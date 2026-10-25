// The voice connection modal (#voice-connect, docs/features/llamada/VOZ.md → «Modal de conexión»).
// «Qubi está fuera de conexión»: the ways to connect a voice service, as cards:
//   1. sign in with ElevenLabs (recommended): the browser opens, the person authorizes and comes back;
//   2. paste an ElevenLabs key;
//   3. paste an xAI key (Grok Voice);
//   4. try the simulated call.
// Opens by itself when a call fails with no voice service ready (callViewModel error «offline»), and from
// the call's settings («Conexión de voz…»). A pasted key goes to main once: the field is cleared right
// away and the window only ever shows its last 4 characters («•••• 171e»).
// Accessible modal: aria-modal, the focus stays inside (Tab cycles), Escape closes, the focus goes back
// to where it was.
import { strings } from '../../i18n/es.js';
import { icon } from './icons.js';
import { thinkingOrb } from './thinkingOrb.js';

// Where each service gives its keys (main opens only the addresses of its fixed list)
export const KEY_LINKS = {
  elevenlabs: 'https://elevenlabs.io/app/settings/api-keys',
  grok: 'https://console.x.ai',
};

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

function button(className, text, iconName) {
  const b = el('button', className);
  b.type = 'button';
  if (iconName) b.appendChild(icon(iconName, { size: 16 }));
  if (text) b.appendChild(el('span', '', text));
  return b;
}

// What a provider's state says: «Conectado •••• 1234» (only the last 4 characters), or «Sin conectar»
function stateText(p) {
  const V = strings.voiceConnect;
  if (!p?.ready) return V.state.notConnected;
  return p.last4 ? V.state.connected(p.last4) : V.state.connected('').replace(/[\s•]+$/, '');
}

export function createVoiceConnectView({ container, voiceService, callViewModel: vm }) {
  const V = strings.voiceConnect;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const usable = Boolean(voiceService?.available); // the web version has no keychain or browser sign-in
  const uid = (name) => `vc-${name}`;

  // ---------- Markup ----------
  container.classList.add('voice-connect');
  container.hidden = true;
  const backdrop = el('div', 'vc-backdrop');
  const dialog = el('div', 'vc-dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', uid('title'));
  dialog.setAttribute('aria-describedby', uid('intro'));
  dialog.tabIndex = -1;

  const head = el('header', 'vc-head');
  const mark = el('span', 'vc-mark');
  mark.setAttribute('aria-hidden', 'true');
  mark.appendChild(icon('offline', { size: 20 }));
  const title = el('h2', 'vc-title', V.title);
  title.id = uid('title');
  const closeBtn = button('vc-close', '', 'close');
  closeBtn.title = V.close;
  closeBtn.setAttribute('aria-label', V.close);
  head.append(mark, title, closeBtn);
  const intro = el('p', 'vc-intro', V.intro);
  intro.id = uid('intro');

  // Once a service is connected: one clear way to call
  const ready = el('div', 'vc-ready');
  ready.hidden = true;
  const callBtn = button('vc-primary vc-call', V.call, 'call');
  ready.append(callBtn);

  // A card: its icon, title, optional chip and state, then its body
  function card(key, className, iconName, titleText, { chip, state } = {}) {
    const section = el('section', `vc-card ${className}`);
    const cardHead = el('div', 'vc-card-head');
    const tile = el('span', 'vc-card-icon');
    tile.setAttribute('aria-hidden', 'true');
    tile.appendChild(icon(iconName, { size: 18 }));
    const h = el('h3', 'vc-card-title', titleText);
    h.id = uid(`${key}-title`);
    section.setAttribute('aria-labelledby', h.id);
    cardHead.append(tile, h);
    if (chip) cardHead.append(el('span', 'vc-chip', chip));
    let stateRow = null;
    if (state) {
      stateRow = el('div', 'vc-state');
      stateRow.append(el('span', 'vc-state-text'));
      cardHead.append(stateRow);
    }
    section.append(cardHead);
    return { section, stateRow };
  }
  const message = () => {
    const p = el('p', 'vc-msg');
    p.setAttribute('role', 'status');
    p.hidden = true;
    return p;
  };
  function setMsg(node, text, kind = '') {
    node.hidden = !text;
    node.textContent = text ?? '';
    node.dataset.kind = kind;
  }

  // 1. Sign in with ElevenLabs
  const login = card('login', 'vc-login', 'login', V.login.title, { chip: V.recommended, state: true });
  const loginIdle = el('div', 'vc-row');
  const loginBtn = button('vc-primary', V.login.button, 'login');
  loginIdle.append(loginBtn);
  const loginWait = el('div', 'vc-row vc-wait');
  loginWait.hidden = true;
  const waitText = el('span', 'vc-wait-text', V.login.progress);
  const cancelBtn = button('vc-secondary', V.login.cancel);
  loginWait.append(thinkingOrb('connecting', { size: 32 }), waitText, cancelBtn);
  const loginMsg = message();
  login.section.append(el('p', 'vc-desc', V.login.description), loginIdle, loginWait, loginMsg);

  // 2 and 3. Paste a key: a password field, cleared on save; the key is never shown again
  function keyCard(provider, T, iconName, note) {
    const c = card(provider, `vc-key vc-${provider}`, iconName, T.title, { state: true });
    const remove = button('vc-text-btn', V.state.remove);
    c.stateRow.append(remove);
    const form = el('form', 'vc-form');
    form.noValidate = true;
    const input = el('input', 'vc-input');
    input.type = 'password';
    input.id = uid(`${provider}-key`);
    input.name = `${provider}-key`;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('autocorrect', 'off');
    input.placeholder = T.placeholder;
    const label = el('label', 'vc-label', T.label);
    label.htmlFor = input.id;
    const save = button('vc-secondary vc-save', T.save);
    save.type = 'submit';
    save.disabled = true;
    const row = el('div', 'vc-row vc-key-row');
    row.append(input, save);
    form.append(label, row);
    const where = button('vc-link', T.where, 'openExternal');
    const msg = message();
    c.section.append(el('p', 'vc-desc', T.description));
    if (note) c.section.append(el('p', 'vc-note', note));
    c.section.append(form, where, msg);
    input.disabled = !usable;
    where.disabled = !usable;
    input.addEventListener('input', () => { save.disabled = !input.value.trim(); });
    form.addEventListener('submit', (e) => { e.preventDefault(); saveKey(provider, input, save, msg); });
    where.addEventListener('click', async () => {
      const res = await voiceService.openLink(KEY_LINKS[provider]);
      if (!res?.ok) setMsg(msg, V.errors.link, 'error');
    });
    remove.addEventListener('click', async () => {
      remove.disabled = true;
      await voiceService.removeKey(provider);
      remove.disabled = false;
      setMsg(msg, '');
      await refresh();
      if (!remove.isConnected || remove.hidden) input.focus(); // the button the focus was on just went away
    });
    return { ...c, input, save, msg, remove };
  }
  const eleven = keyCard('elevenlabs', V.elevenlabsKey, 'key', V.elevenlabsKey.team);
  const grok = keyCard('grok', V.grokKey, 'key', V.grokKey.note);
  const keyCards = { elevenlabs: eleven, grok };

  // 4. The simulated call
  const sim = card('sim', 'vc-sim', 'play', V.simulated.title);
  const simBtn = button('vc-secondary', V.simulated.button);
  sim.section.append(el('p', 'vc-desc', V.simulated.description), simBtn);

  const keysRow = el('div', 'vc-keys');
  keysRow.append(eleven.section, grok.section);
  const cards = el('div', 'vc-cards');
  cards.append(login.section, keysRow, sim.section);
  dialog.append(head, intro, ready, cards);
  container.replaceChildren(backdrop, dialog);
  loginBtn.disabled = !usable;

  // ---------- State ----------
  let providers = { elevenlabs: { ready: false }, grok: { ready: false } };
  let loginBusy = false;
  const anyReady = () => Boolean(providers.elevenlabs?.ready || providers.grok?.ready);

  function renderStates() {
    const states = [[login.stateRow, providers.elevenlabs], [eleven.stateRow, providers.elevenlabs], [grok.stateRow, providers.grok]];
    for (const [row, p] of states) {
      row.querySelector('.vc-state-text').textContent = stateText(p);
      row.dataset.ready = String(Boolean(p?.ready));
    }
    for (const [provider, c] of Object.entries(keyCards)) c.remove.hidden = !providers[provider]?.ready;
    const any = anyReady();
    ready.hidden = !any;
    // with a service connected Qubi is not «offline»: the title names the place instead
    title.textContent = any ? strings.call.settings.connection.replace(/…$/, '') : V.title;
    intro.hidden = any;
    mark.replaceChildren(icon(any ? 'call' : 'offline', { size: 20 }));
    container.dataset.ready = String(any);
  }

  async function refresh() {
    const next = await voiceService.providers?.();
    if (next) providers = { elevenlabs: next.elevenlabs ?? { ready: false }, grok: next.grok ?? { ready: false } };
    renderStates();
  }

  async function saveKey(provider, input, save, msg) {
    const value = input.value.trim();
    input.value = ''; // never kept on screen, not even while it saves
    save.disabled = true;
    if (!value) return;
    setMsg(msg, V.state.saving);
    const res = await voiceService.setKey(provider, value);
    if (res?.ok) {
      const weak = res.reason === 'weak-keychain' || res.warning === 'weak-keychain';
      setMsg(msg, weak ? V.errors['weak-keychain'] : V.state.saved, weak ? 'warn' : 'ok');
      await refresh();
      if (anyReady() && dialog.contains(document.activeElement)) callBtn.focus();
    } else {
      setMsg(msg, V.errors[res?.error ?? res?.reason] ?? V.errors.failed, 'error');
      input.focus();
    }
  }

  function renderLogin() {
    const hadFocus = loginIdle.contains(document.activeElement) || loginWait.contains(document.activeElement);
    loginIdle.hidden = loginBusy;
    loginWait.hidden = !loginBusy;
    if (hadFocus) (loginBusy ? cancelBtn : loginBtn).focus();
  }

  loginBtn.addEventListener('click', async () => {
    if (loginBusy || !usable) return;
    loginBusy = true;
    setMsg(loginMsg, '');
    renderLogin();
    const res = await voiceService.login();
    loginBusy = false;
    renderLogin();
    if (res?.ok) {
      setMsg(loginMsg, V.login.done(res.last4 ?? ''), 'ok');
      await refresh();
      if (!container.hidden && anyReady()) callBtn.focus();
    } else {
      setMsg(loginMsg, V.login.errors[res?.reason] ?? V.login.errors.failed, res?.reason === 'cancelled' ? '' : 'error');
    }
  });
  cancelBtn.addEventListener('click', () => voiceService.loginCancel?.()); // the sign-in answers «cancelled»

  // ---------- Calling from here ----------
  callBtn.addEventListener('click', () => {
    if (vm.canUseVoice) vm.setSimulate(false); // connected on purpose: a real call
    close();
    vm.start();
  });
  // a practice call is one call: setSimulate would keep every later call simulated, and a simulated call
  // never ends offline, so this modal could never offer a real voice again
  simBtn.addEventListener('click', () => {
    close();
    vm.start({ practice: true });
  });

  // ---------- Open and close ----------
  let lastFocus = null;
  let hideTimer = 0;

  function open() {
    clearTimeout(hideTimer);
    if (!container.hidden && container.classList.contains('in')) { refresh(); return; }
    if (container.hidden) lastFocus = document.activeElement;
    container.hidden = false;
    renderStates();
    requestAnimationFrame(() => container.classList.add('in'));
    (anyReady() ? callBtn : usable ? loginBtn : simBtn).focus();
    refresh().then(() => {
      // the services answered: when one is connected the call button is the first thing to reach
      if (anyReady() && !container.hidden && dialog.contains(document.activeElement) && document.activeElement === loginBtn) callBtn.focus();
    });
  }

  function close() {
    if (container.hidden) return;
    container.classList.remove('in');
    for (const c of Object.values(keyCards)) { c.input.value = ''; c.save.disabled = true; }
    // the failed call that opened this modal is over: the phone is ready to call again
    const s = vm.store.state;
    if (s.status === 'error' && s.error === 'offline') vm.hangUp();
    const back = lastFocus;
    lastFocus = null;
    hideTimer = setTimeout(() => { container.hidden = true; }, reduced?.matches ? 0 : 160);
    if (back?.isConnected && typeof back.focus === 'function') back.focus();
  }

  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', close);
  container.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab') return;
    // the focus stays in the modal: Tab from the last control goes to the first, Shift+Tab the other way
    const items = [...dialog.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null || n === document.activeElement);
    if (!items.length) { e.preventDefault(); dialog.focus(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  // A click elsewhere cannot take the focus out while it is open (the backdrop covers the app)
  document.addEventListener('focusin', (e) => {
    if (!container.hidden && container.classList.contains('in') && !container.contains(e.target)) dialog.focus();
  });

  // A call with no voice service ready: Qubi is offline, this modal says how to connect him
  vm.store.subscribe((s, prev) => {
    const offline = s.status === 'error' && s.error === 'offline';
    const was = prev?.status === 'error' && prev?.error === 'offline';
    if (offline && !was) open();
  });

  return { open, close };
}
