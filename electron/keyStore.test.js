const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createKeyStore, KEY_PROVIDERS } = require('./keyStore');

// A stand-in for Electron's safeStorage (the real one encrypts with the OS keychain). The sync API is
// the old one; `async: true` adds the async one (Electron 45), which writes a different format ('v2:')
// but still reads what the sync one wrote, like the real thing.
const xor = (s) => Buffer.from([...Buffer.from(s, 'utf8')].map((b) => b ^ 0x5a));
const unxor = (b) => Buffer.from([...b].map((x) => x ^ 0x5a)).toString('utf8');
function fakeSafe({ available = true, async = false, backend, rotate = false } = {}) {
  const calls = [];
  const safe = {
    calls,
    isEncryptionAvailable: () => available,
    encryptString: (s) => { calls.push('encrypt'); return xor(s); },
    decryptString: (b) => { calls.push('decrypt'); if (b.toString('utf8').startsWith('v2:')) throw new Error('new format'); return unxor(b); },
  };
  if (async) {
    Object.assign(safe, {
      isAsyncEncryptionAvailable: async () => available,
      encryptStringAsync: async (s) => { calls.push('encryptAsync'); return Buffer.concat([Buffer.from('v2:'), xor(s)]); },
      decryptStringAsync: async (b) => {
        calls.push('decryptAsync');
        const v2 = b.toString('utf8').startsWith('v2:');
        return { result: unxor(v2 ? b.subarray(3) : b), shouldReEncrypt: rotate };
      },
    });
  }
  if (backend) safe.getSelectedStorageBackend = () => backend;
  return safe;
}
// Fake keys are built at run time: written out, they would trip the repo's own credential scan
// (tests/secrets.test.mjs), which is exactly what it is for
const fake = (prefix, body = 'abcdefghijklmnopqrstuvwxyz0123') => `${prefix}${body}`;
const ANT = ['sk', 'ant', ''].join('-');
const XAI = ['xai', ''].join('-');
const ELEVEN = () => ['sk', '0123456789abcdef0123456789abcdef0123456789ab171e'].join('_');
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'keys-')), 'keys.json');

test('a key is saved encrypted and only its last four characters are ever listed', async () => {
  const file = tmp();
  const store = createKeyStore({ file, safeStorage: fakeSafe() });
  const key = fake(`${ANT}api03-`);
  assert.deepEqual(await store.set('claude', `  ${key}\n`), { ok: true, last4: '0123' });
  assert.deepEqual(store.list(), { claude: { last4: '0123' } });
  assert.ok(!fs.readFileSync(file, 'utf8').includes(key), 'the file never holds the key in clear');
  assert.equal((fs.statSync(file).mode & 0o777).toString(8), '600');
  assert.deepEqual(await store.envFor('claude'), { [KEY_PROVIDERS.claude.env]: key });
  assert.deepEqual(await store.envFor('grok'), {});
  // a new store on the same file reads it back
  assert.deepEqual(await createKeyStore({ file, safeStorage: fakeSafe() }).envFor('claude'), { ANTHROPIC_API_KEY: key });
});

test('keys with the wrong shape, unknown providers and no keychain are refused', async () => {
  const store = createKeyStore({ file: tmp(), safeStorage: fakeSafe() });
  assert.equal((await store.set('claude', 'hola')).ok, false);
  assert.equal((await store.set('codex', fake(`${ANT}api03-`))).ok, false, 'an Anthropic key is not an OpenAI key');
  assert.equal((await store.set('nope', 'sk-123456789012345678901234')).ok, false);
  assert.equal((await store.set('elevenlabs', 'sk-123456789012345678901234')).error, 'shape', 'an OpenAI key is not an ElevenLabs key');
  assert.equal((await store.set('elevenlabs', fake(XAI))).error, 'shape');
  const locked = createKeyStore({ file: tmp(), safeStorage: fakeSafe({ available: false }) });
  assert.equal((await locked.set('grok', fake(XAI))).error, 'no-keychain');
  const lockedAsync = createKeyStore({ file: tmp(), safeStorage: fakeSafe({ available: false, async: true }) });
  assert.equal((await lockedAsync.set('elevenlabs', ELEVEN())).error, 'no-keychain');
});

test('each provider gets its own variable; a key can be removed', async () => {
  const store = createKeyStore({ file: tmp(), safeStorage: fakeSafe() });
  await store.set('codex', 'sk-proj-abcdefghijklmnopqrstuvwxyz');
  await store.set('grok', fake(XAI, 'abcdefghijklmnopqrstuvwxyz1234'));
  assert.deepEqual(await store.envFor('codex'), { OPENAI_API_KEY: 'sk-proj-abcdefghijklmnopqrstuvwxyz' });
  assert.deepEqual(await store.envFor('grok'), { XAI_API_KEY: fake(XAI, 'abcdefghijklmnopqrstuvwxyz1234') });
  store.remove('codex');
  assert.deepEqual(Object.keys(store.list()), ['grok']);
});

test('ElevenLabs keys: today\'s shape (sk_ + 48 hex) is accepted and saved', async () => {
  assert.equal(KEY_PROVIDERS.elevenlabs.env, 'ELEVENLABS_API_KEY');
  assert.ok(KEY_PROVIDERS.elevenlabs.shape.test(ELEVEN()));
  const store = createKeyStore({ file: tmp(), safeStorage: fakeSafe({ async: true }) });
  assert.deepEqual(await store.set('elevenlabs', ELEVEN()), { ok: true, last4: '171e' });
  assert.deepEqual(store.list(), { elevenlabs: { last4: '171e' } });
  assert.equal(await store.keyFor('elevenlabs'), ELEVEN());
});

test('the async API is used when it exists, and keys saved with the old sync API still read', async () => {
  const file = tmp();
  const key = fake(XAI, 'abcdefghijklmnopqrstuvwxyz1234');
  // saved by an older Qubbot (sync API only)
  await createKeyStore({ file, safeStorage: fakeSafe() }).set('grok', key);

  const safe = fakeSafe({ async: true });
  const store = createKeyStore({ file, safeStorage: safe });
  assert.deepEqual(await store.envFor('grok'), { XAI_API_KEY: key });
  assert.ok(safe.calls.includes('decryptAsync'));

  await store.set('elevenlabs', ELEVEN());
  assert.ok(safe.calls.includes('encryptAsync'));
  assert.ok(!safe.calls.includes('encrypt'), 'the deprecated sync encryption is not used');
  assert.equal(await store.keyFor('elevenlabs'), ELEVEN());
});

test('a key the async API cannot read falls back to the sync one and is written again', async () => {
  const file = tmp();
  const key = fake(XAI, 'abcdefghijklmnopqrstuvwxyz1234');
  await createKeyStore({ file, safeStorage: fakeSafe() }).set('grok', key);
  const before = JSON.parse(fs.readFileSync(file, 'utf8')).grok.data;

  const safe = fakeSafe({ async: true });
  safe.decryptStringAsync = async () => { throw new Error('cannot decrypt'); };
  const store = createKeyStore({ file, safeStorage: safe });
  assert.equal(await store.keyFor('grok'), key);
  const after = JSON.parse(fs.readFileSync(file, 'utf8')).grok;
  assert.notEqual(after.data, before, 'saved again with the async API');
  assert.equal(after.last4, '1234');
});

test('shouldReEncrypt: the key is encrypted again and keeps working', async () => {
  const file = tmp();
  const store = createKeyStore({ file, safeStorage: fakeSafe({ async: true }) });
  await store.set('elevenlabs', ELEVEN());
  fs.writeFileSync(file, JSON.stringify({ elevenlabs: { data: xor(ELEVEN()).toString('base64'), last4: '171e' } }));

  const safe = fakeSafe({ async: true, rotate: true });
  const rotated = createKeyStore({ file, safeStorage: safe });
  assert.equal(await rotated.keyFor('elevenlabs'), ELEVEN());
  assert.ok(safe.calls.includes('encryptAsync'), 'written again');
  assert.ok(Buffer.from(JSON.parse(fs.readFileSync(file, 'utf8')).elevenlabs.data, 'base64').toString('utf8').startsWith('v2:'));
  assert.ok(!fs.readFileSync(file, 'utf8').includes(ELEVEN()));
});

test('Linux without a keyring (basic_text): the key lives only in memory and the reason says so', async () => {
  const file = tmp();
  const safe = fakeSafe({ async: true, backend: 'basic_text' });
  const store = createKeyStore({ file, safeStorage: safe, platform: 'linux' });
  assert.deepEqual(await store.set('elevenlabs', ELEVEN()), { ok: true, last4: '171e', reason: 'weak-keychain' });
  assert.ok(!fs.existsSync(file) || !fs.readFileSync(file, 'utf8').includes('elevenlabs'), 'nothing written to disk');
  assert.deepEqual(store.list(), { elevenlabs: { last4: '171e' } });
  assert.equal(await store.keyFor('elevenlabs'), ELEVEN());
  assert.ok(!safe.calls.some((c) => c.startsWith('encrypt')));
  // a new session forgets it
  assert.equal(await createKeyStore({ file, safeStorage: safe, platform: 'linux', env: {} }).keyFor('elevenlabs'), null);
  store.remove('elevenlabs');
  assert.deepEqual(store.list(), {});

  // the same backend name on macOS means nothing: saved as usual
  const mac = createKeyStore({ file: tmp(), safeStorage: fakeSafe({ async: true, backend: 'basic_text' }), platform: 'darwin' });
  assert.deepEqual(await mac.set('elevenlabs', ELEVEN()), { ok: true, last4: '171e' });
  // a real Linux keyring: saved as usual
  const gnome = createKeyStore({ file: tmp(), safeStorage: fakeSafe({ async: true, backend: 'gnome_libsecret' }), platform: 'linux' });
  assert.deepEqual(await gnome.set('elevenlabs', ELEVEN()), { ok: true, last4: '171e' });
});

test('keyFor: the keychain first, then the environment, then .env.local (development)', async () => {
  const devEnv = {};
  const env = {};
  const store = createKeyStore({ file: tmp(), safeStorage: fakeSafe({ async: true }), env, devEnv });
  assert.equal(await store.keyFor('elevenlabs'), null);
  assert.equal(await store.keyFor('nope'), null);
  devEnv.ELEVENLABS_API_KEY = 'from-dev';
  assert.equal(await store.keyFor('elevenlabs'), 'from-dev', 'read when asked: main fills devEnv at start');
  env.ELEVENLABS_API_KEY = 'from-env';
  assert.equal(await store.keyFor('elevenlabs'), 'from-env');
  await store.set('elevenlabs', ELEVEN());
  assert.equal(await store.keyFor('elevenlabs'), ELEVEN());
  // grok reads XAI_API_KEY: the same key as the Grok agent
  env.XAI_API_KEY = fake(XAI);
  assert.equal(await store.keyFor('grok'), fake(XAI));
});

test('a damaged file reads as empty, never throws', async () => {
  const file = tmp();
  fs.writeFileSync(file, '[1,2');
  const store = createKeyStore({ file, safeStorage: fakeSafe({ async: true }), env: {} });
  assert.deepEqual(store.list(), {});
  assert.equal(await store.keyFor('elevenlabs'), null);
  fs.writeFileSync(file, JSON.stringify({ elevenlabs: { data: 42 } }));
  assert.equal(await store.keyFor('elevenlabs'), null);
});
