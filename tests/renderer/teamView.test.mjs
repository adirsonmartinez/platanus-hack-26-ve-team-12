import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Observable } from '../../renderer/core/observable.js';

// Just enough DOM for the robots' bubbles and the sites' labels (no real page in Node)
function fakeElement() {
  const el = {
    className: '', textContent: '', innerHTML: '', hidden: false, title: '', style: {},
    classList: { toggle() {}, add() {}, remove() {} },
    replaceChildren() {}, appendChild() {}, prepend() {}, remove() {}, addEventListener() {},
  };
  return el;
}
globalThis.document ??= { createElement: () => fakeElement(), createTextNode: () => fakeElement() };
globalThis.window ??= globalThis;
globalThis.window.matchMedia ??= () => ({ matches: false });

const { standsFor, createTeamView } = await import('../../renderer/views/scene/teamView.js');

const place = (x, z, kind = 'ghost') => ({ kind, x, z, stand: { x: x + 2, z } });
const worker = (n, folder, where, extra = {}) => ({
  id: `w${n}-abcd12`, n, title: `Parte ${n}`, folder, status: 'working', created: [], changed: [], audit: null, text: '', place: where, ...extra,
});

test('standsFor: no worker stands on the stand (Qubi audits from there); workers that share it flank it', () => {
  const alone = [worker(1, 'apps/web', place(0, 0))];
  const shared = [worker(1, 'apps/web', place(5, 5, 'building')), worker(2, 'apps/api', place(5, 5, 'building')), worker(3, 'apps/db', place(5, 5, 'building'))];
  for (const workers of [alone, shared]) {
    const stands = standsFor(workers);
    for (const w of workers) {
      const s = stands.get(w.id);
      assert.ok(Math.hypot(s.x - w.place.stand.x, s.z - w.place.stand.z) >= 1, `${w.id} stands beside Qubi`);
    }
    const spots = [...stands.values()].map((s) => `${s.x.toFixed(2)},${s.z.toFixed(2)}`);
    assert.equal(new Set(spots).size, spots.length, 'never two on the same spot');
  }
  const [a, b] = [...standsFor(shared.slice(0, 2)).values()];
  const stand = shared[0].place.stand;
  assert.ok(Math.abs((a.z - stand.z) + (b.z - stand.z)) < 1e-9, 'two workers flank the stand, one on each side');
});

function setupView(initial) {
  const added = [];
  const labelsMade = [];
  const layer = { add: (...o) => added.push(...o), remove() {} };
  const sceneView = { layers: { map: layer }, onFrame: () => {} };
  const labels = {
    add({ className } = {}) {
      const label = { el: fakeElement(), className, anchor: null, removed: false, setAnchor(x, y, z) { this.anchor = { x, y, z }; }, remove() { this.removed = true; } };
      labelsMade.push(label);
      return label;
    },
  };
  const teamViewModel = { store: new Observable(initial) };
  const view = createTeamView({ sceneView, labels, teamViewModel });
  const siteLabels = () => labelsMade.filter((l) => l.className.startsWith('build-site') && !l.removed);
  return { view, teamViewModel, siteLabels, added };
}

test('a ghost folder that moves or gets drawn on the map keeps one site, at its place, with its own name', () => {
  const a = worker(1, 'apps/web', place(10, 0));
  const b = worker(2, 'apps/api', place(14, 0));
  const drop = (w, id) => ({ id, worker: w.id, folder: w.folder, path: `${w.folder}/x${id}.js`, x: w.place.x, z: w.place.z });
  const { view, teamViewModel, siteLabels } = setupView({ phase: 'working', workers: [a, b], guide: null, drops: [] });
  teamViewModel.store.set({ workers: [{ ...a, created: ['apps/web/x1.js'] }, b], drops: [drop(a, 'd1')] });
  teamViewModel.store.set({ workers: [{ ...a, created: ['apps/web/x1.js'] }, { ...b, created: ['apps/api/x2.js'] }], drops: [drop(a, 'd1'), drop(b, 'd2')] });
  assert.equal(siteLabels().length, 2);

  // apps/web gets drawn as a building; apps/api's ghost slides into the slot apps/web had
  const a2 = { ...a, place: place(30, 30, 'building'), created: ['apps/web/x1.js'] };
  const b2 = { ...b, place: place(10, 0), created: ['apps/api/x2.js'] };
  teamViewModel.store.set({ workers: [a2, b2] });
  const ghosts = siteLabels().filter((l) => l.className === 'build-site');
  assert.equal(ghosts.length, 1, 'the old ghost of apps/web is gone');
  assert.match(ghosts[0].el.innerHTML, /apps\/api\//, 'the moved ghost keeps its own folder name');
  assert.doesNotMatch(ghosts[0].el.innerHTML, /apps\/web/);
  assert.equal(ghosts[0].anchor.x, 10, 'at its new place');
  view.dispose();
});
