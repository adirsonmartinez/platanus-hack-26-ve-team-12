// The tour ("Recorrido"): analyzes the open project, plays its stops on the map (camera, guide robot,
// ghost places) and lets the agent narrate them when one is connected.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Observable } from '../../renderer/core/observable.js';
import { createEventBus, EVENTS } from '../../renderer/core/eventBus.js';
import { TourViewModel } from '../../renderer/viewmodels/tourViewModel.js';

const node = (path, children) => (children ? { type: 'dir', path, children } : { type: 'file', path, size: 10 });
const TREE = [
  node('package.json'), node('README.md'),
  node('src', [node('src/server.js'), node('src/routes', [node('src/routes/orders.js')]), node('src/models', [node('src/models/order.js')])]),
  node('public', [node('public/index.html')]),
  node('tests', [node('tests/orders.test.js')]),
];
const FILES = { 'package.json': JSON.stringify({ main: 'src/server.js', scripts: { start: 'node src/server.js', test: 'node --test' } }), 'README.md': '# Tienda\n## Cómo empezar\n' };

function setup({ connection = { live: false }, busy = false, tech = false } = {}) {
  const bus = createEventBus();
  const events = [];
  for (const type of [EVENTS.tourStarted, EVENTS.tourStep, EVENTS.tourEnded]) bus.on(type, (p) => events.push([type, p]));
  const flights = [];
  const camera = { flyTo: (to, zoom) => flights.push([to, zoom]), saveView: () => ({ target: { x: 3, z: 4 }, zoom: 0.8 }), restoreView: (v) => flights.push(['restore', v]) };
  const projectModel = { store: new Observable({ open: true, name: 'tienda', tree: TREE, session: 1, version: 1 }) };
  const reads = [];
  const workspace = { read: async (p) => { reads.push(p); return { ok: true, data: FILES[p] ?? '' }; } };
  let wentUp = 0;
  const mapViewModel = { store: new Observable({ plaza: { size: 5 }, buildings: [{ path: 'src', x: 12, z: 0 }] }), goUp: () => { wentUp++; } };
  const vm = new TourViewModel({
    projectModel, workspace, connection, bus, camera, mapViewModel,
    modeModel: { tech }, repairViewModel: { busy }, timing: { agentTimeoutMs: 40 },
  });
  return { vm, events, flights, reads, projectModel, wentUp: () => wentUp };
}
const step = (vm) => vm.store.state.tour.steps[vm.store.state.index];

test('without an agent: the scripted tour starts on the plaza, the robot and the camera go there', async () => {
  const { vm, events, flights, reads, wentUp } = setup();
  const result = await vm.start();
  assert.equal(result.ok, true);
  const s = vm.store.state;
  assert.equal(s.status, 'playing');
  assert.equal(s.tour.source, 'script');
  assert.equal(s.index, 0);
  assert.equal(step(vm).kind, 'place');
  assert.deepEqual(s.guide.to, { x: 1.1, z: 1.1 });
  assert.equal(s.guide.title, step(vm).title);
  assert.deepEqual(flights.at(-1)[0], { x: 0, z: 0 });
  assert.ok(reads.includes('package.json') && reads.includes('README.md'));
  assert.equal(wentUp(), 1, 'an open folder closes first');
  assert.deepEqual(events.map((e) => e[0]), [EVENTS.tourStarted, EVENTS.tourStep]);
  assert.equal(events[1][1].index, 0);
  assert.equal(events[1][1].total, s.tour.steps.length);
});

test('next / prev move between stops within bounds; each stop flies the camera and walks the robot', async () => {
  const { vm, flights } = setup();
  await vm.start();
  vm.prev();
  assert.equal(vm.store.state.index, 0);
  const before = flights.length;
  vm.next();
  assert.equal(vm.store.state.index, 1);
  assert.equal(flights.length, before + 1);
  const last = vm.store.state.tour.steps.length - 1;
  vm.goTo(last);
  assert.equal(step(vm).kind, 'start');
  vm.next();
  assert.equal(vm.store.state.index, last);
  const folder = vm.store.state.tour.steps.findIndex((x) => x.target === 'tests');
  vm.goTo(folder);
  assert.equal(vm.store.state.current.kind, 'ghost');
  assert.ok(vm.store.state.guide.walkMs >= 600 && vm.store.state.guide.walkMs <= 1800);
  assert.ok(vm.store.state.ghosts.some((g) => g.path === 'tests' && g.current));
});

test('exit puts the camera back and removes the robot and the ghosts', async () => {
  const { vm, events, flights } = setup();
  await vm.start();
  vm.next();
  vm.exit();
  assert.deepEqual(flights.at(-1), ['restore', { target: { x: 3, z: 4 }, zoom: 0.8 }]);
  assert.equal(vm.store.state.status, 'idle');
  assert.equal(vm.store.state.guide, null);
  assert.deepEqual(vm.store.state.ghosts, []);
  assert.equal(events.at(-1)[0], EVENTS.tourEnded);
});

test('with an agent: its valid text replaces the script, on the same stop', async () => {
  let asked;
  const connection = {
    live: true, agentLabel: 'Claude',
    ask: async (prompt, _sys, opts) => {
      asked = { prompt, opts };
      return { text: JSON.stringify({ summary: 'Una tienda', steps: { place: { title: 'Tu tienda', say: 'Es una sola app' }, doc1: { title: 'Lee esto', say: 'La portada' }, part1: { title: 'Código', say: 'Aquí está el código' }, entry: { title: 'Inicio', say: 'Arranca aquí' } }, start: { say: 'Abre el README', open: 'README.md' } }) };
    },
  };
  const { vm, events } = setup({ connection });
  await vm.start();
  await vm.settled;
  assert.equal(asked.opts.session, 'tour');
  assert.equal(asked.opts.voice.purpose, 'tour');
  assert.ok(asked.prompt.includes('"monolith"'));
  const s = vm.store.state;
  assert.equal(s.tour.source, 'agent');
  assert.equal(s.tour.agent, 'Claude');
  assert.equal(s.writing, false);
  assert.equal(step(vm).title, 'Tu tienda');
  assert.equal(s.guide.title, 'Tu tienda');
  assert.equal(events.at(-1)[1].step.title, 'Tu tienda', 'the card gets the new text');
});

test('a bad answer, an error or no answer in time: the script stays', async () => {
  for (const ask of [async () => ({ text: 'no es json' }), async () => ({ text: '', error: 'boom' }), () => new Promise(() => {})]) {
    const { vm } = setup({ connection: { live: true, agentLabel: 'Claude', ask } });
    await vm.start();
    await vm.settled;
    assert.equal(vm.store.state.tour.source, 'script');
    assert.equal(vm.store.state.writing, false);
  }
});

test('an agent that tries to change a file during the tour is stopped (the tour only reads)', async () => {
  let signal;
  const connection = {
    live: true, agentLabel: 'Claude',
    ask: (_p, _s, opts) => new Promise((resolve) => {
      signal = opts.signal;
      opts.onEvent({ type: 'tool', id: 't1', name: 'write_file', target: 'src/server.js' });
      resolve({ text: JSON.stringify({ steps: { place: { say: 'x' }, doc1: { say: 'x' }, part1: { say: 'x' }, entry: { say: 'x' } }, start: { say: 'x' } }) });
    }),
  };
  const { vm } = setup({ connection });
  await vm.start();
  await vm.settled;
  assert.equal(signal.aborted, true);
  assert.equal(vm.store.state.tour.source, 'script');
});

test('not while Remi repairs; and opening another project ends it', async () => {
  const busy = setup({ busy: true });
  assert.deepEqual(await busy.vm.start(), { ok: false, reason: 'busy' });
  assert.equal(busy.vm.store.state.status, 'idle');

  const { vm, projectModel, events } = setup();
  await vm.start();
  projectModel.store.set({ session: 2 });
  assert.equal(vm.store.state.status, 'idle');
  assert.equal(events.at(-1)[0], EVENTS.tourEnded);
});

test('Dev mode tells the stops with paths', async () => {
  const { vm } = setup({ tech: true });
  await vm.start();
  vm.goTo(vm.store.state.tour.steps.findIndex((x) => x.id === 'entry'));
  assert.ok(step(vm).say.includes('src/server.js'));
});
