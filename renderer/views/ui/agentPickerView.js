// Agent picker inside the chat composer: a pill with the agent's mark, its model and its effort (bars).
// It opens a short menu: the agents (each one says how it is connected; "Conectar" signs in or takes an
// API key right there), the permissions, and "Más opciones" folded (model, effort, compare answers).
import { APPROVAL_MODES } from '../../models/approvalModel.js';
import { strings } from '../../i18n/es.js';
import { CATALOG, modelLabel } from '../../models/agentConnectionModel.js';
import { createEffortSlider } from './effortSlider.js';
import { icon } from './icons.js';
import { EXTERNAL_AGENTS, mcpSnippet, maskUrl } from '../../models/mcpSnippets.js';

const C = strings.connect;

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

export function createAgentPickerView({ container, connection, approval = null, onMore }) {
  const pill = el('button', 'picker-pill');
  pill.type = 'button';
  pill.setAttribute('aria-haspopup', 'menu');
  const menu = el('div', 'picker-menu glass-pop');
  menu.hidden = true;
  container.append(pill, menu);

  const close = () => { menu.hidden = true; pill.classList.remove('open'); };
  // The menu opens upward: it is never taller than the room between the composer and the panel's top
  const fit = () => {
    if (menu.hidden) return;
    const top = (container.closest('.composer') ?? container).getBoundingClientRect().top;
    const ceiling = container.closest('#chat')?.getBoundingClientRect().top ?? 0;
    menu.style.maxHeight = `${Math.max(160, Math.min(560, top - ceiling - 16))}px`;
  };
  pill.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    pill.classList.toggle('open', !menu.hidden);
    fit();
  });
  window.addEventListener('resize', fit);
  menu.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', close);
  document.addEventListener('keydown', (e) => e.key === 'Escape' && close());


  const P = strings.chat.picker;
  const LOGO = { claude: 'claude', codex: 'codex', grok: 'grok', opencode: 'opencode' };
  const KEYED = ['claude', 'codex', 'grok']; // agents that take an API key of their own
  const VISIBLE_AGENTS = 2;
  const EXTERNAL_LOGO = { cursor: 'cursorApp', kimi: 'kimi', gemini: 'gemini', qwen: 'qwen', opencode: 'opencode' };
  let slider = null;
  let menuKey = '';
  let connecting = null; // the agent whose "Conectar" panel is open
  let keyFor = null; // the agent whose API key field is open
  let keyError = '';
  let moreOpen = false; // "Más opciones"
  let agentsOpen = false; // "Ver más agentes"

  // The pill: the agent's mark, its model and how much it thinks (as bars)
  function renderPill(state, agent) {
    pill.replaceChildren();
    pill.appendChild(icon(agent ? LOGO[agent.id] ?? 'bot' : 'bot', { size: 14 }));
    if (agent) {
      const catalog = CATALOG[state.selected];
      const index = catalog.efforts.indexOf(state.effort);
      const meter = el('span', 'picker-meter');
      meter.title = C.efforts[state.effort] ?? '';
      catalog.efforts.forEach((_, i) => {
        const bar = el('i', i <= index ? 'on' : '');
        bar.style.height = `${4 + i * 1.5}px`;
        meter.appendChild(bar);
      });
      pill.append(el('span', 'picker-model', modelLabel(state.selected, state.model) ?? C.planDefault), meter);
    } else pill.append(el('span', 'picker-model', strings.chat.demo));
    pill.appendChild(el('span', 'picker-chevron')); // drawn in CSS
    pill.title = agent ? `${agent.label.split(' (')[0]} · ${modelLabel(state.selected, state.model) ?? C.planDefault} · ${C.efforts[state.effort] ?? ''}` : C.scripted;
    pill.classList.toggle('live', Boolean(agent));
  }

  // One agent: mark, name, how it is connected; a check when it answers, "Conectar" when it cannot
  function agentRow(state, a) {
    const ready = !a || a.loggedIn !== false; // null = the demo, always ready
    const row = el('div', `pick-agent${state.selected === (a?.id ?? null) ? ' active' : ''}${ready ? '' : ' off'}`);
    row.dataset.id = a?.id ?? 'demo';
    const main = el('button', 'pick-agent-main');
    main.type = 'button';
    const name = a ? a.label.split(' (')[0] : P.demo;
    const status = !a ? P.demoNote
      : a.auth === 'key' ? P.viaKey(a.keyLast4) : a.loggedIn === true ? P.viaLogin : a.loggedIn === false ? P.notConnected : P.unknown;
    main.append(icon(a ? LOGO[a.id] ?? 'bot' : 'bot', { size: 16 }), el('strong', '', name), el('small', '', status));
    if (state.selected === (a?.id ?? null)) main.appendChild(icon('ok', { size: 15 }));
    main.addEventListener('click', () => {
      if (!ready) { connecting = connecting === a.id ? null : a.id; keyFor = null; keyError = ''; menuKey = ''; return render(connection.store.state); }
      connection.select(a?.id ?? null);
    });
    row.appendChild(main);
    if (a && LOGO[a.id]) {
      const more = el('button', 'pick-connect', ready ? '' : P.connect);
      more.type = 'button';
      more.title = P.connectHint;
      if (ready) more.appendChild(icon('plus', { size: 14 }));
      more.setAttribute('aria-label', P.connectHint);
      more.addEventListener('click', () => { connecting = connecting === a.id ? null : a.id; keyFor = null; keyError = ''; menuKey = ''; render(connection.store.state); });
      row.appendChild(more);
    }
    if (a && connecting === a.id) row.appendChild(connectPanel(a));
    return row;
  }

  // How to connect an agent: sign in with the person's subscription, or paste an API key
  function connectPanel(a) {
    const box = el('div', 'pick-connect-panel');
    const login = el('button', 'connect-choice', P.login);
    login.type = 'button';
    login.addEventListener('click', () => connection.login(a.id).then(() => setTimeout(() => connection.refresh(), 4000)));
    box.appendChild(login);
    // OpenCode takes the keys saved for Claude, ChatGPT or Grok (it reads the same variables)
    if (!KEYED.includes(a.id)) {
      box.appendChild(el('p', 'key-note', P.opencodeKeys));
      return box;
    }
    const useKey = el('button', 'connect-choice', a.auth === 'key' ? P.replaceKey : P.useKey);
    useKey.type = 'button';
    useKey.addEventListener('click', () => { keyFor = a.id; keyError = ''; menuKey = ''; render(connection.store.state); menu.querySelector('.key-form input')?.focus(); });
    box.appendChild(useKey);
    if (keyFor === a.id) {
      // Not a <form>: the menu lives inside the chat's form, and Enter here must never send the message
      const form = el('div', 'key-form');
      const input = el('input');
      input.type = 'password';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.placeholder = P.keyPlaceholder[a.id] ?? P.keyPlaceholder.claude;
      input.setAttribute('aria-label', P.keyLabel(a.label.split(' (')[0]));
      const save = el('button', 'key-save', P.saveKey);
      save.type = 'button';
      form.append(input, save);
      const submit = async () => {
        if (save.disabled || !input.value.trim()) return;
        save.disabled = true;
        const result = await connection.saveKey(a.id, input.value);
        input.value = ''; // never kept in the page
        if (result?.ok) { keyFor = null; connecting = null; keyError = ''; connection.select(a.id); }
        else keyError = P.keyErrors[result?.error] ?? P.keyErrors.failed;
        menuKey = '';
        render(connection.store.state);
      };
      save.addEventListener('click', submit);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
      box.append(form, el('p', 'key-note', keyError || P.keyNote));
      if (keyError) box.lastChild.classList.add('error');
    }
    if (a.auth === 'key') {
      const remove = el('button', 'connect-remove', P.removeKey);
      remove.type = 'button';
      remove.addEventListener('click', async () => { await connection.removeKey(a.id); connecting = null; menuKey = ''; render(connection.store.state); });
      box.appendChild(remove);
    }
    return box;
  }

// A copy button: the real text goes to the clipboard, the button says "Copiado" for a moment
  function copyButton(text) {
    const b = el('button', 'pick-copy', P.copy);
    b.type = 'button';
    b.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(text); b.textContent = P.copied; setTimeout(() => { b.textContent = P.copy; }, 1500); } catch { /* clipboard refused */ }
    });
    return b;
  }

  // Agents connected from their own app through Qubbot' MCP server (they cannot be locked inside
  // the chat): where to paste the config, and how to install them
  function externalRow(state, x) {
    const row = el('div', 'pick-agent external');
    row.dataset.id = x.id;
    const main = el('button', 'pick-agent-main');
    main.type = 'button';
    main.append(icon(EXTERNAL_LOGO[x.id] ?? 'bot', { size: 16 }), el('strong', '', P.external[x.id] ?? x.id), el('small', '', P.fromApp));
    main.addEventListener('click', () => { connecting = connecting === `x:${x.id}` ? null : `x:${x.id}`; menuKey = ''; render(connection.store.state); });
    row.appendChild(main);
    if (connecting === `x:${x.id}`) {
      const box = el('div', 'pick-connect-panel');
      const url = state.mcp?.running ? state.mcp.url : null;
      if (!url) box.appendChild(el('p', 'key-note', P.mcpOff));
      else {
        const code = mcpSnippet(x.id, url);
        const snippet = el('div', 'pick-snippet');
        snippet.append(el('pre', '', maskUrl(code, url)), copyButton(code));
        box.append(el('p', 'key-note', P.how(x.file)), snippet);
      }
      const install = el('div', 'pick-snippet');
      install.append(el('pre', '', x.install), copyButton(x.install));
      box.append(el('p', 'key-note', P.installHint), install);
      row.appendChild(box);
    }
    return row;
  }

  function permissions() {
    const PM = strings.chat.permissions;
    const current = approval.store.state.mode;
    const seg = el('div', 'segmented permissions');
    seg.setAttribute('role', 'radiogroup');
    seg.setAttribute('aria-label', PM.label);
    for (const mode of APPROVAL_MODES) {
      const b = el('button', `${mode}${current === mode ? ' active' : ''}`, PM.names[mode]);
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(current === mode));
      b.addEventListener('click', () => approval.set(mode));
      seg.appendChild(b);
    }
    return [el('p', 'picker-label', PM.label), seg, el('p', `picker-note permissions-note ${current}`, PM.notes[current])];
  }

  // At most VISIBLE_AGENTS in sight: the one that answers first, then the connected ones in order
  function splitAgents(state) {
    const all = [...state.agents.filter((a) => LOGO[a.id]), null, ...state.agents.filter((a) => !LOGO[a.id])]; // null = the demo
    const current = all.find((a) => (a?.id ?? null) === state.selected);
    const connected = all.filter((a) => a && a !== current && a.loggedIn === true && LOGO[a.id]);
    const shown = [current, ...connected].filter((a) => a !== undefined).slice(0, VISIBLE_AGENTS);
    return { shown, folded: all.filter((a) => !shown.includes(a)) };
  }

  function render(state) {
    const agent = state.agents.find((a) => a.id === state.selected);
    renderPill(state, agent);
    // Changing only the effort updates the slider in place (rebuilding would drop the thumb mid-drag)
    const key = JSON.stringify([state.selected, state.model, state.compareWith, state.agents.map((a) => [a.id, a.loggedIn, a.auth, a.keyLast4]), approval?.store.state.mode, connecting, keyFor, keyError, moreOpen, agentsOpen, state.mcp?.url]);
    if (key === menuKey && slider) return slider.set(state.effort);
    menuKey = key;

    const parts = [el('p', 'picker-label', P.agent)];
    // In sight: the agent that answers and the connected ones, at most VISIBLE_AGENTS; the rest
    // (not connected, the demo, the simulator, the "Otros agentes") are folded under "Ver más agentes"
    const { shown, folded } = splitAgents(state);
    for (const a of shown) parts.push(agentRow(state, a));
    const external = EXTERNAL_AGENTS.filter((x) => !state.agents.some((a) => a.id === x.id));
    const hiddenCount = folded.length + external.length;
    if (hiddenCount) {
      const fold = el('details', 'picker-more-agents');
      // open by itself when one of its agents is being connected
      fold.open = agentsOpen || folded.some((a) => connecting === (a?.id ?? 'demo')) || external.some((x) => connecting === `x:${x.id}`);
      fold.addEventListener('toggle', () => { agentsOpen = fold.open; });
      fold.appendChild(el('summary', '', P.moreAgents(hiddenCount)));
      for (const a of folded) fold.appendChild(agentRow(state, a));
      if (external.length) {
        fold.appendChild(el('p', 'picker-label', P.others));
        for (const x of external) fold.appendChild(externalRow(state, x));
      }
      parts.push(fold);
    }

    const catalog = CATALOG[state.selected];
    if (catalog && approval) parts.push(...permissions());
    if (catalog) {
      // The rest is optional: folded under "Más opciones" (the defaults work)
      const more = el('details', 'picker-advanced');
      more.open = moreOpen;
      more.addEventListener('toggle', () => { moreOpen = more.open; });
      const summary = el('summary', '', P.more);
      summary.appendChild(el('small', '', P.moreHint(modelLabel(state.selected, state.model) ?? C.planDefault, C.efforts[state.effort] ?? '')));
      more.appendChild(summary);
      if (catalog.models.length > 1) {
        more.appendChild(el('p', 'picker-label', C.model));
        const row = el('div', 'model-grid');
        for (const m of catalog.models) {
          const b = el('button', `model-option${state.model === m.id ? ' active' : ''}`);
          b.type = 'button';
          b.append(el('strong', '', m.label ?? C.planDefault), el('small', '', m.note ?? C.modelNotes[m.tier] ?? ''));
          b.addEventListener('click', () => connection.setModel(m.id));
          row.appendChild(b);
        }
        more.appendChild(row);
      }
      slider = createEffortSlider({ efforts: catalog.efforts, value: state.effort, onChange: (e) => connection.setEffort(e) });
      more.appendChild(slider.el);
      const rivals = state.agents.filter((a) => a.id !== state.selected && a.loggedIn !== false);
      if (rivals.length) {
        more.appendChild(el('p', 'picker-label', strings.hub.compare));
        const seg = el('div', 'segmented');
        for (const [id, label] of [[null, strings.hub.compareNone], ...rivals.map((a) => [a.id, a.label.split(' (')[0]])]) {
          const b = el('button', state.compareWith === id ? 'active' : '', label);
          b.type = 'button';
          b.addEventListener('click', () => connection.setCompare(id));
          seg.appendChild(b);
        }
        more.appendChild(seg);
      }
      parts.push(more);
    } else slider = null;
    const hub = el('button', 'picker-more', P.hub);
    hub.type = 'button';
    hub.addEventListener('click', () => { close(); onMore(); });
    parts.push(hub);
    menu.replaceChildren(...parts);
    fit();
  }

  connection.store.subscribe(render, { immediate: true });
  approval?.store.subscribe(() => render(connection.store.state));
}
