const test = require('node:test');
const assert = require('node:assert/strict');
const { canOpen } = require('./fileOpen');

test('pages, images and PDFs open with the computer; code and scripts never do', () => {
  for (const p of ['index.html', 'web/page.HTM', 'logo.svg', 'docs/guia.pdf', 'a/b.png', 'x.jpeg', 'y.webp', 'z.gif']) assert.equal(canOpen(p), true, p);
  for (const p of ['run.sh', 'app.js', 'Setup.command', 'x.app', 'tool.exe', 'a.py', 'package.json', 'noext', '.env']) assert.equal(canOpen(p), false, p);
});
