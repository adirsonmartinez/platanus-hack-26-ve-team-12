// The robot on the map. Seven jobs, one robot (views/scene/guideRobot.js), in this order:
//   - tour (TourViewModel.guide): it glides to each stop, points at it and says what it is;
//   - building (BuildViewModel.guide): it carries each file the agent saves to its folder and drops it in;
//   - team (TeamViewModel, docs/features/llamada/FASE2.md): Qubi leads his workers (teamView.js draws them).
//     With a guide it walks to each folder it audits (standing on the camera's side, never on a worker),
//     scans it ('scan') and says the verdict; while they work it stays where it is and points at the folder
//     that got the newest sheet (else the newest worker);
//   - repair (RepairViewModel): it walks to the exact file being repaired (the camera side of its icon),
//     looks at it, thinks while the agent works, pushes the fix in, then turns to you: celebrates a fix the
//     audit verified, shrugs when the risk is still there. Its bubble names the file and what was found
//     (the line). It goes before the team and the call: the robot you talk to is the one that repairs;
//   - call (CallViewModel, docs/features/llamada): it is Qubi on the phone. It faces the camera, talks to
//     the voice ('talk', moved by levels().output) or listens ('listen'), with a live face (guideRobot
//     liveFace). With the call's guide (ir_a / volver, MEJORAS §3) it hops to the folder, waves at the camera
//     on arrival and points at it, then walks back. What Qubi delegates is built by the building job (it
//     goes first), then it is back on the call;
//   - welcome: Desire's welcome robot (welcomeRobotView.js, RobotDialogViewModel) owns it; while its dialog is
//     on, this robot steps aside;
//   - companion (RobotViewModel): it waits on the plaza; the person grabs it, drags or throws it onto a
//     folder, and it asks what to do there. While an agent works it shows, in its bubble, the same
//     thinking orb and words as the chat's working card.
// During a call its bubble is not drawn (the call panel hangs above its head, at head()), except in the tour
// and building jobs, which keep theirs. The person can grab and throw Qubi in the companion, team and call
// jobs; once it lands it goes back to its job.
// Alive (docs/features/llamada/MEJORAS.md): it plays the call's gestures (callViewModel.store.gesture: it
// waves when it picks up, thinks while the agent works, celebrates the result…), makes a face for the moment
// (happy under the pointer, thinking while an agent works, surprised in the hand), its eyes and head follow
// the cursor, a tap on it gets a playful reaction, and facing the camera it keeps turning as the map turns.
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
import { HOME } from '../../viewmodels/robotViewModel.js';
import { auditSpot, clearOfFolders, foldersOf } from '../../viewmodels/teamViewModel.js';
import { repairGuide } from '../../viewmodels/repairViewModel.js';
import { clamp } from '../../core/format.js';
import { ICONS } from '../../icons/hugeicons.js';

const HELD_LIFT = 1.4;
const THROW_ARC = 2.6;
const R = strings.robot;
const PHONE = ICONS.call ? 'call' : 'bot'; // the call's icon (iconNames.js `call`, the chat header's phone)
const IN_CALL = ['ringing', 'connecting', 'live'];
const GRABBABLE = new Set(['companion', 'team', 'call']);
const HOVER_GRACE_MS = 600; // the hint stays this long after the pointer leaves the robot
const WALK_PER_UNIT_MS = 260;
const HOP_FROM = 3;         // a guided walk longer than this hops over the folders on its way
const ARRIVAL_WAVE_S = 1.2; // on arrival (call guide): a short wave at the camera, then it points
const TAP_MS = 280;         // a tap on it (not a drag): shorter than this, moving less than TAP_PX
const TAP_PX = 8;
const TAP_GESTURES = ['sorpresa', 'saludar', 'celebrar', 'aplaudir', 'bailar', 'asentir'];

// The bot message that is working right now (an agent's run, a repair, or the chat "typing"), or null
function working(state) {
  const run = state.messages.findLast((m) => m.run?.status === 'running' && !m.run.queued);
  if (run) return run;
  return state.typing ? { role: 'bot', text: '' } : null;
}

// The folder Qubi points at while his team works: where the newest sheet went, else the newest worker's
function newestFolder(team) {
  const drop = team.drops?.at(-1);
  if (drop) return { x: drop.x, z: drop.z };
  const place = team.workers?.findLast((w) => w.place)?.place;
  return place ? { x: place.x, z: place.z } : null;
}

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const walkMs = (from, to) => Math.round(clamp(distance(from, to) * WALK_PER_UNIT_MS, 700, 2600));
const hopOf = (from, to) => { const d = distance(from, to); return d > HOP_FROM ? clamp(1 + d * 0.12, 1.2, 3) : 0; };

// openChat(): shows the chat (an answer from the bubble's buttons appears there)
// callViewModel: the call with Qubi (store, levels() and start() are used; store.guide moves the robot);
// startCall(): starts it from the companion's bubble (defaults to callViewModel.start); teamViewModel: Qubi's
// team (only store is used); repairViewModel: the repairs (only store is used); tech(): Dev mode (full paths)
export function createRobotView({ sceneView, labels, mapViewModel, tourViewModel = null, buildViewModel = null, robotViewModel = null, robotDialogViewModel = null, chatViewModel = null, cameraViewModel = null, callViewModel = null, teamViewModel = null, repairViewModel = null, tech = () => false, startCall = () => callViewModel?.start(), openChat = () => {} }) {
  const welcomeOn = () => (robotDialogViewModel ? robotDialogViewModel.store.state.phase !== 'off' : false);
  const inCall = () => IN_CALL.includes(callViewModel?.store.state.status);
  const robot = createGuideRobot({ sceneView, labels });
  robot.object.userData.pick = { type: 'robot' };
  robot.bubble.style.zIndex = '3'; // Qubi's bubble stays above his workers' (teamView stacks theirs)
  let job = null;     // 'tour' | 'build' | 'repair' | 'team' | 'call' | 'companion' | null
  let stepId = null;
  let callStep = null; // the call's guide: { stepId, center, pose, phase: 'walk'|'wave'|'hold', at }
  let clock = 0;
  let hovered = false;
  let onBubble = false;  // the pointer is on its bubble (its "Hablar" button)
  let hoverTimer = null;
  let activity = null; // { state, label, orb } while an agent works
  let lastFlight = null;
  let lastGesture = null; // the call's last gesture id it played
  let taps = 0;

  // Facing the camera: read every frame, so Qubi keeps turning toward the person as they turn the map
  const azimuth = () => cameraViewModel?.azimuth ?? CAMERA.azimuth;
  const cameraYaw = () => ({ yaw: azimuth });
  const grabbed = () => ['held', 'flying'].includes(robotViewModel?.store.state.mode);
  const mapReady = () => mapViewModel.store.state.status === 'ready';

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

  // The buttons of a line the app said through the robot (robotViewModel.say): pressing one answers it
  const saidButtons = (bubble) => (bubble.said ? bubble.actions ?? [] : []).map((action) => ({
    label: action.label,
    icon: CHIP_ICON[action.kind],
    run: () => { robotViewModel.quiet(); action.run(); },
  }));

  // "Hablar": starts a call with Qubi from the bubble (only when there is no call going on)
  const callButton = () => (callViewModel && !inCall()
    ? [{ label: strings.call.short, title: strings.call.button, icon: PHONE, round: true, run: () => { hovered = onBubble = false; startCall(); } }]
    : []);

  // What the companion says: the agent's state while it works, else its own question (with its choices),
  // else a hint on hover
  const companionWords = () => {
    if (activity) return { text: activity.label, orb: activity.orb };
    const s = robotViewModel.store.state;
    if (s.mode === 'held') return { text: s.over ? R.dropHere(s.over) : R.hint };
    if (s.bubble) return { title: s.bubble.title, text: s.bubble.text, actions: [...(s.mode === 'here' && s.place?.event ? placeButtons(s.place) : []), ...saidButtons(s.bubble), ...callButton()] };
    return hovered || onBubble ? { text: R.hint, actions: callButton() } : null;
  };

  // The hint (with "Hablar") stays open while the pointer goes from the robot to its bubble and is on it
  const unhover = () => { hovered = false; if (job === 'companion') robot.say(companionWords()); };
  robot.bubble.addEventListener('pointerenter', () => { clearTimeout(hoverTimer); onBubble = true; });
  robot.bubble.addEventListener('pointerleave', () => {
    onBubble = false;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(unhover, HOVER_GRACE_MS);
  });

  // In the person's hand (held) or thrown (flying): the same in every job it can be grabbed in
  function byHand() {
    const companion = robotViewModel.store.state;
    if (companion.mode === 'held') {
      // drawn lifted, but where the person holds it: its feet over `at` on screen
      const shift = liftShift();
      robot.pose('held');
      robot.lift(HELD_LIFT);
      robot.place({ x: companion.at.x + shift.x, z: companion.at.z + shift.z });
    } else if (companion.flight !== lastFlight) {
      lastFlight = companion.flight;
      robot.pose('held');
      robot.lift(0);
      robot.moveTo(companion.flight.to, companion.flight.ms, { arc: THROW_ARC });
    }
    target.visible = companion.mode === 'held' && Boolean(companion.overAt);
    if (target.visible) target.position.set(companion.overAt.x, 0.4, companion.overAt.z);
  }

  // Landed during another job: its job goes on; the place question is for the companion only
  const settle = () => {
    lastFlight = null;
    target.visible = false;
    robot.lift(0);
    const s = robotViewModel?.store.state;
    if (s?.mode === 'here' && s.bubble) queueMicrotask(() => robotViewModel.quiet());
  };

  // Where Qubi audits a folder: on the camera's side of it, off every folder, never on a worker
  const auditAt = (lead, team) => {
    const place = team.workers.find((w) => w.place && distance(w.place, lead.center) < 0.01)?.place;
    const ghosts = team.workers.filter((w) => w.place?.kind === 'ghost').map((w) => ({ x: w.place.x, z: w.place.z }));
    return auditSpot({
      center: lead.center, kind: place?.kind ?? 'building', azimuth: azimuth(),
      avoid: team.workers.map((w) => w.place?.spot).filter(Boolean), folders: [...foldersOf(mapViewModel.store.state), ...ghosts],
    });
  };

  // On a call, when no guide holds a pose: it faces you and talks or listens
  const callPose = () => {
    const call = callViewModel.store.state;
    robot.face(cameraYaw());
    robot.pose(call.mode === 'speaking' && call.status === 'live' ? 'talk' : 'listen');
  };

  // The call's guide (ir_a / volver): it hops to the folder's stand; volver (no guide) takes it home
  const followCallGuide = (guide) => {
    if (guide?.to) {
      if (guide.stepId === callStep?.stepId) return;
      const plaza = !guide.center || Math.hypot(guide.center.x, guide.center.z) < 0.01;
      const to = clearOfFolders(guide.to, [...foldersOf(mapViewModel.store.state), ...(plaza ? [] : [guide.center])]);
      const from = robot.position;
      robot.moveTo(to, walkMs(from, to), { arc: hopOf(from, to), tumble: false });
      robot.pose('idle');
      callStep = { stepId: guide.stepId, center: guide.center ?? null, pose: guide.pose ?? 'point', phase: 'walk', at: clock };
      return;
    }
    if (!callStep) return;
    callStep = null;
    const home = robotViewModel?.store.state.at ?? HOME;
    const from = robot.position;
    robot.moveTo(home, walkMs(from, home), { arc: hopOf(from, home), tumble: false });
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
        target.visible = false;
        job = 'build';
        stepId = null;
      }
      if (work.stepId !== stepId) {
        stepId = work.stepId;
        const phase = work.stepId.split(':').pop();
        if (phase.startsWith('carry')) { robot.moveTo(work.to, work.walkMs); robot.face(work.center); robot.pose('carry'); robot.carry(true); }
        else if (phase === 'drop') { robot.face(work.center); robot.pose('drop'); robot.carry(false); }
        else if (phase === 'edit') { robot.carry(false); robot.pointAt(work.center); }
        else if (phase === 'done') { robot.carry(false); robot.face(cameraYaw()); robot.pose('wave'); }
        else { robot.carry(false); robot.pose('idle'); }
      } else if (work.pose === 'wait' || work.pose === 'carry') robot.pose(work.pose);
      robot.say({ title: work.title, text: work.text, orb: activity?.orb });
      return;
    }
    const fix = repairViewModel?.store.state.job;
    if (fix) {
      if (job !== 'repair') {
        if (!robot.visible) robot.place(fix.from); // else it sets off from where it is (the call, the plaza)
        robot.show(true);
        robot.lift(0);
        robot.carry(false);
        target.visible = false;
        job = 'repair';
        stepId = null;
      }
      if (grabbed()) { byHand(); stepId = null; return; }
      settle();
      const guide = repairGuide(fix, { tech: tech() });
      const key = `${fix.historyId}:${fix.step}:${fix.hammering ? 1 : 0}`;
      if (key !== stepId) {
        const fresh = !stepId?.startsWith(`${fix.historyId}:${fix.step}:`);
        stepId = key;
        if (fix.step === 0) {
          // to the camera side of the file's icon, off every folder; it hops over them on a long way
          const to = clearOfFolders(fix.to, [...foldersOf(mapViewModel.store.state), fix.center]);
          const from = robot.position;
          robot.moveTo(to, Math.max(fix.stepMs || 0, walkMs(from, to)), { arc: hopOf(from, to), tumble: false });
        }
        robot.face(guide.look === 'camera' ? cameraYaw() : fix.center);
        robot.pose(guide.pose);
        if (fresh && guide.gesture) robot.gesture(guide.gesture);
      }
      robot.say(inCall() ? null : { title: guide.title, text: guide.text, orb: fix.step < 4 ? activity?.orb : undefined });
      return;
    }
    const team = teamViewModel?.store.state;
    const lead = team?.guide;
    // between two audits there can be a moment without a guide: Qubi stays with his team, not off home
    if (lead || (['working', 'auditing'].includes(team?.phase) && mapReady())) {
      if (job !== 'team') {
        // it sets off from where it is; if it was not on the map, it appears where the team starts (or home)
        if (!robot.visible) robot.place(lead?.from ?? robotViewModel?.store.state.at ?? HOME);
        robot.show(true);
        robot.lift(0);
        robot.carry(false);
        target.visible = false;
        job = 'team';
        stepId = null;
      }
      if (grabbed()) {
        // in the person's hand: the team waits; once it lands it goes back to the folder it was checking
        byHand();
        robot.say(inCall() ? null : companionWords());
        stepId = null;
        return;
      }
      settle();
      if (lead) {
        if (lead.stepId !== stepId) {
          stepId = lead.stepId;
          if (lead.to) {
            const to = lead.center ? auditAt(lead, team) : lead.to;
            const from = robot.position;
            robot.moveTo(to, lead.walkMs > 0 ? lead.walkMs : walkMs(from, to));
          }
          const pose = lead.pose ?? 'scan';
          if (pose === 'point' && lead.center) robot.pointAt(lead.center);
          else {
            robot.face(pose === 'wave' || !lead.center ? cameraYaw() : lead.center);
            robot.pose(pose);
          }
        }
        robot.say(inCall() ? null : { title: lead.title ?? strings.team.title, text: lead.text });
        return;
      }
      // the team works: Qubi stays, pointing at the folder with the newest sheet
      stepId = null;
      const folder = newestFolder(team);
      if (folder) robot.pointAt(folder); else robot.pose('idle');
      robot.say(inCall() ? null : { title: strings.team.title, text: strings.team.phase.working });
      return;
    }
    stepId = null;
    if (inCall() && mapReady()) {
      if (job !== 'call') {
        // back from a build or a tour it walks home; from the companion it stays; else it appears at home
        const home = robotViewModel?.store.state.at ?? HOME;
        if (robot.visible && job && job !== 'companion') robot.moveTo(home, 900);
        else if (!robot.visible) robot.place(home);
        robot.show(true);
        robot.lift(0);
        robot.carry(false);
        target.visible = false;
        callStep = null;
        job = 'call';
      }
      robot.say(null); // the call panel, above its head, says what Qubi says
      if (grabbed()) { byHand(); callStep = null; return; }
      settle();
      followCallGuide(callViewModel.store.state.guide);
      if (!callStep || (callStep.phase === 'hold' && !(callStep.pose === 'point' && callStep.center))) callPose();
      return;
    }
    callStep = null;
    const companion = robotViewModel?.store.state;
    if (companion?.visible && !welcomeOn() && !mapViewModel.store.state.welcome) {
      if (job !== 'companion') {
        // back from a job: it walks home; otherwise it appears there (a throw in another job is already done)
        if (robot.visible && job) robot.moveTo(companion.at, 900); else robot.place(companion.at);
        robot.show(true);
        robot.carry(false);
        lastFlight = null;
        job = 'companion';
      }
      switch (companion.mode) {
        case 'held':
        case 'flying':
          byHand();
          break;
        case 'here':
          robot.lift(0);
          if (companion.place?.center) robot.pointAt(companion.place.center);
          else robot.pose('wave');
          break;
        default: {
          const at = robot.position;
          if (!robot.moving && distance(at, companion.at) > 0.05) robot.place(companion.at); // sent home
          robot.lift(0);
          robot.pose('idle');
          robot.face(cameraYaw());
        }
      }
      if (companion.mode !== 'held') target.visible = false;
      robot.say(companionWords());
      return;
    }
    target.visible = false;
    job = null;
    robot.say(null);
    robot.show(false);
  };

  // The call's gestures: each new one once, in any job (it waves goodbye as the call ends)
  callViewModel?.store.subscribe(({ gesture }) => {
    if (!gesture || gesture.id === lastGesture) return;
    lastGesture = gesture.id;
    if (robot.visible) robot.gesture(gesture.name);
  });
  // Its face for the moment: surprised in the hand, happy under the pointer, thinking while an agent works
  const expressionNow = () => {
    if (grabbed()) return 'sorprendido';
    if (hovered || onBubble) return 'feliz';
    const task = callViewModel?.store.state.task?.status;
    if (activity || task === 'running' || task === 'waiting') return 'pensativo';
    return 'normal';
  };
  // Its eyes (and a little its head) follow the cursor over the map, where it can see it: companion and call
  const canvas = sceneView.canvas;
  canvas?.addEventListener('pointermove', (e) => {
    if (!robot.visible || !['companion', 'call'].includes(job) || !sceneView.toScreen) { robot.gazeAt(null); return; }
    const box = canvas.getBoundingClientRect();
    const top = robot.top;
    const head = sceneView.toScreen({ x: top.x, y: top.y - 1.2, z: top.z });
    const reach = Math.max(240, box.width * 0.35);
    robot.gazeAt({ x: (e.clientX - box.left - head.x) / reach, y: (head.y - (e.clientY - box.top)) / reach });
  });
  canvas?.addEventListener('pointerleave', () => robot.gazeAt(null));

  mapViewModel.store.subscribe(apply, { immediate: true });
  tourViewModel?.store.subscribe(apply);
  buildViewModel?.store.subscribe(apply);
  robotViewModel?.store.subscribe(apply);
  robotDialogViewModel?.store.subscribe(apply);
  callViewModel?.store.subscribe(apply);
  teamViewModel?.store.subscribe(apply);
  repairViewModel?.store.subscribe(apply);
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
    else if (job === 'build' || job === 'team' || job === 'call' || job === 'repair') apply();
  }, { immediate: true });

  sceneView.onFrame((_t, dt) => {
    clock += dt;
    // The live face: on a call (not during the tour), Qubi's voice opens its mouth and lights it up. A
    // simulated call has no audio level, so its mouth follows a speech-like rhythm while it "speaks".
    const call = callViewModel?.store.state;
    const live = Boolean(call) && IN_CALL.includes(call.status) && job !== 'tour' && robot.visible;
    const talking = live && call.status === 'live' && call.mode === 'speaking';
    robot.liveFace({ on: live, speaking: talking });
    if (talking) {
      const out = callViewModel.levels?.().output ?? 0;
      robot.speak(out > 0.01 || !call.simulated ? out : 0.3 + 0.3 * Math.abs(Math.sin(clock * 11) * Math.sin(clock * 2.7)));
    }
    // The call's guide, once it arrives: a short wave at the camera, then it points at the place
    if (job === 'call' && callStep && !grabbed()) {
      if (callStep.phase === 'walk' && !robot.moving) {
        callStep.phase = 'wave';
        callStep.at = clock;
        robot.face(cameraYaw());
        robot.pose('wave');
      } else if (callStep.phase === 'wave' && clock - callStep.at >= ARRIVAL_WAVE_S) {
        callStep.phase = 'hold';
        if (callStep.pose === 'point' && callStep.center) robot.pointAt(callStep.center);
        else callPose();
      }
    }
    robot.expression(expressionNow());
    robot.update(dt);
  });

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
  let tap = null; // where and when the person took it
  const ground = (x, y) => sceneView.groundPointAt(x, y);
  const grabber = {
    last: null,
    // on it, or close to it on screen (a generous reach), in a job where it can be taken
    hit: (x, y) => Boolean(robotViewModel) && GRABBABLE.has(job) && robot.visible
      && (Boolean(sceneView.pickAt(x, y, [robot.object])) || robot.screenDistance(x, y) < Infinity),
    hover(on) {
      clearTimeout(hoverTimer);
      if (on || !callViewModel) { hovered = on; if (job === 'companion') robot.say(companionWords()); return; }
      hoverTimer = setTimeout(unhover, HOVER_GRACE_MS); // time to reach the "Hablar" button in the bubble
    },
    start(x, y) {
      // from where it is drawn (on a call or with the team it may stand far from the companion's spot)
      const at = robot.position;
      const p = ground(x, y);
      if (!robotViewModel.grab()) return;
      grip = p ? { x: at.x - p.x, z: at.z - p.z } : { x: 0, z: 0 };
      samples = [];
      tap = { x, y, t: performance.now() };
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
      // a quick tap, not a drag: it reacts, a different way each time
      if (tap && performance.now() - tap.t < TAP_MS && Math.hypot(x - tap.x, y - tap.y) < TAP_PX) robot.gesture(TAP_GESTURES[taps++ % TAP_GESTURES.length]);
      tap = null;
    },
  };
  // qubi(): where Qubi is (his workers come out of him and go back to him); home while he is not on the map.
  // While he walks it is where he is going: when the team ends he sets off first, and they follow him there.
  const qubi = () => (robot.visible ? robot.destination : { ...(robotViewModel?.store.state.at ?? HOME) });
  // bubble(): Qubi's bubble element while it is on screen, else null (teamView stacks the workers' above it)
  const bubble = () => (robot.visible && !robot.bubble.hidden ? robot.bubble : null);
  qubi.bubble = bubble; // teamView gets qubi as its origin; this lets it find the bubble without new wiring
  // head(): the world point above Qubi's head, where the call panel hangs; null when he is not on the map
  // or the tour has him (the panel goes back to the bottom of the screen then)
  const head = () => (robot.visible && job !== 'tour' ? robot.top : null);
  return { grabber, get hands() { return robot.hands; }, qubi, head, bubble };
}
