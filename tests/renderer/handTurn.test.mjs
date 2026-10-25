// Turning with one hand (spec/003-hand-gestures.md): thumb and middle finger together, then the hand moves
// sideways; the map turns that way. Two hands are only for zoom now.
import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { pinchFinger, SlideTurnTracker } from '../../renderer/models/handGesture.js';
import { HandControlViewModel } from '../../renderer/viewmodels/handControlViewModel.js';
import { CameraViewModel } from '../../renderer/viewmodels/cameraViewModel.js';
import { hand, middlePinch, holdAndMove, OPEN, PINCHED } from './handFixtures.mjs';

test('which finger touches the thumb: index, middle, or none', () => {
  assert.equal(pinchFinger(hand(0.5, 0.5, PINCHED), null), 'index');
  assert.equal(pinchFinger(middlePinch(0.5, 0.5), null), 'middle');
  assert.equal(pinchFinger(hand(0.5, 0.5, OPEN), null), null);
});

test('when both tips are near the thumb, the clearly closer one wins; too close to call is no pinch', () => {
  const both = middlePinch(0.5, 0.5);
  both[8] = { ...both[12], x: both[12].x + 0.004 }; // the index almost on the middle tip
  assert.equal(pinchFinger(both, null), null);
});

test('a pinch keeps its finger until it lets go (no flicker between index and middle)', () => {
  const h = middlePinch(0.5, 0.5);
  h[8] = { x: h[4].x + 0.03, y: h[4].y, z: 0 }; // the index comes close while still pinching with the middle
  assert.equal(pinchFinger(h, 'middle'), 'middle');
});

test('the turn tracker: sideways moves turn (the person\'s right is clockwise), a still or trembling hand does not', () => {
  const t = new SlideTurnTracker();
  t.update(middlePinch(0.5, 0.5), 0);
  let still = 0;
  for (let i = 1; i <= 10; i++) still += t.update(middlePinch(0.5 + (i % 2 ? 0.001 : -0.001), 0.5), i * 33).dAngle;
  assert.equal(still, 0, 'tremor does not turn');
  let total = 0;
  for (let i = 1; i <= 10; i++) total += t.update(middlePinch(0.5 - i * 0.02, 0.5), (10 + i) * 33).dAngle;
  assert.ok(total > 0.3, `turned ${total}`);
});

function setup() {
  const camera = new CameraViewModel();
  const now = { t: 0 };
  let onHands = null;
  const tracking = { async start(cb) { onHands = cb; }, stop() { onHands = null; } };
  const vm = new HandControlViewModel({ tracking, camera, actions: { targetAt: () => null, zoomAt: (f) => camera.zoomBy(f) }, now: () => now.t });
  const send = (hands) => { now.t += 33; onHands?.(hands, { now: now.t, delegate: 'GPU' }); };
  return { vm, camera, send, state: () => vm.store.state };
}

test('thumb and middle together, moving right: the map turns right, without dragging or zooming', async () => {
  const { vm, camera, send, state } = setup();
  await vm.toggle();
  const azimuth = camera.azimuthGoal, zoom = camera.zoomGoal;
  for (let i = 0; i <= 10; i++) send([middlePinch(0.6 - i * 0.02, 0.5)]);
  assert.ok(camera.azimuthGoal - azimuth > 0.3, `turn ${camera.azimuthGoal - azimuth}`);
  assert.equal(state().gesture, 'rotate');
  assert.equal(camera.targetGoal, null, 'no drag');
  assert.equal(camera.zoomGoal, zoom, 'no zoom');
});

test('thumb and index still drag the map, and never turn it', async () => {
  const { vm, camera, send } = setup();
  await vm.toggle();
  const azimuth = camera.azimuthGoal;
  for (let i = 0; i <= 10; i++) send([hand(0.6 - i * 0.02, 0.5, PINCHED)]);
  assert.ok(camera.targetGoal, 'it drags');
  assert.equal(camera.azimuthGoal, azimuth, 'no turn');
});

test('two hands only zoom now: moving the free hand sideways neither turns nor zooms', async () => {
  const { vm, camera, send } = setup();
  await vm.toggle();
  const azimuth = camera.azimuthGoal, zoom = camera.zoomGoal;
  for (let i = 0; i <= 10; i++) send(holdAndMove(-i * 0.02, 0));
  assert.equal(camera.azimuthGoal, azimuth, 'no turn');
  assert.ok(Math.abs(camera.zoomGoal - zoom) < 0.02, `zoom ${camera.zoomGoal}`);
});
