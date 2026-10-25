import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGitIntent as p, looksLikeGit } from '../../renderer/models/gitIntent.js';
const C = (m) => ({ type: 'commit', message: m });
const R = (s = 'HEAD') => ({ type: 'revert', sha: s });
const Z = (s = null) => ({ type: 'reset', sha: s });
const B = (n) => ({ type: 'createBranch', name: n });
const K = (n) => ({ type: 'checkout', target: n });
const cases = [
  // commit
  ['haz commit', C('')], ['hazme un commit que se llame arreglo', C('arreglo')], ['quiero hacer un commit llamado prueba3', C('prueba3')],
  ['crea un commit con el nombre inicial', C('inicial')], ['necesito un commit: agregar login', C('agregar login')],
  ['sube mis cambios con el mensaje fix', C('fix')], ['guarda todo con mensaje listo', C('listo')], ['commitea: v1', C('v1')],
  ['puedes hacer un commit que diga "ajuste de estilos"', C('ajuste de estilos')], ['por favor haz un commit llamado prueba 4', C('prueba 4')],
  ['registra los cambios como primera version', C('primera version')], ['git commit -m hola', C('-m hola')],
  ['crea un commit', C('')], ['commit', C('')], ['hacer commit "x"', C('x')],
  // revert
  ['quiero hacer rollback', R()], ['haz un rollback', R()], ['necesito deshacer el ultimo commit', R()], ['revierte el commit abc1234', R('abc1234')],
  ['revierte el ultimo cambio', R()], ['vuelve atras por favor', R()], ['deshaz lo ultimo', R()], ['haz rollback del commit 1a2b3c4', R('1a2b3c4')],
  ['anula el ultimo commit', R()], ['quita el ultimo commit', R()], ['deshacer', R()], ['git revert abc1234', R('abc1234')],
  // reset
  ['haz un reset', Z()], ['quiero hacer reset al commit abc1234', Z('abc1234')], ['resetea el proyecto', Z()], ['vuelve al principio', Z()],
  ['reinicia todo', Z()], ['git reset --hard abc1234', Z('abc1234')], ['haz reset hasta el commit 1a2b3c4', Z('1a2b3c4')],
  // create branch
  ['crea una rama llamada pruebas', B('pruebas')], ['quiero crear una rama feature/login', B('feature/login')], ['necesito una nueva rama que se llame hotfix', B('hotfix')],
  ['haz una rama nueva para el menu', B('menu')], ['crea rama test', B('test')], ['puedes crear una rama de nombre demo', B('demo')],
  ['abre una rama para reportes', B('reportes')], ['crea una rama y llamala qa', B('qa')], ['git branch nueva', B('nueva')], ['git checkout -b feature/x', K('feature/x')],
  ['crea la branch dev2', B('dev2')], ['hazme una rama chat-v2', B('chat-v2')],
  // checkout
  ['quiero hacer checkout a develop', K('develop')], ['haz checkout develop', K('develop')], ['checkout a main', K('main')], ['hazme un checkout hasta feature/chat', K('feature/chat')],
  ['cambia a la rama main', K('main')], ['cambiate a develop', K('develop')], ['quiero cambiar a la rama pruebas', K('pruebas')], ['muevete a la rama qa', K('qa')],
  ['ir a la rama main', K('main')], ['pasa a develop', K('develop')], ['necesito que cambies a la rama prueba2', K('prueba2')], ['vamos a la rama feature/chat', K('feature/chat')],
  ['git switch main', K('main')], ['cambia de rama a main', K('main')], ['mudate a la rama develop', K('develop')],
  // not git
  ['hola', null], ['corrige la vulnerabilidad', null], ['que stack uso', null],
];
test('phrase table: many ways to ask for each command', () => {
  for (const [text, want] of cases) assert.deepEqual(p(text), want, text);
});

test('git talk that is not understood shows the help; questions and other topics do not', () => {
  assert.equal(looksLikeGit('haz algo raro con la rama'), true);
  assert.equal(looksLikeGit('que commit subio secretos'), false);
  assert.equal(looksLikeGit('hola'), false);
});
