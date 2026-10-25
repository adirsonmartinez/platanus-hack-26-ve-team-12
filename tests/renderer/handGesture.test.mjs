import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { PinchTracker } from '../../renderer/models/handGesture.js';

// A hand of 21 landmarks in image coordinates (0..1): wrist at (x, y + 0.2), knuckles at (x, y),
// thumb and index tips `gap` apart around (x, y - 0.05). Hand size (wrist to middle knuckle) = 0.2.
// `turn` rotates it (radians, clockwise in the image) around the palm, like turning a knob.
function hand(x, y, gap, turn = 0) {
  const points = Array.from({ length: 21 }, () => ({ x, y, z: 0 }));
  points[0] = { x, y: y + 0.2, z: 0 };
  points[9] = { x, y, z: 0 };
  points[4] = { x: x - gap / 2, y: y - 0.05, z: 0 };
  points[8] = { x: x + gap / 2, y: y - 0.05, z: 0 };
  const cx = x, cy = y + 0.2 / 3; // palm center: wrist and the index and pinky knuckles
  const cos = Math.cos(turn), sin = Math.sin(turn);
  return points.map((p) => ({ x: cx + (p.x - cx) * cos - (p.y - cy) * sin, y: cy + (p.x - cx) * sin + (p.y - cy) * cos, z: 0 }));
}
const OPEN = 0.15, PINCHED = 0.02;

test('an open hand does not grab the map', () => {
  const t = new PinchTracker();
  const out = t.update(hand(0.5, 0.5, OPEN));
  assert.equal(out.pinching, false);
  assert.deepEqual([out.dx, out.dy], [0, 0]);
});

test('pinching grabs without jumping, then moving the pinch drags', () => {
  const t = new PinchTracker();
  const first = t.update(hand(0.5, 0.5, PINCHED));
  assert.equal(first.pinching, true);
  assert.deepEqual([first.dx, first.dy], [0, 0]);
  let dx = 0, dy = 0;
  for (let i = 1; i <= 10; i++) {
    const out = t.update(hand(0.5 - i * 0.01, 0.5 + i * 0.01, PINCHED)); // moves left (in the image) and down
    dx += out.dx; dy += out.dy;
  }
  // The camera image is mirrored: moving left in the image is moving right for the person
  assert.ok(dx > 0.05, `dx ${dx}`);
  assert.ok(dy > 0.05, `dy ${dy}`);
});

test('a slightly open pinch keeps holding (hysteresis), a clearly open hand lets go', () => {
  const t = new PinchTracker();
  t.update(hand(0.5, 0.5, PINCHED));
  assert.equal(t.update(hand(0.5, 0.5, 0.08)).pinching, true);
  assert.equal(t.update(hand(0.5, 0.5, OPEN)).pinching, false);
});

test('losing the hand lets go', () => {
  const t = new PinchTracker();
  t.update(hand(0.5, 0.5, PINCHED));
  const out = t.update(null);
  assert.equal(out.pinching, false);
  assert.deepEqual([out.dx, out.dy], [0, 0]);
});

test('tiny tremors while pinching do not move the map', () => {
  const t = new PinchTracker();
  t.update(hand(0.5, 0.5, PINCHED));
  let moved = 0;
  for (let i = 0; i < 20; i++) {
    const out = t.update(hand(0.5 + (i % 2 ? 0.002 : -0.002), 0.5, PINCHED));
    moved += Math.abs(out.dx) + Math.abs(out.dy);
  }
  assert.equal(moved, 0);
});

test('pinching again after letting go starts from where the hand is, without a jump', () => {
  const t = new PinchTracker();
  t.update(hand(0.5, 0.5, PINCHED));
  t.update(hand(0.5, 0.5, OPEN));
  t.update(hand(0.2, 0.2, OPEN));
  const out = t.update(hand(0.2, 0.2, PINCHED));
  assert.deepEqual([out.dx, out.dy], [0, 0]);
});

test('pinching and turning the hand rotates instead of dragging', () => {
  const t = new PinchTracker();
  t.update(hand(0.5, 0.5, PINCHED));
  let turned = 0, moved = 0, mode = null;
  for (let i = 1; i <= 12; i++) {
    const out = t.update(hand(0.5, 0.5, PINCHED, -i * 0.05)); // counterclockwise in the image = clockwise for the person
    turned += out.dAngle; moved += Math.abs(out.dx) + Math.abs(out.dy);
    mode = out.mode;
  }
  assert.equal(mode, 'rotate');
  assert.equal(moved, 0);
  assert.ok(turned > 0.35, `turned ${turned}`); // most of the 0.6 rad, a bit behind because of smoothing
});

test('once dragging, turning the hand a little does not rotate', () => {
  const t = new PinchTracker();
  t.update(hand(0.5, 0.5, PINCHED));
  for (let i = 1; i <= 6; i++) t.update(hand(0.5 + i * 0.02, 0.5, PINCHED));
  let turned = 0;
  for (let i = 1; i <= 6; i++) turned += t.update(hand(0.62, 0.5, PINCHED, i * 0.05)).dAngle;
  assert.equal(turned, 0);
  assert.equal(t.update(hand(0.62, 0.5, PINCHED)).mode, 'pan');
});

test('letting go forgets the gesture: the next pinch can rotate', () => {
  const t = new PinchTracker();
  t.update(hand(0.5, 0.5, PINCHED));
  for (let i = 1; i <= 6; i++) t.update(hand(0.5 + i * 0.02, 0.5, PINCHED));
  t.update(hand(0.62, 0.5, OPEN));
  t.update(hand(0.62, 0.5, PINCHED));
  let mode = null;
  for (let i = 1; i <= 8; i++) mode = t.update(hand(0.62, 0.5, PINCHED, -i * 0.05)).mode;
  assert.equal(mode, 'rotate');
});
