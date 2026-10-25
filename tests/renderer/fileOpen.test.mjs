import test from 'node:test';
import assert from 'node:assert/strict';
import { opensInBrowser, isSecretFile, previewOf, fileKind } from '../../renderer/models/fileOpen.js';

test('which files can open in the browser', () => {
  assert.equal(opensInBrowser('index.html'), true);
  assert.equal(opensInBrowser('docs/a.pdf'), true);
  assert.equal(opensInBrowser('src/app.js'), false);
});

test('secret files are recognized by name', () => {
  for (const p of ['.env', 'api/.env.local', 'id_rsa', 'certs/server.pem', 'x.key']) assert.equal(isSecretFile(p), true, p);
  assert.equal(isSecretFile('.env.example'), false);
  assert.equal(isSecretFile('src/env.js'), false);
});

test('a preview keeps the first lines and says how many are left', () => {
  const text = Array.from({ length: 50 }, (_, i) => `línea ${i + 1}`).join('\n');
  const p = previewOf(text, 30);
  assert.equal(p.lines.length, 30);
  assert.equal(p.lines[0], 'línea 1');
  assert.equal(p.more, 20);
  assert.deepEqual(previewOf('a\nb'), { lines: ['a', 'b'], more: 0 });
  assert.equal(previewOf('PNG\u0000\u0001'), null); // binary: nothing to show
  assert.equal(previewOf('x'.repeat(500)).lines[0].length, 200); // long lines are cut
});

test('what kind of file it is, by its name (plain words live in es.js)', () => {
  const cases = { 'index.html': 'page', 'a/app.css': 'styles', 'src/x.ts': 'code', 'App.jsx': 'code', 'tests/a.test.mjs': 'test', 'package.json': 'settings', 'data/users.csv': 'data', 'db/1.sql': 'data', 'README.md': 'text', 'logo.png': 'image', 'guia.pdf': 'document', 'deploy.sh': 'script', '.env': 'secret', 'LICENSE': 'other' };
  for (const [path, kind] of Object.entries(cases)) assert.equal(fileKind(path), kind, path);
});

test('the same secret names the agent is refused: folders like .git or .ssh and their files too', () => {
  for (const p of ['.git/config', '.ssh/known_hosts', 'home/.aws/config', '.npmrc', '.netrc', 'gcp/service-account-prod.json', '.docker/config.json', 'cert.p12']) assert.equal(isSecretFile(p), true, p);
  for (const p of ['.env.sample', 'docs/git.md', 'src/keys.js', 'gitignore.txt']) assert.equal(isSecretFile(p), false, p);
});
