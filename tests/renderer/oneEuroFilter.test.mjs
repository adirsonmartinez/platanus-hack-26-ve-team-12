import test from 'node:test';
import assert from 'node:assert/strict';
import { OneEuroFilter, PointFilter, HAND_FILTER } from '../../renderer/models/oneEuroFilter.js';

const FRAME = 1000 / 30; // ms between camera frames
// The smoothing the hand used before: half the new value each frame
const ema = (values) => values.reduce((out, v) => [...out, out.length ? out.at(-1) + (v - out.at(-1)) * 0.5 : v], []);
const run = (values) => { const f = new OneEuroFilter(HAND_FILTER); return values.map((v, i) => f.filter(v, i * FRAME)); };

test('the first value passes through and a still value stays still', () => {
  assert.deepEqual(run([0.4, 0.4, 0.4]), [0.4, 0.4, 0.4]);
});

test('a hand at rest shakes much less than with the old smoothing', () => {
  const tremor = Array.from({ length: 60 }, (_, i) => 0.5 + (i % 2 ? 0.002 : -0.002));
  const swing = (out) => Math.max(...out.slice(30)) - Math.min(...out.slice(30));
  assert.ok(swing(run(tremor)) < swing(ema(tremor)) / 2, `${swing(run(tremor))} vs ${swing(ema(tremor))}`);
});

test('a fast move lags behind less than with the old smoothing', () => {
  const ramp = Array.from({ length: 12 }, (_, i) => i * 0.08); // ~2.4 window widths per second
  const lag = (out) => ramp.at(-1) - out.at(-1);
  assert.ok(lag(run(ramp)) < lag(ema(ramp)), `${lag(run(ramp))} vs ${lag(ema(ramp))}`);
});

test('without timestamps it assumes camera frames; reset starts over', () => {
  const f = new OneEuroFilter(HAND_FILTER);
  f.filter(0);
  const second = f.filter(1);
  assert.ok(second > 0 && second < 1);
  f.reset();
  assert.equal(f.filter(0.7), 0.7);
});

test('points are filtered per axis', () => {
  const f = new PointFilter(HAND_FILTER);
  assert.deepEqual(f.filter({ x: 0.2, y: 0.8 }, 0), { x: 0.2, y: 0.8 });
  const next = f.filter({ x: 0.3, y: 0.8 }, FRAME);
  assert.ok(next.x > 0.2 && next.x < 0.3);
  assert.equal(next.y, 0.8);
});

test('times closer than any camera can deliver count as camera frames (no freeze)', () => {
  const real = new OneEuroFilter(HAND_FILTER);
  const burst = new OneEuroFilter(HAND_FILTER);
  const values = [0, 0.1, 0.2, 0.3];
  const a = values.map((v, i) => real.filter(v, i * FRAME));
  const b = values.map((v, i) => burst.filter(v, 1000 + i * 0.01)); // microseconds apart
  assert.ok(Math.abs(a.at(-1) - b.at(-1)) < 1e-9, `${a.at(-1)} vs ${b.at(-1)}`);
});
