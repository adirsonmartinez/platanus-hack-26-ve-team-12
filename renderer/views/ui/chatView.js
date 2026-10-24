// Renders ChatViewModel: messages (appended incrementally to keep the scroll; a streaming answer
// updates its bubble in place), map cards, "thinking…", chips, and the composer (Enter sends,
// Shift+Enter breaks) with the Vibe / Dev switch.
//
// While the agent works (libraries.dev effects): a thinking orb whose state names what it is doing, from
// the first moment, one per activity (the "Pensando…" row, a run card step, or else the header avatar),
// a border beam on the composer after 3 s, and liquid metal on the send button (calm while it works).
// File names in answers open the file in the chat.
import { strings } from '../../i18n/es.js';
import { splitAnswer } from '../../models/answerFormat.js';
import { markdownToHtml } from './markdown.js';
import { renderRunCard, tickRunTimers, orbKeyOf, ORB_AFTER_MS } from './runCardView.js';
import { createComposerAssist } from './composerAssistView.js';
import { renderStep, renderResult } from './activityView.js';
import { isSpec } from '../../models/promptSpec.js';
import { renderChatCard, actionButton } from './chatCardsView.js';
import { applyIcons } from '../icons.js';
import { icon } from './icons.js';
import { thinkingOrb, STEP_ORB } from './thinkingOrb.js';

const MAX_INPUT_PX = 160;
const BEAM_AFTER_MS = 3000;
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function createChatView({ chatViewModel: vm, composerViewModel = null, connection = null, modeModel = null }) {
  const $ = (id) => document.getElementById(id);
  const root = $('chat'), body = $('chat-body'), form = $('chat-form'), input = $('chat-text');
  const sendButton = $('chat-send'), toggle = $('chat-toggle');
  const rendered = new Map(); // message id -> { el, text }

  // "Pensando…": a thinking orb with its label from the first moment (no three dots)
  const typing = document.createElement('div');
  typing.className = 'msg bot typing';
  const thinking = document.createElement('span');
  thinking.className = 'typing-orb';
  thinking.dataset.state = 'breathing';
  thinking.append(thinkingOrb('breathing', { size: 20 }), document.createTextNode(strings.chat.thinking));
  typing.append(thinking);

  // The place the robot is on (ChatViewModel.focus): stuck on top of the conversation while it lasts,
  // so the person always sees what "aquí" is
  const focusBar = document.createElement('div');
  focusBar.className = 'chat-focus';
  focusBar.hidden = true;
  const F = strings.chat.focus;
  function paintFocus(focus) {
    focusBar.hidden = !focus;
    if (!focus) return;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'chat-focus-close';
    close.title = F.close;
    close.setAttribute('aria-label', F.close);
    close.appendChild(icon('close', { size: 14 }));
    close.addEventListener('click', () => vm.clearFocus());
    const text = document.createElement('span');
    text.className = 'chat-focus-text';
    const label = document.createElement('small');
    label.textContent = F.label;
    const title = document.createElement('strong');
    title.textContent = focus.title;
    text.append(label, title);
    const where = document.createElement('code');
    where.textContent = focus.path || F.project;
    const badge = document.createElement('span');
    badge.className = `chat-focus-badge ${focus.level}`;
    badge.appendChild(icon('bot', { size: 16 }));
    focusBar.replaceChildren(badge, text, where, close);
  }

  // Where a question is about (asked while the robot was on a place): a small tag over the bubble
  const contextTag = (context) => {
    const tag = document.createElement('span');
    tag.className = 'msg-context';
    tag.append(icon('bot', { size: 12 }), document.createTextNode(context.path || context.title));
    tag.title = `${F.about} ${context.title}`;
    return tag;
  };

  // The question just sent stays at the top while its answer comes below (instead of jumping to the end);
  // the person scrolling takes over
  let anchorId = null;
  const letGo = () => { anchorId = null; };
  body.addEventListener('wheel', letGo, { passive: true });
  body.addEventListener('touchmove', letGo, { passive: true });
  body.addEventListener('pointerdown', letGo); // the scrollbar, a selection
  body.addEventListener('keydown', letGo);

  const chips = document.createElement('div');
  chips.className = 'chips';

  // Welcome screen (empty conversation), as in Obra: title, one sentence and suggestions
  const hero = document.createElement('div');
  hero.className = 'chat-hero';
  body.prepend(hero);
  let heroKey = '';
  function renderHero(state) {
    const key = `${state.projectName}|${(state.chips ?? []).map((c) => (typeof c === 'string' ? c : c.label)).join('|')}`;
    if (key === heroKey) return;
    heroKey = key;
    const mark = document.createElement('span');
    mark.className = 'chat-hero-mark';
    const title = document.createElement('h2');
    title.textContent = state.projectName ? strings.chat.welcomeTitle(state.projectName) : strings.chat.welcomeNoProject;
    const text = document.createElement('p');
    text.textContent = strings.chat.welcomeBody;
    const list = document.createElement('div');
    list.className = 'chat-hero-list';
    const options = [...(state.chips ?? []), ...(state.projectName ? strings.chat.prompts : [])];
    for (const option of options) {
      list.appendChild(actionButton(typeof option === 'string' ? { kind: 'ask', label: option } : option, vm, 'hero-option'));
    }
    mark.replaceChildren(icon('sparkles', { size: 22 }));
    hero.replaceChildren(mark, title, text, list);
  }

  // Agent answers are Markdown (escaped first, see markdown.js) with cards; the suggestions block is
  // not shown (it becomes the chips). The person's own text stays plain, except a spec made with
  // "Mejorar mi mensaje", shown with its headings and steps (markdownToHtml escapes it first).
  function fill(el, { role, text, html, thinking }) {
    if (html) { el.innerHTML = html; return; } // only our own strings, never user input
    if (role === 'user' && isSpec(text)) { el.classList.add('spec'); el.innerHTML = `<div class="md">${markdownToHtml(text)}</div>`; return; }
    if (role !== 'bot') { el.textContent = text ?? ''; return; }
    const parts = [];
    if (thinking) {
      parts.push(`<details class="reasoning"${text ? '' : ' open'}><summary>${strings.chat.reasoning}</summary><div>${markdownToHtml(thinking)}</div></details>`);
    }
    const answer = splitAnswer(text).body;
    parts.push(answer ? `<div class="md">${markdownToHtml(answer)}</div>` : thinking ? '' : `<div class="md">${strings.chat.thinking}</div>`);
    const open = el.querySelector('details.reasoning')?.open;
    el.innerHTML = parts.join('');
    applyIcons(el);
    if (open !== undefined && text) el.querySelector('details.reasoning').open = open; // keep what the person chose
  }

  function messageElement(m) {
    const el = document.createElement('div');
    el.className = ['msg', m.role, m.tone, m.run && 'run', m.card && `card-msg ${m.card.kind}`, m.result && `result ${m.result}`].filter(Boolean).join(' ');
    paint(el, m);
    return el;
  }

  const paint = (el, m) => {
    const plain = !modeModel?.tech;
    if (m.run) renderRunCard(el, m, { plain });
    else if (m.card) renderChatCard(el, m.card, vm, { plain });
    else if (m.step) renderStep(el, m);
    else if (m.result) renderResult(el, m);
    else fill(el, m);
    if (m.role === 'user' && m.context) el.prepend(contextTag(m.context));
    // Modo Vibe: file links show the file's name; the full path is on hover
    for (const ref of el.querySelectorAll('code.file-ref')) {
      ref.title = ref.dataset.path;
      ref.textContent = plain ? ref.dataset.path.split('/').filter(Boolean).pop() : ref.dataset.path;
    }
  };

  // File names in answers are links: they open the file's card here (folders go to the map)
  const openRef = (e) => {
    const ref = e.target.closest?.('.file-ref');
    if (!ref || (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    vm.openFile(ref.dataset.path);
  };
  body.addEventListener('click', openRef);
  body.addEventListener('keydown', openRef);
  body.addEventListener('mousedown', (e) => { if (e.detail > 1 && e.target.closest?.('.file-ref')) e.preventDefault(); }); // no word selection on double click

  function render(state, previous) {
    // Follow the conversation only if the person is already at the bottom (not while they read above)
    const atBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 80;
    body.classList.toggle('welcome', state.welcome);
    if (state.welcome) renderHero(state);
    // A new conversation empties the list: drop the bubbles that are no longer there
    if (previous && state.messages.length < previous.messages.length) {
      const keep = new Set(state.messages.map((m) => m.id));
      for (const [id, { el }] of rendered) if (!keep.has(id)) { el.remove(); rendered.delete(id); }
    }
    state.messages.forEach((m) => {
      const seen = rendered.get(m.id);
      if (!seen) {
        const el = messageElement(m);
        rendered.set(m.id, { el, msg: m });
        body.appendChild(el);
      } else if (seen.msg !== m && !m.html) { // messages are immutable: a new object means it changed
        seen.msg = m;
        paint(seen.el, m);
      }
    });

    // A live run card already shows its own orb: no "Pensando…" row under it
    const runWorking = state.messages.at(-1)?.run?.status === 'running';
    const showTyping = state.typing && !runWorking;
    // A detached canvas leaves the orbs' draw loop: the row gets a fresh orb each time it appears
    if (showTyping && !typing.isConnected) thinking.firstChild.replaceWith(thinkingOrb('breathing', { size: 20 })); // the text beside it says it
    if (state.chips?.length && state.chips !== previous?.chips) {
      chips.replaceChildren(...state.chips.map((chip, i) => {
        const button = actionButton(typeof chip === 'string' ? { kind: 'ask', label: chip } : chip, vm, 'chip');
        button.style.setProperty('--i', String(i)); // staggered entrance
        return button;
      }));
    }
    // The row and the chips stay at the end; they move only when a new message pushed them up (moving a
    // node restarts its entrance animation, so they are not re-attached on every streamed word)
    const tail = [showTyping && typing, state.chips?.length && chips].filter(Boolean);
    for (const node of [typing, chips]) if (!tail.includes(node)) node.remove();
    const last = [...body.children].slice(-tail.length);
    if (tail.length && tail.some((node, i) => last[i] !== node)) body.append(...tail);
    if (state.focus !== previous?.focus) paintFocus(state.focus);
    if (body.firstElementChild !== focusBar) body.prepend(focusBar);
    const added = previous ? state.messages.slice(previous.messages.length) : [];
    const asked = added.findLast((m) => m.role === 'user');
    if (asked) anchorId = asked.id;
    const busy = state.typing || state.messages.at(-1)?.run?.status === 'running';
    const anchor = anchorId !== null && rendered.get(anchorId)?.el;
    // it stays there after the answer too (its chips appear below); something new from the map lets go
    if (anchor && (busy || asked || !added.length)) {
      // the question at the top, under the place bar
      const top = anchor.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop;
      body.scrollTop = Math.max(0, top - (focusBar.hidden ? 0 : focusBar.offsetHeight) - 12);
    } else {
      anchorId = null;
      if (atBottom || state.messages.length !== previous?.messages.length) body.scrollTop = body.scrollHeight;
    }

    sendButton.disabled = state.typing;
    root.classList.toggle('min', state.minimized);
    root.classList.toggle('working', state.typing);
    document.body.classList.toggle('chat-min', state.minimized); // the map takes the chat's column
    toggle.setAttribute('aria-expanded', String(!state.minimized));
    toggle.title = state.minimized ? strings.chat.expand : strings.chat.minimize;
    if (toggle.dataset.min !== String(state.minimized)) {
      toggle.dataset.min = String(state.minimized);
      toggle.replaceChildren(icon(state.minimized ? 'plus' : 'minus', { size: 16 }));
    }
    working(state);
  }

  // --- While the agent works: orb in the avatar (from the start), beam on the composer (after 3 s) ---
  const avatar = root.querySelector('.chat-avatar');
  let orbKey = null;
  let workStarted = 0;
  let beamTimer = 0;
  let beam = null;
  // The metal of the send button calms down while the agent works (the beam is the effect then: one
  // effect at a time) and stays still with "reduce motion" (the shader does not read that setting)
  let metal = null;
  let metalCalm = null;
  const calmMetal = (calm) => {
    if (!metal || calm === metalCalm) return;
    metalCalm = calm;
    const still = calm || reducedMotion();
    metal.update({ paused: still, disableGlow: still, strength: calm ? 0.45 : 0.9 });
  };
  // libraries.dev effects (renderer/vendor/react-ui.js, built by scripts/vendor-ui.js): the beam on the
  // composer while the agent works, and liquid metal on the send button, reflected on the model picker.
  // Without the file (or WebGL2 for the metal) the chat simply works without them.
  import('../../vendor/react-ui.js')
    .then(({ mountBorderBeam, mountMetalButton }) => {
      beam = mountBorderBeam(form, { size: 'md', colorVariant: 'ocean', theme: 'dark', active: Boolean(beamTimer === -1), strength: 0.85, borderRadius: 22 }); // the composer's glass corners (chat-glass.css)
      // The beam also rides the border while the cursor is over the composer or the person writes in it
      const hoverBeam = () => beam?.update({ active: beamTimer === -1 || (!reducedMotion() && (form.matches(':hover') || form.contains(document.activeElement))) });
      for (const type of ['mouseenter', 'mouseleave', 'focusin', 'focusout']) form.addEventListener(type, () => setTimeout(hoverBeam, 0));
      metal = mountMetalButton(sendButton, { reflect: form.querySelector('.picker-pill'), paused: reducedMotion(), disableGlow: reducedMotion() });
      calmMetal(Boolean(vm.store.state.typing));
      // The floating button (chat closed or minimized) gets the same liquid metal, mounted the first time
      // it shows (the shader measures the button; a hidden one has no size). Never both at once: it only
      // shows while the composer and its send button are hidden.
      const launcher = document.getElementById('chat-launcher-button');
      const launcherShown = () => launcher && launcher.offsetParent !== null;
      const mountLauncher = () => {
        if (!launcherShown() || launcher.closest('.metal-host')) return;
        mountMetalButton(launcher, { paused: reducedMotion(), disableGlow: reducedMotion() });
      };
      new MutationObserver(mountLauncher).observe(document.body, { attributes: true, attributeFilter: ['class'] });
      mountLauncher();
    })
    .catch((error) => console.warn('libraries.dev:', error.message));
  const calmAvatar = () => {
    if (orbKey) { avatar.querySelector('.orb')?.remove(); orbKey = null; }
    avatar.classList.remove('busy');
  };
  function working(state) {
    calmMetal(Boolean(state.typing));
    if (!state.typing) {
      workStarted = 0;
      clearTimeout(beamTimer);
      beamTimer = 0;
      beam?.update({ active: !reducedMotion() && (form.matches(':hover') || form.contains(document.activeElement)) }); // hover or writing keeps it
      return calmAvatar();
    }
    if (!workStarted) {
      workStarted = Date.now();
      if (!reducedMotion()) beamTimer = setTimeout(() => { beamTimer = -1; beam?.update({ active: true }); }, BEAM_AFTER_MS);
    }
    // The "Pensando…" row or a working card (its avatar is the orb) already shows it: one orb per activity
    if (typing.isConnected || state.messages.at(-1)?.run?.status === 'running') return calmAvatar();
    const key = orbKeyOf(state.messages.at(-1));
    if (key === orbKey) return;
    orbKey = key;
    avatar.querySelector('.orb')?.remove();
    // The 32 preset drawn at 28 px (0.875, within the library's tolerance) fills the 28 px avatar
    const orb = thinkingOrb(STEP_ORB[key] ?? 'working', { size: 32, label: strings.chat.orbLabels[key] ?? strings.chat.orbLabels.working });
    orb.style.width = orb.style.height = '28px';
    orb.style.animationDelay = `${ORB_AFTER_MS - (Date.now() - workStarted)}ms`;
    avatar.appendChild(orb);
    avatar.classList.add('busy');
  }

  const grow = () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, MAX_INPUT_PX)}px`;
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (e.target !== form) return; // a form inside a menu of the composer, not the message
    if (vm.store.state.typing || !input.value.trim()) return; // keep the text until it can be sent
    vm.send(input.value);
    input.value = '';
    grow();
  });
  input.addEventListener('input', grow);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  toggle.addEventListener('click', () => vm.toggleMinimized());
  setInterval(() => tickRunTimers(body), 1000);

  // Suggestions to start writing: a click fills the box (the person can edit before sending)
  const suggest = $('chat-suggest');
  suggest.setAttribute('aria-label', strings.chat.followUpsTitle);
  const fillSuggestions = (mode) => suggest.replaceChildren(...strings.chat.followUps[mode].map((text) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'listitem');
    b.textContent = text;
    b.addEventListener('click', () => {
      input.value = text;
      grow();
      input.focus();
      input.setSelectionRange(text.length, text.length);
      updateSuggest();
    });
    return b;
  }));

  // Vibe / Dev: how the agent talks (plain words or technical detail). Lives in the composer bar.
  const voice = document.createElement('div');
  voice.className = 'voice-switch';
  voice.setAttribute('role', 'radiogroup');
  voice.setAttribute('aria-label', strings.chat.voice.label);
  const voiceButtons = ['vibe', 'tech'].map((mode) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.dataset.mode = mode;
    b.dataset.tip = strings.chat.voice.tips[mode]; // hover label: what this mode does
    b.setAttribute('aria-label', strings.chat.voice.hints[mode]);
    b.appendChild(icon(mode === 'vibe' ? 'vibe' : 'dev', { size: 14 }));
    b.addEventListener('click', () => modeModel?.set(mode));
    voice.appendChild(b);
    return b;
  });
  if (modeModel) $('agent-picker').before(voice);
  const applyMode = (mode) => {
    voice.dataset.mode = mode;
    voiceButtons.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === mode)));
    input.placeholder = strings.chat.placeholders[mode];
    fillSuggestions(mode);
    for (const { el, msg } of rendered.values()) if (msg.run || msg.card) paint(el, msg); // agent and file cards switch voice too
  };
  if (modeModel) modeModel.store.subscribe(({ mode }) => applyMode(mode), { immediate: true });
  else fillSuggestions('vibe');
  const updateSuggest = () => {
    const { welcome, typing, chips: next } = vm.store.state;
    // the agent's own next steps (chips) take the place of the generic suggestions
    suggest.hidden = welcome || typing || input.value.trim().length > 0 || Boolean(next?.length);
  };
  input.addEventListener('input', updateSuggest);
  vm.store.subscribe(updateSuggest, { immediate: true });

  // When a git chip is clicked the ViewModel puts the command text in gitPrefill.
  // We write it to the textarea so the user can review and edit before hitting Enter.
  vm.store.subscribe((state, prev) => {
    if (state.gitPrefill && state.gitPrefill !== prev?.gitPrefill) {
      input.value = state.gitPrefill;
      grow();
      input.focus();
      input.setSelectionRange(state.gitPrefill.length, state.gitPrefill.length);
      updateSuggest();
    }
  });

  vm.store.subscribe(render, { immediate: true });
  // Help while writing: hints, file completions and "Mejorar mi mensaje"
  if (composerViewModel) createComposerAssist({ vm: composerViewModel, form, input, bar: form.querySelector('.composer-bar') });

  // Header: the agent that answers, by its mark and name, and how it is connected ("Claude · Con tu
  // suscripción"); the demo and the simulator say what they are
  const title = root.querySelector('.chat-title strong');
  const status = root.querySelector('.chat-title span');
  const H = strings.chat.header;
  let mark = 'bot';
  connection?.store.subscribe((state) => {
    const agent = state.agents.find((a) => a.id === state.selected);
    const own = agent && agent.id !== 'sim';
    title.textContent = own ? agent.label.split(' (')[0] : agent ? H.sim.name : H.demo.name;
    // How it is connected (the model and the effort are on the composer's button)
    status.textContent = own
      ? (agent.auth === 'key' ? strings.chat.picker.viaKey(agent.keyLast4) : strings.chat.picker.viaLogin)
      : agent ? H.sim.detail : H.demo.detail;
    const next = own && ['claude', 'codex', 'grok', 'opencode'].includes(agent.id) ? agent.id : 'bot';
    if (next !== mark) {
      mark = next;
      avatar.querySelector('svg.icon')?.replaceWith(icon(next, { size: 16 }));
    }
    root.dataset.agent = next; // the mark takes its brand color (chat-glass.css)
    // the floating button shows the same mark
    const launcher = document.getElementById('chat-launcher-button');
    if (launcher) {
      launcher.dataset.agent = next;
      launcher.querySelector('svg.icon')?.replaceWith(icon(next, { size: 20 }));
    }
  }, { immediate: true });
}
