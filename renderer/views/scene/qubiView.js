// Qubi on the map, in 3D: walks into the risky file's folder, looks at it, thinks
// (hand on chin), hammers with sparks and celebrates. A bubble above him says what he is doing.
import * as THREE from 'three';
import { box, materials as M } from './materials.js';
import { buildRemi } from './builders/qubiBuilder.js';
import { loadRemiModel } from './builders/qubiModelLoader.js';
import { strings } from '../../i18n/es.js';

const GRAVITY = 14;
const BASE_Y = 0.45; // ground plates of the buildings
const TURN_SPEED = 10;
const BUBBLE = ['🚶', '👀', '🤔', '🔨', '✅'];

const damp = (current, goal, dt, speed = TURN_SPEED) => current + (goal - current) * Math.min(dt * speed, 1);
// Shortest way between two angles
const angleTo = (from, to) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from));

export function createRemiView({ sceneView, labels, repairViewModel }) {
  const qubi = buildRemi();
  qubi.root.scale.setScalar(1.35); // reads well next to the buildings at the default zoom
  qubi.root.visible = false;
  sceneView.scene.add(qubi.root);

  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.6, 24), new THREE.MeshBasicMaterial({ color: 0x1b1a2e, transparent: true, opacity: 0.2 }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  qubi.root.add(shadow);

  const bubble = labels.add({ className: 'qubi-bubble', hidden: true });

  // The 3D character from renderer/assets/qubi/ replaces the blocky one when it is there.
  // It has no skeleton, so the whole model bobs, leans and rocks with the same poses.
  let skin = null;
  loadRemiModel().then((model) => {
    if (!model) return;
    skin = model;
    qubi.body.visible = false;
    qubi.root.add(skin);
  });

  const sparks = []; // { mesh, v, life }
  let stepStarted = 0;
  let lastStep = -1;
  let clock = 0;
  let lastSwing = 0;
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function spark(at) {
    const mesh = box(sceneView.scene, M.spark, 0.12, 0.12, 0.12, at.x, at.y, at.z);
    mesh.castShadow = false;
    sparks.push({ mesh, life: 0.6, v: new THREE.Vector3((Math.random() - 0.5) * 4, 3 + Math.random() * 3, (Math.random() - 0.5) * 4) });
  }

  repairViewModel.store.subscribe((state) => {
    const job = state.job;
    qubi.root.visible = Boolean(job);
    bubble.el.hidden = !job;
    if (!job) { lastStep = -1; return; }
    if (job.step !== lastStep) {
      lastStep = job.step;
      stepStarted = clock;
      const R = strings.repair;
      const names = job.source === 'agent' ? R.stepsAgent(job.agentLabel) : R.steps;
      const done = job.step === BUBBLE.length - 1;
      bubble.el.textContent = done ? `${job.outcome === 'failed' ? '⛔' : BUBBLE[job.step]} ${R.outcome[job.outcome] ?? names[job.step]}` : `${BUBBLE[job.step]} ${names[job.step]}`;
      bubble.el.classList.toggle('done', job.step === BUBBLE.length - 1);
    }
  });

  // Pose: every joint eases toward its goal so steps blend into each other
  function pose(dt, { legs = 0, armL = 0, armLz = 0, armR = 0, armRz = 0, headX = 0, headY = 0, lean = 0, bob = 0 }) {
    qubi.legs[0].rotation.x = damp(qubi.legs[0].rotation.x, legs, dt, 18);
    qubi.legs[1].rotation.x = damp(qubi.legs[1].rotation.x, -legs, dt, 18);
    qubi.arms[0].rotation.x = damp(qubi.arms[0].rotation.x, armL, dt, 18);
    qubi.arms[0].rotation.z = damp(qubi.arms[0].rotation.z, armLz, dt);
    qubi.arms[1].rotation.x = damp(qubi.arms[1].rotation.x, armR, dt, 22);
    qubi.arms[1].rotation.z = damp(qubi.arms[1].rotation.z, armRz, dt);
    qubi.head.rotation.x = damp(qubi.head.rotation.x, headX, dt);
    qubi.head.rotation.y = damp(qubi.head.rotation.y, headY, dt);
    qubi.body.rotation.x = damp(qubi.body.rotation.x, lean, dt);
    qubi.body.position.y = bob;
  }

  sceneView.onFrame((_t, dt) => {
    clock += dt;
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.life -= dt;
      s.v.y -= GRAVITY * dt;
      s.mesh.position.addScaledVector(s.v, dt);
      if (s.life <= 0) { sceneView.scene.remove(s.mesh); sparks.splice(i, 1); }
    }

    const job = repairViewModel.store.state.job;
    if (!job) return;
    const e = clock - stepStarted;
    const a = still ? 0 : 1; // amplitude of every movement

    // Position: along the road while walking, then in front of the building
    const k = job.step === 0 ? Math.min(e / (job.stepMs / 1000), 1) : 1;
    const x = job.from.x + (job.to.x - job.from.x) * k;
    const z = job.from.z + (job.to.z - job.from.z) * k;
    qubi.root.position.set(x, BASE_Y, z);

    // Facing: the way he walks, then the building
    const look = job.step === 0 ? Math.atan2(job.to.x - job.from.x, job.to.z - job.from.z) : Math.atan2(job.center.x - x, job.center.z - z);
    qubi.root.rotation.y = damp(qubi.root.rotation.y, angleTo(qubi.root.rotation.y, look), dt);

    // While the agent is changing files (step 2), Qubi hammers instead of thinking
    const pose3 = job.step === 2 && job.hammering ? 3 : job.step;
    switch (pose3) {
      case 0: { // walk
        const s = Math.sin(e * 11) * a;
        pose(dt, { legs: s * 0.7, armL: -s * 0.6, armR: s * 0.5 - 0.3, bob: Math.abs(s) * 0.08 });
        break;
      }
      case 1: // look: leans in and turns the head side to side
        pose(dt, { lean: 0.18 * a, headX: 0.15, headY: Math.sin(e * 2.2) * 0.45 * a, armR: -0.2 });
        break;
      case 2: // think: hand on the chin, head tilted, slow sway
        pose(dt, { armL: -2.2, armLz: -0.55, headX: -0.2, headY: 0.25 * Math.sin(e * 1.4) * a, armR: -0.15, bob: Math.sin(e * 2) * 0.03 * a });
        break;
      case 3: { // hammer: raise high, strike down, sparks on each hit
        const phase = still ? 0.5 : (e * 2.6) % 1;
        const swing = phase < 0.6 ? -2.7 + (phase / 0.6) * 0.3 : -2.4 + ((phase - 0.6) / 0.4) * 1.6;
        pose(dt, { armR: swing, lean: 0.12 * a, headX: 0.2, armL: -0.4 });
        if (!still && phase > 0.92 && clock - lastSwing > 0.25) {
          lastSwing = clock;
          const toward = 0.45;
          for (let i = 0; i < 4; i++) spark({ x: x + (job.center.x - x) * toward, y: BASE_Y + 1.0, z: z + (job.center.z - z) * toward });
        }
        break;
      }
      default: { // done: hammer up and a happy hop
        const hop = still ? 0 : Math.max(0, Math.sin(e * 6)) * 0.25 * (e < 2.5 ? 1 : 0);
        pose(dt, { armR: -2.9, armRz: 0.2, bob: hop, headX: -0.15 });
      }
    }

    if (skin) {
      // Whole-body version of the pose: lean, bob, and a rocking strike while hammering
      skin.position.y = qubi.body.position.y;
      skin.rotation.x = qubi.body.rotation.x + (pose3 === 3 ? Math.max(0, -qubi.arms[1].rotation.x - 1.6) * 0.12 : 0);
      skin.rotation.z = pose3 === 0 ? Math.sin(e * 11) * 0.06 * a : 0;
      skin.rotation.y = qubi.head.rotation.y * 0.4;
    }
    bubble.setAnchor(x, BASE_Y + 3.1, z);
  });
}
