const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { createSecretStore } = require('./secretStore');

// A fake keychain: reversible, but never plain text on disk
const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from([...Buffer.from(s)].map((b) => b ^ 0x5a)),
  decryptString: (b) => Buffer.from([...b].map((x) => x ^ 0x5a)).toString(),
};

test('values are saved encrypted in a private file and read back; removing forgets them', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sec-')), 'connections.json');
  const store = createSecretStore({ file, safeStorage });
  assert.equal(store.get('supabase'), null);
  store.set('supabase', { tokens: { access_token: 'tok-123' } });
  assert.deepEqual(createSecretStore({ file, safeStorage }).get('supabase'), { tokens: { access_token: 'tok-123' } });
  assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /tok-123/);
  if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  store.remove('supabase');
  assert.equal(store.get('supabase'), null);
});

test('without a keychain nothing is saved (and nothing breaks)', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sec-')), 'c.json');
  const store = createSecretStore({ file, safeStorage: { isEncryptionAvailable: () => false } });
  assert.equal(store.set('x', { a: 1 }), false);
  assert.equal(store.get('x'), null);
});
