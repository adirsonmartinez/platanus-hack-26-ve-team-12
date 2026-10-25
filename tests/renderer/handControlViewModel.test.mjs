import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { HandControlViewModel } from '../../renderer/viewmodels/handControlViewModel.js';
import { CameraViewModel } from '../../renderer/viewmodels/cameraViewModel.js';

// Same hand as in handGesture.test.mjs
function hand(x, y, gap, turn = 0) {
  const points = Array.from({ length: 21 }, () => ({ x, y, z: 0 }));
  points[0] = { x, y: y + 0.2, z: 0 };
  points[9] = { x, y, z: 0 };
  points[4] = { x: x - gap / 2, y: y - 0.05, z: 0 };
  points[8] = { x: x + gap / 2, y: y - 0.05, z: 0 };
  const cx = x, cy = y + 0.2 / 3;
  const cos = Math.cos(turn), sin = Math.sin(turn);
  return points.map((p) => ({ x: cx + (p.x - cx) * cos - (p.y - cy) * sin, y: cy + (p.x - cx) * sin + (p.y - cy) * cos, z: 0 }));
}

function fakeTracking({ fails = null } = {}) {
  let onHand = null;
  return {
    started: 0,
    stopped: 0,
    async start(callback) {
      if (fails) throw Object.assign(new Error(fails), { name: fails });
      this.started++;
      onHand = callback;
    },
    stop() { this.stopped++; onHand = null; },
    send: (landmarks) => onHand?.(landmarks),
  };
}

function setup(options) {
  const camera = new CameraViewModel();
  camera.azimuth = camera.azimuthGoal = Math.PI / 4; // the directions below are checked at this angle
  const tracking = fakeTracking(options);
  const vm = new HandControlViewModel({ tracking, camera });
  return { vm, camera, tracking, state: () => vm.store.state };
}

// Where the camera is heading (the pan glides there)
const goal = (camera) => camera.targetGoal ?? camera.target;

test('it starts off; turning it on starts the camera and the tracking', async () => {
  const { vm, tracking, state } = setup();
  assert.equal(state().status, 'off');
  await vm.toggle();
  assert.equal(state().status, 'on');
  assert.equal(tracking.started, 1);
  vm.toggle();
  assert.equal(state().status, 'off');
  assert.equal(tracking.stopped, 1);
});

test('a camera that is denied or missing leaves it off with an error', async () => {
  const { vm, state } = setup({ fails: 'NotAllowedError' });
  await vm.toggle();
  assert.equal(state().status, 'error');
  assert.equal(state().error, 'denied');
  const missing = setup({ fails: 'NotFoundError' });
  await missing.vm.toggle();
  assert.equal(missing.state().error, 'noCamera');
});

test('pinching and moving the hand right drags the map right: the camera moves the other way', async () => {
  const { vm, camera, tracking, state } = setup();
  await vm.toggle();
  tracking.send(hand(0.6, 0.5, 0.02));
  assert.equal(state().pinching, true);
  for (let i = 1; i <= 10; i++) tracking.send(hand(0.6 - i * 0.02, 0.5, 0.02)); // right for the person (mirrored image)
  const g = goal(camera);
  // Screen right at the default angle is (+x, -z) on the ground; the camera goes the opposite way
  assert.ok(g.x < -0.5 && g.z > 0.5, JSON.stringify(g));
});

test('moving the pinch down drags the map down: the camera moves away from the viewer', async () => {
  const { vm, camera, tracking } = setup();
  await vm.toggle();
  tracking.send(hand(0.5, 0.4, 0.02));
  for (let i = 1; i <= 10; i++) tracking.send(hand(0.5, 0.4 + i * 0.02, 0.02));
  const g = goal(camera);
  // Screen down at the default angle is (+x, +z): the camera goes to (-x, -z)
  assert.ok(g.x < -0.5 && g.z < -0.5, JSON.stringify(g));
});

test('an open hand does not move the map, and letting go shows it is no longer grabbing', async () => {
  const { vm, camera, tracking, state } = setup();
  await vm.toggle();
  for (let i = 0; i < 5; i++) tracking.send(hand(0.5 + i * 0.05, 0.5, 0.15));
  assert.deepEqual(goal(camera), { x: 0, z: 0 });
  tracking.send(hand(0.5, 0.5, 0.02));
  tracking.send(null);
  assert.equal(state().pinching, false);
  assert.equal(state().hand, false);
});

test('a frame that arrives after turning it off is ignored', async () => {
  const { vm, camera, tracking } = setup();
  await vm.toggle();
  const send = tracking.send;
  vm.toggle();
  send(hand(0.5, 0.5, 0.02));
  send(hand(0.3, 0.5, 0.02));
  assert.deepEqual(goal(camera), { x: 0, z: 0 });
});

// Turning the map is now a two-hand gesture (one holds, the other moves sideways: spec/003-hand-gestures.md)
test('turning one pinching hand like a knob no longer turns the map, and does not pan either', async () => {
  const { vm, camera, tracking } = setup();
  await vm.toggle();
  const start = camera.azimuthGoal;
  tracking.send(hand(0.5, 0.5, 0.02));
  for (let i = 1; i <= 12; i++) tracking.send(hand(0.5, 0.5, 0.02, -i * 0.05));
  assert.equal(camera.azimuthGoal, start);
  assert.deepEqual(goal(camera), { x: 0, z: 0 });
});

test('the camera view model glides to a pan (eased like a flight)', () => {
  const camera = new CameraViewModel();
  camera.glideBy(2, -1);
  camera.glideBy(1, 0);
  assert.deepEqual(camera.targetGoal, { x: 3, z: -1 });
  camera.step(0.016);
  assert.ok(camera.target.x > 0 && camera.target.x < 3);
});

test('the camera view model eases a turn', () => {
  const camera = new CameraViewModel();
  const start = camera.azimuth;
  camera.turnBy(0.5);
  assert.equal(camera.azimuthGoal, start + 0.5);
  camera.step(0.016);
  assert.ok(camera.azimuth > start && camera.azimuth < start + 0.5);
});
