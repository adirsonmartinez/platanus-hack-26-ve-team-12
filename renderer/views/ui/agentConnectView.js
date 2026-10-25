// "Conecta tu agente" (sidebar view): connects the user's AI agents and the local MCP server.
// Renders six sections: intro, agents, compare, MCP server, recent activity, editor snippets.
import { strings } from '../../i18n/es.js';
import { CATALOG, modelLabel } from '../../models/agentConnectionModel.js';
import { mcpSnippet, maskUrl } from '../../models/mcpSnippets.js';
import { thinkingOrb, STEP_ORB } from './thinkingOrb.js';
import { icon } from '../icons.js';

const C = strings.connect;
const H = strings.hub;
const T = strings.chat?.run?.tools ?? {};

// The configs per editor / CLI (renderer/models/mcpSnippets.js); the private key is masked on screen
const SNIPPETS = ['claude', 'cursor', 'codex', 'gemini', 'kimi', 'qwen', 'opencode'];
const snippets = (url) => SNIPPETS.map((key) => ({ key, code: mcpSnippet(key, url) }));
const mask = maskUrl;

async function copy(button, textToCopy) {
  try {
    await navigator.clipboard.writeText(textToCopy);
    button.textContent = C.copied;
    setTimeout(() => { button.textContent = C.copy; }, 1400);
  } catch {
    // no clipboard: the code stays visible to copy by hand
  }
}

// ---- DOM helpers ----

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

// A row per agent: its real logo, its name, one status line and one action. Details (stats, last error,
// path) stay in the tooltip and in Dev mode, so the list reads at a glance.
const LOGOS = new Set(['claude', 'codex', 'grok', 'opencode', 'gemini', 'kimi', 'qwen']);
const shortName = (label) => label.split(' (')[0];
const button = (className, text, onClick) => {
  const b = el('button', className, text);
  b.type = 'button';
  if (onClick) b.addEventListener('click', onClick);
  return b;
};

export function createAgentConnectView({ container, connection, modeModel }) {
  function agentRow(agent, state) {
    const selected = state.selected === agent.id;
    const row = el('div', `hub-row${selected ? ' selected' : ''}${agent.loggedIn === false ? ' off' : ''}`);
    const logo = el('span', 'hub-logo');
    logo.innerHTML = icon(LOGOS.has(agent.id) ? agent.id : 'bot');
    const info = el('div', 'hub-row-info');
    const name = el('div', 'hub-row-name', shortName(agent.label));
    const kind = agent.label.match(/\(([^)]+)\)/)?.[1];
    if (kind) name.appendChild(el('span', 'hub-row-kind', kind));
    const session = agent.loggedIn === true ? ['on', C.loggedIn] : agent.loggedIn === false ? ['off', C.loggedOut] : ['unknown', C.unknownLogin];
    const meta = el('div', `hub-row-meta ${session[0]}`, selected ? H.current(modelLabel(agent.id, state.model) ?? C.planDefault, C.efforts[state.effort] ?? '') : session[1]);
    info.append(name, meta);
    // the rest, on hover: version, use and the last error
    const stats = state.stats?.[agent.id];
    row.title = [session[1], agent.version && H.version(agent.version), stats?.runs ? H.stats(stats) : H.never, stats?.lastError && `${H.lastError}: ${stats.lastError}`].filter(Boolean).join(' · ');
    if (modeModel.tech && agent.path) info.appendChild(el('div', 'hub-row-dev', agent.path));

    const actions = el('div', 'hub-row-actions');
    if (agent.loggedIn !== false) {
      const running = state.testing?.[agent.id] === 'running';
      const result = state.testResult?.[agent.id];
      const test = button(`hub-row-test${running ? ' running' : ''}`, null, () => connection.testAgent(agent.id, H.testPrompt));
      if (running) test.appendChild(thinkingOrb(STEP_ORB.connect, { size: 20 }));
      else test.textContent = result ? (state.testing[agent.id] === 'ok' ? H.testOk(result.ms) : H.testFailed) : H.test;
      if (result && !running) test.classList.add(state.testing[agent.id] === 'ok' ? 'ok' : 'error');
      test.disabled = running;
      test.title = result?.error ?? H.testHint;
      actions.appendChild(test);
    }
    if (agent.loggedIn === false) {
      actions.appendChild(button('hub-row-main', C.login, () => connection.login(agent.id).then(() => setTimeout(() => connection.refresh(), 4000))));
    } else {
      const use = button(`hub-row-main${selected ? ' active' : ''}`, selected ? C.inUse : C.use, () => connection.select(agent.id));
      use.setAttribute('aria-pressed', String(selected));
      actions.appendChild(use);
    }
    row.append(logo, info, actions);
    return row;
  }

  function agentsSection(state) {
    const parts = [el('p', 'hub-intro', C.intro)]; // the sidebar header already says "Conecta tu agente"
    if (!state.isDesktop) return [...parts, el('p', 'hub-empty', C.desktopOnly)];
    const list = el('div', 'hub-rows');
    state.agents.forEach((a) => list.appendChild(agentRow(a, state)));
    if (!state.agents.length) list.appendChild(el('p', 'hub-empty', C.none));
    // the scripted demo: a quiet choice under the list, not a card like a real agent
    const demo = button(`hub-demo${state.selected ? '' : ' active'}`, state.selected ? `${C.use}: ${C.scripted}` : `${C.inUse}: ${C.scripted}`, () => connection.select(null));
    parts.push(el('h2', 'hub-section', H.agents), list, demo);
    return parts;
  }

  function compareSection(state) {
    const others = state.agents.filter((a) => a.id !== state.selected && a.loggedIn !== false);
    if (!state.selected || !others.length) return [];
    const row = el('div', 'hub-segmented');
    for (const [id, label] of [[null, H.compareNone], ...others.map((a) => [a.id, a.label.split(' (')[0]])]) {
      const b = el('button', `hub-btn hub-btn-compare${state.compareWith === id ? ' active' : ''}`, label);
      b.type = 'button';
      b.addEventListener('click', () => connection.setCompare(id));
      row.appendChild(b);
    }
    return [el('h2', 'hub-section', H.compare), el('p', 'hub-compare-intro', H.compareIntro), row];
  }

  function mcpSection(state) {
    const parts = [el('h2', 'hub-section', H.server), el('div', `hub-pill${state.mcp?.running ? ' on' : ''}`, state.mcp?.running ? H.running : H.stopped)];
    if (!state.mcp?.running || !state.mcp.url) return parts;
    parts.push(el('p', 'hub-url', C.mcpOn(mask(state.mcp.url, state.mcp.url))), el('p', 'hub-hint', C.mcpPrivate));
    const list = el('ul', 'hub-tools');
    for (const k of Object.keys(H.toolInfo)) {
      const li = el('li');
      li.append(el('strong', '', T[k] ?? k), el('span', 'hub-tool-desc', H.toolInfo[k]));
      list.appendChild(li);
    }
    parts.push(el('p', 'side-label', H.tools), list);
    return parts;
  }

  function activitySection(state) {
    const items = (state.activity ?? []).slice(0, 12);
    if (!items.length) return [el('h2', 'hub-section', H.activity), el('p', 'hub-empty', H.activityEmpty)];
    const list = el('div', 'hub-activity');
    for (const a of items) {
      const row = el('div', 'hub-activity-row');
      row.append(el('span', a.ok ? 'hub-dot-ok' : 'hub-dot-err'), el('span', 'hub-activity-tool', T[a.tool] ?? a.tool));
      if (a.path) row.appendChild(el('span', 'hub-activity-path', a.path));
      row.appendChild(el('span', 'hub-activity-ago', H.ago(Date.now() - a.at)));
      if (a.error) row.title = a.error;
      list.appendChild(row);
    }
    return [el('h2', 'hub-section', H.activity), list];
  }

  function snippetsSection(state) {
    if (!state.isDesktop) return [];
    const head = [el('h2', 'hub-section', C.fromEditor), el('p', 'hub-intro', C.fromEditorIntro)];
    if (!state.mcp?.running || !state.mcp.url) return [...head, el('p', 'hub-empty', C.mcpOff)];
    return [...head, ...snippets(state.mcp.url).map((s) => {
      const box = el('div', 'snippet');
      const top = el('div', 'snippet-head');
      const button = el('button', 'pill', C.copy);
      button.type = 'button';
      button.addEventListener('click', () => copy(button, s.code));
      top.append(el('span', '', C.snippets[s.key] ?? s.key), button);
      box.append(top, el('pre', '', mask(s.code, state.mcp.url)));
      return box;
    })];
  }

  function render() {
    const state = connection.store.state;
    const scroll = container.scrollTop;
    container.replaceChildren(...agentsSection(state), ...compareSection(state), ...mcpSection(state), ...activitySection(state), ...snippetsSection(state));
    container.scrollTop = scroll;
  }

  connection.store.subscribe(render, { immediate: true });
  modeModel.store.subscribe(render);
}
