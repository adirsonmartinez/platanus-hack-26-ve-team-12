import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { boxHeight, fitView, screenOf, toWorld, treeBlock, integrationToWorld, SUPABASE_NODE } from '../../renderer/viewmodels/layout.js';

const close = (a, b) => Math.abs(a - b) < 1e-9;

test('screen coordinates: u goes right on screen, v goes down (default camera)', () => {
  const p = toWorld(3, 5);
  const back = screenOf(p.x, p.z);
  assert.ok(close(back.u, 3) && close(back.v, 5));
  // Down on screen is (+x, +z) at the default camera angle; right is (+x, -z)
  assert.ok(toWorld(0, 1).x > 0 && toWorld(0, 1).z > 0);
  assert.ok(toWorld(1, 0).x > 0 && toWorld(1, 0).z < 0);
});

test('a tree block lays its items in rows below the parent, centered under it', () => {
  const block = treeBlock(5, { parentU: 4, parentV: 0, startV: 6, pitch: 3, cols: 10, rowGap: 4 });
  assert.equal(block.slots.length, 5);
  block.slots.forEach((s) => assert.equal(s.v, 6));
  const mean = block.slots.reduce((sum, s) => sum + s.u, 0) / 5;
  assert.ok(close(mean, 4));
  assert.equal(block.endV, 6);
  // A trunk leaves the parent, and every item hangs from a bar
  assert.ok(block.links.some(([u1, v1]) => u1 === 4 && v1 === 0));
});

test('past `cols`, a tree block wraps into more rows, each lower', () => {
  const block = treeBlock(19, { parentU: 0, parentV: 0, startV: 6, pitch: 3, cols: 8, rowGap: 4 });
  const rows = [...new Set(block.slots.map((s) => s.v))];
  assert.deepEqual(rows, [6, 10, 14]);
  assert.equal(block.endV, 14);
});

test('integrations sit above the plaza (up on screen)', () => {
  const node = integrationToWorld(SUPABASE_NODE);
  const s = screenOf(node.x, node.z);
  assert.ok(s.v < -10, String(s.v));
  assert.ok(Math.abs(s.u) < 1e-9);
});

test('fitView centers a set of ground points and zooms out for wider ones', () => {
  const near = fitView([{ x: -5, z: -5 }, { x: 5, z: 5 }]);
  assert.ok(close(near.x, 0) && close(near.z, 0));
  const far = fitView([{ x: -40, z: -40 }, { x: 40, z: 40 }]);
  assert.ok(far.zoom < near.zoom);
  const shifted = fitView([{ x: 10, z: 0 }, { x: 20, z: 0 }]);
  assert.ok(close(shifted.x, 15) && close(shifted.z, 0));
});

test('folder boxes grow with their files, on a log scale, and stop growing', () => {
  assert.ok(boxHeight(1) < boxHeight(10));
  assert.ok(boxHeight(10) < boxHeight(100));
  assert.ok(boxHeight(100) - boxHeight(10) < boxHeight(10) * 2); // a big folder is not ten times taller
  assert.equal(boxHeight(1e6), boxHeight(1e7));
});

test('a tree block can open a gap after a row: the rows below move down, the links follow', () => {
  const block = treeBlock(19, { parentU: 0, parentV: 0, startV: 6, pitch: 3, cols: 8, rowGap: 4, insert: { row: 0, height: 10 } });
  const rows = [...new Set(block.slots.map((s) => s.v))];
  assert.deepEqual(rows, [6, 20, 24]);
  assert.equal(block.endV, 24);
});

test('a tree block can be kept right of a line (minU), instead of centering under its parent', () => {
  const block = treeBlock(6, { parentU: 0, parentV: 0, startV: 6, pitch: 3, cols: 10, rowGap: 4, minU: 2 });
  assert.equal(Math.min(...block.slots.map((s) => s.u)), 2);
});
