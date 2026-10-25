// Zoom with two hands, the cursor and selecting by holding still (spec/003-hand-gestures.md), as pure
// numbers: no camera, no DOM.
import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { TwoHandTracker, PointerTracker, DwellTimer, pickCursorHand, isPinched, toViewport, DWELL_MS } from '../../renderer/models/handGesture.js';
import { hand, holdAndMove, jitter, OPEN, PINCHED } from './handFixtures.mjs';

test('pinched or not, with hysteresis like the grab', () => {
  assert.equal(isPinched(hand(0.5, 0.5, PINCHED), false), true);
  assert.equal(isPinched(hand(0.5, 0.5, OPEN), false), false);
  assert.equal(isPinched(hand(0.5, 0.5, 0.07), false), false, 'in between: not yet');
  assert.equal(isPinched(hand(0.5, 0.5, 0.07), true), true, 'in between: keeps holding');
});

// Hold and move (spec/003-hand-gestures.md, B5-B8): both hands pinch, one holds still, the other one moves.
// Up or down zooms, sideways turns; the first direction past its threshold stays until letting go.
const run = (frames) => {
  const t = new TwoHandTracker();
  let factor = 1, angle = 0, last = null;
  for (const f of frames) {
    last = t.update(...f);
    factor *= last.factor;
    angle += last.dAngle;
  }
  return { factor, angle, last };
};
const steps = (n, fn) => Array.from({ length: n + 1 }, (_, i) => fn(i));

test('holding one hand and raising the other zooms in; lowering it zooms out (B5, B6)', () => {
  const up = run(steps(10, (i) => holdAndMove(0, -i * 0.02)));
  assert.equal(up.last.mode, 'zoom');
  assert.ok(up.factor > 1.5, `zoom in ${up.factor}`);
  assert.equal(up.angle, 0);
  const down = run(steps(10, (i) => holdAndMove(0, i * 0.02)));
  assert.ok(down.factor < 0.7, `zoom out ${down.factor}`);
});

test('moving the other hand sideways turns: to the person\'s right is clockwise (positive)', () => {
  const right = run(steps(10, (i) => holdAndMove(-i * 0.02, 0))); // image left = the person's right
  assert.equal(right.last.mode, 'rotate');
  assert.ok(right.angle > 0.3, `angle ${right.angle}`);
  assert.equal(right.factor, 1);
  const left = run(steps(10, (i) => holdAndMove(i * 0.02, 0)));
  assert.ok(left.angle < -0.3, `angle ${left.angle}`);
});

test('the first direction locks until letting go: a zoom does not turn', () => {
  const r = run([...steps(10, (i) => holdAndMove(0, -i * 0.02)), ...steps(10, (i) => holdAndMove(-i * 0.03, -0.2))]);
  assert.equal(r.last.mode, 'zoom');
  assert.equal(r.angle, 0);
});

test('either hand can be the one that moves; the zoom keeps the holding hand\'s point (B7)', () => {
  const t = new TwoHandTracker();
  let last;
  for (let i = 0; i <= 10; i++) last = t.update(hand(0.3, 0.5 - i * 0.02, PINCHED), hand(0.7, 0.5, PINCHED)); // the left one rises
  assert.equal(last.mode, 'zoom');
  assert.ok(last.factor >= 1);
  assert.ok(Math.abs(last.anchor.x - toViewport({ x: 0.7, y: 0 }).x) < 0.05, 'the right hand holds');
});

test('before a direction is clear, and for a tremor, nothing happens (B8)', () => {
  const r = run(steps(20, (i) => holdAndMove(jitter(i, 0.002), jitter(i + 1, 0.002))));
  assert.deepEqual([r.last.mode, r.factor, r.angle], [null, 1, 0]);
});

test('the cursor follows the point between thumb and index, mirrored; the center of the image covers the window (B10)', () => {
  const p = new PointerTracker();
  const at = p.update(hand(0.5, 0.5, OPEN));
  assert.ok(Math.abs(at.x - 0.5) < 0.05 && Math.abs(at.y - 0.47) < 0.1, JSON.stringify(at));
  const corner = toViewport({ x: 0.12, y: 0.12 });
  assert.deepEqual(corner, { x: 1, y: 0 }, 'near the image corner already reaches the window edge (mirrored)');
  assert.deepEqual(toViewport({ x: 0.5, y: 0.5 }), { x: 0.5, y: 0.5 });
});

test('the cursor ignores tremor and smooths jumps (B13)', () => {
  const p = new PointerTracker();
  const first = p.update(hand(0.5, 0.5, OPEN));
  for (let i = 0; i < 10; i++) assert.deepEqual(p.update(hand(0.5 + jitter(i, 0.0008), 0.5, OPEN)), first);
  const moved = p.update(hand(0.3, 0.5, OPEN));
  assert.ok(moved.x > first.x, 'the hand moved left in the image: right for the person');
  assert.ok(moved.x < toViewport({ x: 0.3, y: 0 }).x, 'smoothed, not a jump');
  assert.equal(p.update(null), null);
});

test('holding still on a target for 800 ms selects it once (B15, B17)', () => {
  const d = new DwellTimer();
  const at = { x: 0.5, y: 0.5 };
  assert.deepEqual(d.update('folder:src', at, 0), { progress: 0, fire: false });
  assert.equal(d.update('folder:src', at, 400).progress, 0.5);
  assert.deepEqual(d.update('folder:src', at, DWELL_MS), { progress: 1, fire: true });
  for (const t of [900, 2000, 5000]) assert.equal(d.update('folder:src', at, t).fire, false, 'no repeat while it stays');
  d.update(null, at, 5100); // leaves
  d.update('folder:src', at, 5200); // comes back
  assert.equal(d.update('folder:src', at, 5200 + DWELL_MS).fire, true, 'selects again after leaving and coming back');
});

test('moving or changing target before the end restarts the ring; nothing selectable shows no ring (B16, B18)', () => {
  const d = new DwellTimer();
  d.update('folder:src', { x: 0.5, y: 0.5 }, 0);
  assert.equal(d.update('folder:src', { x: 0.56, y: 0.5 }, 500).progress, 0, 'moved past the tolerance');
  assert.equal(d.update('folder:src', { x: 0.56, y: 0.5 }, 1000).progress, 0.625);
  assert.equal(d.update('file:a.js', { x: 0.56, y: 0.5 }, 1100).progress, 0, 'another target');
  assert.deepEqual(d.update(null, { x: 0.56, y: 0.5 }, 1200), { progress: 0, fire: false });
});

test('with two open hands the cursor stays with the hand that had it (D2)', () => {
  const left = hand(0.3, 0.5, OPEN), right = hand(0.7, 0.5, OPEN);
  assert.equal(pickCursorHand([left, right], null), left, 'both appear together: the first one');
  assert.equal(pickCursorHand([left, right], { x: 0.71, y: 0.55 }), right);
  assert.equal(pickCursorHand([right, left], { x: 0.31, y: 0.55 }), left, 'order in the frame does not matter');
  assert.equal(pickCursorHand([], null), null);
});

test('hands keep their place between frames, by where their palms were', async () => {
  const { matchHands } = await import('../../renderer/models/handGesture.js');
  const left = hand(0.3, 0.5, OPEN), right = hand(0.7, 0.5, PINCHED);
  const first = matchHands([left, right], []);
  const swapped = matchHands([right, left], first.palms);
  assert.deepEqual(swapped.hands, [left, right]);
  assert.deepEqual(swapped.previous, [0, 1]);
  const one = matchHands([right], first.palms);
  assert.deepEqual(one.previous, [1], 'the right hand alone was the second one');
  const back = matchHands([right, left], one.palms);
  assert.deepEqual(back.hands, [left, right], 'a hand that blinked out comes back to its place');
  assert.deepEqual(back.previous, [0, 1]);
  const fresh = matchHands([left, right], [first.palms[1]]);
  assert.deepEqual(fresh.hands, [right, left], 'only one hand before: it keeps the first place');
  assert.deepEqual(fresh.previous, [0, -1]);
});
