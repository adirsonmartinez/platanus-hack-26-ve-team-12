// The welcome robot (RobotDialogViewModel): it hovers on the plaza of a new project and talks in one speech
// bubble at its right, with the tail at its head. Each new message pops in: the robot hops (shakes its head for a risk), a few typing
// dots, the text types itself (click to skip) and then the buttons slide in one by one. Minimized, the bubble
// is a small pill that lights up when there is news. While the tour, a build or a call with Qubi moves the
// map's other robot (robotView.js), this one steps aside, so there is never two robots on the map.
// callViewModel (optional): only its store is read, to know when a call is on. teamViewModel (optional): the
// same for Qubi's team, which can keep working after the call ends.
import * as THREE from 'three';
import { buildRobot } from './builders/robotBuilder.js';
import { strings } from '../../i18n/es.js';
import { escapeHtml } from '../../core/format.js';
import { icon } from '../icons.js';
import { CAMERA } from '../../viewmodels/cameraViewModel.js';

const UI = strings.map.welcome.ui;
// Below and to the left of the project's label (the camera looks from +z): clear of the label and of the folder
// tree (it grows down-right from the plaza), with room at its right for the bubble
const SPOT = { x: -9, z: 7.4 };
const BASE_Y = 0.6;        // hovering just above the plaza
const SCALE = 1.6;         // big enough to stand out at the zoom of a new project
const HEAD = { x: 0.75, y: 1.7 }; // the bubble's tail points here: the right side of the head (robot units)
const SIDE_GAP = 16;       // px between the robot and the bubble
const EDGE = { top: 64, bottom: 24 }; // px kept clear above (title bar) and below the bubble
const POP_SPEED = 2.4;
const TYPING_DOTS_S = 0.35; // "…" before the text starts
const CHARS_PER_S = 55;
const TONE_ICON = { info: 'sparkles', success: 'ok', warn: 'shieldWarn', danger: 'danger' };

function headHtml(b) {
  if (b.progress) {
    const dots = Array.from({ length: b.progress.of }, (_, i) =>
      `<span class="${i < b.progress.step - 1 ? 'done' : i === b.progress.step - 1 ? 'now' : ''}"></span>`).join('');
    return `<span class="rb-steps" aria-label="${escapeHtml(UI.progress(b.progress.step, b.progress.of))}">${dots}</span>`;
  }
  return `<span class="rb-badge">${icon(TONE_ICON[b.tone])}${escapeHtml(UI.coach)}</span>`;
}

function bubbleHtml(b) {
  // Earlier answers: tapping one goes back to that question to change it
  const answers = b.answers?.length
    ? `<div class="rb-answers">${b.answers.map((a, i) => `<button type="button" data-press="rewind:${i}" title="${escapeHtml(UI.rewind(a))}" aria-label="${escapeHtml(UI.rewind(a))}">${escapeHtml(a)}${icon('rotateLeft')}</button>`).join('')}</div>` : '';
  const buttons = b.buttons.map((btn, i) =>
    `<button type="button" class="rb-btn ${btn.kind}" data-press="${btn.id}" style="--i:${i}">${escapeHtml(btn.label)}</button>`).join('');
  const back = b.canBack
    ? `<button type="button" class="rb-back" data-press="back" title="${escapeHtml(UI.back)}">${icon('arrowRight')}${escapeHtml(UI.back)}</button>` : '';
  const hint = b.hint ? `<p class="rb-hint">${escapeHtml(b.hint)}</p>` : '';
  // The recommendation: why it is a good choice first, the real tech in small print
  const card = b.stack ? `
      <div class="rb-card">
        <ul>${b.stack.perks.map((p, i) => `<li style="--i:${i}">${icon('ok')}${escapeHtml(p)}</li>`).join('')}</ul>
        <span class="rb-tech">${escapeHtml(b.stack.inside)} <code>${escapeHtml(b.stack.tech)}</code></span>
      </div>` : '';
  return `
    <div class="rb-bubble tone-${b.tone} kind-${b.kind}" role="dialog" aria-live="polite" aria-label="${escapeHtml(b.title)}">
      <div class="rb-head">
        ${back}
        ${headHtml(b)}
        <button type="button" class="rb-icon" data-press="collapse" title="${escapeHtml(UI.collapse)}" aria-label="${escapeHtml(UI.collapse)}">${icon('minus')}</button>
        <button type="button" class="rb-icon" data-press="close" title="${escapeHtml(UI.close)}" aria-label="${escapeHtml(UI.close)}">${icon('close')}</button>
      </div>
      ${answers}
      <strong class="rb-title">${escapeHtml(b.title)}</strong>
      <p class="rb-text" title="${escapeHtml(UI.skipTyping)}"><span class="rb-typed"></span><span class="rb-caret"></span><span class="rb-dots"><i></i><i></i><i></i></span></p>
      ${hint}${card}
      <div class="rb-buttons">${buttons}</div>
    </div>`;
}

function pillHtml(unread) {
  return `<button type="button" class="rb-pill${unread ? ' unread' : ''}" data-press="expand" aria-label="${escapeHtml(UI.expand)}">${icon('bot')}<span>${escapeHtml(UI.pill)}</span></button>`;
}

export function createWelcomeRobotView({ sceneView, labels, mapViewModel, robotDialogViewModel: dialog, tourViewModel = null, buildViewModel = null, callViewModel = null, teamViewModel = null }) {
  const inCall = () => ['connecting', 'live'].includes(callViewModel?.store.state.status);
  const teamOn = () => Boolean(teamViewModel && teamViewModel.store.state.phase !== 'idle');
  const busy = () => Boolean(tourViewModel?.store.state.guide || buildViewModel?.store.state.guide || inCall() || teamOn());
  const robot = buildRobot();
  robot.root.position.set(SPOT.x, BASE_Y, SPOT.z);
  robot.root.rotation.y = CAMERA.azimuth; // faces the camera
  robot.root.visible = false;
  sceneView.layers.map.add(robot.root);

  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.6, 24), new THREE.MeshBasicMaterial({ color: 0x0d0f12, transparent: true, opacity: 0.35 }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(SPOT.x, 0.3, SPOT.z);
  shadow.visible = false;
  sceneView.layers.map.add(shadow);

  const label = labels.add({ anchor: { x: SPOT.x + HEAD.x * SCALE, y: BASE_Y + HEAD.y * SCALE, z: SPOT.z }, className: 'robot-speech', hidden: true });
  label.el.addEventListener('click', (e) => {
    const button = e.target.closest('[data-press]');
    if (button) return dialog.press(button.dataset.press);
    if (e.target.closest('.rb-text')) finishTyping();
  });
  // Clicks and wheel on the bubble stay off the map below it
  for (const type of ['pointerdown', 'wheel']) label.el.addEventListener(type, (e) => e.stopPropagation());

  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let shown = 0;       // 0..1 pop-in / pop-out
  let on = false;
  let clock = 0;
  let hop = 0;         // 1 -> 0 after each new message
  let shake = 0;       // 1 -> 0 after a risk
  let worried = false; // a risk is on screen: tilted eyes and a frown
  let typing = null;   // { el, full, chars, start } while the text is being typed
  let rendered = { seq: -1, collapsed: null, unread: null };

  // The label layer puts the bubble's bottom center on the anchor; margins move it to the robot's right,
  // vertically centered on its head but always whole on screen, and the tail follows the head
  function placeBubble() {
    const at = sceneView.toScreen(label.anchor);
    const { offsetWidth: w, offsetHeight: h } = label.el;
    const room = label.el.parentElement.clientHeight;
    const top = Math.max(EDGE.top, Math.min(at.y - h / 2, room - EDGE.bottom - h));
    label.el.style.marginLeft = `${w / 2 + SIDE_GAP}px`;
    label.el.style.marginTop = `${top - (at.y - h)}px`;
    label.el.style.setProperty('--tail-y', `${Math.max(24, Math.min(at.y - top, h - 24))}px`);
  }

  function finishTyping() {
    if (!typing) return;
    typing.el.textContent = typing.full;
    typing = null;
    label.el.querySelector('.rb-bubble')?.classList.add('typed');
  }

  function render(state) {
    const fresh = state.seq !== rendered.seq;
    if (!fresh && state.collapsed === rendered.collapsed && state.unread === rendered.unread) return;
    rendered = { seq: state.seq, collapsed: state.collapsed, unread: state.unread };
    typing = null;
    label.el.classList.toggle('collapsed', state.collapsed);
    if (state.collapsed) {
      label.el.innerHTML = pillHtml(state.unread);
      return;
    }
    label.el.innerHTML = bubbleHtml(state.bubble);
    worried = state.bubble.tone === 'danger' || state.bubble.tone === 'warn';
    const typed = label.el.querySelector('.rb-typed');
    const bubble = label.el.querySelector('.rb-bubble');
    // Only a new message is typed out and bounced; reopening the bubble shows it whole
    if (fresh && !still) {
      // By characters, not UTF-16 units, so an emoji is never cut in half
      typing = { el: typed, full: state.bubble.text, chars: [...state.bubble.text], start: clock };
      bubble.classList.add('pop');
      hop = 1;
      if (state.bubble.tone === 'danger' || state.bubble.tone === 'warn') shake = 1;
    } else {
      typed.textContent = state.bubble.text;
      bubble.classList.add('typed');
    }
  }

  function sync() {
    const map = mapViewModel.store.state;
    const state = dialog.store.state;
    const wasOn = on;
    on = state.phase !== 'off' && map.status === 'ready' && !busy();
    if (on && !wasOn) {
      shown = still ? 1 : 0;
      robot.root.visible = shadow.visible = true;
      label.el.hidden = false;
    }
    if (on) render(state);
  }
  mapViewModel.store.subscribe(sync, { immediate: true });
  dialog.store.subscribe(sync, { immediate: true });
  tourViewModel?.store.subscribe(sync);
  buildViewModel?.store.subscribe(sync);
  callViewModel?.store.subscribe(sync);
  teamViewModel?.store.subscribe(sync);

  sceneView.onFrame((_t, dt) => {
    if (!robot.root.visible) return;
    clock += dt;
    const a = still ? 0 : 1;

    // Pop in while on, pop out (then hide) when the guide closes
    shown = on ? Math.min(shown + dt * POP_SPEED, 1) : Math.max(shown - dt * POP_SPEED * 1.5, 0);
    if (!on && shown === 0) {
      robot.root.visible = shadow.visible = false;
      label.el.hidden = true;
      rendered = { seq: -1, collapsed: null, unread: null };
      return;
    }
    const pop = 1 - (1 - shown) ** 3;

    const p = robot.root.position;
    hop = Math.max(hop - dt * 2.2, 0);
    shake = Math.max(shake - dt * 1.6, 0);
    const talking = typing ? 1 : 0;

    const bob = Math.sin(clock * 2);
    robot.root.scale.setScalar(SCALE * Math.max(pop, 0.001));
    robot.body.position.y = (bob * 0.08 + Math.sin(hop * Math.PI) * 0.45) * a;
    robot.arms[1].rotation.z = 2.5 + Math.sin(clock * 6) * 0.35 * a;      // wave, arm up
    robot.arms[0].rotation.x = bob * 0.08 * a;
    robot.head.rotation.z = Math.sin(clock * 1.5) * 0.08 * a;             // curious tilt
    robot.head.rotation.y = Math.sin(clock * 22) * 0.35 * shake * a;      // "no, no" for a risk
    robot.head.rotation.x = -0.08 * talking * a;                          // looks up at its bubble while talking
    robot.tip.scale.setScalar(1 + Math.abs(Math.sin(clock * 14)) * 0.6 * talking * a); // antenna blinks while talking

    // Face: blinks every few seconds; a risk tilts the eyes and turns the smile into a frown; the mouth moves
    // while the text is typed
    const blink = !still && clock % 3.2 < 0.12;
    robot.eyes.forEach((eye) => { eye.scale.y = blink ? 0.15 : 1; });
    robot.setFace({ worried });
    robot.mouth.scale.set(1, 1 + Math.abs(Math.sin(clock * 16)) * 0.9 * talking * a, 1);

    // Heart light beats; the thruster flickers; the ring of light breathes with the hover
    const beat = Math.max(0, Math.sin(clock * 5)) ** 6;
    robot.heart.scale.setScalar(1 + beat * 0.3 * a);
    robot.flame.scale.set(1, 1 + Math.sin(clock * 31) * 0.12 * a - bob * 0.1 * a, 1);
    robot.ring.scale.setScalar(1 - bob * 0.08 * a);
    robot.ring.material.opacity = 0.1 + (0.04 - bob * 0.04) * a;

    label.setAnchor(p.x + HEAD.x * SCALE, BASE_Y + (HEAD.y + robot.body.position.y) * SCALE, p.z);
    label.el.style.opacity = String(pop);
    placeBubble();

    // Typing: a few dots first, then the text letter by letter, then the buttons
    if (typing) {
      const elapsed = clock - typing.start - TYPING_DOTS_S;
      const bubble = label.el.querySelector('.rb-bubble');
      bubble?.classList.toggle('thinking', elapsed < 0);
      if (elapsed >= 0) {
        const n = Math.min(Math.floor(elapsed * CHARS_PER_S), typing.chars.length);
        typing.el.textContent = typing.chars.slice(0, n).join('');
        if (n >= typing.chars.length) finishTyping();
      }
    }
  });
}
