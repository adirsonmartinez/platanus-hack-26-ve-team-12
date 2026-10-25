// What Qubi remembers of a project between calls (fase 3): the bridge to main (fake here), the
// in-memory version of the web, the short text the voice gets and the fixed facts learned from the tree.
import test from 'node:test';
import assert from 'node:assert/strict';
import { strings } from '../../renderer/i18n/es.js';
import { createProjectMemory, memoryText, learnFacts, MEMORY_TEXT_MAX } from '../../renderer/models/projectMemoryModel.js';

// es.js gets strings.memory from another change; until then a local stand-in with the same contract
strings.memory ??= {
  title: 'Lo que recuerdo',
  empty: 'Aún no recuerdo nada de este proyecto.',
  text: ({ calls, built, learned }) => [calls.length && `Llamadas anteriores: ${calls.join('; ')}.`, built.length && `Ya existe: ${built.join(', ')}.`, learned.length && `Aprendido: ${learned.join(', ')}.`].filter(Boolean).join(' '),
};
const M = strings.memory;

const call = (n, extra = {}) => ({ at: `2026-10-${String(n).padStart(2, '0')}T10:00:00.000Z`, pedidos: [`pedido ${n}`], built: [`src/archivo-${n}.js`], audits: [], notes: '', ...extra });

test('memoryText: empty memory says so; otherwise past requests, what exists and what was learned', () => {
  assert.equal(memoryText(null), M.empty);
  assert.equal(memoryText({ calls: [], learned: [] }), M.empty);
  const text = memoryText({ calls: [call(1), call(2, { built: ['src/archivo-2.js', '.env'] })], learned: ['src/', 'TypeScript'] });
  assert.match(text, /pedido 1/);
  assert.match(text, /pedido 2/);
  assert.match(text, /src\/archivo-2\.js/);
  assert.match(text, /TypeScript/);
  assert.doesNotMatch(text, /\.env/, 'a secret file is never named to the voice');
  assert.ok(text.indexOf('pedido 2') < text.indexOf('pedido 1'), 'the newest call first');
});

test('memoryText: never longer than the limit, however big the memory', () => {
  const calls = Array.from({ length: 20 }, (_, i) => call(i + 1, {
    pedidos: [`Haz una página larga número ${i} ${'x'.repeat(280)}`],
    built: Array.from({ length: 30 }, (__, j) => `carpeta-${i}/subcarpeta/archivo-con-nombre-largo-${j}.tsx`),
  }));
  const text = memoryText({ calls, learned: Array.from({ length: 12 }, (_, i) => `hecho-${i}-${'y'.repeat(70)}`) });
  assert.ok(text.length <= MEMORY_TEXT_MAX, `${text.length} characters`);
  assert.match(text, /Haz una página larga número 19/, 'it keeps the newest request');
});

test('createProjectMemory: talks to the bridge, unwraps { ok, data } and never rejects', async () => {
  const seen = [];
  const stored = { calls: [call(1)], learned: ['src/'] };
  const bridge = {
    read: async (root) => { seen.push(['read', root]); return { ok: true, data: stored }; },
    append: async (root, entry) => { seen.push(['append', root, entry]); return { ...stored, calls: [...stored.calls, entry] }; },
    learn: async (root, facts) => { seen.push(['learn', root, facts]); return { ...stored, learned: facts }; },
    forget: async (root) => { seen.push(['forget', root]); },
  };
  const memory = createProjectMemory(bridge);
  assert.equal(memory.available, true);
  assert.deepEqual(await memory.read('/p'), stored);
  const after = await memory.append('/p', call(2));
  assert.equal(after.calls.length, 2);
  assert.deepEqual((await memory.learn('/p', ['TypeScript'])).learned, ['TypeScript']);
  await memory.forget('/p');
  assert.deepEqual(seen.map((s) => s[0]), ['read', 'append', 'learn', 'forget']);

  const broken = createProjectMemory({ read: () => { throw new Error('ipc'); }, append: async () => { throw new Error('ipc'); }, forget: () => {} });
  assert.deepEqual(await broken.read('/p'), { calls: [], learned: [] });
  assert.deepEqual(await broken.append('/p', call(1)), { calls: [], learned: [] });
  assert.deepEqual(await createProjectMemory({ read: async () => 'basura' }).read('/p'), { calls: [], learned: [] });
});

test('createProjectMemory: a bridge with no learn keeps what was learned for this session', async () => {
  const memory = createProjectMemory({ read: async () => ({ calls: [call(1)], learned: ['src/'] }), append: async () => ({}), forget: async () => {} });
  await memory.learn('/p', ['TypeScript', 'src/']);
  assert.deepEqual((await memory.read('/p')).learned, ['src/', 'TypeScript']);
  assert.deepEqual((await memory.read('/otro')).learned, ['src/']);
});

test('the web version keeps memory in this window only: the newest 20 calls, no repeated facts', async () => {
  const memory = createProjectMemory(null);
  assert.equal(memory.available, false);
  assert.deepEqual(await memory.read('/p'), { calls: [], learned: [] });
  for (let i = 1; i <= 25; i++) await memory.append('/p', call(i, { pedidos: [`pedido ${i} ${'z'.repeat(400)}`] }));
  const kept = await memory.read('/p');
  assert.equal(kept.calls.length, 20);
  assert.match(kept.calls[0].pedidos[0], /^pedido 6 /);
  assert.ok(kept.calls[0].pedidos[0].length <= 300, 'requests are trimmed');
  await memory.learn('/p', ['src/', 'src/', 'TypeScript']);
  await memory.learn('/p', ['TypeScript', 'npm', ...Array.from({ length: 20 }, (_, i) => `h${i}`)]);
  const { learned } = await memory.read('/p');
  assert.equal(new Set(learned).size, learned.length);
  assert.ok(learned.length <= 12);
  assert.deepEqual((await memory.read('/otro')).calls, [], 'one memory per project');
  await memory.forget('/p');
  assert.deepEqual(await memory.read('/p'), { calls: [], learned: [] });
});

test('learnFacts: top folders and the stack, from the tree only; never secrets nor hidden folders', () => {
  const tree = [
    { type: 'dir', path: 'src', children: [{ type: 'file', path: 'src/app.ts' }, { type: 'file', path: 'src/ui.tsx' }, { type: 'file', path: 'src/util.js' }] },
    { type: 'dir', path: 'public', children: [{ type: 'file', path: 'public/index.html' }] },
    { type: 'dir', path: '.git', children: [] },
    { type: 'dir', path: 'node_modules', children: [] },
    { type: 'dir', path: '.ssh', children: [] },
    { type: 'file', path: 'package.json' },
    { type: 'file', path: 'pnpm-lock.yaml' },
    { type: 'file', path: '.env' },
  ];
  assert.deepEqual(learnFacts(tree), ['src/', 'public/', 'TypeScript', 'JavaScript', 'pnpm']);
  assert.deepEqual(learnFacts([]), []);
  const many = Array.from({ length: 30 }, (_, i) => ({ type: 'dir', path: `c${i}`, children: [] }));
  assert.ok(learnFacts(many).length <= 12);
});
