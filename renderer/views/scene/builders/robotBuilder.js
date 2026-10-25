// The welcome robot, in 3D: a friendly little hover bot, all curves. A big round pearl head with a dark glass
// face where two pill eyes and a smile light up, ear discs with light rings, a curved antenna with a glowing
// orb, an egg body with a heart light, floating round hands, and a thruster with a ring of light under it.
// Front = +z. Total height ≈ 2.5 units, like Qubi. robotView animates the returned pieces.
import * as THREE from 'three';
import { glowLines, materials as M } from '../materials.js';

const pivot = (parent, x, y, z) => {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
};

const mesh = (parent, geometry, material, { x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, shadow = true } = {}) => {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = shadow;
  parent.add(m);
  return m;
};

// Soft light that does not depend on the bloom pass; each robot gets its own copy so it can pulse
const glow = (opacity) => Object.assign(glowLines.accent.halo.clone(), { opacity });

const HEAD = { y: 1.68, r: 0.56, sx: 1.08, sy: 0.9, sz: 0.95 };

export function buildRobot() {
  const root = new THREE.Group();
  const body = pivot(root, 0, 0, 0); // hovers as a whole

  // Thruster under the body and a ring of light on the ground below it
  const flame = mesh(body, new THREE.ConeGeometry(0.15, 0.42, 24, 1, true), glow(0.55), { y: 0.1, shadow: false });
  flame.rotation.x = Math.PI; // points down
  mesh(body, new THREE.ConeGeometry(0.06, 0.24, 16), glowLines.accent.core, { y: 0.16, shadow: false }).rotation.x = Math.PI;
  const ring = mesh(root, new THREE.RingGeometry(0.34, 0.5, 64), glow(0.12), { y: -0.12, shadow: false });
  ring.rotation.x = -Math.PI / 2;
  mesh(ring, new THREE.TorusGeometry(0.42, 0.012, 8, 64), glowLines.accent.core, { shadow: false });

  // Egg body: a nozzle, a trim belt and a heart light on the chest
  mesh(body, new THREE.CylinderGeometry(0.16, 0.12, 0.14, 24), M.robotTrim, { y: 0.32 });
  mesh(body, new THREE.SphereGeometry(0.42, 40, 28), M.robotShell, { y: 0.72, sy: 1.12, sz: 0.95 });
  const belt = mesh(body, new THREE.TorusGeometry(0.4, 0.03, 12, 48), M.robotTrim, { y: 0.6, sz: 0.95 });
  belt.rotation.x = Math.PI / 2;
  const chest = pivot(body, 0, 0.84, 0.385);
  chest.rotation.x = -0.25; // follows the curve of the body
  mesh(chest, new THREE.TorusGeometry(0.11, 0.025, 10, 32), M.robotTrim);
  const heart = mesh(chest, new THREE.CircleGeometry(0.075, 24), M.robotGlow, { z: 0.01, shadow: false });

  // Floating hands, no arms: each one turns around a pivot at the shoulder (robotView waves the right one)
  const arms = [-0.5, 0.5].map((x) => {
    const arm = pivot(body, x, 0.98, 0);
    const hand = mesh(arm, new THREE.SphereGeometry(0.13, 24, 16), M.robotShell, { y: -0.36 });
    mesh(hand, new THREE.TorusGeometry(0.12, 0.022, 8, 28), M.robotTrim, { y: 0.06 }).rotation.x = Math.PI / 2; // cuff
    return arm;
  });

  // Head (pivot at the neck)
  const head = pivot(body, 0, 1.2, 0);
  mesh(head, new THREE.CylinderGeometry(0.11, 0.14, 0.12, 20), M.robotTrim, { y: 0.02 });
  const y = HEAD.y - 1.2;
  mesh(head, new THREE.SphereGeometry(HEAD.r, 48, 32), M.robotShell, { y, sx: HEAD.sx, sy: HEAD.sy, sz: HEAD.sz });
  // Glass face: the front of a slightly bigger sphere (phi around +z, theta across the middle band)
  mesh(head, new THREE.SphereGeometry(HEAD.r + 0.012, 48, 24, Math.PI / 2 - 0.95, 1.9, 0.82, 1.2), M.robotFace,
    { y, sx: HEAD.sx, sy: HEAD.sy, sz: HEAD.sz, shadow: false });

  // Pill eyes, turned to follow the face; robotView blinks them (scale.y) and tilts them when worried
  const eyes = [-0.19, 0.19].map((x) => {
    const eye = mesh(head, new THREE.CapsuleGeometry(0.072, 0.13, 6, 16), M.robotGlow, { x, y: y + 0.07, z: 0.5, sz: 0.5, shadow: false });
    eye.rotation.y = x * 1.6;
    return eye;
  });
  // Smile: half a torus, opening up; robotView flips it into a frown for a risk and moves it while talking.
  // Tilted back to lie on the face, so it reads from the camera's height
  const mouthY = y - 0.07, mouthZ = 0.525;
  const mouth = pivot(head, 0, mouthY, mouthZ);
  mouth.rotation.x = -0.35;
  const smile = mesh(mouth, new THREE.TorusGeometry(0.1, 0.026, 10, 28, Math.PI), M.robotGlow, { shadow: false });
  smile.rotation.z = Math.PI;
  // Worried: eyes tilted up in the middle and a frown. The flipped arc leans into the glass (the tilt that
  // shows the smile), so it moves down and forward to stay on top of it
  const setFace = ({ worried = false } = {}) => {
    eyes.forEach((eye, i) => { eye.rotation.z = worried ? (i ? -0.35 : 0.35) : 0; });
    mouth.rotation.z = worried ? Math.PI : 0;
    mouth.position.y = mouthY - (worried ? 0.06 : 0);
    mouth.position.z = mouthZ + (worried ? 0.06 : 0);
  };

  // Ears: discs with a ring of light
  for (const side of [-1, 1]) {
    const ear = pivot(head, side * HEAD.r * HEAD.sx, y, 0);
    ear.rotation.z = Math.PI / 2;
    mesh(ear, new THREE.CylinderGeometry(0.14, 0.14, 0.1, 28), M.robotTrim);
    // The pivot's turn points its +y to -x, so the outer face is at -side
    mesh(ear, new THREE.TorusGeometry(0.1, 0.02, 8, 28), M.robotGlow, { y: -side * 0.055, shadow: false }).rotation.x = Math.PI / 2;
  }

  // Curved antenna with a glowing orb and a faint halo
  const top = y + HEAD.r * HEAD.sy - 0.03;
  const stem = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, top, 0), new THREE.Vector3(0, top + 0.3, 0), new THREE.Vector3(0.17, top + 0.38, 0.02));
  mesh(head, new THREE.TubeGeometry(stem, 20, 0.022, 8), M.robotTrim);
  const tip = mesh(head, new THREE.SphereGeometry(0.075, 20, 14), M.accentLit, { x: 0.17, y: top + 0.38, z: 0.02, shadow: false });
  mesh(tip, new THREE.SphereGeometry(0.13, 20, 14), glow(0.08), { shadow: false });

  root.traverse((o) => { if (o.isMesh && o.castShadow) o.receiveShadow = true; });
  return { root, body, arms, head, eyes, tip, mouth, heart, ring, flame, setFace };
}
