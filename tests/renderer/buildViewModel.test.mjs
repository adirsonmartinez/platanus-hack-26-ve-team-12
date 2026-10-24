// Building live: while an agent saves files, the robot carries each one as a sheet of paper to its
// folder (a temporary site if the map does not show that folder) and drops it in.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { Observable } from '../../renderer/core/observable.js';
import { createEventBus, EVENTS } from '../../renderer/core/eventBus.js';
import { BuildViewModel, TIMING } from '../../renderer/viewmodels/buildViewModel.js';

function setup({ buildings = [], tree = [], tour = 'idle' } = {}) {
  const bus = createEventBus();
  const chatViewModel = { store: new Observable({ messages: [] }) };
  const mapViewModel = { store: new Observable({ plaza: { size: 5, name: 'tienda' }, buildings, version: 1 }) };
  const projectModel = { store: new Observable({ open: true, tree, session: 1, usesSupabase: false }) };
  const tourViewModel = { store: new Observable({ status: tour }) };
  const vm = new BuildViewModel({ chatViewModel, mapViewModel, projectModel, tourViewModel, bus });
  let seq = 0;
  // a chat run with write steps; returns helpers to change a step's status
  const run = (steps, extra = {}) => {
    const id = ++seq;
    chatViewModel.store.set({ messages: [...chatViewModel.store.state.messages, { id, role: 'bot', run: { status: 'running', steps, ...extra } }] });
    return {
      set(stepId, status) {
        chatViewModel.store.set({ messages: chatViewModel.store.state.messages.map((m) => (m.id === id ? { ...m, run: { ...m.run, steps: m.run.steps.map((s) => (s.id === stepId ? { ...s, status } : s)) } } : m)) });
      },
      update(fn) { chatViewModel.store.set({ messages: chatViewModel.store.state.messages.map((m) => (m.id === id ? { ...m, run: fn(m.run) } : m)) }); },
    };
  };
  const write = (id, target, status = 'running') => ({ id, kind: 'tool', name: 'write_file', target, status });
  return { vm, bus, run, write, chatViewModel, mapViewModel, tourViewModel };
}

test('an agent starts saving a file: the robot carries it to its folder, which rises as a site', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { vm, run, write } = setup();
    run([write('w1', 'src/routes/orders.js')]);
    const s = vm.store.state;
    assert.equal(s.active, true);
    assert.deepEqual(s.sites.map((x) => [x.folder, x.kind, x.papers]), [['src', 'ghost', 0]]);
    assert.equal(s.guide.pose, 'carry');
    assert.equal(s.guide.carrying, true);
    assert.match(s.guide.text, /orders\.js/);
    assert.ok(Math.hypot(s.guide.to.x - s.sites[0].x, s.guide.to.z - s.sites[0].z) < 5, 'it goes next to the folder');
  } finally { mock.timers.reset(); }
});

test('saved as a new file: it drops the paper into the folder (one more sheet)', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { vm, bus, run, write } = setup();
    const r = run([write('w1', 'src/a.js')]);
    bus.emit(EVENTS.agentChanged, { path: 'src/a.js', diff: { created: true, added: 3, removed: 0 } });
    r.set('w1', 'done');
    mock.timers.tick(TIMING.walkMaxMs); // it arrives
    assert.equal(vm.store.state.guide.pose, 'drop');
    assert.equal(vm.store.state.drop?.folder, 'src', 'the view animates the paper going in');
    mock.timers.tick(TIMING.dropMs);
    assert.equal(vm.store.state.sites[0].papers, 1);
  } finally { mock.timers.reset(); }
});

test('an existing file that changes: it points at the folder, no new sheet', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const tree = [{ type: 'dir', path: 'src', children: [{ type: 'file', path: 'src/a.js' }] }];
    const { vm, run, write } = setup({ tree });
    const r = run([write('w1', 'src/a.js')]);
    r.set('w1', 'done');
    mock.timers.tick(TIMING.walkMaxMs); mock.timers.tick(TIMING.dropMs);
    const site = vm.store.state.sites[0];
    assert.deepEqual([site.papers, site.edits], [0, 1]);
  } finally { mock.timers.reset(); }
});

test('waiting for the person: it says so, holding the paper; not saved: it says so and keeps going', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { vm, run, write } = setup();
    const r = run([write('w1', 'src/a.js'), write('w2', 'docs/b.md')]);
    r.update((x) => ({ ...x, awaiting: 'src/a.js' }));
    assert.match(vm.store.state.guide.text, /permiso/i);
    assert.equal(vm.store.state.guide.carrying, true);
    r.update((x) => ({ ...x, awaiting: null }));
    r.set('w1', 'error');
    mock.timers.tick(TIMING.walkMaxMs);
    assert.match(vm.store.state.guide.text, /no se guardó/i);
    assert.equal(vm.store.state.guide.carrying, false);
    mock.timers.tick(TIMING.failMs);
    assert.match(vm.store.state.guide.text, /b\.md/, 'then the next file');
    assert.equal(vm.store.state.sites.find((x) => x.folder === 'src').papers, 0);
  } finally { mock.timers.reset(); }
});

test('several files: one at a time, in order; root files go to the plaza; a folder on the map is used as it is', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { vm, run, write } = setup({ buildings: [{ path: 'db', x: 12, z: 0 }] });
    const r = run([write('w1', 'README.md'), write('w2', 'db/001.sql'), write('w3', 'src/x.js')]);
    const kinds = Object.fromEntries(vm.store.state.sites.map((x) => [x.folder, x.kind]));
    assert.deepEqual(kinds, { '': 'plaza', db: 'building', src: 'ghost' });
    assert.equal(vm.store.state.sites.find((x) => x.folder === 'db').x, 12);
    assert.match(vm.store.state.guide.text, /README/);
    for (const id of ['w1', 'w2', 'w3']) { r.set(id, 'done'); mock.timers.tick(TIMING.walkMaxMs); mock.timers.tick(TIMING.dropMs); }
    assert.deepEqual(vm.store.state.sites.map((x) => x.papers + x.edits), [1, 1, 1]);
  } finally { mock.timers.reset(); }
});

test('when the work is over it lingers a moment, then the sites go and the robot is free', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { vm, run, write } = setup();
    const r = run([write('w1', 'src/a.js')]);
    r.set('w1', 'done');
    mock.timers.tick(TIMING.walkMaxMs); mock.timers.tick(TIMING.dropMs);
    assert.equal(vm.store.state.active, true);
    mock.timers.tick(TIMING.lingerMs);
    assert.equal(vm.store.state.active, false);
    assert.deepEqual(vm.store.state.sites, []);
    assert.equal(vm.store.state.guide, null);
  } finally { mock.timers.reset(); }
});

test('repairs count too (their run card has the same write steps); nothing happens during the tour', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const repair = setup();
    repair.run([repair.write('r1', 'vercel.json')], { kind: 'repair' });
    assert.equal(repair.vm.store.state.active, true);
    const touring = setup({ tour: 'playing' });
    touring.run([touring.write('w1', 'src/a.js')]);
    assert.equal(touring.vm.store.state.active, false);
  } finally { mock.timers.reset(); }
});

test('when the last file is in, the robot says what it built and waves', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { vm, run, write } = setup();
    const r = run([write('w1', 'src/a.js'), write('w2', 'src/b.js')]);
    for (const id of ['w1', 'w2']) { r.set(id, 'done'); mock.timers.tick(TIMING.walkMaxMs); mock.timers.tick(TIMING.dropMs); }
    const g = vm.store.state.guide;
    assert.equal(g.pose, 'wave');
    assert.match(g.text, /2 archivos nuevos/);
    assert.ok(g.stepId.endsWith(':done'));
  } finally { mock.timers.reset(); }
});

test('review: a save reported before its tool event (OpenCode) is one file, not two', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { vm, run } = setup();
    // the chat adds a done step from the change first, then the tool event takes it over (new id, running), then done
    const r = run([{ id: 'change-1', kind: 'tool', name: 'write_file', target: 'src/a.js', status: 'done', fromChange: true, diff: { created: true } }]);
    r.update((x) => ({ ...x, steps: x.steps.map((s) => ({ ...s, id: 't1', status: 'running', fromChange: false })) }));
    r.set('t1', 'done');
    mock.timers.tick(TIMING.walkMaxMs); mock.timers.tick(TIMING.dropMs); mock.timers.tick(TIMING.walkMaxMs); mock.timers.tick(TIMING.dropMs);
    assert.equal(vm.store.state.sites[0].papers, 1);
    assert.match(vm.store.state.guide.text, /1 archivo nuevo/);
  } finally { mock.timers.reset(); }
});

test('review: the card disappearing (new chat) never leaves the robot stuck carrying', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { vm, run, write, chatViewModel } = setup();
    run([write('w1', 'src/a.js'), write('w2', 'src/b.js')]);
    mock.timers.tick(TIMING.walkMaxMs);
    chatViewModel.store.set({ messages: [] });
    mock.timers.tick(TIMING.failMs);
    mock.timers.tick(TIMING.lingerMs);
    assert.equal(vm.store.state.active, false);
    assert.equal(vm.store.state.guide, null);
  } finally { mock.timers.reset(); }
});

test('review: new or changed is decided per write (the step diff), not per path', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { vm, run } = setup();
    const r = run([
      { id: 'w1', kind: 'tool', name: 'write_file', target: 'src/a.js', status: 'running' },
      { id: 'w2', kind: 'tool', name: 'write_file', target: 'src/a.js', status: 'running' },
    ]);
    r.update((x) => ({ ...x, steps: x.steps.map((s) => (s.id === 'w1' ? { ...s, status: 'done', diff: { created: true } } : s)) }));
    mock.timers.tick(TIMING.walkMaxMs); mock.timers.tick(TIMING.dropMs);
    r.update((x) => ({ ...x, steps: x.steps.map((s) => (s.id === 'w2' ? { ...s, status: 'done', diff: { created: false } } : s)) }));
    mock.timers.tick(TIMING.walkMaxMs); mock.timers.tick(TIMING.editMs);
    assert.deepEqual([vm.store.state.sites[0].papers, vm.store.state.sites[0].edits], [1, 1]);
  } finally { mock.timers.reset(); }
});

test('review: starting the tour stops the work on the map at once; explaining runs build nothing', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { vm, run, write, tourViewModel } = setup();
    run([write('w1', 'src/a.js')]);
    assert.equal(vm.store.state.active, true);
    tourViewModel.store.set({ status: 'playing' });
    assert.equal(vm.store.state.active, false);
    assert.deepEqual(vm.store.state.sites, []);

    const second = setup();
    second.run([second.write('w1', 'src/a.js')], { intent: 'explain' });
    assert.equal(second.vm.store.state.active, false);
  } finally { mock.timers.reset(); }
});
