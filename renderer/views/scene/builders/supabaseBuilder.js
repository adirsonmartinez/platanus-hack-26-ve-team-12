// Supabase node: stacked database disks, floating bolt logo and server rack. It reaches the project
// by the same road as the other integrations (drawn by mapView). When vulnerable it turns red, blinks
// and shows a warning sign.
import * as THREE from 'three';
import { box, cylinder, materials as M, warningSign } from '../materials.js';
import { SUPABASE_NODE as SB } from '../../../viewmodels/layout.js';

const BASE = 0.55;

export function buildSupabaseNode() {
  const g = new THREE.Group();
  const B = BASE;

  // Dark platform with a green rim
  box(g, M.slabEdge, 5.4, 0.3, 5.4, SB.x, 0, SB.z);
  box(g, M.slab, 5, 0.25, 5, SB.x, 0.3, SB.z);

  // Database: stacked disks with light rings between them
  const db = { x: SB.x - 0.4, z: SB.z - 0.4, r: 1.3 };
  const lights = []; // parts that turn red during a vulnerability
  for (let i = 0; i < 3; i++) {
    cylinder(g, M.body, db.r, 0.85, db.x, B + i * 1.05, db.z);
    if (i < 2) lights.push(cylinder(g, M.supabaseLit, db.r * 0.94, 0.2, db.x, B + i * 1.05 + 0.85, db.z));
  }
  cylinder(g, M.slabEdge, db.r * 0.8, 0.12, db.x, B + 3.0, db.z);

  // Logo: extruded bolt floating and spinning above the database
  const shape = new THREE.Shape();
  [[0.15, 1], [-0.65, -0.12], [-0.02, -0.12], [-0.15, -1], [0.65, 0.12], [0.02, 0.12]]
    .forEach(([px, py], i) => (i ? shape.lineTo(px, py) : shape.moveTo(px, py)));
  shape.closePath();
  const boltGeometry = new THREE.ExtrudeGeometry(shape, { depth: 0.22, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 });
  boltGeometry.center();
  const bolt = new THREE.Mesh(boltGeometry, M.supabaseLit);
  bolt.castShadow = true;
  bolt.position.set(db.x, B + 4.4, db.z);
  g.add(bolt);
  lights.push(bolt);

  // Server rack with LEDs
  const rack = { x: SB.x + 1.4, z: SB.z + 1.2 };
  box(g, M.bodyDark, 1.4, 2.4, 1.2, rack.x, B, rack.z);
  for (let i = 0; i < 4; i++) {
    const led = box(g, i % 2 ? M.supabaseLit : M.glass, 0.9, 0.12, 0.05, rack.x, B + 0.4 + i * 0.5, rack.z + 0.62);
    if (i % 2) lights.push(led);
  }
  box(g, M.slab, 1.5, 0.12, 1.3, rack.x, B + 2.4, rack.z);

  // --- Vulnerability indicators (hidden until it is active) ---
  const warning = warningSign();
  warning.position.set(db.x, B + 7, db.z);
  warning.visible = false;
  g.add(warning);

  // Red waves expanding on the ground from the node
  const waves = [0, 0.5].map((phase) => {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xff3b4e, transparent: true, depthWrite: false })
    );
    mesh.position.set(SB.x, 0.6, SB.z);
    mesh.visible = false;
    g.add(mesh);
    return { mesh, phase };
  });

  // Red light washing over the platform
  const glow = new THREE.PointLight(0xff3b4e, 0, 10, 2);
  glow.position.set(db.x, B + 3.5, db.z + 1.5);
  g.add(glow);

  let vulnerable = false;

  function setVulnerable(on) {
    vulnerable = on;
    warning.visible = on;
    waves.forEach((w) => { w.mesh.visible = on; });
    lights.forEach((mesh) => { mesh.material = on ? M.dangerLit : M.supabaseLit; });
  }

  function update(t) {
    bolt.rotation.y = t * 1.2;
    bolt.position.y = B + 4.4 + Math.sin(t * 2) * 0.15;
    M.supabaseLit.emissiveIntensity = 0.7 + 0.35 * Math.sin(t * 3) ** 2;

    if (!vulnerable) {
      glow.intensity = 0;
      return;
    }
    const blink = Math.sin(t * 8) > 0 ? 1 : 0.35; // hard alarm-like blink
    M.dangerLit.emissiveIntensity = 0.35 + 0.55 * blink;
    glow.intensity = 3 + 5 * blink;
    warning.rotation.y = t * 2;
    warning.position.y = B + 7 + Math.sin(t * 3) * 0.25;
    waves.forEach((w) => {
      const k = (t * 0.6 + w.phase) % 1;
      const s = 1 + k * 3.2;
      w.mesh.scale.set(s, 1, s);
      w.mesh.material.opacity = 0.8 * (1 - k);
    });
  }

  return { group: g, update, setVulnerable, labelAnchor: { x: db.x, y: B + 5.6, z: db.z }, trunkStart: { x: db.x, z: SB.z - 2.7 } };
}
