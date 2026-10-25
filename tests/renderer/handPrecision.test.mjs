// Precision (spec/003-hand-gestures.md): the pinch is measured on MediaPipe's 3D landmarks (metres) when
// they come with the hand, so a hand turned away from the camera or far from it still pinches as it really is.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isPinched, pinchGap, PinchTracker, PointerTracker } from '../../renderer/models/handGesture.js';
import { hand, OPEN, PINCHED } from './handFixtures.mjs';

// The same hand with its 3D landmarks attached, as handTrackingService passes them
const withWorld = (landmarks, world) => Object.assign(landmarks, { world });

test('the 3D landmarks decide the pinch when they come with the hand', () => {
  // Seen edge-on, the tips look apart in the image, but in 3D they touch: it is a pinch
  assert.equal(isPinched(withWorld(hand(0.5, 0.5, OPEN), hand(0, 0, PINCHED, { scale: 0.4 })), false), true);
  // And the other way round: close in the image, apart in 3D, no pinch
  assert.equal(isPinched(withWorld(hand(0.5, 0.5, PINCHED), hand(0, 0, OPEN, { scale: 0.4 })), false), false);
});

test('without 3D landmarks it measures in the image, as before', () => {
  assert.equal(isPinched(hand(0.5, 0.5, PINCHED), false), true);
  assert.equal(isPinched(hand(0.5, 0.5, OPEN), false), false);
  assert.ok(pinchGap(hand(0.5, 0.5, OPEN)) > pinchGap(hand(0.5, 0.5, PINCHED)));
});

test('the drag tracker grabs with the 3D pinch too', () => {
  const tracker = new PinchTracker();
  const r = tracker.update(withWorld(hand(0.5, 0.5, OPEN), hand(0, 0, PINCHED, { scale: 0.4 })));
  assert.equal(r.pinching, true);
});

test('the cursor stays still under a trembling hand and follows a real move', () => {
  const pointer = new PointerTracker();
  const frame = 1000 / 30;
  let first;
  for (let i = 0; i < 40; i++) {
    const at = pointer.update(hand(0.5 + (i % 2 ? 0.002 : -0.002), 0.5, OPEN), i * frame);
    if (i === 10) first = at;
    if (i > 10) assert.deepEqual(at, first, 'tremor does not move the cursor');
  }
  let last;
  for (let i = 0; i < 15; i++) last = pointer.update(hand(0.5 - i * 0.02, 0.5, OPEN), (40 + i) * frame);
  assert.ok(last.x > first.x + 0.2, 'a move to the person\'s right moves the cursor right');
});
