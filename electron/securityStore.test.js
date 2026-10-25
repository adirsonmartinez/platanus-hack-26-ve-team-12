const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSecurityStore, createSecurityService, scoreOf } = require('./securityStore');

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sec-'));

// A fake project on disk the audit reads through auditOne/audit
function project(files) {
  const disk = { ...files };
  const auditOne = async (_root, rel) => (rel in disk ? { ...disk[rel] } : null);
  const audit = async () => ({ files: Object.fromEntries(Object.entries(disk).map(([k, v]) => [k, { ...v }])), truncated: false });
  return { disk, auditOne, audit };
}
const RED = { level: 'red', findings: [{ rule: 'sqlInjection', level: 'red', line: 12 }], hash: 'r1' };
const YELLOW = { level: 'yellow', findings: [{ rule: 'dockerRoot', level: 'yellow', line: 1 }], hash: 'y1' };
const GREEN = { level: 'green', findings: [], hash: 'g1' };

test('the score: 100 minus 15 per risk and 5 per review, never below 0', () => {
  assert.equal(scoreOf({ red: 0, yellow: 0 }), 100);
  assert.equal(scoreOf({ red: 1, yellow: 2 }), 75);
  assert.equal(scoreOf({ red: 9, yellow: 9 }), 0);
});

test('an audit is remembered: the score history survives closing the app, and a repair shows in it', async () => {
  const dir = tmpDir();
  const p = project({ 'src/orders.ts': RED, Dockerfile: YELLOW, 'src/ok.ts': GREEN });
  let clock = 0;
  const now = () => `2026-10-24T10:00:0${clock++}.000Z`;
  const service = createSecurityService({ store: createSecurityStore({ dir }), audit: p.audit, auditOne: p.auditOne, now });
  const first = await service.full('/proj', 'open');
  assert.deepEqual(first.counts, { red: 1, yellow: 1, green: 1, grey: 0 });
  assert.equal(first.score, 80);
  assert.deepEqual(first.files['src/orders.ts'].findings, RED.findings);

  // the agent fixed the query: only that file is read again
  p.disk['src/orders.ts'] = { ...GREEN, hash: 'r2' };
  const fixed = await service.check('/proj', ['src/orders.ts'], 'repair');
  assert.equal(fixed.score, 95);
  assert.equal(fixed.files['src/orders.ts'].level, 'green');
  assert.deepEqual(fixed.history.map((h) => [h.score, h.cause]), [[80, 'open'], [95, 'repair']]);
  assert.deepEqual(fixed.history[1].paths, ['src/orders.ts']);

  // the app closes and opens again: the history is still there, and the audit reads the disk again
  const again = createSecurityService({ store: createSecurityStore({ dir }), audit: p.audit, auditOne: p.auditOne, now });
  assert.equal(again.current('/proj'), null, 'nothing in memory yet');
  const reopened = await again.full('/proj', 'open');
  assert.equal(reopened.score, 95, 'the fix is on disk, so the score stays up');
  assert.deepEqual(reopened.history.map((h) => h.score), [80, 95], 'the same score is not written twice');

  // someone undoes the fix outside Qubbot: the next audit brings the risk back
  p.disk['src/orders.ts'] = RED;
  const undone = await again.check('/proj', ['src/orders.ts']);
  assert.equal(undone.score, 80);
  assert.deepEqual(undone.history.map((h) => h.score), [80, 95, 80]);
  const saved = fs.readFileSync(createSecurityStore({ dir }).fileFor('/proj'), 'utf8');
  assert.ok(!saved.includes('sqlInjection'), 'the file keeps scores, not findings or contents');
});

test('accepting: only a yellow file, only while it stays the same; a red one must be repaired', async () => {
  const dir = tmpDir();
  const p = project({ Dockerfile: YELLOW, 'src/orders.ts': RED });
  const service = createSecurityService({ store: createSecurityStore({ dir }), audit: p.audit, auditOne: p.auditOne });
  await service.full('/proj', 'open');
  assert.deepEqual(await service.accept('/proj', 'src/orders.ts'), { ok: false, reason: 'red' });
  const ok = await service.accept('/proj', 'Dockerfile');
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.audit.files.Dockerfile, { level: 'green', findings: YELLOW.findings, accepted: true });
  assert.equal(ok.audit.history.at(-1).cause, 'accept');
  // the file changes: the acceptance no longer applies
  p.disk.Dockerfile = { ...YELLOW, hash: 'y2' };
  const changed = await service.check('/proj', ['Dockerfile']);
  assert.equal(changed.files.Dockerfile.level, 'yellow');
  assert.equal(changed.files.Dockerfile.accepted, undefined);
  // a deleted file leaves the audit
  delete p.disk['src/orders.ts'];
  assert.equal((await service.check('/proj', ['src/orders.ts'])).files['src/orders.ts'], undefined);
});

test('a hand-edited file is read safely', () => {
  const dir = tmpDir();
  const store = createSecurityStore({ dir });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(store.fileFor('/p'), JSON.stringify({ history: [{ at: 'x', score: 'no', cause: 'open' }, { at: '2026', score: 50, red: 1, yellow: 7, cause: 'hack' }, { at: '2026', score: 60, red: 2, yellow: 2, cause: 'audit' }], accepted: { a: { hash: 1 } } }));
  assert.deepEqual(store.read('/p'), { history: [{ at: '2026', score: 60, red: 2, yellow: 2, cause: 'audit', paths: [] }], accepted: {} });
  fs.writeFileSync(store.fileFor('/q'), 'not json');
  assert.deepEqual(store.read('/q'), { history: [], accepted: {} });
});
