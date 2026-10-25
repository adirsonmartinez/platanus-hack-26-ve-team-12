// Qubi, the repairer, in 3D: a blocky character (helmet, overalls, golden hammer) built from boxes.
// Legs, arms and head hang from pivot groups so qubiView can animate walking, thinking and hammering.
// Front = +z. Total height ≈ 2.4 units.
import * as THREE from 'three';
import { box, materials as M } from '../materials.js';

const pivot = (parent, x, y, z) => {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
};

export function buildRemi() {
  const root = new THREE.Group();
  const body = pivot(root, 0, 0, 0); // bobs and leans as a whole

  // Legs (pivot at the hip) with boots
  const legs = [-0.2, 0.2].map((x) => {
    const leg = pivot(body, x, 0.9, 0);
    box(leg, M.qubiOverallsDark, 0.3, 0.72, 0.32, 0, -0.72, 0);
    box(leg, M.qubiBoots, 0.34, 0.18, 0.46, 0, -0.9, 0.06);
    return leg;
  });

  // Torso: overalls below, white shirt above, bib with golden buttons in front
  box(body, M.qubiOveralls, 0.8, 0.42, 0.46, 0, 0.88, 0);
  box(body, M.qubiShirt, 0.8, 0.38, 0.42, 0, 1.3, 0);
  box(body, M.qubiOveralls, 0.5, 0.34, 0.06, 0, 1.22, 0.22);
  for (const x of [-0.17, 0.17]) {
    box(body, M.qubiOveralls, 0.1, 0.3, 0.44, x, 1.32, 0); // straps
    box(body, M.qubiHammer, 0.07, 0.07, 0.04, x, 1.44, 0.25); // buttons
  }

  // Arms (pivot at the shoulder): sleeve, forearm, hand
  const arms = [-0.52, 0.52].map((x) => {
    const arm = pivot(body, x, 1.62, 0);
    box(arm, M.qubiShirt, 0.24, 0.3, 0.26, 0, -0.3, 0);
    box(arm, M.qubiSkin, 0.2, 0.36, 0.22, 0, -0.66, 0);
    box(arm, M.qubiSkin, 0.24, 0.18, 0.24, 0, -0.84, 0);
    return arm;
  });

  // Golden hammer in the right hand (pointing forward when the arm hangs)
  const hammer = pivot(arms[1], 0, -0.76, 0.05);
  box(hammer, M.qubiHandle, 0.08, 0.08, 0.62, 0, -0.04, 0.26);
  box(hammer, M.qubiHammer, 0.22, 0.42, 0.24, 0, -0.21, 0.6);

  // Head (pivot at the neck): face, eyes, nose, smile, helmet with brim
  const head = pivot(body, 0, 1.68, 0);
  box(head, M.qubiSkin, 0.62, 0.56, 0.56, 0, 0, 0);
  for (const x of [-0.13, 0.13]) box(head, M.qubiEye, 0.08, 0.11, 0.03, x, 0.24, 0.285);
  box(head, M.qubiSkinDark, 0.1, 0.08, 0.06, 0, 0.14, 0.3); // nose
  box(head, M.qubiEye, 0.2, 0.04, 0.03, 0, 0.06, 0.285); // smile
  box(head, M.qubiHelmet, 0.68, 0.2, 0.64, 0, 0.5, 0);
  box(head, M.qubiHelmet, 0.48, 0.12, 0.48, 0, 0.7, 0);
  box(head, M.qubiHelmetDark, 0.7, 0.06, 0.26, 0, 0.5, 0.42); // brim

  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { root, body, legs, arms, head, hammer };
}
