// The tour's own layer on the map (TourViewModel.ghosts / current): folders with no problems are not
// buildings on the security radar, so while the tour lasts each stop among them gets a low silver
// "ghost" plate with a dashed edge and its name; a white ring marks the stop on screen. Nothing here
// glows like a problem does, nothing is clickable, and all of it goes away when the tour ends.
import * as THREE from 'three';
import { FOLDER } from '../../viewmodels/layout.js';
import { PALETTE, groundLink, materials as M } from './materials.js';
import { escapeHtml } from '../../core/format.js';
import { strings } from '../../i18n/es.js';

const PLATE = FOLDER.platform;
const ghostMaterial = new THREE.MeshStandardMaterial({ color: 0x8d959e, transparent: true, opacity: 0.16, roughness: 0.8, metalness: 0.1, depthWrite: false });
const edgeMaterial = new THREE.LineDashedMaterial({ color: 0xc9ced4, dashSize: 0.35, gapSize: 0.25, transparent: true, opacity: 0.7 });
const ringMaterial = new THREE.MeshBasicMaterial({ color: PALETTE.marker, transparent: true, opacity: 0.75, side: THREE.DoubleSide });

export function createTourView({ sceneView, labels, tourViewModel }) {
  const group = new THREE.Group();
  sceneView.layers.map.add(group);
  let own = [];
  let made = []; // geometries made here (the shared box of groundLink is not one)
  let key = '';

  const ring = new THREE.Mesh(new THREE.RingGeometry(1, 1.12, 64), ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  sceneView.layers.map.add(ring);
  let ringSize = 1;
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function build(ghosts) {
    group.clear();
    made.forEach((g) => g.dispose());
    made = [];
    own.forEach((l) => l.remove());
    own = [];
    for (const g of ghosts) {
      groundLink(group, M.road, 0, 0, g.x, g.z, 0.2, 0.02).material = ghostMaterial;
      const plate = new THREE.Mesh(new THREE.BoxGeometry(PLATE, 0.15, PLATE), ghostMaterial);
      plate.position.set(g.x, 0.08, g.z);
      group.add(plate);
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(plate.geometry), edgeMaterial);
      made.push(plate.geometry, edge.geometry);
      edge.position.copy(plate.position);
      edge.computeLineDistances();
      group.add(edge);
      own.push(labels.add({
        html: `<strong>${escapeHtml(g.path)}/</strong><span>${strings.tour.ghost}</span>`,
        anchor: { x: g.x, y: 1.4, z: g.z },
        className: 'ghost',
      }));
    }
  }

  tourViewModel.store.subscribe(({ ghosts, current }) => {
    const next = ghosts.map((g) => `${g.path}@${g.x},${g.z}`).join('|');
    if (next !== key) { key = next; build(ghosts); }
    ring.visible = Boolean(current);
    if (current) {
      ringSize = current.kind === 'plaza' ? 3.2 : PLATE * 0.75;
      ring.position.set(current.x, 0.35, current.z);
    }
  }, { immediate: true });

  sceneView.onFrame((t) => {
    if (!ring.visible) return;
    const pulse = still ? 1 : 1 + Math.sin(t * 3) * 0.04;
    ring.scale.setScalar(ringSize * pulse);
  });
}
