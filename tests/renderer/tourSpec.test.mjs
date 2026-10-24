// The tour's text: written by the agent (validated against the analyzer's facts) or by the script.
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeProject, planSteps } from '../../renderer/models/projectAnalyzer.js';
import { parseTour, scriptedTour, mergeTour, factsForAgent } from '../../renderer/models/tourSpec.js';

const node = (path, children) => (children ? { type: 'dir', path, children } : { type: 'file', path, size: 10 });
const TREE = [
  node('package.json'), node('README.md'), node('.env'),
  node('docs', [node('docs/arquitectura.md')]),
  node('src', [node('src/server.js'), node('src/routes', [node('src/routes/orders.js'), node('src/routes/products.js')]), node('src/models', [node('src/models/order.js')])]),
  node('public', [node('public/index.html'), node('public/app.js')]),
  node('tests', [node('tests/orders.test.js')]),
];
const CONTENTS = new Map([
  ['package.json', JSON.stringify({ main: 'src/server.js', scripts: { start: 'node src/server.js', test: 'node --test' }, dependencies: { express: '4' } })],
  ['README.md', '# Tienda\n## Cómo empezar\n'],
]);
const facts = analyzeProject(TREE, CONTENTS);
const slots = planSteps(facts);
const ids = slots.map((s) => s.id);

const agentAnswer = (over = {}) => JSON.stringify({
  summary: 'Una tienda con su servidor',
  steps: Object.fromEntries(slots.filter((s) => s.kind !== 'usecase' && s.kind !== 'start').map((s) => [s.id, { title: `Título ${s.id}`, say: `Texto de ${s.id}`, bubble: `Globo ${s.id}` }])),
  usecases: [{ candidate: 'uc1', title: 'Hacer un pedido', say: 'El pedido entra por aquí', flow: ['src/routes/orders.js', 'src/models/order.js'] }],
  start: { say: 'Empieza leyendo el README', open: 'README.md', folder: 'src', ask: '¿Cómo se guarda un pedido?' },
  ...over,
});

test('the script tells every stop, in plain words, without an agent (Vibe and Dev differ)', () => {
  const vibe = scriptedTour(facts, slots, 'vibe');
  assert.equal(vibe.source, 'script');
  assert.deepEqual(vibe.steps.map((s) => s.id), ids);
  for (const s of vibe.steps) assert.ok(s.title && s.say && s.bubble, s.id);
  assert.equal(vibe.architecture.kind, 'monolith');
  const dev = scriptedTour(facts, slots, 'dev');
  assert.notEqual(dev.steps[0].say, vibe.steps[0].say);
  assert.deepEqual(scriptedTour(facts, slots, 'vibe'), vibe, 'deterministic');
  const usecase = vibe.steps.find((s) => s.kind === 'usecase');
  assert.equal(usecase.target, 'src/routes/orders.js');
  assert.deepEqual(usecase.flow, ['src/routes/orders.js']);
  const start = vibe.steps.at(-1);
  assert.equal(start.open, 'README.md');
});

test('a valid agent answer (fenced or loose) is accepted', () => {
  assert.ok(parseTour(`Aquí va:\n\`\`\`json\n${agentAnswer()}\n\`\`\``, facts, slots));
  const tour = parseTour(`texto ${agentAnswer()} más texto`, facts, slots);
  assert.equal(tour.summary, 'Una tienda con su servidor');
  assert.equal(tour.steps.place.title, 'Título place');
});

test('only stops and paths that exist count: unknown ids, made up or secret paths are dropped', () => {
  const tour = parseTour(agentAnswer({
    steps: { ...JSON.parse(agentAnswer()).steps, inventado: { title: 'x', say: 'y' } },
    usecases: [
      { candidate: 'uc9', title: 'No existe', say: 'x', flow: [] },
      { candidate: 'uc2', title: 'Ver productos', say: 'Mira', flow: ['src/routes/products.js', 'no/existe.js', '.env'] },
    ],
    start: { say: 'Empieza', open: '.env', folder: 'no-existe', ask: 'x' },
  }), facts, slots);
  assert.equal(tour.steps.inventado, undefined);
  assert.deepEqual(tour.usecases.map((u) => u.candidate), ['uc2']);
  assert.deepEqual(tour.usecases[0].flow, ['src/routes/products.js']);
  assert.equal(tour.start.open, null);
  assert.equal(tour.start.folder, null);
});

test('text is plain and short: no HTML, Markdown, links, and trimmed', () => {
  const tour = parseTour(agentAnswer({ summary: `<b>Hola</b> **mundo** https://malo.example/x ${'a'.repeat(400)}` }), facts, slots);
  assert.ok(!/[<>*]|https?:/.test(tour.summary));
  assert.ok(tour.summary.length <= 240);
});

test('"skip" may hide a folder or file stop, never the plaza nor the start', () => {
  const tour = parseTour(agentAnswer({ skip: ['place', 'start', 'tests'] }), facts, slots);
  assert.deepEqual(tour.skip, ['tests']);
});

test('too little valid text means no agent tour (the script is used)', () => {
  assert.equal(parseTour(JSON.stringify({ steps: { place: { title: 'x', say: 'y' } } }), facts, slots), null);
  assert.equal(parseTour('no es json', facts, slots), null);
});

test('merged: agent text where valid, script elsewhere; the architecture and the stops never come from the agent', () => {
  const agent = parseTour(agentAnswer({ architecture: { kind: 'microservices' }, skip: ['tests'] }), facts, slots);
  const tour = mergeTour(scriptedTour(facts, slots, 'vibe'), agent, { agent: 'Claude' });
  assert.equal(tour.source, 'agent');
  assert.equal(tour.agent, 'Claude');
  assert.equal(tour.architecture.kind, 'monolith');
  assert.ok(!tour.steps.some((s) => s.id === 'tests'));
  assert.equal(tour.steps[0].title, 'Título place');
  const usecase = tour.steps.find((s) => s.kind === 'usecase');
  assert.equal(usecase.title, 'Hacer un pedido');
  assert.equal(usecase.target, 'src/routes/orders.js');
  assert.deepEqual(usecase.flow, ['src/routes/orders.js', 'src/models/order.js']);
  const start = tour.steps.at(-1);
  assert.equal(start.say, 'Empieza leyendo el README');
  assert.equal(start.folder, 'src');
  assert.equal(mergeTour(scriptedTour(facts, slots, 'vibe'), null).source, 'script');
});

test('what the agent receives: the facts, no secrets, no file contents', () => {
  const sent = JSON.stringify(factsForAgent(facts, slots));
  assert.ok(sent.includes('"monolith"') && sent.includes('src/server.js') && sent.includes('Cómo empezar'));
  assert.ok(!sent.includes('.env'));
  assert.ok(JSON.parse(sent).stops.every((s) => ids.includes(s.id)));
});
