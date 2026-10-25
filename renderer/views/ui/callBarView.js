// Call with Qubi: the call panel (#call-bar) and the phone in the chat header (#chat-call)
// (docs/features/llamada/MEJORAS.md §1 and §5).
// - During a call the compact panel floats ABOVE QUBI'S HEAD on the map. It follows him every frame (when
//   he walks, builds or is thrown), clamped inside the stage and out of the floating chat's way. When Qubi
//   is not on screen (hidden, the tour, the git view) it falls back to the bottom center of the map.
// - Contents: Qubi's face, «En vivo · 0:42» (or «Llamando…» while it rings), the voice wave, the last
//   thing Qubi said (two lines at most), a permission request when Qubi asks for one, and round buttons
//   (settings, chat, microphone, hang up in red).
// - A phone ring (ringTone.js) sounds while the call connects and stops when Qubi answers.
// The view only reads callViewModel.store and calls its public API (docs/features/llamada/README.md).
import { strings } from '../../i18n/es.js';
import { icon } from './icons.js';
import { createRingTone } from './ringTone.js';

const BARS = 14;
const WAVE_W = 64; // CSS px; call.css gives the canvas this exact size
const WAVE_H = 28;
const ERROR_MS = 8000; // an error stays this long, then the panel closes by itself
const MARGIN = 12;     // the panel never gets closer than this to the stage's edges
const GAP = 14;        // between the panel's bottom (its tail) and the point above Qubi's head
const TAIL_MIN = 18;   // the tail stays clear of the panel's rounded corners
const AVOID_MS = 300;  // how often the floating chat's place is read again (not every frame)

// The voices of each service (the keys of VOICES in electron/voiceCall.js; names in es.js)
export const VOICE_KEYS = { elevenlabs: ['juan', 'julio', 'josemanuel', 'maggie'], grok: ['rex', 'eve', 'ara'] };

// The voice list for the chosen service; «Automático» may end up on either, so it shows both groups
export function voiceOptions(provider) {
  const groups = VOICE_KEYS[provider] ? [provider] : Object.keys(VOICE_KEYS);
  return groups.map((group) => ({ group, keys: VOICE_KEYS[group] }));
}

// A voice the chosen service has: the current one if it fits, otherwise its first
export function pickVoice(provider, voice) {
  const keys = voiceOptions(provider).flatMap((g) => g.keys);
  return keys.includes(voice) ? voice : keys[0];
}

// The panel's title: it rings (also while connecting: for the person the phone is still ringing), then
// the live timer
export function titleText(state, seconds = 0) {
  const C = strings.call;
  if (state.status === 'ringing' || state.status === 'connecting') return C.state.ringing;
  if (state.status === 'ending') return C.state.ended;
  return C.live(C.timer(seconds));
}

const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
const clamp = (v, min, max) => Math.max(min, Math.min(v, max));

// Where the panel goes for a screen point above Qubi's head, in stage pixels: its top-left corner (x, y)
// and where its tail points (tailX from the panel's left; tail false when the panel could not sit above
// the point). null when there is no point or it is off the stage: the caller falls back to the dock.
// avoid: rects (stage pixels) the panel must not cover, such as the floating chat; it moves to their left.
export function placePanel({ point, stage, panel, margin = MARGIN, gap = GAP, avoid = [] }) {
  if (!point || !stage?.width || !stage?.height) return null;
  const { x: px, y: py } = point;
  if (!Number.isFinite(px) || !Number.isFinite(py) || px < 0 || py < 0 || px > stage.width || py > stage.height) return null;
  const w = panel?.width ?? 0;
  const h = panel?.height ?? 0;
  let x = Math.max(margin, Math.min(px - w / 2, stage.width - margin - w));
  const ideal = py - gap - h;
  const y = Math.max(margin, Math.min(ideal, stage.height - margin - h));
  let y2 = y;
  // the map's controls along the top push it down; the floating chat pushes it to its left
  for (const o of avoid.filter((a) => a?.down)) {
    if (overlaps({ left: x, right: x + w, top: y2, bottom: y2 + h }, o)) y2 = Math.min(o.bottom + margin, stage.height - margin - h);
  }
  for (const o of avoid.filter((a) => a && !a.down)) {
    if (overlaps({ left: x, right: x + w, top: y2, bottom: y2 + h }, o)) x = Math.max(margin, o.left - margin - w);
  }
  return { x, y: y2, tailX: clamp(px - x, TAIL_MIN, Math.max(TAIL_MIN, w - TAIL_MIN)), tail: y2 === ideal };
}

// The anchor in stage pixels: a world point (projected with toScreen) or an element on screen, such as
// Qubi's bubble while he builds (the panel then sits above the bubble instead of covering it). null when
// there is neither, or the element is not laid out. stageRect(): the stage's client rect, read only for an element.
export function anchorPoint(a, { toScreen = null, stageRect = () => null } = {}) {
  if (!a) return null;
  if (typeof a.getBoundingClientRect === 'function') {
    const r = a.getBoundingClientRect();
    const s = r?.width ? stageRect() : null;
    return s ? { x: r.left + r.width / 2 - s.left, y: r.top - s.top } : null;
  }
  return toScreen ? toScreen(a.x, a.y, a.z) : null;
}

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

function roundButton(className, name, label) {
  const b = el('button', `call-btn ${className}`);
  b.type = 'button';
  b.title = label;
  b.setAttribute('aria-label', label);
  b.appendChild(icon(name, { size: 18 }));
  return b;
}

const setIcon = (button, name) => button.querySelector('svg.icon')?.replaceWith(icon(name, { size: 18 }));

// The agent that builds what Qubi asks for: the one picked in the chat (same naming as the chat header)
function builderName(connection) {
  const state = connection?.store.state;
  const agent = state?.agents?.find((a) => a.id === state.selected);
  const H = strings.chat.header;
  if (!agent) return H.demo.name;
  return agent.id === 'sim' ? H.sim.name : agent.label.split(' (')[0];
}

// A <select> with a visible label (the settings popover)
function field(labelText, id) {
  const wrap = el('label', 'call-pop-field');
  wrap.htmlFor = id;
  const select = el('select', 'call-pop-select');
  select.id = id;
  wrap.append(el('span', 'call-pop-label', labelText), select);
  return { wrap, select };
}

// sceneView: its onFrame moves the panel right after the 3D views moved Qubi (no lag behind him).
// anchor(): the world point above Qubi's head, or null when he is not on screen (robotView.head); or an
// element the panel must sit above (Qubi's bubble while he builds), see anchorPoint.
// project(x, y, z): that point in stage pixels (defaults to sceneView.toScreen, as the map's labels).
// voiceConnect: { open() } of voiceConnectView; when given it owns the «offline» error.
// onOpenLink(port): opens the running project (the link Qubi leaves once it is up) in the browser.
export function createCallBarView({
  container, callButton, callViewModel: vm, connection = null, onOpenChat = () => {},
  sceneView = null, anchor = () => null, project = null, voiceConnect = null, onOpenLink = () => {},
}) {
  const C = strings.call;
  const S = C.settings;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const toScreen = project ?? (sceneView ? (x, y, z) => sceneView.toScreen({ x, y, z }) : null);
  const ring = createRingTone();

  // ---------- Markup ----------
  container.classList.add('call-bar');
  container.setAttribute('role', 'region');
  container.setAttribute('aria-label', C.card.title);
  container.dataset.place = 'dock';

  const panel = el('div', 'call-panel');

  // A permission Qubi asks for: on top, so the buttons below never move under the pointer
  const perm = el('div', 'call-perm');
  perm.hidden = true;
  perm.setAttribute('role', 'group');
  const permText = el('p', 'call-perm-text');
  permText.id = 'call-perm-text';
  permText.setAttribute('role', 'alert');
  perm.setAttribute('aria-labelledby', permText.id);
  const allowBtn = el('button', 'call-perm-btn allow', C.permission.allow);
  allowBtn.type = 'button';
  const denyBtn = el('button', 'call-perm-btn deny', C.permission.deny);
  denyBtn.type = 'button';
  const permActions = el('div', 'call-perm-actions');
  permActions.append(allowBtn, denyBtn);
  const alwaysLabel = el('label', 'call-perm-always');
  const alwaysBox = el('input');
  alwaysBox.type = 'checkbox';
  alwaysLabel.append(alwaysBox, el('span', '', C.permission.always));
  const permHint = el('small', 'call-perm-hint', C.permission.voiceHint);
  perm.append(permText, permActions, alwaysLabel, permHint);

  // The project running (ejecutar_app): its address, one click away in the browser
  const linkBtn = el('button', 'call-link');
  linkBtn.type = 'button';
  linkBtn.hidden = true;
  linkBtn.addEventListener('click', () => { const link = vm.store.state.link; if (link) onOpenLink(link.port); });

  // Qubi's face: eyes and a mouth that opens with his voice (--talk, set every frame)
  const face = el('span', 'call-face');
  face.setAttribute('aria-hidden', 'true');
  face.append(el('i', 'call-eye'), el('i', 'call-eye'), el('i', 'call-mouth'));
  const info = el('div', 'call-info');
  const titleRow = el('div', 'call-title-row');
  const title = el('strong', 'call-title');
  const tag = el('small', 'call-tag', C.state.simulated);
  titleRow.append(title, tag);
  const status = el('span', 'call-status');
  status.setAttribute('aria-live', 'polite'); // the mode, not the timer: a ticking clock must not be read aloud
  info.append(titleRow, status);
  const wave = el('canvas', 'call-wave');
  wave.setAttribute('aria-hidden', 'true');
  // hides or shows the conversation log (the buttons stay)
  const minBtn = roundButton('call-min', 'unfoldLess', C.actions.hideLog);
  minBtn.setAttribute('aria-pressed', 'false');
  const head = el('div', 'call-head');
  head.append(face, info, wave, minBtn);

  // What was said: a log of the whole call (Qubi and you), scrollable, newest at the bottom. The button in
  // the head hides or shows it; the call's buttons always stay
  const line = el('div', 'call-line');
  line.setAttribute('role', 'log');
  line.setAttribute('aria-label', C.card.title);
  line.hidden = true;
  let logHidden = false;

  const settingsBtn = roundButton('call-settings', 'settings', C.actions.settings);
  settingsBtn.setAttribute('aria-haspopup', 'dialog');
  settingsBtn.setAttribute('aria-expanded', 'false');
  const chatBtn = roundButton('call-chat', 'chatBubble', C.actions.chat);
  const micBtn = roundButton('call-mic', 'mic', C.actions.mute);
  micBtn.setAttribute('aria-pressed', 'false');
  const endBtn = roundButton('call-end', 'callEnd', C.actions.hangUp);
  const actions = el('div', 'call-actions');
  const left = el('div', 'call-actions-side');
  const right = el('div', 'call-actions-side');
  left.append(settingsBtn, chatBtn);
  right.append(micBtn, endBtn);
  actions.append(left, right);

  // Settings popover: who builds, the voice service and voice, the connection modal, the simulated call
  const pop = el('div', 'call-pop');
  pop.hidden = true;
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', S.title);
  const popTitle = el('strong', 'call-pop-title', S.title);
  const builderRow = el('div', 'call-pop-row');
  const builderValue = el('span', 'call-pop-value');
  builderRow.append(el('span', 'call-pop-label', S.builder), builderValue);
  const providerField = field(S.provider, 'call-provider');
  for (const key of ['auto', 'elevenlabs', 'grok']) providerField.select.append(new Option(S.providers[key], key));
  const providerHint = el('small', 'call-pop-hint', S.providerHint);
  providerField.wrap.append(providerHint);
  const voiceField = field(S.voice, 'call-voice');
  // how technical Qubi talks: applies from the next call (it goes in the call's instructions)
  const styleField = field(S.style, 'call-style');
  for (const key of ['pana', 'neutral', 'formal', 'divertido']) styleField.select.append(new Option(S.styles[key], key));
  const levelField = field(S.level, 'call-level');
  for (const key of ['basico', 'intermedio', 'tecnico']) levelField.select.append(new Option(S.levels[key], key));
  levelField.wrap.append(el('small', 'call-pop-hint', S.levelHint));
  const connectBtn = el('button', 'call-pop-link', S.connection);
  connectBtn.type = 'button';
  connectBtn.hidden = !voiceConnect;
  const simLabel = el('label', 'call-pop-check');
  const simBox = el('input');
  simBox.type = 'checkbox';
  simLabel.append(simBox, el('span', '', S.simulate));
  pop.append(popTitle, builderRow, levelField.wrap, styleField.wrap, providerField.wrap, voiceField.wrap, connectBtn, simLabel);

  const tail = el('span', 'call-tail');
  tail.setAttribute('aria-hidden', 'true');
  panel.append(perm, head, linkBtn, line, actions, pop, tail);

  // Errors: the reason in plain words, with "try again" and close
  const errorBox = el('div', 'call-error');
  errorBox.hidden = true;
  errorBox.setAttribute('role', 'alert');
  const errorText = el('span', 'call-error-text');
  const retryBtn = roundButton('call-retry', 'retry', strings.repair.history.retry); // "Reintentar"
  const closeBtn = roundButton('call-close', 'close', strings.repair.close); // "Cerrar"
  errorBox.append(errorText, retryBtn, closeBtn);

  container.replaceChildren(panel, errorBox);

  // ---------- Settings popover ----------
  const settingsNow = () => ({ provider: 'auto', voice: 'juan', level: 'basico', style: 'pana', ...(vm.settings ?? {}) });
  function fillVoices(provider, voice) {
    const options = voiceOptions(provider);
    const groups = options.map(({ group, keys }) => {
      const opts = keys.map((k) => new Option(S.voiceNotes?.[k] ? `${S.voices[k]} · ${S.voiceNotes[k]}` : S.voices[k], k));
      if (options.length === 1) return opts;
      const og = el('optgroup');
      og.label = S.voiceGroups[group];
      og.append(...opts);
      return [og];
    });
    voiceField.select.replaceChildren(...groups.flat());
    voiceField.select.value = pickVoice(provider, voice);
  }

  let popH = 0;
  const openPop = (open) => {
    pop.hidden = !open;
    settingsBtn.setAttribute('aria-expanded', String(open));
    settingsBtn.classList.toggle('active', open);
    if (!open) return;
    builderValue.textContent = builderName(connection);
    const { provider, voice, level, style } = settingsNow();
    levelField.select.value = level;
    styleField.select.value = style;
    providerField.select.value = S.providers[provider] ? provider : 'auto';
    fillVoices(providerField.select.value, voice);
    simBox.checked = Boolean(vm.simulate);
    // the web version: always simulated, so the voice controls cannot promise otherwise
    const voiceOk = Boolean(vm.canUseVoice);
    simBox.disabled = !voiceOk;
    providerField.select.disabled = !voiceOk;
    voiceField.select.disabled = !voiceOk;
    connectBtn.disabled = !voiceOk;
    popH = pop.offsetHeight;
    placePop();
    (voiceOk ? providerField.select : settingsBtn).focus();
  };
  settingsBtn.addEventListener('click', () => openPop(pop.hidden));
  providerField.select.addEventListener('change', () => {
    const provider = providerField.select.value;
    const voice = pickVoice(provider, voiceField.select.value);
    vm.setSettings?.({ provider, voice });
    fillVoices(provider, voice);
  });
  voiceField.select.addEventListener('change', () => vm.setSettings?.({ voice: voiceField.select.value }));
  levelField.select.addEventListener('change', () => vm.setSettings?.({ level: levelField.select.value }));
  styleField.select.addEventListener('change', () => vm.setSettings?.({ style: styleField.select.value }));
  connectBtn.addEventListener('click', () => { openPop(false); voiceConnect?.open(); });
  simBox.addEventListener('change', () => {
    vm.setSimulate(simBox.checked);
    simBox.checked = Boolean(vm.simulate); // show what will really happen
  });
  document.addEventListener('pointerdown', (e) => {
    if (!pop.hidden && !pop.contains(e.target) && !settingsBtn.contains(e.target)) openPop(false);
  });

  // ---------- What was said ----------
  const LOG_MAX = 60;
  let lineKey = '';
  function renderLine(s) {
    const said = (s.lines ?? []).filter((l) => l.who === 'qubi' || l.who === 'person');
    line.hidden = !said.length || logHidden;
    const key = `${said.length}|${said.at(-1)?.text ?? ''}`;
    if (!said.length || key === lineKey) return;
    lineKey = key;
    // stays at the bottom while the person is there; if they scrolled up to read, it does not jump
    const atBottom = line.scrollHeight - line.scrollTop - line.clientHeight < 24;
    line.replaceChildren(...said.slice(-LOG_MAX).map((l) => {
      const row = el('p', `call-line-row ${l.who}`);
      row.append(el('b', '', l.who === 'qubi' ? C.card.qubi : C.card.you), document.createTextNode(l.text));
      return row;
    }));
    if (atBottom || said.length <= 2) line.scrollTop = line.scrollHeight;
  }
  minBtn.addEventListener('click', () => {
    logHidden = !logHidden;
    minBtn.setAttribute('aria-pressed', String(logHidden));
    setIcon(minBtn, logHidden ? 'unfoldMore' : 'unfoldLess');
    minBtn.title = logHidden ? C.actions.showLog : C.actions.hideLog;
    minBtn.setAttribute('aria-label', minBtn.title);
    renderLine(vm.store.state);
    if (!logHidden) line.scrollTop = line.scrollHeight;
  });

  // ---------- Buttons ----------
  chatBtn.addEventListener('click', () => onOpenChat());
  micBtn.addEventListener('click', () => vm.toggleMute());
  endBtn.addEventListener('click', () => vm.hangUp());
  retryBtn.addEventListener('click', () => vm.start());
  closeBtn.addEventListener('click', () => vm.hangUp());
  const permId = () => vm.store.state.permission?.id;
  allowBtn.addEventListener('click', () => { const id = permId(); if (id != null) vm.allow(id, { always: alwaysBox.checked && !alwaysLabel.hidden }); });
  denyBtn.addEventListener('click', () => { const id = permId(); if (id != null) vm.deny(id); });
  // Escape: closes the settings first; on the permission it says no; otherwise it hangs up, but only
  // while the focus is in the panel
  container.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    if (!pop.hidden) { openPop(false); settingsBtn.focus(); return; }
    if (perm.contains(e.target) && permId() != null) { vm.deny(permId()); return; }
    vm.hangUp();
  });
  // The header phone starts a call; during one it takes the focus to the panel instead
  callButton?.addEventListener('click', () => {
    const s = vm.store.state.status;
    if (s === 'idle' || s === 'error') vm.start();
    else endBtn.focus();
  });

  // ---------- Following Qubi ----------
  const stageEl = container.parentElement;
  const stageSize = { width: 0, height: 0 };
  const panelSize = { width: 0, height: 0 };
  const measureStage = () => { stageSize.width = stageEl?.clientWidth ?? 0; stageSize.height = stageEl?.clientHeight ?? 0; };
  const measurePanel = () => { panelSize.width = container.offsetWidth; panelSize.height = container.offsetHeight; };
  if (typeof ResizeObserver === 'function') {
    if (stageEl) new ResizeObserver(measureStage).observe(stageEl);
    new ResizeObserver(measurePanel).observe(container);
  }
  // The floating chat covers part of the map: the panel moves to its left instead of going under it
  let avoid = [];
  let avoidAt = -Infinity;
  function obstacles(now) {
    if (now - avoidAt < AVOID_MS) return avoid;
    avoidAt = now;
    avoid = [];
    if (!stageEl) return avoid;
    const s = stageEl.getBoundingClientRect();
    const rectOf = (node, extra = {}) => {
      const r = node?.getBoundingClientRect();
      return r?.width && r.height ? { left: r.left - s.left, right: r.right - s.left, top: r.top - s.top, bottom: r.bottom - s.top, ...extra } : null;
    };
    // the map's top controls (security card, Mapa/Git switcher): the panel never sits under them
    for (const id of ['hud', 'stage-tabs']) { const r = rectOf(document.getElementById(id), { down: true }); if (r) avoid.push(r); }
    const chat = document.getElementById('chat');
    const b = document.body.classList;
    if (chat && !b.contains('chat-closed') && !b.contains('chat-min') && !b.contains('chat-docked')) { const r = rectOf(chat); if (r) avoid.push(r); }
    return avoid;
  }

  let place = 'dock';
  let spot = null;
  let lastTransform = '';
  let lastTail = '';
  function setPlace(next) {
    if (place === next) return;
    place = next;
    container.dataset.place = next;
    if (next === 'dock') {
      // the dock's transform transition would slide the panel in from the old translate3d, now measured
      // from the dock's corner (often from below the stage): it jumps there instead
      container.style.transition = 'none';
      container.style.transform = '';
      void container.offsetWidth; // the dock position applies now, with no transition
      container.style.transition = '';
      lastTransform = '';
      spot = null;
    }
  }

  // The settings open above the panel; near the top of the map they open below it
  let popBelow = false;
  function placePop() {
    const below = place === 'anchor' && spot != null && spot.y < popH + MARGIN * 2;
    if (below !== popBelow) { popBelow = below; pop.classList.toggle('below', below); }
  }

  function follow() {
    if (container.hidden) return;
    let point = null;
    try {
      point = anchorPoint(anchor(), { toScreen, stageRect: () => stageEl?.getBoundingClientRect() ?? null });
    } catch { point = null; }
    if (!stageSize.width) measureStage();
    if (!panelSize.width) measurePanel();
    const next = placePanel({ point, stage: stageSize, panel: panelSize, avoid: point ? obstacles(performance.now()) : [] });
    if (!next) { setPlace('dock'); return; }
    setPlace('anchor');
    spot = next;
    const transform = `translate3d(${next.x.toFixed(1)}px, ${next.y.toFixed(1)}px, 0)`;
    if (transform !== lastTransform) { container.style.transform = transform; lastTransform = transform; }
    const t = next.tail ? `${next.tailX.toFixed(1)}px` : '';
    if (t !== lastTail) {
      lastTail = t;
      if (t) container.style.setProperty('--tail-x', t);
      container.dataset.tail = t ? 'on' : 'off';
    }
    if (!pop.hidden) placePop();
  }
  // after the 3D views moved Qubi in the same frame; without a scene the wave's loop moves it
  sceneView?.onFrame?.(follow);

  // ---------- Voice wave, Qubi's mouth and the live timer ----------
  const ctx = wave.getContext('2d');
  const heights = new Float32Array(BARS);
  let raf = 0;
  let dpr = 0;
  let liveAt = 0;
  let talk = -1;

  function levelNow() {
    const s = vm.store.state;
    if (s.status !== 'live') return 0;
    let levels;
    try { levels = vm.levels(); } catch { return 0; }
    if (s.mode === 'speaking') return levels?.output ?? 0;
    return s.muted ? 0 : levels?.input ?? 0;
  }

  function draw(time) {
    raf = requestAnimationFrame(draw);
    if (!sceneView) follow();
    const s = vm.store.state;
    // the timer: the text changes once a second, not every frame
    const text = titleText(s, liveAt ? (performance.now() - liveAt) / 1000 : 0);
    if (title.textContent !== text) title.textContent = text;
    const ratio = window.devicePixelRatio || 1;
    if (ratio !== dpr) { // sharp on any screen
      dpr = ratio;
      wave.width = Math.round(WAVE_W * dpr);
      wave.height = Math.round(WAVE_H * dpr);
    }
    // voice levels sit around 0.1–0.4: a square root with some gain makes speech fill the wave
    const level = Math.min(1, Math.sqrt(Math.max(0, levelNow())) * 1.5);
    const still = reduced?.matches;
    // Qubi's mouth opens with his own voice only
    const mouth = s.status === 'live' && s.mode === 'speaking' ? Math.round(level * 20) / 20 : 0;
    if (mouth !== talk) { talk = mouth; face.style.setProperty('--talk', String(mouth)); }
    const t = time / 1000;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, WAVE_W, WAVE_H);
    // Qubi talking is bright; the person talking a bit softer; muted is faint
    ctx.fillStyle = s.mode === 'speaking' ? 'rgba(255, 255, 255, .95)' : s.muted ? 'rgba(255, 255, 255, .3)' : 'rgba(255, 255, 255, .7)';
    const step = WAVE_W / BARS;
    const barW = 3;
    for (let i = 0; i < BARS; i++) {
      // taller in the middle, each bar moving a little on its own so the wave looks alive
      const envelope = 1 - Math.abs(i - (BARS - 1) / 2) / BARS;
      const wobble = still ? 1 : 0.45 + 0.55 * Math.abs(Math.sin(t * 7.3 + i * 1.7 + Math.sin(t * 1.9 + i)));
      const target = level * envelope * wobble * WAVE_H;
      heights[i] = still ? target : heights[i] + (target - heights[i]) * 0.35;
      const x = i * step + (step - barW) / 2;
      const h = heights[i];
      ctx.beginPath();
      if (h < 3) ctx.arc(x + barW / 2, WAVE_H / 2, 1.5, 0, Math.PI * 2);
      else ctx.roundRect(x, (WAVE_H - h) / 2, barW, h, barW / 2);
      ctx.fill();
    }
  }

  const startWave = () => { if (!raf) raf = requestAnimationFrame(draw); };
  const stopWave = () => { cancelAnimationFrame(raf); raf = 0; heights.fill(0); };

  // ---------- Show and hide ----------
  let hideTimer = 0;
  let errorTimer = 0;
  function show(visible) {
    clearTimeout(hideTimer);
    if (visible) {
      if (container.hidden) {
        container.hidden = false;
        measureStage();
        measurePanel();
        follow(); // already in its place on the first frame (above Qubi or docked)
        requestAnimationFrame(() => container.classList.add('in')); // short fade (none with reduced motion)
      }
      startWave();
    } else if (!container.hidden) {
      container.classList.remove('in');
      openPop(false);
      stopWave();
      // the focus must not stay on a button that is about to hide: back to the header phone
      if (container.contains(document.activeElement)) callButton?.focus();
      hideTimer = setTimeout(() => { container.hidden = true; setPlace('dock'); }, reduced?.matches ? 0 : 180);
    }
  }

  function statusText(s) {
    if (s.status === 'ringing' || s.status === 'connecting') return C.state.connecting;
    if (s.status === 'ending') return C.state.ended;
    if (s.muted) return C.state.muted;
    if (s.mode === 'speaking') return C.state.speaking;
    if (s.task && (s.task.status === 'running' || s.task.status === 'waiting')) return s.task.kind === 'ask' ? C.state.asking : C.state.working;
    return C.state.listening;
  }

  let shownPerm = null;
  function renderPermission(s) {
    const p = s.permission ?? null;
    const id = p?.id ?? null;
    if (id === shownPerm) return;
    shownPerm = id;
    const hadFocus = container.contains(document.activeElement);
    const focusInPerm = perm.contains(document.activeElement);
    perm.hidden = !p;
    container.dataset.permission = p ? 'on' : 'off';
    if (p) {
      permText.textContent = C.permission.ask(p.label ?? '');
      alwaysBox.checked = false;
      alwaysLabel.hidden = !p.canAlways;
      permHint.hidden = Boolean(s.simulated);
      // only when the person was already on the call's controls: never steal the focus from the chat
      if (hadFocus) allowBtn.focus();
    } else if (focusInPerm) {
      chatBtn.focus();
    }
  }

  // The «offline» error belongs to the voice connection modal (voiceConnectView): the panel stays closed
  const ownedByModal = (s) => s.status === 'error' && s.error === 'offline' && Boolean(voiceConnect);
  const isRinging = (s) => s?.status === 'ringing' || s?.status === 'connecting';

  function render(s, prev) {
    // the ring: from the first ring until Qubi answers (or the call fails or is hung up)
    if (isRinging(s) && !isRinging(prev)) ring.start();
    else if (!isRinging(s)) ring.stop();
    if (s.status === 'live' && prev?.status !== 'live') liveAt = performance.now();
    if (s.status === 'idle') liveAt = 0;

    const active = s.status !== 'idle' && !ownedByModal(s);
    show(active);
    const onCall = s.status !== 'idle' && s.status !== 'error';
    // Not a toggle (pressing it again does not hang up): during a call it says where it takes you
    if (callButton && callButton.classList.contains('active') !== onCall) {
      callButton.classList.toggle('active', onCall);
      const label = onCall ? C.goToCall : C.button;
      callButton.title = label;
      callButton.setAttribute('aria-label', label);
    }
    container.dataset.status = s.status;
    container.dataset.mode = s.mode;
    const failed = s.status === 'error';
    panel.hidden = failed;
    errorBox.hidden = !failed;
    if (failed) {
      errorText.textContent = C.errors[s.error] ?? C.errors.failed;
      if (prev?.status !== 'error' && !ownedByModal(s)) {
        clearTimeout(errorTimer);
        errorTimer = setTimeout(() => { if (vm.store.state.status === 'error') vm.hangUp(); }, ERROR_MS);
        // only when the person was already on the call's controls: a key meant for the chat must not call again
        if (container.contains(document.activeElement) || document.activeElement === callButton) retryBtn.focus();
      }
    } else {
      clearTimeout(errorTimer);
    }
    if (!active || failed) return;
    // how Qubi talks (simulated, or voice to voice) goes after the status, small: the timer keeps its room
    const mode = s.simulated ? C.state.simulated : s.voiceMode === 'realtime' ? C.state.realtime : '';
    const text = mode ? `${statusText(s)} · ${mode}` : statusText(s);
    if (status.textContent !== text) status.textContent = text; // aria-live speaks only real changes
    status.title = s.simulated || !mode ? '' : C.state.realtimeHint;
    tag.hidden = true;
    renderLine(s);
    renderPermission(s);
    linkBtn.hidden = !s.link;
    if (s.link && linkBtn.dataset.url !== s.link.url) {
      linkBtn.dataset.url = s.link.url;
      linkBtn.textContent = C.link.open(s.link.url.replace(/^https?:\/\//, ''));
      linkBtn.title = C.link.hint;
    }
    // Mic: on/off with its own icon and label (a simulated call has no microphone)
    if (micBtn.getAttribute('aria-pressed') !== String(Boolean(s.muted))) {
      micBtn.setAttribute('aria-pressed', String(Boolean(s.muted)));
      setIcon(micBtn, s.muted ? 'micOff' : 'mic');
      const label = s.muted ? C.actions.unmute : C.actions.mute;
      micBtn.title = label;
      micBtn.setAttribute('aria-label', label);
    }
    micBtn.disabled = Boolean(s.simulated) || s.status !== 'live';
  }

  vm.store.subscribe(render, { immediate: true });
}
