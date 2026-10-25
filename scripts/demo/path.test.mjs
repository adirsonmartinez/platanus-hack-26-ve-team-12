import test from 'node:test';
import assert from 'node:assert/strict';
import { cursorPath, moveMs } from './path.mjs';

test('the path ends exactly at the target, time always goes forward', () => {
  const frames = cursorPath({ x: 10, y: 10 }, { x: 410, y: 310 }, { ms: 500, fps: 60 });
  assert.equal(frames.length, 30);
  assert.deepEqual(frames.at(-1), { t: 500, x: 410, y: 310 });
  for (let i = 1; i < frames.length; i++) assert.ok(frames[i].t > frames[i - 1].t);
});

test('eased: slow at the start and the end, fast in the middle; and it arcs', () => {
  const f = cursorPath({ x: 0, y: 0 }, { x: 1000, y: 0 }, { ms: 1000, fps: 50, arc: 0.1 });
  const step = (i) => Math.abs(f[i].x - (i ? f[i - 1].x : 0));
  assert.ok(step(1) < step(25) && step(49) < step(25));
  assert.ok(Math.abs(f[25].y) > 50, 'bends away from the straight line');
  assert.equal(f.at(-1).y, 0);
});

test('same input, same frames; move time grows with distance and has a cap', () => {
  assert.deepEqual(cursorPath({ x: 1, y: 2 }, { x: 300, y: 50 }), cursorPath({ x: 1, y: 2 }, { x: 300, y: 50 }));
  assert.ok(moveMs({ x: 0, y: 0 }, { x: 100, y: 0 }) < moveMs({ x: 0, y: 0 }, { x: 900, y: 0 }));
  assert.equal(moveMs({ x: 0, y: 0 }, { x: 99999, y: 0 }), 1100);
  assert.deepEqual(cursorPath({ x: 5, y: 5 }, { x: 5, y: 5 }, { ms: 100 }).at(-1), { t: 100, x: 5, y: 5 });
});
