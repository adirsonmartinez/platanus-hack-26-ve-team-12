const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const { isTrusted, setTrusted, createTrustStore } = require('./trust');

test('a folder is trusted only if it is on the list, by its exact resolved path', () => {
  const list = ['/Users/ana/tienda'];
  assert.equal(isTrusted(list, '/Users/ana/tienda'), true);
  assert.equal(isTrusted(list, '/Users/ana/tienda/'), true);
  assert.equal(isTrusted(list, '/Users/ana/tienda/src'), false, 'a subfolder is not the folder the person trusted');
  assert.equal(isTrusted(list, '/Users/ana'), false, 'nor its parent');
  assert.equal(isTrusted(list, '/Users/ana/tienda-2'), false);
  assert.equal(isTrusted(list, null), false);
});

test('trusting adds the folder once; untrusting removes it', () => {
  let list = setTrusted([], '/a/b', true);
  list = setTrusted(list, '/a/b/', true);
  assert.deepEqual(list, ['/a/b']);
  assert.deepEqual(setTrusted(list, '/a/b', false), []);
  assert.deepEqual(setTrusted(['/x'], null, true), ['/x']);
});

test('the store keeps the list in a file; a broken or missing file means nothing is trusted', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'trust-'));
  const file = path.join(dir, 'trusted-folders.json');
  const store = createTrustStore(file);
  assert.equal(await store.has('/p/q'), false);
  await store.set('/p/q', true);
  assert.equal(await createTrustStore(file).has('/p/q'), true);
  await store.set('/p/q', false);
  assert.equal(await store.has('/p/q'), false);
  await fs.writeFile(file, '{not json');
  assert.equal(await store.has('/p/q'), false);
});
