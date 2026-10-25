const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { createProjectMemory, cleanEntry, cleanFacts, hideKeys, MAX_CALLS, MAX_LEARNED } = require('./projectMemory');

const tmpDir = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'memory-')), 'memory');
const ROOT = '/Users/ana/proyectos/feria';
const entry = (over = {}) => ({ at: '2026-10-24T10:00:00.000Z', pedidos: ['Haz una página de inicio'], built: ['web/index.html'], audits: [{ folder: 'web', status: 'approved' }], notes: 'Todo bien.', ...over });

// Fake keys are built at run time: written out, they would trip the repo's own credential scan
// (tests/secrets.test.mjs), which is exactly what it is for
const BODY = 'abcdefghijklmnopqrstuvwxyz0123456789ABCD';
const KEYS = [
  ['sk', 'ant', `api03-${BODY}`].join('-'),
  ['sk', `proj-${BODY}`].join('-'),
  ['xai', BODY].join('-'),
  ['ghp', BODY].join('_'),
  ['AKIA', 'ABCDEFGHIJKLMNOP'].join(''),
  ['AIza', BODY].join(''),
  ['xoxb', '1234567890-abcdefghij'].join('-'),
  ['sbp', 'a'.repeat(40)].join('_'),
  ['eyJhbGciOi', 'JIUzI1NiIsInR5cCI6IkpXVCJ9', '.', 'eyJzdWIiOiIxMjM0NTY3ODkwIn0'].join(''),
  ['-----BEGIN', 'RSA PRIVATE KEY-----', 'MIIEowIBAAKCAQEA'].join(' '),
  ['sk', 'live', '51Habcdefghijklmnop'].join('_'), // Stripe secret key
  ['rk', 'test', '51Habcdefghijklmnop'].join('_'), // Stripe restricted key
  ['sk', 'a1b2c3d4'.repeat(6)].join('_'), // ElevenLabs: sk_ + 48
];

test('an empty project: no calls and nothing learned', () => {
  const memory = createProjectMemory({ dir: tmpDir() });
  assert.deepEqual(memory.read(ROOT), { calls: [], learned: [] });
});

test('a call is saved in a private file named after the project, and read back', () => {
  const dir = tmpDir();
  const memory = createProjectMemory({ dir });
  const saved = memory.append(ROOT, entry());
  assert.deepEqual(saved, { calls: [entry()], learned: [] });
  const file = path.join(dir, `${crypto.createHash('sha256').update(ROOT).digest('hex').slice(0, 16)}.json`);
  assert.equal(memory.fileFor(ROOT), file);
  assert.equal((fs.statSync(file).mode & 0o777).toString(8), '600');
  // a new instance (the app restarted) reads the same memory; another project has its own
  assert.deepEqual(createProjectMemory({ dir }).read(ROOT), saved);
  assert.deepEqual(memory.read('/Users/ana/otro'), { calls: [], learned: [] });
});

test('texts are trimmed: requests and notes to 300 characters, paths to 200', () => {
  const memory = createProjectMemory({ dir: tmpDir() });
  const { calls: [call] } = memory.append(ROOT, entry({
    pedidos: ['p'.repeat(1000)], notes: 'n'.repeat(1000), built: [`${'d/'.repeat(200)}x.js`],
    audits: [{ folder: 'f'.repeat(500), status: 'flagged' }],
  }));
  assert.equal(call.pedidos[0].length, 300);
  assert.equal(call.notes.length, 300);
  assert.equal(call.built[0].length, 200);
  assert.equal(call.audits[0].folder.length, 200);
  assert.equal(call.audits[0].status, 'flagged');
});

test('only the newest 20 calls are kept', () => {
  const memory = createProjectMemory({ dir: tmpDir() });
  let last;
  for (let i = 0; i < 25; i++) last = memory.append(ROOT, entry({ notes: `llamada ${i}` }));
  assert.equal(MAX_CALLS, 20);
  assert.equal(last.calls.length, 20);
  assert.equal(last.calls[0].notes, 'llamada 5');
  assert.equal(last.calls.at(-1).notes, 'llamada 24');
});

test('anything that looks like a key is hidden before it is saved', () => {
  for (const key of KEYS) {
    const hidden = hideKeys(`mi clave es ${key} y nada más`);
    assert.ok(!hidden.includes(key), key.slice(0, 6));
    assert.match(hidden, /\[oculto\]/);
  }
  const dir = tmpDir();
  const memory = createProjectMemory({ dir });
  memory.append(ROOT, entry({ pedidos: [`usa la clave ${KEYS[0]}`], notes: `token ${KEYS[3]}`, built: [`web/${KEYS[4]}.txt`] }));
  memory.learn(ROOT, [`la clave de AWS es ${KEYS[4]}`]);
  const raw = fs.readFileSync(memory.fileFor(ROOT), 'utf8');
  for (const key of [KEYS[0], KEYS[3], KEYS[4]]) assert.ok(!raw.includes(key));
  assert.match(raw, /\[oculto\]/);
  assert.equal(hideKeys('Haz una página con un botón azul'), 'Haz una página con un botón azul');
});

test('Stripe and ElevenLabs keys said in a call request never reach the disk', () => {
  const [stripe, , eleven] = KEYS.slice(-3);
  const memory = createProjectMemory({ dir: tmpDir() });
  memory.append(ROOT, entry({ pedidos: [`conecta Stripe con ${stripe} y la voz con ${eleven}`] }));
  memory.learn(ROOT, [`la clave de ElevenLabs es ${eleven}`]);
  const raw = fs.readFileSync(memory.fileFor(ROOT), 'utf8');
  assert.ok(!raw.includes(stripe) && !raw.includes(eleven));
  assert.match(raw, /conecta Stripe con \[oculto\] y la voz con \[oculto\]/);
});

test('what was learned has no repeats and keeps at most the newest 12', () => {
  const memory = createProjectMemory({ dir: tmpDir() });
  memory.learn(ROOT, ['Usa Next.js', 'Carpetas: web, api']);
  const again = memory.learn(ROOT, ['usa next.js ', 'Carpetas: web, api', 'Tiene pagos']);
  assert.deepEqual(again.learned, ['Usa Next.js', 'Carpetas: web, api', 'Tiene pagos']);
  const many = memory.learn(ROOT, Array.from({ length: 15 }, (_v, i) => `hecho ${i}`));
  assert.equal(MAX_LEARNED, 12);
  assert.equal(many.learned.length, 12);
  assert.equal(many.learned.at(-1), 'hecho 14');
  assert.ok(!many.learned.includes('Usa Next.js'), 'the oldest go first');
  // learning keeps the calls
  memory.append(ROOT, entry());
  assert.equal(memory.learn(ROOT, ['otro']).calls.length, 1);
});

test('forget removes the whole memory of that project only', () => {
  const memory = createProjectMemory({ dir: tmpDir() });
  memory.append(ROOT, entry());
  memory.append('/Users/ana/otro', entry());
  memory.forget(ROOT);
  memory.forget(ROOT); // twice is fine
  assert.deepEqual(memory.read(ROOT), { calls: [], learned: [] });
  assert.equal(memory.read('/Users/ana/otro').calls.length, 1);
});

test('a broken or tampered file reads as empty or cleaned, never throws', () => {
  const memory = createProjectMemory({ dir: tmpDir() });
  memory.append(ROOT, entry());
  fs.writeFileSync(memory.fileFor(ROOT), '{ no es json');
  assert.deepEqual(memory.read(ROOT), { calls: [], learned: [] });
  fs.writeFileSync(memory.fileFor(ROOT), JSON.stringify({ calls: [entry(), 7, { pedidos: 'x' }], learned: ['ok', 3] }));
  assert.deepEqual(memory.read(ROOT), { calls: [entry()], learned: ['ok'] });
});

test('entries from the window are checked strictly: wrong types or sizes are refused', () => {
  assert.deepEqual(cleanEntry(entry()), entry());
  assert.equal(cleanEntry(null), null);
  assert.equal(cleanEntry('texto'), null);
  assert.equal(cleanEntry(entry({ pedidos: 'no es lista' })), null);
  assert.equal(cleanEntry(entry({ pedidos: [3] })), null);
  assert.equal(cleanEntry(entry({ built: [null] })), null);
  assert.equal(cleanEntry(entry({ audits: [{ folder: 'web' }] })), null);
  assert.equal(cleanEntry(entry({ audits: [{ folder: 'web', status: 'aprobado de verdad <b>' }] })), null);
  assert.equal(cleanEntry(entry({ notes: 5 })), null);
  assert.equal(cleanEntry(entry({ pedidos: Array(500).fill('x') })), null);
  assert.equal(cleanEntry(entry({ notes: 'x'.repeat(100_000) })), null);
  // optional fields may be missing; a bad date becomes now
  const minimal = cleanEntry({ pedidos: ['Hola'] });
  assert.deepEqual({ ...minimal, at: 'x' }, { at: 'x', pedidos: ['Hola'], built: [], audits: [], notes: '' });
  assert.ok(!Number.isNaN(Date.parse(minimal.at)));
  assert.notEqual(cleanEntry(entry({ at: 'ayer' })).at, 'ayer');
  // control characters go
  assert.equal(cleanEntry(entry({ pedidos: ['a\u0000b\nc'] })).pedidos[0], 'ab c');
  assert.deepEqual(cleanFacts([' a ', 'b']), ['a', 'b']);
  assert.equal(cleanFacts('a'), null);
  assert.equal(cleanFacts([1]), null);
  assert.equal(cleanFacts(Array(100).fill('x')), null);
});

test('append refuses an invalid entry without touching the file', () => {
  const memory = createProjectMemory({ dir: tmpDir() });
  memory.append(ROOT, entry());
  assert.equal(memory.append(ROOT, { pedidos: 3 }), null);
  assert.equal(memory.learn(ROOT, 'x'), null);
  assert.equal(memory.read(ROOT).calls.length, 1);
});
