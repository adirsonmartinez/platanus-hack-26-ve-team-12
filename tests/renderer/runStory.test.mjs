import test from 'node:test';
import assert from 'node:assert/strict';
import { stepLine, runHeadline, runRecap } from '../../renderer/models/runStory.js';

const step = (over) => ({ id: 's', kind: 'tool', name: 'read_file', target: '', status: 'done', parent: null, ...over });

test('a step becomes a short sentence with the file name, not its path', () => {
  assert.deepEqual(stepLine(step({ status: 'running', target: 'src/api/login.js' })),
    { text: 'Leyendo login.js…', name: 'login.js', path: 'src/api/login.js', level: null, status: 'running' });
  assert.equal(stepLine(step({ target: 'src/api/login.js' })).text, 'Leí login.js');
  assert.equal(stepLine(step({ name: 'list_risks' })).text, 'Revisé lo que está en riesgo');
});

test('the traffic light says its color in words', () => {
  const line = stepLine(step({ name: 'set_file_score', target: 'db.js', level: 'red' }));
  assert.equal(line.text, 'Marqué db.js en rojo');
  assert.equal(line.level, 'red');
});

test('no path: the sentence still reads well; errors and helpers too', () => {
  assert.equal(stepLine(step({ status: 'running' })).text, 'Leyendo un archivo…');
  assert.equal(stepLine(step({ name: 'show_folder', target: '' })).text, 'Te mostré tu proyecto en el mapa');
  assert.equal(stepLine(step({ status: 'error', target: 'a.js' })).text, 'No pude terminar: leer a.js');
  assert.equal(stepLine(step({ name: 'unknown_tool' })).text, 'Usé una herramienta de Platanus');
  assert.equal(stepLine({ id: 'h', kind: 'subagent', description: 'Revisar pagos', status: 'running' }).text, 'Un ayudante: Revisar pagos');
});

test('the headline says what it is doing right now', () => {
  const run = { status: 'running', steps: [step({ target: 'a.js' }), step({ id: 't', status: 'running', target: 'src/db.js' })] };
  assert.equal(runHeadline(run, ''), 'Leyendo db.js…');
  assert.equal(runHeadline({ status: 'running', steps: [] }, ''), 'Pensando qué hacer…');
  assert.equal(runHeadline({ status: 'running', steps: [step()] }, 'Hola'), 'Escribiendo la respuesta…');
});

test('when it ends, a recap counts what it did', () => {
  const steps = [
    step({ target: 'a.js' }), step({ target: 'a.js' }), step({ target: 'b.js' }),
    step({ name: 'set_file_score', target: 'a.js', level: 'red' }),
    step({ name: 'set_file_score', target: 'b.js', level: 'green' }),
    step({ name: 'write_file', target: 'a.js' }),
  ];
  assert.equal(runRecap(steps), 'Leí 2 archivos · 1 en rojo · 1 en verde · guardé 1 arreglo');
  assert.equal(runRecap([step({ name: 'list_risks' })]), '1 paso');
  assert.equal(runRecap([]), '');
});

test('waiting for the person to approve a change has its own headline', () => {
  assert.equal(runHeadline({ status: 'running', awaiting: 'src/db.js', steps: [step({ status: 'running', name: 'write_file', target: 'src/db.js' })] }, ''), 'Esperando tu aprobación para guardar db.js…');
});

test('a change the agent was not allowed to make while explaining is told calmly, not as a failure', () => {
  const line = stepLine({ kind: 'tool', name: 'set_file_score', target: 'apps/api/src/routes/orders.ts', status: 'skipped' });
  assert.equal(line.status, 'skipped');
  assert.match(line.text, /No cambié nada/);
  assert.match(line.text, /orders\.ts/);
});

test('a new file is told as created, not as a fix; the recap counts both and starts with a capital', () => {
  const created = { kind: 'tool', name: 'write_file', target: 'src/index.js', status: 'done', diff: { created: true, added: 2, removed: 0 } };
  const edited = { kind: 'tool', name: 'write_file', target: 'README.md', status: 'done', diff: { created: false, added: 1, removed: 1 } };
  assert.match(stepLine(created).text, /^Creé index\.js/);
  assert.match(stepLine(edited).text, /^Guardé el arreglo en README\.md/);
  assert.equal(runRecap([created, { ...created, target: 'src/a.js' }]), 'Creé 2 archivos');
  assert.equal(runRecap([created, edited]), 'Creé 1 archivo · guardé 1 arreglo');
  assert.equal(runRecap([edited]), 'Guardé 1 arreglo');
});
