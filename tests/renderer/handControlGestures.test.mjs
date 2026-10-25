// The hand control view model with the new gestures (spec/003-hand-gestures.md): one pinch moves the map;
// two pinches, one holding and the other moving, zoom (up / down) or turn (sideways); an open hand moves a
// cursor and holding still selects. The screen side (what is under the cursor, clicking it,
// zooming around a point) comes as fake actions.
import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { HandControlViewModel } from '../../renderer/viewmodels/handControlViewModel.js';
import { CameraViewModel, CAMERA } from '../../renderer/viewmodels/cameraViewModel.js';
import { DWELL_MS } from '../../renderer/models/handGesture.js';
import { hand, holdAndMove, OPEN, PINCHED } from './handFixtures.mjs';
import { toViewport } from '../../renderer/models/handGesture.js';

function setup({ target = { key: 'folder:src', kind: 'pick', label: 'src', selectable: true }, now = { t: 0 } } = {}) {
  const camera = new CameraViewModel();
  let onHands = null;
  const tracking = { async start(cb) { onHands = cb; }, stop() { onHands = null; } };
  const calls = { selected: [], hovered: [], zoomAt: [] };
  const actions = {
    targetAt: () => target,
    select: (t) => calls.selected.push(t.key),
    hover: (t) => calls.hovered.push(t?.key ?? null),
    zoomAt: (factor, x, y) => { calls.zoomAt.push({ factor, x, y }); camera.zoomBy(factor); },
  };
  const vm = new HandControlViewModel({ tracking, camera, actions, now: () => now.t });
  const send = (hands, info = {}) => onHands?.(hands, { now: now.t, delegate: 'GPU', ...info });
  return { vm, camera, calls, send, now, state: () => vm.store.state };
}

test('hold with one hand and raise the other: zoom in around the holding hand; lower it: zoom out (B5-B7)', async () => {
  const { vm, camera, calls, send, state, now } = setup();
  await vm.toggle();
  const target = { ...camera.target }, azimuth = camera.azimuthGoal;
  for (let i = 0; i <= 10; i++) { now.t += 33; send(holdAndMove(0, -i * 0.02)); }
  assert.ok(camera.zoomGoal > 1.3, `zoom ${camera.zoomGoal}`);
  assert.equal(state().gesture, 'zoomIn');
  assert.deepEqual(camera.target, target);
  assert.equal(camera.targetGoal, null);
  assert.equal(camera.azimuthGoal, azimuth, 'no turn');
  const holding = toViewport({ x: 0.3, y: 0 }).x;
  assert.ok(calls.zoomAt.every((c) => Math.abs(c.x - holding) < 0.05), 'around the holding hand');
  for (let i = 1; i <= 10; i++) { now.t += 33; send(holdAndMove(0, -0.2 + i * 0.03)); }
  assert.equal(state().gesture, 'zoomOut');
});

test('hold with one hand and move the other sideways: the map turns, without zoom (the person\'s right turns right)', async () => {
  const { vm, camera, send, state, now } = setup();
  await vm.toggle();
  const azimuth = camera.azimuthGoal, zoom = camera.zoomGoal;
  for (let i = 0; i <= 10; i++) { now.t += 33; send(holdAndMove(-i * 0.02, 0)); }
  assert.ok(camera.azimuthGoal - azimuth > 0.3, `turn ${camera.azimuthGoal - azimuth}`);
  assert.equal(state().gesture, 'rotate');
  assert.equal(camera.zoomGoal, zoom);
  assert.equal(camera.targetGoal, null, 'no drag');
});

test('the zoom never passes its limits (B6)', async () => {
  const { vm, camera, send, now } = setup();
  await vm.toggle();
  for (let i = 0; i <= 30; i++) { now.t += 33; send(holdAndMove(0, -i * 0.015)); }
  assert.equal(camera.zoomGoal, CAMERA.zoomMax);
  for (let i = 1; i <= 60; i++) { now.t += 33; send(holdAndMove(0, -0.45 + i * 0.015)); }
  assert.equal(camera.zoomGoal, CAMERA.zoomMin);
});

test('when one hand lets go the gesture ends, and the other hand does not drag until it pinches again (B9)', async () => {
  const { vm, camera, send, state, now } = setup();
  await vm.toggle();
  for (let i = 0; i <= 6; i++) { now.t += 33; send(holdAndMove(0, -i * 0.02)); }
  for (let i = 0; i <= 10; i++) { now.t += 33; send([hand(0.3, 0.5, OPEN), hand(0.7 - i * 0.02, 0.38, PINCHED)]); }
  assert.equal(camera.targetGoal, null, 'no drag');
  assert.equal(state().gesture, 'wait');
  now.t += 33; send([hand(0.7, 0.5, OPEN)]); // lets go
  now.t += 33; send([hand(0.7, 0.5, PINCHED)]); // pinches again
  for (let i = 1; i <= 10; i++) { now.t += 33; send([hand(0.7 - i * 0.02, 0.5, PINCHED)]); }
  assert.notEqual(camera.targetGoal, null, 'now it drags');
});

test('one hand pinching only moves the map; turning it like a knob no longer turns the map (B4)', async () => {
  const { vm, camera, send, state } = setup();
  await vm.toggle();
  send([hand(0.5, 0.5, PINCHED)]);
  for (let i = 1; i <= 10; i++) send([hand(0.5 - i * 0.02, 0.5, PINCHED)]);
  assert.equal(state().gesture, 'pan');
  assert.notEqual(camera.targetGoal, null);
  assert.equal(state().cursor, null, 'no cursor while grabbing (B12)');
  const knob = setup();
  await knob.vm.toggle();
  const azimuth = knob.camera.azimuthGoal;
  knob.send([hand(0.5, 0.5, PINCHED)]);
  for (let i = 1; i <= 12; i++) knob.send([hand(0.5, 0.5, PINCHED, { turn: -i * 0.05 })]);
  assert.equal(knob.camera.azimuthGoal, azimuth);
});

test('an open hand shows the cursor and hovers what is under it (B10, B14)', async () => {
  const { vm, calls, send, state } = setup();
  await vm.toggle();
  send([hand(0.5, 0.5, OPEN)]);
  const { cursor } = state();
  assert.ok(cursor && Math.abs(cursor.x - 0.5) < 0.05, JSON.stringify(cursor));
  assert.equal(state().gesture, 'point');
  assert.deepEqual(calls.hovered, ['folder:src']);
  send([]);
  assert.equal(state().cursor, null, 'no hand: no cursor');
  assert.equal(calls.hovered.at(-1), null);
});

test('holding still 800 ms selects once and says what; pinching resets the ring (B12, B15, B17, B23)', async () => {
  const { vm, calls, send, state, now } = setup();
  await vm.toggle();
  send([hand(0.5, 0.5, OPEN)]);
  now.t = 400; send([hand(0.5, 0.5, OPEN)]);
  assert.equal(state().ring, 0.5);
  now.t = 450; send([hand(0.5, 0.5, PINCHED)]);
  assert.equal(state().ring, 0);
  assert.equal(state().cursor, null);
  now.t = 500; send([hand(0.5, 0.5, OPEN)]);
  now.t = 500 + DWELL_MS; send([hand(0.5, 0.5, OPEN)]);
  assert.deepEqual(calls.selected, ['folder:src']);
  assert.equal(state().selected, 'src');
  for (const t of [2000, 3000]) { now.t = t; send([hand(0.5, 0.5, OPEN)]); }
  assert.deepEqual(calls.selected, ['folder:src'], 'only once');
});

test('nothing selectable: no ring and nothing selected (B18-B21)', async () => {
  const { vm, calls, send, state, now } = setup({ target: { key: 'ui:repair', kind: 'ui', label: 'Reparar', selectable: false } });
  await vm.toggle();
  for (const t of [0, 500, 1000, 2000]) { now.t = t; send([hand(0.5, 0.5, OPEN)]); }
  assert.equal(state().ring, 0);
  assert.deepEqual(calls.selected, []);
});

test('on CPU under 20 fps for 3 s, two-hand zoom turns off and says so; on GPU it stays (B2, B3)', async () => {
  const slow = setup();
  await slow.vm.toggle();
  for (let t = 0; t <= 3500; t += 70) { slow.now.t = t; slow.send([hand(0.5, 0.5, OPEN)], { delegate: 'CPU' }); } // ~14 fps
  assert.equal(slow.state().twoHands, false);
  assert.equal(slow.state().delegate, 'CPU');
  assert.ok(slow.state().fps > 10 && slow.state().fps < 20, `fps ${slow.state().fps}`);
  const zoom = slow.camera.zoomGoal;
  for (let i = 0; i <= 10; i++) slow.send(holdAndMove(0, -i * 0.02), { delegate: 'CPU' });
  assert.equal(slow.camera.zoomGoal, zoom, 'no two-hand zoom');
  const fast = setup();
  await fast.vm.toggle();
  for (let t = 0; t <= 3500; t += 70) { fast.now.t = t; fast.send([hand(0.5, 0.5, OPEN)], { delegate: 'GPU' }); }
  assert.equal(fast.state().twoHands, true);
});

test('turning it off hides the cursor, empties the ring and lets go (B26)', async () => {
  const { vm, send, state, now } = setup();
  await vm.toggle();
  send([hand(0.5, 0.5, OPEN)]);
  now.t = 300; send([hand(0.5, 0.5, OPEN)]);
  vm.stop();
  assert.deepEqual([state().cursor, state().ring, state().gesture, state().selected], [null, 0, null, null]);
});

// Real use: one hand pinches a moment before the other, and MediaPipe may list the hands in either order
test('if one hand already drags, pinching with the other one switches to hold-and-move and the drag stops', async () => {
  const { vm, camera, send, state, now } = setup();
  await vm.toggle();
  // the right hand pinches alone and drags (the left one is not in view yet)
  send([hand(0.7, 0.5, PINCHED)]);
  for (let i = 1; i <= 8; i++) { now.t += 33; send([hand(0.7 - i * 0.02, 0.5, PINCHED)]); }
  assert.equal(state().gesture, 'pan');
  // the left hand appears and holds; the right one goes up
  camera.cancelFlight();
  const target = { ...camera.target };
  const zoom = camera.zoomGoal;
  for (let i = 0; i <= 10; i++) { now.t += 33; send([hand(0.3, 0.5, PINCHED), hand(0.54, 0.5 - i * 0.02, PINCHED)]); }
  assert.ok(camera.zoomGoal > zoom * 1.2, `zoom ${camera.zoomGoal}`);
  assert.ok(state().gesture.startsWith('zoom'));
  assert.deepEqual(camera.target, target, 'no more drag');
  assert.equal(camera.targetGoal, null);
});

test('hands listed in a different order from one frame to the next still zoom', async () => {
  const { vm, camera, send, now } = setup();
  await vm.toggle();
  for (let i = 0; i <= 10; i++) {
    now.t += 33;
    const [a, b] = holdAndMove(0, -i * 0.02);
    send(i % 2 ? [b, a] : [a, b]);
  }
  assert.ok(camera.zoomGoal > 1.3, `zoom ${camera.zoomGoal}`);
});

test('with the other hand in view, a single pinch waits a moment before dragging (time for the second pinch)', async () => {
  const { vm, camera, send, now, state } = setup();
  await vm.toggle();
  const left = hand(0.3, 0.5, OPEN);
  send([left, hand(0.7, 0.5, PINCHED)]);
  for (let i = 1; i <= 5; i++) { now.t += 40; send([left, hand(0.7 - i * 0.02, 0.5, PINCHED)]); } // 200 ms
  assert.equal(camera.targetGoal, null, 'not yet: the other hand may pinch');
  assert.equal(state().pinching, true);
  for (let i = 6; i <= 14; i++) { now.t += 40; send([left, hand(0.7 - i * 0.02, 0.5, PINCHED)]); }
  assert.notEqual(camera.targetGoal, null, 'then it drags');
});

test('a hand lost for a frame or two (tracking blinks) does not end the gesture', async () => {
  const { vm, camera, send, state, now } = setup();
  await vm.toggle();
  for (let i = 0; i <= 6; i++) { now.t += 33; send(holdAndMove(0, -i * 0.02)); }
  const before = camera.zoomGoal;
  now.t += 33; send([holdAndMove(0, -0.12)[1]]); // the holding hand blinks out
  now.t += 33; send([holdAndMove(0, -0.12)[1]]);
  assert.ok(state().gesture.startsWith('zoom'), 'still zooming');
  for (let i = 7; i <= 12; i++) { now.t += 33; send(holdAndMove(0, -i * 0.02)); }
  assert.ok(camera.zoomGoal > before, 'and it goes on');
});
