// The guide robot (builders/robotBuilder.js) with a small API, so the welcome and the tour drive the
// same robot: show it, place it, glide it to a spot, turn it, set a pose and a bubble. update(dt) runs
// every frame; poses ease into each other. Reduced motion: moves are instant and nothing sways.
//   pose: 'idle' | 'wave' (right arm up, waving) | 'point' (right arm out toward what it faces) |
//         'held' (picked up: both arms up, swinging) | 'carry' (a sheet of paper in both hands) |
//         'wait' (carrying, waiting for the person) | 'drop' (pushing the sheet into a folder)
// carry(on) shows the sheet in its hands.
// lift(h) raises it off the ground (held); moveTo(…, { arc }) flies it in an arc (thrown).
import * as THREE from 'three';
import { buildRobot } from './builders/robotBuilder.js';
import { materials as M } from './materials.js';
import { icon } from '../ui/icons.js';

const BASE_Y = 0.6;      // hovering just above the ground
const SCALE = 1.25;
const POP_SPEED = 2.4;
const TURN_SPEED = 8;

const damp = (current, goal, dt, speed = TURN_SPEED) => current + (goal - current) * Math.min(dt * speed, 1);
const angleTo = (from, to) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from));
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);

export function createGuideRobot({ sceneView, labels }) {
  const robot = buildRobot();
  robot.root.visible = false;
  sceneView.layers.map.add(robot.root);

  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), new THREE.MeshBasicMaterial({ color: 0x0d0f12, transparent: true, opacity: 0.35 }));
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

  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const at = { x: 0, z: 0 };
  let walk = null;        // { from, to, ms, t, arc }
  let lift = 0;           // eased height above the ground
  let liftGoal = 0;
  let swing = 0;          // sideways tilt while held, from how fast it is dragged
  let words = null;
  let look = { yaw: Math.PI / 4 }; // { yaw } | { x, z, arm } (turned from where it stands, once it arrives)
  let poseName = 'idle';
  let shown = 0;
  let clock = 0;

  const put = (x, z, y = 0) => {
    const moved = Math.hypot(x - at.x, z - at.z);
    at.x = x; at.z = z;
    robot.root.position.set(x, BASE_Y + y, z);
    shadow.position.set(x, 0.3, z);
    shadow.scale.setScalar(Math.max(0.4, 1 - y * 0.15));
    bubble.setAnchor(x, BASE_Y + y + 3.7, z);
    return moved;
  };
  const orbSlot = document.createElement('span');
  orbSlot.className = 'robot-orb';
  const actionRow = document.createElement('div');
  actionRow.className = 'robot-actions';

  return {
    // the 3D object (for picking: the person grabs it)
    get object() { return robot.root; },
    get visible() { return robot.root.visible; },
    get position() { return { ...at }; },
    lift(height) { liftGoal = height; },
    show(on) {
      if (on && !robot.root.visible) shown = still ? 1 : 0;
      robot.root.visible = shadow.visible = on;
      bubble.el.hidden = !on || !words;
    },
    place({ x, z }) {
      walk = null;
      const moved = put(x, z, lift);
      if (poseName === 'held') swing = Math.max(-0.6, Math.min(0.6, swing + moved * 0.25));
    },
    moveTo({ x, z }, ms = 1000, { arc = 0 } = {}) {
      if (still || ms <= 0 || Math.hypot(x - at.x, z - at.z) < 0.05) return this.place({ x, z }); // already there
      walk = { from: { ...at }, to: { x, z }, ms, t: 0, arc, startLift: lift };
    },
    // Turn toward a point (or to a fixed angle with { yaw })
    face(target) { look = { ...target }; },
    // Turn so the right arm points at a spot
    pointAt({ x, z }) {
      look = { x, z, arm: true };
      poseName = 'point';
    },
    pose(name) { poseName = name; },
    carry(on) { sheet.visible = on; },
    // where its hands are (the sheet flies from there into the folder)
    get hands() { return { x: at.x, y: BASE_Y + lift + 0.86 * SCALE, z: at.z }; },
    // words: { title?, text, orb?, actions? } or null. orb: a thinking orb element before the words;
    // actions: [{ label, icon, run }] buttons in the bubble (the person answers right there on the map)
    say(next) {
      words = next;
      title.textContent = next?.title ?? '';
      title.hidden = !next?.title;
      text.textContent = next?.text ?? '';
      if (next?.orb) { orbSlot.replaceChildren(next.orb); bubble.el.prepend(orbSlot); } else orbSlot.remove();
      bubble.el.classList.toggle('busy', Boolean(next?.orb));
      const actions = next?.actions ?? [];
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
      bubble.el.classList.toggle('has-actions', actions.length > 0);
      bubble.el.hidden = !robot.root.visible || !next;
    },
    get moving() { return Boolean(walk); },
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
        const e = walk.arc ? k : ease(k); // a throw flies at an even pace, a walk eases
        // a flight starts from where it was held and comes down in an arc
        lift = walk.arc ? walk.startLift * (1 - k) + Math.sin(Math.PI * k) * walk.arc : lift;
        put(walk.from.x + (walk.to.x - walk.from.x) * e, walk.from.z + (walk.to.z - walk.from.z) * e, lift);
        robot.root.rotation.y = damp(robot.root.rotation.y, angleTo(robot.root.rotation.y, Math.atan2(walk.to.x - walk.from.x, walk.to.z - walk.from.z)), dt);
        gliding = k < 1 && !walk.arc;
        if (walk.arc && k < 1) robot.root.rotation.x = Math.sin(Math.PI * 2 * k) * 0.35 * a; // a little tumble
        if (k >= 1) { walk = null; robot.root.rotation.x = 0; }
      } else {
        if (lift > 0.001 || liftGoal > 0) put(at.x, at.z, lift);
        const yaw = look.yaw ?? (look.arm ? Math.atan2(-(look.z - at.z), look.x - at.x) : Math.atan2(look.x - at.x, look.z - at.z));
        robot.root.rotation.y = damp(robot.root.rotation.y, angleTo(robot.root.rotation.y, yaw), dt);
      }

      robot.root.scale.setScalar(SCALE * Math.max(pop, 0.001));
      robot.body.position.y = Math.sin(clock * 2) * 0.08 * a;
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
      robot.head.rotation.z = Math.sin(clock * 1.5) * 0.08 * a;
      const blink = !still && clock % 3.2 < 0.12;
      robot.eyes.forEach((eye) => { eye.scale.y = blink ? 0.02 : 0.12; });
      bubble.el.style.opacity = pop;
    },
  };
}
