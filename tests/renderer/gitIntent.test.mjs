import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGitIntent as p } from '../../renderer/models/gitIntent.js';

test('commit: many ways to ask', () => {
  const cases = {
    'commit Nuevo modulo': 'Nuevo modulo',
    'necesito crear por favor un commit que se llame prueba2': 'prueba2',
    'haz un commit con mensaje arreglo login': 'arreglo login',
    'realiza un commit: fix auth': 'fix auth',
    'guárdame los cambios: fix pagos': 'fix pagos',
    'oye por favor guarda mis cambios con el mensaje "listo"': 'listo',
    'haz un commit: deshacer bug': 'deshacer bug', // message words must not trigger rollback
    'commit "uno dos"': 'uno dos',
  };
  for (const [text, message] of Object.entries(cases)) assert.deepEqual(p(text), { type: 'commit', message }, text);
  assert.deepEqual(p('confirma los cambios'), { type: 'commit', message: '' });
});

test('revert: HEAD by default, explicit sha when given', () => {
  for (const t of ['rollback', 'deshaz el último commit', 'vuelve atrás', 'quiero volver al commit anterior', 'deshacer commit']) {
    assert.deepEqual(p(t), { type: 'revert', sha: 'HEAD' }, t);
  }
  assert.deepEqual(p('rollback al commit abc1234'), { type: 'revert', sha: 'abc1234' });
  assert.deepEqual(p('revert abc1234'), { type: 'revert', sha: 'abc1234' });
});

test('reset: never guesses a sha (destructive)', () => {
  assert.deepEqual(p('reset'), { type: 'reset', sha: null });
  assert.deepEqual(p('borra todo y empieza de cero'), { type: 'reset', sha: null });
  assert.deepEqual(p('resetear al commit abc1234'), { type: 'reset', sha: 'abc1234' });
});

test('branches', () => {
  assert.deepEqual(p('crea una rama para pagos'), { type: 'createBranch', name: 'pagos' });
  assert.deepEqual(p('crea la rama feature/auth'), { type: 'createBranch', name: 'feature/auth' });
  assert.deepEqual(p('nueva rama login de usuario'), { type: 'createBranch', name: 'login-de-usuario' });
  assert.deepEqual(p('branch dev'), { type: 'createBranch', name: 'dev' });
  assert.deepEqual(p('crear rama'), { type: 'createBranch', name: '' });
  assert.deepEqual(p('cámbiate a main'), { type: 'checkout', target: 'main' });
  assert.deepEqual(p('checkout feature/auth'), { type: 'checkout', target: 'feature/auth' });
  assert.deepEqual(p('cambia a la rama develop'), { type: 'checkout', target: 'develop' });
  assert.deepEqual(p('ve a main'), { type: 'checkout', target: 'main' });
  assert.deepEqual(p('puedes hacer un checkout hasta feature/chat'), { type: 'checkout', target: 'feature/chat' });
  assert.deepEqual(p('haz checkout a la rama develop'), { type: 'checkout', target: 'develop' });
});

test('names never start with "-" (option injection)', () => {
  assert.equal(p('checkout --orphan x').target.startsWith('-'), false);
  assert.equal(p('crea rama --force').name.startsWith('-'), false);
});

test('questions explain, they do not execute', () => {
  assert.deepEqual(p('qué es un rollback'), { type: 'explain', topic: 'rollback' });
  assert.deepEqual(p('cuál es la diferencia entre reset y rollback'), { type: 'explain', topic: 'diff' });
  assert.deepEqual(p('qué es un commit'), { type: 'explain', topic: 'commit' });
  assert.equal(p('qué commit subió secretos'), null);
});

test('non-git text falls through', () => {
  for (const t of ['hola', 'escanear', 'qué stack uso', 'revisa los archivos en rojo', 'corrige la vulnerabilidad']) assert.equal(p(t), null, t);
  assert.deepEqual(p('ayuda'), { type: 'help' });
});
