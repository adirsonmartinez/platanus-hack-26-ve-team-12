// The guide robot (builders/robotBuilder.js) with a small API, so the welcome and the tour drive the
// same robot: show it, place it, glide it to a spot, turn it, set a pose and a bubble. update(dt) runs
// every frame; poses ease into each other. Reduced motion: moves are instant and nothing sways.
//   pose: 'idle' | 'wave' (right arm up, waving) | 'point' (right arm out toward what it faces) |
//         'held' (picked up: both arms up, swinging) | 'carry' (a sheet of paper in both hands) |
//         'wait' (carrying, waiting for the person) | 'drop' (pushing the sheet into a folder) |
//         'talk' (on a call, Qubi speaking: head nods and body bounces with speak(level), heart, mouth and
//         antenna light up with the voice) | 'listen' (on a call, the person speaking: head tilted to one
//         side, slow breathing, arms relaxed) | 'scan' (checking a folder: head down, turning slowly from side
//         to side, the right arm held out in front as if scanning it)
// carry(on) shows the sheet in its hands. speak(level) (0..1) is the voice's loudness for this frame; the
// call view sends it every frame while Qubi speaks (silence when it stops).
// lift(h) raises it off the ground (held); moveTo(…, { arc }) flies it in an arc (thrown, tumbling); with
// { arc, tumble: false } it hops over the folders on its way, easing and leaning (Qubi guided on a call).
// Face (MEJORAS §4): it blinks every 2-5 s; liveFace({ on, speaking }) each frame during a call: the mouth
// opens with the voice (speak), the eyes glow more while it speaks and look at you with small saccades
// while it listens, it nods when it starts to answer and its heart beats faster. Reduced motion: no blink,
// saccade, nod or heartbeat; only a small mouth.
// gesture(name) plays a short move on top of the pose (robotGestures.js: saludar, celebrar, pensar, sorpresa,
// encoger, asentir, negar, bailar, aplaudir) with its own face; expression(name) sets the face it keeps
// (feliz, sorprendido, pensativo, apenado, normal); gazeAt({ x, y } | null) turns its eyes and head a little
// toward a point on screen (-1..1 around its head: the pointer), so it looks at the person's cursor.
// Reduced motion: gestures only change the face.
// compact(text) shows its bubble as a one-line pill (null: back to its words); screenDistance(x, y) is how
// far a pointer is from it on screen (generous, for picking); top is the world point above its head.
// Options: scale (its size; Qubi is 1.25, a worker of his team 0.55: everything that hangs off it, the hover
// height, its shadow, its hands and its bubble, follows), accent (a color for its heart, ring, thruster,
// antenna and bubble title, on its own copies of those materials), pop (false: the caller animates its
// size with grow(k), so it does not also pop in by itself). dispose() frees what it made.
import * as THREE from 'three';
import { buildRobot } from './builders/robotBuilder.js';
import { glowLines, materials as M } from './materials.js';
import { icon } from '../ui/icons.js';
import { gestureFrame, faceOf, GESTURES } from './robotGestures.js';

const BASE_Y = 0.6;      // hovering just above the ground
const SCALE = 1.25;
const POP_SPEED = 2.4;
const TURN_SPEED = 8;
const LISTEN_TILT = 0.24; // head to one side, as someone listening
const BLINK_S = 0.12;
const NOD_S = 0.45;
const HEAD_TOP = 3.3;     // above its head (world units at Qubi's size), where the call panel hangs
const HIT_MIN_PX = 26;    // the smallest pick radius on screen, so a far, small robot is still easy to take

const damp = (current, goal, dt, speed = TURN_SPEED) => current + (goal - current) * Math.min(dt * speed, 1);
const angleTo = (from, to) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from));
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const between = (lo, hi) => lo + Math.random() * (hi - lo);
// A heartbeat: two quick bumps (lub-dub) per beat, rest otherwise; phase 0..1
const beat = (p) => Math.exp(-(((p - 0.06) / 0.05) ** 2)) + 0.6 * Math.exp(-(((p - 0.3) / 0.05) ** 2));
// Distance from p to the segment a-b (screen pixels)
function toSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

// The materials buildRobot shares between robots (only its own copies are freed or tinted)
const shared = () => new Set([M.robotShell, M.robotTrim, M.robotFace, M.robotGlow, M.accentLit, M.white, glowLines.accent.core, glowLines.accent.halo]);

// Its own copies of the lit parts, in `accent`: the heart and antenna keep their glow, the thruster and the
// ring of light under it take the color. The eyes and mouth stay as they are: it is still the same robot
function tint(robot, accent) {
  const color = new THREE.Color(accent);
  const lit = (base) => Object.assign(base.clone(), { color: color.clone().lerp(new THREE.Color(0xffffff), 0.35), emissive: color.clone() });
  robot.heart.material = lit(M.robotGlow);
  robot.tip.material = lit(M.accentLit);
  const core = Object.assign(glowLines.accent.core.clone(), { color: color.clone().multiplyScalar(1.15) });
  robot.root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.material === glowLines.accent.core) o.material = core;
    else if (o.material.blending === THREE.AdditiveBlending && o.material !== glowLines.accent.halo) o.material.color.set(color); // its own halo copies
  });
}

export function createGuideRobot({ sceneView, labels, scale = SCALE, accent = null, pop: popIn = true }) {
  const k = scale / SCALE; // everything that hangs off the robot follows its size
  const baseY = BASE_Y * k;
  const robot = buildRobot();
  if (accent != null) tint(robot, accent);
  // its own eye material, so its eyes can glow brighter while it speaks without lighting up other robots
  const eyeMaterial = robot.eyes[0].material.clone();
  const eyeGlow = eyeMaterial.emissiveIntensity ?? 1;
  robot.eyes.forEach((eye) => { eye.material = eyeMaterial; });
  const eyeRest = robot.eyes.map((eye) => ({ x: eye.position.x, y: eye.position.y }));
  robot.root.visible = false;
  sceneView.layers.map.add(robot.root);

  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.5 * k, 24), new THREE.MeshBasicMaterial({ color: 0x0d0f12, transparent: true, opacity: 0.35 }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.visible = false;
  sceneView.layers.map.add(shadow);

  // the sheet it carries to a folder (building live): in front of its chest, held with both hands
  const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.04, 0.8), M.white);
  sheet.position.set(0, 0.86, 0.62);
  sheet.rotation.x = -0.35;
  sheet.castShadow = true;
  sheet.visible = false;
  robot.body.add(sheet);

  const bubble = labels.add({ className: 'robot-bubble', hidden: true });
  const title = document.createElement('strong');
  const text = document.createElement('span');
  bubble.el.replaceChildren(title, text);
  if (accent != null) title.style.color = `#${new THREE.Color(accent).getHexString()}`; // which worker it is, at a glance

  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const at = { x: 0, z: 0 };
  let walk = null;        // { from, to, ms, t, arc }
  let lift = 0;           // eased height above the ground
  let liftGoal = 0;
  let swing = 0;          // sideways tilt while held, from how fast it is dragged
  let words = null;
  // { yaw } | { x, z, arm } (turned from where it stands, once it arrives). yaw may be a function, read every
  // frame: facing the camera, it keeps turning as the person turns the map
  let look = { yaw: Math.PI / 4 };
  let poseName = 'idle';
  let shown = 0;
  let clock = 0;
  let voice = 0;          // speak(level) for this frame
  let level = 0;          // eased voice level, so the nods follow the voice without jitter
  let tilt = 0;           // eased listening tilt
  let size = 1;           // grow(k): the caller's own pop and shrink
  let pill = null;        // compact(text): its bubble as a one-line pill
  // the live face
  let faceOn = false;     // on a call
  let speaking = false;
  let mouthY = 1, mouthX = 1;
  let glow = 0;           // eased extra light in its eyes
  let nextBlink = between(2, 5);
  let blinkAt = -10;
  const gaze = { x: 0, y: 0 };    // where the eyes are (offset from rest), eased
  const gazeGoal = { x: 0, y: 0 };
  let nextSaccade = 0;
  let nodAt = -10;
  let heartPhase = 0;
  // gestures and faces (robotGestures.js)
  let gesture = null;     // { name, t }
  let expressionName = 'normal';
  let moodWorried = false; // mood({ worried }): a worker Qubi flagged
  let worriedNow = false;
  const faceNow = { ...faceOf('normal') };
  let pointer = null;     // gazeAt: where the cursor is, -1..1 around its head
  const look2 = { x: 0, y: 0 }; // eased head turn toward the cursor

  const put = (x, z, y = 0) => {
    const moved = Math.hypot(x - at.x, z - at.z);
    at.x = x; at.z = z;
    robot.root.position.set(x, baseY + y, z);
    shadow.position.set(x, 0.3, z);
    shadow.scale.setScalar(Math.max(0.4, 1 - y * 0.15) * Math.max(size, 0.001));
    bubble.setAnchor(x, baseY + y + 3.7 * k, z);
    return moved;
  };
  const orbSlot = document.createElement('span');
  orbSlot.className = 'robot-orb';
  const actionRow = document.createElement('div');
  actionRow.className = 'robot-actions';
  // A round action (the call): one icon, centred on its own row, plain (labels.css .robot-call). Made once.
  const roundRow = document.createElement('div');
  roundRow.className = 'robot-round';
  let roundButton = null;
  let roundRun = null;
  const roundNode = (a) => {
    if (!roundButton) {
      roundButton = document.createElement('button');
      roundButton.type = 'button';
      roundButton.className = 'robot-call';
      roundButton.addEventListener('click', (e) => { e.stopPropagation(); roundRun?.(); });
    }
    roundRun = a.run;
    roundButton.replaceChildren(icon(a.icon, { size: 20 }));
    roundButton.title = a.title ?? a.label;
    roundButton.setAttribute('aria-label', a.title ?? a.label);
    return roundButton;
  };

  // Draws its words (or, compacted, the one-line pill) into the bubble
  const render = () => {
    const next = pill && words ? { text: pill } : words;
    title.textContent = next?.title ?? '';
    title.hidden = !next?.title;
    text.textContent = next?.text ?? '';
    if (next?.orb) { orbSlot.replaceChildren(next.orb); bubble.el.prepend(orbSlot); } else orbSlot.remove();
    bubble.el.classList.toggle('busy', Boolean(next?.orb) || Boolean(pill)); // the one-line pill style
    const all = next?.actions ?? [];
    const round = all.find((a) => a.round);
    const actions = all.filter((a) => !a.round);
    if (actions.length) {
      actionRow.replaceChildren(...actions.map((a) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'robot-action';
        if (a.icon) b.appendChild(icon(a.icon, { size: 14 }));
        b.appendChild(document.createTextNode(a.label));
        if (a.title) b.title = a.title;
        b.addEventListener('click', (e) => { e.stopPropagation(); a.run(); });
        return b;
      }));
      bubble.el.appendChild(actionRow);
    } else actionRow.remove();
    if (round) { roundRow.replaceChildren(roundNode(round)); bubble.el.appendChild(roundRow); } else roundRow.remove();
    bubble.el.classList.toggle('has-actions', all.length > 0);
    bubble.el.hidden = !robot.root.visible || !next;
  };

  // The face, every frame (MEJORAS §4). a: 0 with reduced motion (only a small mouth moves then)
  const animateFace = (dt, a, faceName) => {
    // the expression (eased), then the voice on top of it
    const want = faceOf(faceName);
    for (const key of ['eyeY', 'eyeScale', 'gazeX', 'gazeY', 'mouthX', 'mouthY']) faceNow[key] = damp(faceNow[key], want[key], dt, 10);
    const worried = moodWorried || want.worried;
    if (worried !== worriedNow) { worriedNow = worried; robot.setFace({ worried }); }
    // mouth: opens with the voice, a little narrower as it opens; eased twice so it never flickers
    const open = still ? level * 0.35 : level;
    mouthY = damp(mouthY, faceOn ? 0.6 + open : 1, dt, 20);
    mouthX = damp(mouthX, faceOn ? 1 - open * 0.15 : 1, dt, 20);
    robot.mouth.scale.set(mouthX * faceNow.mouthX, mouthY * faceNow.mouthY, 1);
    // blinks at a natural, uneven pace (sometimes twice); the lid closes and opens in BLINK_S
    if (a && clock >= nextBlink) {
      blinkAt = clock;
      nextBlink = clock + (Math.random() < 0.15 ? 0.28 : between(2, 5));
    }
    const b = (clock - blinkAt) / BLINK_S;
    const lid = a && b >= 0 && b < 1 ? 1 - 0.9 * Math.sin(Math.PI * b) : 1;
    // the cursor: the eyes follow it; else, listening on a call, they look at you with small quick jumps
    // (saccades), never still
    if (pointer) {
      gazeGoal.x = pointer.x * 0.04;
      gazeGoal.y = pointer.y * 0.03;
    } else if (a && faceOn && !speaking) {
      if (clock >= nextSaccade) {
        gazeGoal.x = between(-0.025, 0.025);
        gazeGoal.y = 0.012 + between(-0.012, 0.012); // a bit up: the camera is above it
        nextSaccade = clock + between(0.5, 1.8);
      }
    } else { gazeGoal.x = 0; gazeGoal.y = 0; }
    gaze.x = damp(gaze.x, gazeGoal.x, dt, 30);
    gaze.y = damp(gaze.y, gazeGoal.y, dt, 30);
    robot.eyes.forEach((eye, i) => {
      eye.scale.set(faceNow.eyeScale, lid * faceNow.eyeY * faceNow.eyeScale, 0.5 * faceNow.eyeScale);
      eye.position.x = eyeRest[i].x + gaze.x + faceNow.gazeX;
      eye.position.y = eyeRest[i].y + gaze.y + faceNow.gazeY;
    });
    // brighter eyes while it speaks (more with a louder voice)
    glow = damp(glow, speaking ? 0.35 + level * 0.5 : 0, dt, 8);
    eyeMaterial.emissiveIntensity = eyeGlow * (1 + glow);
    // heart: a calm beat, faster on a call and faster still while it speaks; the voice makes it bigger
    heartPhase = (heartPhase + dt * (speaking ? 2.1 : faceOn ? 1.3 : 1)) % 1;
    robot.heart.scale.setScalar(1 + (beat(heartPhase) * (faceOn ? 0.2 : 0.1) + level * 0.3) * a);
    robot.tip.scale.setScalar(1 + level * 0.5 * a);
  };

  return {
    // the 3D object (for picking: the person grabs it)
    get object() { return robot.root; },
    get visible() { return robot.root.visible; },
    get position() { return { ...at }; },
    // where it is going (the end of its walk), or where it is when it stands still
    get destination() { return walk ? { ...walk.to } : { ...at }; },
    // its speech bubble (the view keeps the hint open while the pointer is on its buttons)
    get bubble() { return bubble.el; },
    lift(height) { liftGoal = height; },
    show(on) {
      if (on && !robot.root.visible) shown = still || !popIn ? 1 : 0;
      robot.root.visible = shadow.visible = on;
      bubble.el.hidden = !on || !words;
    },
    place({ x, z }) {
      walk = null;
      const moved = put(x, z, lift);
      if (poseName === 'held') swing = Math.max(-0.6, Math.min(0.6, swing + moved * 0.25));
    },
    moveTo({ x, z }, ms = 1000, { arc = 0, tumble = arc > 0 } = {}) {
      if (still || ms <= 0 || Math.hypot(x - at.x, z - at.z) < 0.05) return this.place({ x, z }); // already there
      walk = { from: { ...at }, to: { x, z }, ms, t: 0, arc, tumble, startLift: lift };
    },
    // Turn toward a point (or to a fixed angle with { yaw })
    face(target) { look = { ...target }; },
    // Turn so the right arm points at a spot
    pointAt({ x, z }) {
      look = { x, z, arm: true };
      poseName = 'point';
    },
    pose(name) { poseName = name; },
    // Extra size, set by the caller every frame it changes (a worker pops in with an overshoot, shrinks away)
    grow(next) { size = Math.max(0, next); },
    // A worried face (a worker whose work Qubi flagged) or the usual smile
    mood({ worried = false } = {}) { moodWorried = worried; },
    // A short move on top of the pose (robotGestures.js); a new one replaces the one playing
    gesture(name) {
      if (!Object.hasOwn(GESTURES, name)) return false;
      gesture = { name, t: 0 };
      return true;
    },
    get gesturing() { return gesture?.name ?? null; },
    // The face it keeps between gestures
    expression(name) { expressionName = name || 'normal'; },
    // Where the cursor is around its head on screen (-1..1 each way), or null: it looks back ahead
    gazeAt(next) {
      pointer = next ? { x: Math.max(-1, Math.min(1, next.x)), y: Math.max(-1, Math.min(1, next.y)) } : null;
    },
    // How loud Qubi's voice is right now (0..1); read once by the next update
    speak(next) { voice = Math.max(0, Math.min(1, Number(next) || 0)); },
    carry(on) { sheet.visible = on; },
    // where its hands are (the sheet flies from there into the folder)
    get hands() { return { x: at.x, y: baseY + lift + 0.86 * scale, z: at.z }; },
    // words: { title?, text, orb?, actions? } or null. orb: a thinking orb element before the words;
    // actions: [{ label, icon, run }] buttons in the bubble (the person answers right there on the map)
    say(next) {
      words = next;
      render();
    },
    // A one-line pill instead of its words (its bubble touches another on screen); null: its words again
    compact(next) {
      const value = next || null;
      if (value === pill) return;
      pill = value;
      render();
    },
    get compacted() { return Boolean(pill); },
    get moving() { return Boolean(walk); },
    // The world point just above its head (the call panel hangs there)
    get top() { return { x: at.x, y: baseY + lift + HEAD_TOP * k * Math.max(size, 0.001), z: at.z }; },
    // How far (CSS pixels) the pointer at (clientX, clientY) is from it on screen: 0 on its axis, Infinity
    // when it is hidden or out of reach. The reach is generous: around its whole height, HIT_MIN_PX at least.
    screenDistance(clientX, clientY, extra = 10) {
      if (!robot.root.visible || !sceneView.toScreen || !sceneView.canvas) return Infinity;
      const box = sceneView.canvas.getBoundingClientRect();
      const p = { x: clientX - box.left, y: clientY - box.top };
      const grown = Math.max(size, 0.001);
      const feet = sceneView.toScreen({ x: at.x, y: baseY + lift, z: at.z });
      const head = sceneView.toScreen({ x: at.x, y: baseY + lift + 2.4 * k * grown, z: at.z });
      const reach = Math.max(HIT_MIN_PX, Math.hypot(head.x - feet.x, head.y - feet.y) * 0.42) + extra;
      const d = toSegment(p, feet, head);
      return d <= reach ? d : Infinity;
    },
    // During a call, every frame: on (it is Qubi on the phone) and speaking (Qubi talks, else he listens)
    liveFace({ on = false, speaking: talking = false } = {}) {
      if (on && talking && !speaking && !still) nodAt = clock; // the person stopped: it nods and answers
      faceOn = on;
      speaking = on && talking;
    },
    // Takes it off the map and frees its geometries, its own materials and its bubble (Qubi is never freed;
    // a worker is, when the team goes home)
    dispose() {
      sceneView.layers.map.remove(robot.root, shadow);
      bubble.remove();
      const keep = shared();
      const owned = new Set([shadow.material]);
      robot.root.traverse((o) => {
        if (!o.isMesh) return;
        o.geometry.dispose();
        if (!keep.has(o.material)) owned.add(o.material);
      });
      shadow.geometry.dispose();
      owned.forEach((m) => m.dispose());
    },
    update(dt) {
      if (!robot.root.visible) return;
      clock += dt;
      shown = Math.min(shown + dt * POP_SPEED, 1);
      const pop = 1 - (1 - shown) ** 3;
      const a = still ? 0 : 1;
      let gliding = false;
      lift = walk ? lift : damp(lift, liftGoal, dt, 10);
      swing = damp(swing, 0, dt, 4);
      if (walk) {
        walk.t += dt * 1000;
        const k = Math.min(walk.t / walk.ms, 1);
        const e = walk.tumble ? k : ease(k); // a throw flies at an even pace, a walk (or a hop) eases
        // a flight starts from where it was held and comes down in an arc; a hop goes up and over
        lift = walk.arc ? walk.startLift * (1 - e) + Math.sin(Math.PI * e) * walk.arc : lift;
        put(walk.from.x + (walk.to.x - walk.from.x) * e, walk.from.z + (walk.to.z - walk.from.z) * e, lift);
        robot.root.rotation.y = damp(robot.root.rotation.y, angleTo(robot.root.rotation.y, Math.atan2(walk.to.x - walk.from.x, walk.to.z - walk.from.z)), dt);
        gliding = k < 1 && !walk.tumble;
        if (walk.tumble && k < 1) robot.root.rotation.x = Math.sin(Math.PI * 2 * k) * 0.35 * a; // a little tumble
        if (k >= 1) { walk = null; robot.root.rotation.x = 0; }
      } else {
        if (lift > 0.001 || liftGoal > 0) put(at.x, at.z, lift);
        const yaw = (typeof look.yaw === 'function' ? look.yaw() : look.yaw) ?? (look.arm ? Math.atan2(-(look.z - at.z), look.x - at.x) : Math.atan2(look.x - at.x, look.z - at.z));
        robot.root.rotation.y = damp(robot.root.rotation.y, angleTo(robot.root.rotation.y, yaw), dt);
      }

      robot.root.scale.setScalar(scale * Math.max(pop * size, 0.001));
      shadow.scale.setScalar(Math.max(0.4, 1 - lift * 0.15) * Math.max(size, 0.001));
      // on a call: the voice (fast attack, quick release), in any pose (it can point while it talks);
      // listening breathes slowly
      level = damp(level, voice, dt, voice > level ? 18 : 9);
      voice = 0;
      tilt = damp(tilt, poseName === 'listen' ? LISTEN_TILT : 0, dt, 4);
      const breathe = poseName === 'listen' ? Math.sin(clock * 1.1) * 0.05 : Math.sin(clock * 2) * 0.08;
      robot.body.position.y = (breathe + level * 0.14 * Math.abs(Math.sin(clock * 7))) * a;
      robot.body.rotation.x = damp(robot.body.rotation.x, gliding ? 0.28 * a : 0, dt);        // leans while gliding
      const right = robot.arms[1];
      const left = robot.arms[0];
      if (poseName === 'held') {
        right.rotation.z = damp(right.rotation.z, 2.7 + Math.sin(clock * 9) * 0.12 * a, dt);
        left.rotation.z = damp(left.rotation.z, -2.7 - Math.sin(clock * 9) * 0.12 * a, dt);
        right.rotation.x = damp(right.rotation.x, 0, dt);
        left.rotation.x = damp(left.rotation.x, 0, dt);
        robot.root.rotation.z = swing;
      } else if (gliding && !['carry', 'wait', 'drop'].includes(poseName)) { // carrying keeps its hands on the sheet
        right.rotation.z = damp(right.rotation.z, 0.25, dt);
        right.rotation.x = damp(right.rotation.x, 0.5, dt);
        left.rotation.x = damp(left.rotation.x, 0.5, dt);
      } else if (poseName === 'carry' || poseName === 'wait' || poseName === 'drop') {
        const reach = poseName === 'drop' ? -1.65 : -1.2;
        const sway = poseName === 'wait' ? Math.sin(clock * 2.2) * 0.06 * a : 0;
        right.rotation.x = damp(right.rotation.x, reach + sway, dt, 12);
        left.rotation.x = damp(left.rotation.x, reach - sway, dt, 12);
        right.rotation.z = damp(right.rotation.z, 0.18, dt);
        left.rotation.z = damp(left.rotation.z, -0.18, dt);
        robot.body.rotation.x = damp(robot.body.rotation.x, poseName === 'drop' ? 0.22 * a : 0.05, dt);
        robot.head.rotation.x = poseName === 'wait' ? Math.sin(clock * 1.6) * 0.08 * a : 0;
      } else if (poseName === 'wave') {
        right.rotation.z = 2.5 + Math.sin(clock * 6) * 0.35 * a;
        right.rotation.x = damp(right.rotation.x, 0, dt);
        left.rotation.x = Math.sin(clock * 2) * 0.08 * a;
      } else if (poseName === 'talk' || poseName === 'listen') {
        // relaxed hands; talking, they move a little with the words, as people do
        const gesture = poseName === 'talk' ? Math.sin(clock * 4.5) * (0.06 + level * 0.25) * a : 0;
        const rest = poseName === 'listen' ? Math.sin(clock * 1.1) * 0.04 * a : 0;
        right.rotation.z = damp(right.rotation.z, 0.12 + gesture * 0.5, dt);
        right.rotation.x = damp(right.rotation.x, -0.15 - gesture + rest, dt);
        left.rotation.x = damp(left.rotation.x, -0.15 + gesture + rest, dt);
      } else if (poseName === 'scan') {
        // the right hand held out in front, sweeping slowly with the head, like a scanner over the folder
        const sweep = Math.sin(clock * 1.3) * a;
        right.rotation.x = damp(right.rotation.x, -1.35 + Math.sin(clock * 2.6) * 0.05 * a, dt);
        right.rotation.z = damp(right.rotation.z, 0.1 + sweep * 0.22, dt);
        left.rotation.x = damp(left.rotation.x, -0.1, dt);
      } else if (poseName === 'point') {
        right.rotation.z = damp(right.rotation.z, 1.5 + Math.sin(clock * 3) * 0.05 * a, dt);
        right.rotation.x = damp(right.rotation.x, 0, dt);
        left.rotation.x = damp(left.rotation.x, Math.sin(clock * 2) * 0.08 * a, dt);
      } else {
        right.rotation.z = damp(right.rotation.z, 0, dt);
        right.rotation.x = damp(right.rotation.x, 0, dt);
        left.rotation.x = damp(left.rotation.x, 0, dt);
      }
      if (!['held', 'carry', 'wait', 'drop'].includes(poseName)) {
        left.rotation.z = damp(left.rotation.z, 0, dt);
        robot.root.rotation.z = damp(robot.root.rotation.z, 0, dt);
      }
      robot.head.rotation.z = tilt + Math.sin(clock * (poseName === 'listen' ? 0.8 : 1.5)) * 0.08 * a;
      // the nod when it starts to answer: down and back up once
      const nodK = (clock - nodAt) / NOD_S;
      const answerNod = nodK >= 0 && nodK < 1 ? Math.sin(Math.PI * nodK) * 0.22 * a : 0;
      if (!['carry', 'wait', 'drop'].includes(poseName)) {
        // talking nods to the voice; listening looks up at you (the camera is above); else straight ahead
        const nod = poseName === 'talk' ? -level * 0.12 + Math.sin(clock * 9) * level * 0.14 * a
          : poseName === 'listen' ? -0.04 + Math.sin(clock * 1.1) * 0.03 * a
            : poseName === 'scan' ? 0.38 : 0;
        robot.head.rotation.x = damp(robot.head.rotation.x, nod + answerNod, dt, poseName === 'scan' ? 5 : 14);
      }
      // scanning: the head turns slowly from side to side (looking down at the folder); else straight ahead
      // the cursor: the head turns a little toward it too (not while scanning or carrying)
      const follows = pointer && !['scan', 'carry', 'wait', 'drop', 'held'].includes(poseName) && !walk;
      look2.x = damp(look2.x, follows ? pointer.x * 0.35 * a : 0, dt, 6);
      look2.y = damp(look2.y, follows ? pointer.y * 0.15 * a : 0, dt, 6);
      robot.head.rotation.y = damp(robot.head.rotation.y, (poseName === 'scan' ? Math.sin(clock * 1.3) * 0.5 * a : 0) + look2.x, dt, 5);
      if (follows) robot.head.rotation.x -= look2.y;
      // a gesture, on top of the pose: it eases in and hands the pose back as it ends
      const g = gesture ? gestureFrame(gesture.name, gesture.t) : null;
      if (gesture) { gesture.t += dt; if (!g) gesture = null; }
      const w = g ? g.w * a : 0;
      const mix = (current, value) => (value === undefined ? current : current + (value - current) * w);
      if (w > 0) {
        right.rotation.z = mix(right.rotation.z, g.rz);
        right.rotation.x = mix(right.rotation.x, g.rx);
        left.rotation.z = mix(left.rotation.z, g.lz);
        left.rotation.x = mix(left.rotation.x, g.lx);
        robot.head.rotation.x = mix(robot.head.rotation.x, g.hx);
        robot.head.rotation.y = mix(robot.head.rotation.y, g.hy);
        robot.head.rotation.z = mix(robot.head.rotation.z, g.hz);
        robot.body.position.y += (g.hop ?? 0) * w;
      }
      robot.body.rotation.y = w > 0 && g.spin !== undefined ? g.spin * w : damp(robot.body.rotation.y, 0, dt);
      robot.body.rotation.z = w > 0 && g.sway !== undefined ? g.sway * w : damp(robot.body.rotation.z, 0, dt);
      animateFace(dt, a, g && g.w > 0.3 ? g.face : expressionName);
      bubble.el.style.opacity = pop * Math.min(size, 1); // a worker's bubble fades as it shrinks away
    },
  };
}
