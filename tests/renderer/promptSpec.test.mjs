import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSpec, localSpec, specToPrompt, isSpec } from '../../renderer/models/promptSpec.js';

const tree = ['src/api/login.js', 'src/db.js'].map((path) => ({ path, type: 'file' }));
const agentJson = {
  objective: 'Que nadie entre sin contraseña',
  problem: 'El login acepta cualquier clave',
  scope: ['src/api/login.js', '../../etc/passwd'],
  constraints: ['No cambiar la pantalla de inicio'],
  tasks: [
    { id: 'X9', do: 'Escribir una prueba que entre con clave falsa', accept: 'La prueba falla hoy' },
    { do: 'Revisar la clave en el login', accept: 'La prueba pasa' },
  ],
  test: { red: 'Entrar con clave falsa da acceso', green: 'Entrar con clave falsa da error', refactor: 'Quitar código repetido' },
  extra: 'ignored',
};

test('the agent answer (JSON, even fenced) becomes a typed spec; unsafe paths and unknown keys are dropped', () => {
  const spec = parseSpec(`Aquí va:\n\`\`\`json\n${JSON.stringify(agentJson)}\n\`\`\``);
  assert.deepEqual(spec.scope, ['src/api/login.js']);
  assert.deepEqual(spec.tasks.map((t) => t.id), ['T1', 'T2']);
  assert.equal(spec.test.red, 'Entrar con clave falsa da acceso');
  assert.equal('extra' in spec, false);
});

test('no objective or no tasks: not a spec', () => {
  assert.equal(parseSpec('no es json'), null);
  assert.equal(parseSpec(JSON.stringify({ objective: 'x', tasks: [] })), null);
  assert.equal(parseSpec(JSON.stringify({ tasks: [{ do: 'a' }] })), null);
});

test('without an agent, a local spec follows test first: RED, GREEN, REFACTOR', () => {
  const spec = localSpec('repara el login', { tree });
  assert.equal(spec.objective, 'Repara el login');
  assert.deepEqual(spec.scope, ['src/api/login.js']);
  assert.equal(spec.tasks.length, 3);
  assert.deepEqual(spec.tasks.map((t) => t.id), ['T1', 'T2', 'T3']);
  assert.ok(spec.test.red && spec.test.green && spec.test.refactor);
});

test('Vibe writes the spec in plain words; Dev with the TDD names', () => {
  const spec = parseSpec(JSON.stringify(agentJson));
  const vibe = specToPrompt(spec, 'vibe');
  assert.match(vibe, /^## Qué quiero\nQue nadie entre sin contraseña/);
  assert.match(vibe, /- T1 · Escribir una prueba que entre con clave falsa\n {2}- Listo cuando: La prueba falla hoy/);
  assert.match(vibe, /## Primero la prueba/);
  assert.match(vibe, /`src\/api\/login.js`/);
  const dev = specToPrompt(spec, 'dev');
  assert.match(dev, /^## Objetivo/);
  assert.match(dev, /RED: Entrar con clave falsa da acceso/);
  assert.match(dev, /GREEN: .*\n.*REFACTOR: /);
});

test('a sent spec is recognized (the chat shows it formatted); ordinary text is not', () => {
  assert.equal(isSpec(specToPrompt(parseSpec(JSON.stringify(agentJson)), 'vibe')), true);
  assert.equal(isSpec(specToPrompt(parseSpec(JSON.stringify(agentJson)), 'dev')), true);
  assert.equal(isSpec('## hola\nnada más'), false);
  assert.equal(isSpec('repara el login'), false);
});
