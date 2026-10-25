import test from 'node:test';
import assert from 'node:assert/strict';
import { AuditViewModel } from '../../renderer/viewmodels/auditViewModel.js';
import { SecurityModel } from '../../renderer/models/securityModel.js';
import { createEventBus, EVENTS } from '../../renderer/core/eventBus.js';

const audit = (files, score, extra = {}) => ({ at: '2026-10-24T10:00:00.000Z', files, score, counts: {}, history: [], ...extra });
const RED = { level: 'red', findings: [{ rule: 'sqlInjection', level: 'red', line: 12 }] };
const GREEN = { level: 'green', findings: [] };

function setup(answers = {}) {
  const calls = [];
  const queue = { audit: [...(answers.audit ?? [])], check: [...(answers.check ?? [])] };
  const service = {
    available: true,
    audit: async (cause) => { calls.push(['audit', cause]); return { ok: true, data: queue.audit.shift() }; },
    check: async (paths, cause) => { calls.push(['check', paths, cause]); return { ok: true, data: queue.check.shift() }; },
    accept: async (path) => { calls.push(['accept', path]); return answers.accept ?? { ok: true, data: { ok: true, audit: queue.check.shift() } }; },
    unaccept: async () => ({ ok: true, data: queue.check.shift() }),
  };
  const security = new SecurityModel();
  const bus = createEventBus();
  const events = [];
  bus.on(EVENTS.auditFinished, (e) => events.push(e));
  return { vm: new AuditViewModel({ securityModel: security, service, bus }), security, calls, events };
}

test('a project opens: it is audited from scratch and the map takes the audit', async () => {
  const t = setup({ audit: [audit({ 'src/orders.ts': RED, 'db/001.sql': GREEN }, 85)] });
  t.security.setScore('db/001.sql', 'yellow', 'old', 'qubi');
  await t.vm.open();
  assert.deepEqual(t.calls, [['audit', 'open']]);
  assert.equal(t.security.audited, true);
  assert.equal(t.security.scoreOf('src/orders.ts').level, 'red');
  assert.equal(t.security.scoreOf('db/001.sql').level, 'green', 'nothing of the old session survives');
  assert.equal(t.security.store.state.score, 85);
  assert.deepEqual(t.events, [], 'opening is not news');
});

test('files that change are checked; asking again reports what got fixed or worse', async () => {
  const t = setup({
    audit: [audit({ 'a.ts': RED, 'b.ts': GREEN }, 85), audit({ 'a.ts': GREEN, 'b.ts': RED }, 85)],
    check: [audit({ 'a.ts': GREEN, 'b.ts': GREEN }, 100)],
  });
  await t.vm.open();
  await t.vm.check(['a.ts', 'a.ts', '']);
  assert.deepEqual(t.calls[1], ['check', ['a.ts'], 'change']);
  assert.equal(t.security.scoreOf('a.ts').level, 'green');
  await t.vm.check([]); // nothing to read
  assert.equal(t.calls.length, 2);
  await t.vm.auditNow();
  assert.deepEqual(t.events, [{ cause: 'audit', before: 100, after: 85, fixed: [], worse: ['b.ts'], at: '2026-10-24T10:00:00.000Z' }]);
  assert.deepEqual(t.vm.store.state.last.worse, ['b.ts']);
});

test('runs go one after another, and a run of a closed project is dropped', async () => {
  const t = setup({ audit: [audit({ 'a.ts': RED }, 85)], check: [audit({ 'a.ts': GREEN }, 100)] });
  const opening = t.vm.open();
  const checking = t.vm.check(['a.ts']);
  t.vm.close();
  assert.equal(await opening, null);
  assert.equal(await checking, null);
  assert.equal(t.security.audited, false);
});

test('accepting a reviewed file; a red one is refused; no service, no audit', async () => {
  const t = setup({ audit: [audit({ Dockerfile: { level: 'yellow', findings: [{ rule: 'dockerRoot', level: 'yellow', line: 1 }] } }, 95)], check: [audit({ Dockerfile: { level: 'green', findings: [], accepted: true } }, 100)] });
  await t.vm.open();
  assert.deepEqual(await t.vm.accept('Dockerfile'), { ok: true });
  assert.equal(t.security.scoreOf('Dockerfile').by, 'accepted');
  const refused = setup({ accept: { ok: true, data: { ok: false, reason: 'red' } } });
  assert.deepEqual(await refused.vm.accept('a.ts'), { ok: false, reason: 'red' });
  const none = new AuditViewModel({ securityModel: new SecurityModel(), service: { available: false } });
  assert.equal(await none.open(), null);
  assert.deepEqual(await none.accept('a'), { ok: false, reason: 'unavailable' });
});
