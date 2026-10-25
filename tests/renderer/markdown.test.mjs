import test from 'node:test';
import assert from 'node:assert/strict';
import { markdownToHtml } from '../../renderer/views/ui/markdown.js';

test('bold, italics, inline code and paragraphs', () => {
  const html = markdownToHtml('Revisé **team-12** y *todo* va bien.\n\nUsa `npm test`.');
  assert.equal(html, '<p>Revisé <strong>team-12</strong> y <em>todo</em> va bien.</p><p>Usa <code>npm test</code>.</p>');
});

test('lists and headings become structure', () => {
  const html = markdownToHtml('## Qué encontré\n- **a.js** (rojo)\n- b.js\n\n1. Primero\n2. Segundo');
  assert.equal(html, '<h4>Qué encontré</h4><ul><li><strong>a.js</strong> (rojo)</li><li>b.js</li></ul><ol><li>Primero</li><li>Segundo</li></ol>');
});

test('a bold line followed by a list keeps both', () => {
  const html = markdownToHtml('**Ya revisados:**\n- uno');
  assert.equal(html, '<p><strong>Ya revisados:</strong></p><ul><li>uno</li></ul>');
});

test('code blocks keep their text verbatim', () => {
  const html = markdownToHtml('```sql\nALTER TABLE users ENABLE ROW LEVEL SECURITY;\n```');
  assert.equal(html, '<pre><code>ALTER TABLE users ENABLE ROW LEVEL SECURITY;</code></pre>');
});

test('HTML from the agent or the project is escaped, never executed', () => {
  const html = markdownToHtml('<img src=x onerror=alert(1)> **<b>x</b>** [a](javascript:alert(1))');
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('<b>'));
  assert.ok(!html.includes('href'));
  assert.ok(html.includes('&lt;img'));
});

test('unclosed markers while streaming stay as text', () => {
  assert.equal(markdownToHtml('Revisé **team'), '<p>Revisé **team</p>');
});

test('callouts ("> [!riesgo] Título") become cards with their icon slot', () => {
  const html = markdownToHtml('> [!riesgo] Tu clave está a la vista\n> Cualquiera puede **leerla**.\n\nFin.');
  assert.ok(html.startsWith('<div class="callout callout-danger">'));
  assert.ok(html.includes('data-icon="danger"'));
  assert.ok(html.includes('<strong>Tu clave está a la vista</strong>'));
  assert.ok(html.includes('<p>Cualquiera puede <strong>leerla</strong>.</p>'));
  assert.ok(html.endsWith('<p>Fin.</p>'));
});

test('a callout without title uses its kind; unknown kinds stay a plain quote', () => {
  assert.ok(markdownToHtml('> [!ok]\n> Todo en verde').includes('callout-ok'));
  assert.ok(markdownToHtml('> [!idea] Prueba esto').includes('callout-idea'));
  assert.equal(markdownToHtml('> solo una cita'), '<blockquote><p>solo una cita</p></blockquote>');
});

test('file names in inline code become links to the map', () => {
  const html = markdownToHtml('Mira `src/db.js` y `vercel.json`, no `npm test`.');
  assert.ok(html.includes('<code class="file-ref" data-path="src/db.js" role="button" tabindex="0">src/db.js</code>'));
  assert.ok(html.includes('data-path="vercel.json"'));
  assert.ok(html.includes('<code>npm test</code>'));
});

test('a file link cannot carry HTML or quotes', () => {
  const html = markdownToHtml('`a"onmouseover=x.js`');
  assert.ok(!html.includes('data-path'));
});
