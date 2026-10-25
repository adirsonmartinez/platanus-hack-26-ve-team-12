// Line diff of a file the agent changes: the chat shows it live (the proposed change while the person
// is asked to approve it, then the applied one). Pure; tested in lineDiff.test.js.
//   lineDiff(before, after) -> { added, removed, created, truncated, hunks: [{ lines: [{ type, text, old?, new? }] }] }
//   type: 'add' | 'del' | 'ctx'; old / new: 1-based line numbers. `before` null = a new file.
// The common start and end are skipped first, so a small edit in a big file is fast; the middle is
// compared with an LCS table, or (when too big) shown as removed then added.

const CONTEXT = 2;
const MAX_CELLS = 2_000_000;

const split = (text) => (text == null || text === '' ? [] : String(text).replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n'));

// Edit script of the middle parts -> [{ type, text, a?, b? }] with indexes into a / b
function middle(a, b, offA, offB) {
  const n = a.length;
  const m = b.length;
  if (n * m > MAX_CELLS) {
    return [...a.map((text, i) => ({ type: 'del', text, a: offA + i })), ...b.map((text, j) => ({ type: 'add', text, b: offB + j }))];
  }
  // lcs[i][j] = longest common subsequence of a[i:] and b[j:]
  const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push({ type: 'ctx', text: a[i], a: offA + i, b: offB + j }); i++; j++; }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) { ops.push({ type: 'del', text: a[i], a: offA + i }); i++; }
    else { ops.push({ type: 'add', text: b[j], b: offB + j }); j++; }
  }
  while (i < n) { ops.push({ type: 'del', text: a[i], a: offA + i }); i++; }
  while (j < m) { ops.push({ type: 'add', text: b[j], b: offB + j }); j++; }
  return ops;
}

function lineDiff(before, after, { context = CONTEXT, maxLines = 160 } = {}) {
  const a = split(before);
  const b = split(after);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }

  const ops = [
    ...a.slice(0, start).map((text, i) => ({ type: 'ctx', text, a: i, b: i })),
    ...middle(a.slice(start, endA), b.slice(start, endB), start, start),
    ...a.slice(endA).map((text, k) => ({ type: 'ctx', text, a: endA + k, b: endB + k })),
  ];
  const added = ops.filter((o) => o.type === 'add').length;
  const removed = ops.filter((o) => o.type === 'del').length;

  // Group the changes with `context` unchanged lines around them
  const keep = new Array(ops.length).fill(false);
  ops.forEach((o, k) => {
    if (o.type === 'ctx') return;
    for (let x = Math.max(0, k - context); x <= Math.min(ops.length - 1, k + context); x++) keep[x] = true;
  });
  const hunks = [];
  let shown = 0;
  let truncated = false;
  let current = null;
  ops.forEach((o, k) => {
    if (!keep[k]) { current = null; return; }
    if (shown >= maxLines) { truncated = true; return; }
    if (!current) { current = { lines: [] }; hunks.push(current); }
    const line = { type: o.type, text: o.text.slice(0, 400) };
    if (o.a !== undefined) line.old = o.a + 1;
    if (o.b !== undefined) line.new = o.b + 1;
    current.lines.push(line);
    shown++;
  });
  return { added, removed, created: before == null, truncated, hunks };
}

module.exports = { lineDiff };
