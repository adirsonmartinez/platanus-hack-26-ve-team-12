import test from 'node:test';
import assert from 'node:assert/strict';
import { splitAnswer } from '../../renderer/models/answerFormat.js';

test('the suggestions block leaves the answer and becomes next steps', () => {
  const { body, suggestions } = splitAnswer('Todo bien.\n\n```sugerencias\n- Explícamelo más simple\n- reparar: src/db.js\n- auditar: `api/login.js`\n- ver: src\n```');
  assert.equal(body, 'Todo bien.');
  assert.deepEqual(suggestions, [
    { kind: 'ask', text: 'Explícamelo más simple' },
    { kind: 'repair', path: 'src/db.js', text: 'reparar: src/db.js' },
    { kind: 'audit', path: 'api/login.js', text: 'auditar: `api/login.js`' },
    { kind: 'locate', path: 'src', text: 'ver: src' },
  ]);
});

test('while it streams, an unfinished block is hidden', () => {
  const { body, suggestions } = splitAnswer('Listo.\n```sugerencias\n- Revisa');
  assert.equal(body, 'Listo.');
  assert.deepEqual(suggestions, [{ kind: 'ask', text: 'Revisa' }]);
});

test('no block: the answer stays as it is', () => {
  assert.deepEqual(splitAnswer('Hola **mundo**'), { body: 'Hola **mundo**', suggestions: [] });
  assert.deepEqual(splitAnswer(null), { body: '', suggestions: [] });
});

test('at most four suggestions; unsafe paths become plain questions', () => {
  const lines = ['- uno', '- dos', '- tres', '- cuatro', '- cinco'].join('\n');
  assert.equal(splitAnswer(`x\n\`\`\`sugerencias\n${lines}\n\`\`\``).suggestions.length, 4);
  const [s] = splitAnswer('x\n```sugerencias\n- reparar: ../../etc/passwd\n```').suggestions;
  assert.equal(s.kind, 'ask');
});

test('"abrir: ruta" offers to open a file', () => {
  const { suggestions } = splitAnswer('x\n```sugerencias\n- abrir: `index.html`\n```');
  assert.deepEqual(suggestions, [{ kind: 'open', path: 'index.html', text: 'abrir: `index.html`' }]);
});
