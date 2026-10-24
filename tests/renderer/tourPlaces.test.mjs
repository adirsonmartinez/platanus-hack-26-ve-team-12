// Where each stop of the tour is on the map: the plaza, a building that is already there, or a
// temporary "ghost" place for a folder with no problems (the radar does not draw those).
import test from 'node:test';
import assert from 'node:assert/strict';
import { placesFor } from '../../renderer/viewmodels/tourPlaces.js';
import { ghostSlots, screenOf } from '../../renderer/viewmodels/layout.js';

const map = { plaza: { size: 5 }, buildings: [{ path: 'src', x: 12, z: 0 }] };
const steps = [
  { id: 'place', kind: 'place', target: '' },
  { id: 'doc1', kind: 'doc', target: 'README.md' },
  { id: 'part1', kind: 'folder', target: 'src' },
  { id: 'part2', kind: 'folder', target: 'public' },
  { id: 'entry', kind: 'file', target: 'src/server.js' },
  { id: 'case1', kind: 'usecase', target: 'api/routes/orders.js' },
  { id: 'part3', kind: 'folder', target: 'apps/web' },
  { id: 'part4', kind: 'folder', target: 'apps/api' },
  { id: 'case2', kind: 'usecase', target: 'apps/api/src/routes/orders.ts' },
  { id: 'start', kind: 'start', target: 'README.md' },
];

test('ghost places go in a row under everything the map draws, never on a folder', () => {
  const drawn = [{ x: 0, z: 9 }, { x: 6, z: 12 }];
  const ghosts = ghostSlots(drawn, 3);
  assert.equal(ghosts.length, 3);
  const lowest = Math.max(...drawn.map((p) => screenOf(p.x, p.z).v));
  for (const g of ghosts) assert.ok(screenOf(g.x, g.z).v > lowest, 'below the tree');
  assert.equal(new Set(ghosts.map((g) => `${g.x.toFixed(2)},${g.z.toFixed(2)}`)).size, 3, 'apart');
});

test('the plaza, root files, buildings and ghosts', () => {
  const places = placesFor(steps, map);
  assert.equal(places.get('place').kind, 'plaza');
  assert.equal(places.get('doc1').kind, 'plaza');
  const src = places.get('part1');
  assert.deepEqual([src.kind, src.x, src.z, src.path], ['building', 12, 0, 'src']);
  assert.equal(places.get('entry').path, 'src', 'a file goes to its top folder');
  const pub = places.get('part2');
  const api = places.get('case1');
  assert.equal(pub.kind, 'ghost');
  assert.equal(api.kind, 'ghost');
  assert.notDeepEqual([pub.x, pub.z], [api.x, api.z]);
  assert.notDeepEqual([pub.x, pub.z], [12, 0]);
});

test('the robot stands on the plaza side of a place, close enough to see it', () => {
  const src = placesFor(steps, map).get('part1');
  assert.ok(Math.hypot(src.stand.x, src.stand.z) < Math.hypot(src.x, src.z));
  assert.ok(Math.hypot(src.stand.x - src.x, src.stand.z - src.z) < 5);
});

test('a subfolder the open tree draws is its own place', () => {
  const places = placesFor([{ id: 'p', kind: 'folder', target: 'src/routes' }], { buildings: [{ path: 'src', x: 0, z: 9 }], branches: [{ folders: [{ path: 'src/routes', x: 4, z: 20 }] }] });
  assert.deepEqual([places.get('p').kind, places.get('p').x], ['building', 4]);
});

test('the list of ghosts (what the view draws)', () => {
  const places = placesFor(steps, map);
  const ghosts = [...places.values()].filter((p) => p.kind === 'ghost').map((p) => p.path);
  assert.deepEqual([...new Set(ghosts)], ['public', 'api', 'apps/web', 'apps/api'], 'each folder stop is its own place');
  assert.equal(places.get('case2'), places.get('part4'), 'a file goes to the folder stop that holds it');
});
