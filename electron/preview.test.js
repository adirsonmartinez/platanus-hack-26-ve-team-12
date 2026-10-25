// Tests for the file preview protocol (qubbot-preview://project/<path>): only files of the open project,
// never a secret, never through a link that leads out. Temporary folders as projects.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { previewPathOf, mimeOf, servePreview, PREVIEW_SCHEME } = require('./preview');

function project(t, files) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'platanus-preview-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content);
  }
  return root;
}

test('previewPathOf: the project path of a preview address; anything else is null', () => {
  assert.equal(PREVIEW_SCHEME, 'qubbot-preview');
  assert.equal(previewPathOf('qubbot-preview://project/index.html'), 'index.html');
  assert.equal(previewPathOf('qubbot-preview://project/site/mi%20p%C3%A1gina.html?v=3#top'), 'site/mi página.html');
  assert.equal(previewPathOf('qubbot-preview://project/'), '');
  assert.equal(previewPathOf('qubbot-preview://project'), '');
  assert.equal(previewPathOf('qubbot-preview://other/index.html'), null, 'only the project host');
  assert.equal(previewPathOf('https://project/index.html'), null);
  // the URL parser resolves dot segments (encoded too) at the address' root: it stays a project path
  assert.equal(previewPathOf('qubbot-preview://project/a/%2e%2e/%2e%2e/etc/passwd'), 'etc/passwd');
  assert.equal(previewPathOf('qubbot-preview://project/a%2f..%2f..%2fx'), null, 'an encoded slash cannot smuggle a step up');
  assert.equal(previewPathOf('qubbot-preview://project/a%00b.html'), null);
  assert.equal(previewPathOf('qubbot-preview://project/%E0%A4%A'), null, 'broken encoding');
  assert.equal(previewPathOf('not a url'), null);
});

test('mimeOf: web types by extension, octet-stream otherwise', () => {
  assert.equal(mimeOf('index.html'), 'text/html; charset=utf-8');
  assert.equal(mimeOf('a/b.CSS'), 'text/css; charset=utf-8');
  assert.equal(mimeOf('app.mjs'), 'text/javascript; charset=utf-8');
  assert.equal(mimeOf('logo.svg'), 'image/svg+xml');
  assert.equal(mimeOf('foto.jpeg'), 'image/jpeg');
  assert.equal(mimeOf('data.json'), 'application/json; charset=utf-8');
  assert.equal(mimeOf('font.woff2'), 'font/woff2');
  assert.equal(mimeOf('archive.bin'), 'application/octet-stream');
});

test('servePreview: a project file with its type; a folder serves its index.html', async (t) => {
  const root = project(t, { 'index.html': '<h1>hola</h1>', 'css/site.css': 'h1{}', 'docs/index.html': '<p>docs</p>' });
  const page = await servePreview(root, 'index.html');
  assert.equal(page.status, 200);
  assert.equal(page.headers['Content-Type'], 'text/html; charset=utf-8');
  assert.equal(page.headers['Cache-Control'], 'no-store', 'an edit shows on reload');
  assert.equal(page.headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(page.body.toString(), '<h1>hola</h1>');
  assert.equal((await servePreview(root, 'css/site.css')).headers['Content-Type'], 'text/css; charset=utf-8');
  assert.equal((await servePreview(root, 'docs')).body.toString(), '<p>docs</p>');
  assert.equal((await servePreview(root, '')).body.toString(), '<h1>hola</h1>', 'the root is its index.html');
});

test('servePreview: missing, no project, secrets and links out are refused', async (t) => {
  const outside = project(t, { 'secret.txt': 'fuera' });
  const root = project(t, {
    'index.html': 'ok', '.env': 'KEY=1', '.env.example': 'KEY=', 'keys/server.pem': 'x', '.git/config': 'x', 'a/.env.local': 'x',
  });
  fs.symlinkSync(path.join(outside, 'secret.txt'), path.join(root, 'link.txt'));
  fs.symlinkSync(path.join(root, '.env'), path.join(root, 'env.html'));
  assert.equal((await servePreview(root, 'nope.html')).status, 404);
  assert.equal((await servePreview(root, 'empty-dir-or-missing/')).status, 404);
  assert.equal((await servePreview(null, 'index.html')).status, 404);
  assert.equal((await servePreview(root, null)).status, 404);
  for (const rel of ['.env', 'a/.env.local', 'keys/server.pem', '.git/config']) {
    assert.equal((await servePreview(root, rel)).status, 403, rel);
  }
  assert.equal((await servePreview(root, '.env.example')).status, 200, 'an env template is fine');
  assert.equal((await servePreview(root, 'link.txt')).status, 403, 'a link out of the project');
  assert.equal((await servePreview(root, 'env.html')).status, 403, 'a harmless name that is a link to a secret');
  assert.equal((await servePreview(root, '../outside')).status, 403);
});

test('servePreview: a file too big for a preview is refused', async (t) => {
  const root = project(t, { 'big.html': 'x'.repeat(64) });
  assert.equal((await servePreview(root, 'big.html', { maxBytes: 10 })).status, 413);
});
