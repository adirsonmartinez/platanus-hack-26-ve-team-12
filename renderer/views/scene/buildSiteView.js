// Building live, on the map (BuildViewModel.sites / drop): each folder the agent is saving files into
// is a "site". A folder the map does not draw rises from the ground as an open folder; it gains a sheet
// for each new file, and the sheet the robot carries flies from its hands into the folder. A purple
// ring marks the folder it is working on. Nothing glows like a problem, nothing is clickable, and it all
// goes when the work is over (the radar map stays the source of truth).
import * as THREE from 'three';
import { FOLDER } from '../../viewmodels/layout.js';
import { buildGlassFolder } from './builders/glassFolderBuilder.js';
import { PALETTE, materials as M } from './materials.js';
import { escapeHtml } from '../../core/format.js';
import { strings } from '../../i18n/es.js';

const RISE_S = 0.5;
const FLY_S = 0.6;
const MAX_SHEETS = 4;
// glassFolderBuilder draws log2(1 + files) / 2 sheets (up to 4): this many files show `sheets` of them
const filesFor = (sheets) => 2 ** (2 * Math.min(Math.max(sheets, 1), MAX_SHEETS)) - 1;
const ringMaterial = new THREE.MeshBasicMaterial({ color: PALETTE.marker, transparent: true, opacity: 0.75, side: THREE.DoubleSide });

export function createBuildSiteView({ sceneView, labels, buildViewModel, hands = () => null }) {
  const layer = sceneView.layers.map;
  const sites = new Map(); // folder -> { group, label, sheets, rise, x, z }
  const flights = [];      // sheets flying into a folder { mesh, from, to, t }
  let lastDrop = null;
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const ring = new THREE.Mesh(new THREE.RingGeometry(1, 1.1, 64), ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  layer.add(ring);

  function drawSite(site) {
    let s = sites.get(site.folder);
    const sheets = site.papers + 1; // an empty site already shows one sheet: it is a folder
    if (s && s.sheets === sheets && s.x === site.x && s.z === site.z && s.kind === site.kind) return s;
    // it became a folder the map draws (or the other way): its label changes too
    if (s && s.kind !== site.kind) { s.label?.remove(); s.label = null; }
    if (s?.group) layer.remove(s.group);
    const isNew = !s;
    s ??= { label: null, rise: 0 };
    s.sheets = sheets;
    s.kind = site.kind;
    s.x = site.x;
    s.z = site.z;
    // a folder the map already shows (it has problems) keeps its own building; root files use the plaza
    if (site.kind === 'ghost') {
      const built = buildGlassFolder({ size: FOLDER.size, files: filesFor(sheets), level: 'green' }); // like the map's folders
      built.group.position.set(site.x, 0, site.z);
      layer.add(built.group);
      s.group = built.group;
      s.top = built.top;
      if (isNew && !still) { built.group.scale.y = 0.001; s.rise = 0; } else s.rise = 1;
      if (!isNew && !still) built.group.scale.setScalar(1.06); // a little bump when a sheet goes in
    } else {
      s.group = null;
      s.top = site.kind === 'plaza' ? 1 : 3;
    }
    // the plaza already has the project's label: its loose files are told just in front of it
    // a folder the map draws already has its label: only a small counter goes under it
    const anchor = site.kind === 'plaza' ? { x: site.x, y: 0.6, z: site.z + 3.4 }
      : site.kind === 'building' ? { x: site.x, y: 0.2, z: site.z + 2.6 }
        : { x: site.x, y: s.top + 1.1, z: site.z };
    s.label ??= labels.add({ className: `build-site${site.kind === 'building' ? ' counter' : ''}`, anchor });
    s.label.setAnchor(anchor.x, anchor.y, anchor.z);
    sites.set(site.folder, s);
    return s;
  }

  function clear(folder) {
    const s = sites.get(folder);
    if (s?.group) layer.remove(s.group);
    s?.label.remove();
    sites.delete(folder);
  }

  buildViewModel.store.subscribe(({ sites: list, drop }) => {
    const keep = new Set(list.map((s) => s.folder));
    for (const folder of [...sites.keys()]) if (!keep.has(folder)) clear(folder);
    let current = null;
    for (const site of list) {
      const s = drawSite(site);
      const name = site.kind === 'plaza' ? strings.build.root : site.label;
      const count = escapeHtml(strings.build.papers(site.papers, site.edits));
      s.label.el.innerHTML = site.kind === 'building' ? `<span>${count}</span>` : `<strong>${escapeHtml(name)}</strong><span>${count}</span>`;
      s.label.el.classList.toggle('current', site.current);
      if (site.current) current = { site, s };
    }
    ring.visible = Boolean(current);
    if (current) ring.position.set(current.site.x, 0.35, current.site.z);
    // a sheet goes from the robot's hands into the folder
    if (drop && drop !== lastDrop) {
      lastDrop = drop;
      const target = sites.get(drop.folder);
      const from = hands() ?? { x: drop.from.x, y: 1.6, z: drop.from.z };
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.04, 0.8), M.white);
      mesh.castShadow = true;
      mesh.position.set(from.x, from.y, from.z);
      layer.add(mesh);
      flights.push({ mesh, from, to: { x: drop.x, y: (target?.top ?? 2) - 0.6, z: drop.z }, t: still ? FLY_S : 0 });
    }
  }, { immediate: true });

  sceneView.onFrame((time, dt) => {
    const pulse = still ? 1 : 1 + Math.sin(time * 3) * 0.04;
    ring.scale.setScalar(FOLDER.platform * 0.75 * pulse);
    for (const s of sites.values()) {
      if (!s.group) continue;
      if (s.rise < 1) { s.rise = Math.min(1, s.rise + dt / RISE_S); s.group.scale.y = 1 - (1 - s.rise) ** 3; }
      else if (s.group.scale.x !== 1) s.group.scale.setScalar(Math.max(1, s.group.scale.x - dt * 0.4));
    }
    for (let i = flights.length - 1; i >= 0; i--) {
      const f = flights[i];
      f.t = Math.min(FLY_S, f.t + dt);
      const k = f.t / FLY_S;
      const e = 1 - (1 - k) ** 2;
      f.mesh.position.set(f.from.x + (f.to.x - f.from.x) * e, f.from.y + (f.to.y - f.from.y) * e + Math.sin(Math.PI * k) * 1.4, f.from.z + (f.to.z - f.from.z) * e);
      f.mesh.rotation.x = -0.35 + k * 1.9; // it turns upright to slide in
      if (k >= 1) { layer.remove(f.mesh); f.mesh.geometry.dispose(); flights.splice(i, 1); }
    }
  });
}
