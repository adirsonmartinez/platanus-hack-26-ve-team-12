// The robot on the map. Four jobs, one robot (views/scene/guideRobot.js), in this order:
//   - tour (TourViewModel.guide): it glides to each stop, points at it and says what it is;
//   - building (BuildViewModel.guide): it carries each file the agent saves to its folder and drops it in;
//   - welcome: Desire's welcome robot (welcomeRobotView.js, RobotDialogViewModel) owns it; while its dialog is
//     on, this robot steps aside;
//   - companion (RobotViewModel): it waits on the plaza; the person grabs it, drags or throws it onto a
//     folder, and it asks what to do there. While an agent works it shows, in its bubble, the same
//     thinking orb and words as the chat's working card.
// `grabber` is what the map's input controller drags instead of the map when the pointer is on it.
import { createGuideRobot } from './guideRobot.js';
import { strings } from '../../i18n/es.js';
import { CAMERA } from '../../viewmodels/cameraViewModel.js';
import { thinkingOrb } from '../ui/thinkingOrb.js';
import { orbKeyOf, orbStateOf } from '../ui/runCardView.js';
import { CHIP_ICON } from '../ui/chatCardsView.js';
import * as THREE from 'three';
import { PALETTE } from './materials.js';
import { FOLDER } from '../../viewmodels/layout.js';

const HELD_LIFT = 1.4;
const THROW_ARC = 2.6;
const R = strings.robot;

// The bot message that is working right now (an agent's run, a repair, or the chat "typing"), or null
function working(state) {
  const run = state.messages.findLast((m) => m.run?.status === 'running' && !m.run.queued);
  if (run) return run;
  return state.typing ? { role: 'bot', text: '' } : null;
}

// openChat(): shows the chat (an answer from the bubble's buttons appears there)
export function createRobotView({ sceneView, labels, mapViewModel, tourViewModel = null, buildViewModel = null, robotViewModel = null, robotDialogViewModel = null, chatViewModel = null, cameraViewModel = null, openChat = () => {} }) {
  const welcomeOn = () => (robotDialogViewModel ? robotDialogViewModel.store.state.phase !== 'off' : false);
  const robot = createGuideRobot({ sceneView, labels });
  robot.object.userData.pick = { type: 'robot' };
  let job = null;     // 'tour' | 'build' | 'companion' | null
  let stepId = null;
  let hovered = false;
  let activity = null; // { state, label, orb } while an agent works
  let lastFlight = null;

  // Where it would land while held: a ring on that folder
  const target = new THREE.Mesh(new THREE.RingGeometry(1, 1.12, 64), new THREE.MeshBasicMaterial({ color: PALETTE.marker, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
  target.rotation.x = -Math.PI / 2;
  target.scale.setScalar(FOLDER.platform * 0.7);
  target.visible = false;
  sceneView.layers.map.add(target);

  // The choices where it landed, as buttons in its bubble (the same as its chat card)
  const placeButtons = (place) => (chatViewModel?.placeActions(place.event) ?? []).map((action) => ({
    label: R.short[action.kind] ?? action.label, // short on the map; the full wording on hover
    title: action.label,
    icon: CHIP_ICON[action.kind],
    run: () => { openChat(); chatViewModel.choose(action); robotViewModel.quiet(); },
  }));

  // What the companion says: the agent's state while it works, else its own question (with its choices),
  // else a hint on hover
  const companionWords = () => {
    if (activity) return { text: activity.label, orb: activity.orb };
    const s = robotViewModel.store.state;
    if (s.mode === 'held') return { text: s.over ? R.dropHere(s.over) : R.hint };
    if (s.bubble) return { ...s.bubble, actions: s.mode === 'here' && s.place?.event ? placeButtons(s.place) : [] };
    return hovered ? { text: R.hint } : null;
  };

  const apply = () => {
    const guide = tourViewModel?.store.state.guide;
    if (guide) {
      if (job !== 'tour') { robot.show(true); robot.lift(0); robot.carry(false); robot.place(guide.from); job = 'tour'; stepId = null; }
      if (guide.stepId !== stepId) {
        stepId = guide.stepId;
        robot.moveTo(guide.to, guide.walkMs);
        robot.pointAt(guide.center);
      }
      robot.say({ title: guide.title, text: guide.text });
      return;
    }
    const work = buildViewModel?.store.state.guide;
    if (work) {
      if (job !== 'build') {
        if (!robot.visible) robot.place(work.from); // else it sets off from where it is
        robot.show(true);
        robot.lift(0);
        job = 'build';
        stepId = null;
      }
      if (work.stepId !== stepId) {
        stepId = work.stepId;
        const phase = work.stepId.split(':').pop();
        if (phase.startsWith('carry')) { robot.moveTo(work.to, work.walkMs); robot.face(work.center); robot.pose('carry'); robot.carry(true); }
        else if (phase === 'drop') { robot.face(work.center); robot.pose('drop'); robot.carry(false); }
        else if (phase === 'edit') { robot.carry(false); robot.pointAt(work.center); }
        else if (phase === 'done') { robot.carry(false); robot.face({ yaw: cameraViewModel?.azimuth ?? CAMERA.azimuth }); robot.pose('wave'); }
        else { robot.carry(false); robot.pose('idle'); }
      } else if (work.pose === 'wait' || work.pose === 'carry') robot.pose(work.pose);
      robot.say({ title: work.title, text: work.text, orb: activity?.orb });
      return;
    }
    stepId = null;
    const companion = robotViewModel?.store.state;
    if (companion?.visible && !welcomeOn() && !mapViewModel.store.state.welcome) {
      if (job !== 'companion') {
        // back from a job: it walks home; otherwise it appears there
        if (robot.visible && job) robot.moveTo(companion.at, 900); else robot.place(companion.at);
        robot.show(true);
        robot.carry(false);
        lastFlight = null;
        job = 'companion';
      }
      switch (companion.mode) {
        case 'held': {
          // drawn lifted, but where the person holds it: its feet over `at` on screen
          const shift = liftShift();
          robot.pose('held');
          robot.lift(HELD_LIFT);
          robot.place({ x: companion.at.x + shift.x, z: companion.at.z + shift.z });
          break;
        }
        case 'flying':
          if (companion.flight !== lastFlight) {
            lastFlight = companion.flight;
            robot.pose('held');
            robot.lift(0);
            robot.moveTo(companion.flight.to, companion.flight.ms, { arc: THROW_ARC });
          }
          break;
        case 'here':
          robot.lift(0);
          if (companion.place?.center) robot.pointAt(companion.place.center);
          else robot.pose('wave');
          break;
        default: {
          const at = robot.position;
          if (!robot.moving && Math.hypot(at.x - companion.at.x, at.z - companion.at.z) > 0.05) robot.place(companion.at); // sent home
          robot.lift(0);
          robot.pose('idle');
          robot.face({ yaw: cameraViewModel?.azimuth ?? CAMERA.azimuth });
        }
      }
      target.visible = companion.mode === 'held' && Boolean(companion.overAt);
      if (target.visible) target.position.set(companion.overAt.x, 0.4, companion.overAt.z);
      robot.say(companionWords());
      return;
    }
    target.visible = false;
    job = null;
    robot.say(null);
    robot.show(false);
  };

  mapViewModel.store.subscribe(apply, { immediate: true });
  tourViewModel?.store.subscribe(apply);
  buildViewModel?.store.subscribe(apply);
  robotViewModel?.store.subscribe(apply);
  robotDialogViewModel?.store.subscribe(apply);
  // The agent's state, as in the chat's working card: a new orb only when the state changes
  chatViewModel?.store.subscribe((state) => {
    const message = working(state);
    if (!message) {
      if (activity) { activity = null; apply(); }
      return;
    }
    const orbState = orbStateOf(message);
    const label = strings.chat.orbLabels[orbKeyOf(message)] ?? strings.chat.orbLabels.working;
    if (activity?.state === orbState && activity.label === label) return;
    activity = { state: orbState, label, orb: thinkingOrb(orbState, { size: 20, label }) };
    if (job === 'companion') robot.say(companionWords());
    else if (job === 'build') apply();
  }, { immediate: true });
  sceneView.onFrame((_t, dt) => robot.update(dt));

  // Lifting it moves it up on screen: its ground spot moves toward the camera by the same amount, so it
  // stays under the hand (the camera's offset says which way "toward the camera" is)
  function liftShift() {
    const o = cameraViewModel?.offset?.() ?? { x: 0, y: 1, z: 0 };
    return { x: (o.x / o.y) * HELD_LIFT, z: (o.z / o.y) * HELD_LIFT };
  }

  // Dragging and throwing: screen points become ground points; the speed of the last moves is the throw.
  // `grip` keeps where on the robot the person took it, so it does not jump to the cursor.
  let samples = [];
  let grip = { x: 0, z: 0 };
  const ground = (x, y) => sceneView.groundPointAt(x, y);
  const grabber = {
    last: null,
    hit: (x, y) => job === 'companion' && Boolean(sceneView.pickAt(x, y, [robot.object])),
    hover(on) {
      hovered = on;
      if (job === 'companion') robot.say(companionWords());
    },
    start(x, y) {
      const at = robotViewModel.store.state.at;
      const p = ground(x, y);
      if (!robotViewModel.grab()) return;
      grip = p ? { x: at.x - p.x, z: at.z - p.z } : { x: 0, z: 0 };
      samples = [];
      this.move(x, y);
    },
    move(x, y) {
      this.last = { x, y };
      const g = ground(x, y);
      if (!g) return;
      const p = { x: g.x + grip.x, z: g.z + grip.z }; // where its feet are, as the person sees it
      samples.push({ x: p.x, z: p.z, t: performance.now() });
      samples = samples.filter((s) => samples.at(-1).t - s.t < 90);
      robotViewModel.drag(p);
    },
    end(x, y) {
      const g = ground(x, y);
      const p = g ? { x: g.x + grip.x, z: g.z + grip.z } : robotViewModel.store.state.at;
      const first = samples[0];
      const last = samples.at(-1);
      const dt = first && last ? (last.t - first.t) / 1000 : 0;
      const v = dt > 0.01 ? { vx: (last.x - first.x) / dt, vz: (last.z - first.z) / dt } : { vx: 0, vz: 0 };
      robotViewModel.release({ x: p.x, z: p.z, ...v });
      samples = [];
    },
  };
  return { grabber, get hands() { return robot.hands; } };
}
