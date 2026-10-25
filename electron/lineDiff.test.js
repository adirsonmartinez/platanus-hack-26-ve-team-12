const test = require('node:test');
const assert = require('node:assert/strict');
const { lineDiff } = require('./lineDiff');

const kinds = (d) => d.hunks.flatMap((h) => h.lines.map((l) => `${l.type[0]}${l.text}`));

test('a changed line: one removed, one added, with a little context and line numbers', () => {
  const before = ['a', 'b', 'c', 'd', 'e', 'f'].join('\n');
  const after = ['a', 'b', 'c', 'D', 'e', 'f'].join('\n');
  const d = lineDiff(before, after);
  assert.equal(d.added, 1);
  assert.equal(d.removed, 1);
  assert.deepEqual(kinds(d), ['cb', 'cc', 'dd', 'aD', 'ce', 'cf']);
  const del = d.hunks[0].lines.find((l) => l.type === 'del');
  const add = d.hunks[0].lines.find((l) => l.type === 'add');
  assert.equal(del.old, 4);
  assert.equal(add.new, 4);
});

test('a new file is all added; identical files have no hunks', () => {
  const created = lineDiff(null, 'uno\ndos');
  assert.equal(created.created, true);
  assert.equal(created.added, 2);
  assert.deepEqual(kinds(created), ['auno', 'ados']);
  assert.deepEqual(lineDiff('x\ny', 'x\ny').hunks, []);
});

test('far apart edits are separate hunks; long diffs are cut and say so', () => {
  const base = Array.from({ length: 40 }, (_, i) => `l${i}`);
  const changed = [...base];
  changed[2] = 'X'; changed[35] = 'Y';
  const d = lineDiff(base.join('\n'), changed.join('\n'));
  assert.equal(d.hunks.length, 2);
  const big = lineDiff('', Array.from({ length: 500 }, (_, i) => `n${i}`).join('\n'), { maxLines: 50 });
  assert.equal(big.truncated, true);
  assert.equal(big.hunks.flatMap((h) => h.lines).length, 50);
  assert.equal(big.added, 500, 'the counts are always complete');
});

test('huge files with a small edit stay fast (common start and end are skipped)', () => {
  const lines = Array.from({ length: 20000 }, (_, i) => `line ${i}`);
  const changed = [...lines];
  changed[10000] = 'changed';
  const started = Date.now();
  const d = lineDiff(lines.join('\n'), changed.join('\n'));
  assert.ok(Date.now() - started < 500);
  assert.equal(d.added, 1);
  assert.equal(d.removed, 1);
});
