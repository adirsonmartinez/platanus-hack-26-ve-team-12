import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzePrompt, completions, applyCompletion } from '../../renderer/models/promptAssist.js';

const tree = ['src', 'src/api', 'src/api/login.js', 'src/db.js', 'vercel.json', '.github/workflows/release.yml', '.env']
  .map((path) => ({ path, type: path.includes('.') ? 'file' : 'dir' }));
const kinds = (hints) => hints.map((h) => h.kind);

test('a very short message asks for a bit more detail', () => {
  assert.deepEqual(kinds(analyzePrompt('arregla', tree)), ['short']);
  assert.deepEqual(analyzePrompt('', tree), []);
});

test('an action without a file suggests the file it probably means', () => {
  const [hint] = analyzePrompt('repara el login por favor', tree);
  assert.equal(hint.kind, 'noTarget');
  assert.equal(hint.path, 'src/api/login.js');
  assert.deepEqual(analyzePrompt('revisa `src/db.js` y dime si es seguro', tree), []);
  assert.deepEqual(analyzePrompt('revisa vercel.json y dime si es seguro', tree), []); // named without backticks
});

test('something that looks like a secret is flagged before it is sent', () => {
  // built at run time: written out, it would trip the repo's own credential scan (tests/secrets.test.mjs)
  const stripe = ['sk', 'live', '51Habcdefghijklmnop'].join('_');
  assert.ok(kinds(analyzePrompt(`mi clave es ${stripe} y no funciona`, tree)).includes('secret'));
  assert.ok(kinds(analyzePrompt('la contraseña: Hunter2024! no entra', tree)).includes('secret'));
});

test('@ or the start of a file name completes it with its path', () => {
  const [item] = completions('revisa @log', tree);
  assert.deepEqual(item, { kind: 'file', label: 'login.js', detail: 'src/api/login.js', insert: '`src/api/login.js` ' });
  assert.equal(completions('revisa verc', tree)[0].detail, 'vercel.json');
  assert.equal(applyCompletion('revisa @log', item), 'revisa `src/api/login.js` ');
});

test('files that hold secrets are never offered; finished words get nothing', () => {
  assert.deepEqual(completions('mira @.en', tree), []);
  assert.deepEqual(completions('hola mundo ', tree), []);
  assert.deepEqual(completions('revisa @zzz', tree), []);
});

test('an empty box gets no completions (the chat shows ways to start)', () => {
  assert.deepEqual(completions('', tree), []);
});

test('files inside folders are found too (the project tree is nested)', () => {
  const nested = [{ path: 'src', type: 'dir', children: [{ path: 'src/lib', type: 'dir', children: [{ path: 'src/lib/auth.ts', type: 'file' }] }] }];
  assert.equal(completions('revisa @auth', nested)[0].detail, 'src/lib/auth.ts');
  assert.equal(analyzePrompt('repara el auth por favor', nested)[0].path, 'src/lib/auth.ts');
});
