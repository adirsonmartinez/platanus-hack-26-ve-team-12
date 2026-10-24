// The robot companion on the map: the person grabs it, drags or throws it, and it lands on a folder
// (or the project's plaza) and asks what to do there.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { Observable } from '../../renderer/core/observable.js';
import { createEventBus, EVENTS } from '../../renderer/core/eventBus.js';
import { RobotViewModel, HOME } from '../../renderer/viewmodels/robotViewModel.js';

function setup({ welcome = false, tour = false, open = true } = {}) {
  const bus = createEventBus();
  const landed = [];
  bus.on(EVENTS.robotLanded, (e) => landed.push(e));
  const projectModel = { store: new Observable({ open, session: 1 }) };
  const mapViewModel = { store: new Observable({ status: open ? 'ready' : 'empty', welcome, plaza: { size: 5, name: 'tienda', counts: { red: 0, yellow: 1 } }, buildings: [{ path: 'src', name: 'src', x: 12, z: 0, files: 7, red: 1, yellow: 0 }] }) };
  const tourViewModel = { store: new Observable({ status: tour ? 'playing' : 'idle' }) };
  const vm = new RobotViewModel({ projectModel, mapViewModel, tourViewModel, bus });
  return { vm, bus, landed, projectModel, mapViewModel, tourViewModel };
}

test('it waits on the plaza while a project is open (not during the welcome or the tour)', () => {
  assert.equal(setup().vm.store.state.visible, true);
  assert.deepEqual(setup().vm.store.state.at, HOME);
  assert.equal(setup({ welcome: true }).vm.store.state.visible, false);
  assert.equal(setup({ tour: true }).vm.store.state.visible, false);
  assert.equal(setup({ open: false }).vm.store.state.visible, false);
});

test('grab and drag: it follows the cursor, lifted', () => {
  const { vm } = setup();
  assert.equal(vm.grab(), true);
  vm.drag({ x: 4, z: 2 });
  assert.equal(vm.store.state.mode, 'held');
  assert.deepEqual(vm.store.state.at, { x: 4, z: 2 });
});

test('dropped on a folder: it flies there, lands beside it, says where it is and asks', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { vm, landed } = setup();
    vm.grab();
    vm.drag({ x: 11.5, z: 0.5 });
    vm.release({ x: 11.5, z: 0.5, vx: 0, vz: 0 });
    const s = vm.store.state;
    assert.equal(s.mode, 'flying');
    assert.ok(s.flight.ms > 0);
    assert.ok(Math.hypot(s.flight.to.x - 12, s.flight.to.z) < 5, 'next to the folder');
    mock.timers.tick(s.flight.ms);
    assert.equal(vm.store.state.mode, 'here');
    assert.equal(vm.store.state.place.path, 'src');
    assert.equal(landed.length, 1);
    assert.deepEqual(landed[0], { path: 'src', kind: 'folder', name: 'src', files: 7, red: 1, yellow: 0 });
    assert.ok(vm.store.state.bubble.title.includes('src'));
  } finally { mock.timers.reset(); }
});

test('thrown: it keeps going the way it was thrown and lands on the folder it reaches', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { vm, landed } = setup();
    vm.grab();
    vm.release({ x: 4, z: 0, vx: 22, vz: 0 }); // fast, toward src at x = 12
    mock.timers.tick(vm.store.state.flight.ms);
    assert.equal(landed[0]?.path, 'src');
  } finally { mock.timers.reset(); }
});

test('dropped on the plaza: it talks about the whole project', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { vm, landed } = setup();
    vm.grab();
    vm.release({ x: 0.5, z: -0.5, vx: 0, vz: 0 });
    mock.timers.tick(vm.store.state.flight.ms);
    assert.deepEqual(landed[0], { path: '', kind: 'project', name: 'tienda', red: 0, yellow: 1 });
  } finally { mock.timers.reset(); }
});

test('dropped where there is nothing: it stays there and says how it works, no question', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { vm, landed } = setup();
    vm.grab();
    vm.release({ x: -20, z: 20, vx: 0, vz: 0 });
    mock.timers.tick(vm.store.state.flight.ms);
    assert.equal(landed.length, 0);
    assert.equal(vm.store.state.place, null);
    assert.equal(vm.store.state.mode, 'idle');
    assert.ok(vm.store.state.bubble.text);
  } finally { mock.timers.reset(); }
});

test('it cannot be grabbed while it flies or while the tour plays; a new project sends it home', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { vm, tourViewModel, projectModel } = setup();
    vm.grab();
    vm.release({ x: 11.5, z: 0, vx: 0, vz: 0 });
    assert.equal(vm.grab(), false, 'flying');
    mock.timers.tick(vm.store.state.flight.ms);
    tourViewModel.store.set({ status: 'playing' });
    assert.equal(vm.grab(), false, 'tour');
    tourViewModel.store.set({ status: 'idle' });
    projectModel.store.set({ session: 2 });
    assert.deepEqual(vm.store.state.at, HOME);
    assert.equal(vm.store.state.place, null);
    assert.equal(vm.store.state.mode, 'idle');
  } finally { mock.timers.reset(); }
});

test('a throw never goes too far', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { vm } = setup();
    vm.grab();
    vm.release({ x: 0, z: 0, vx: 9999, vz: 0 });
    assert.ok(vm.store.state.flight.to.x <= 30);
  } finally { mock.timers.reset(); }
});

test('while held it knows what it is over (the bubble says where it would land)', () => {
  const { vm } = setup();
  vm.grab();
  vm.drag({ x: 10, z: 1 });
  assert.equal(vm.store.state.over, 'src/');
  vm.drag({ x: -20, z: 20 });
  assert.equal(vm.store.state.over, null);
  vm.drag({ x: 0, z: 0 });
  assert.equal(vm.store.state.over, 'tienda');
});

test('let go over a folder while still moving a little: it stays on that folder', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { vm, landed } = setup();
    vm.grab();
    vm.release({ x: 12, z: 0.5, vx: 5, vz: 2 }); // a slow hand is a drop
    mock.timers.tick(vm.store.state.flight.ms);
    assert.equal(landed[0]?.path, 'src');
  } finally { mock.timers.reset(); }
});

test('review: a drag or throw in progress when the robot goes to build is cancelled (no landing, no question)', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const bus = createEventBus();
    const landed = [];
    bus.on(EVENTS.robotLanded, (e) => landed.push(e));
    const projectModel = { store: new Observable({ open: true, session: 1 }) };
    const mapViewModel = { store: new Observable({ status: 'ready', welcome: false, plaza: { size: 5, name: 't' }, buildings: [{ path: 'src', name: 'src', x: 12, z: 0, files: 1, red: 0, yellow: 0 }] }) };
    const buildViewModel = { store: new Observable({ active: false }) };
    const vm = new RobotViewModel({ projectModel, mapViewModel, buildViewModel, bus });
    vm.grab();
    vm.release({ x: 12, z: 0, vx: 0, vz: 0 });
    buildViewModel.store.set({ active: true });
    mock.timers.tick(2000);
    assert.equal(landed.length, 0);
    assert.equal(vm.store.state.mode, 'idle');
  } finally { mock.timers.reset(); }
});

test('while held it marks where it would land (folders of the open tree too); the place keeps what the chat needs', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const bus = createEventBus();
    const projectModel = { store: new Observable({ open: true, session: 1 }) };
    const mapViewModel = { store: new Observable({ status: 'ready', welcome: false, plaza: { size: 5, name: 't' },
      buildings: [{ path: 'src', name: 'src', x: 12, z: 0, files: 3, red: 0, yellow: 1 }],
      branches: [{ folders: [{ path: 'src/routes', name: 'routes', x: 12, z: 14, files: 2, red: 0, yellow: 0 }] }] }) };
    const vm = new RobotViewModel({ projectModel, mapViewModel, bus });
    vm.grab();
    vm.drag({ x: 12.5, z: 13 });
    assert.equal(vm.store.state.over, 'routes/');
    assert.deepEqual(vm.store.state.overAt, { x: 12, z: 14 });
    vm.release({ x: 12.5, z: 13, vx: 0, vz: 0 });
    mock.timers.tick(vm.store.state.flight.ms);
    assert.equal(vm.store.state.place.path, 'src/routes');
    assert.equal(vm.store.state.place.event.yellow, 0);
  } finally { mock.timers.reset(); }
});
