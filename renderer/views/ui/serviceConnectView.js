// "Fuera de conexión: Stripe" (docs/features/servicios/README.md): how to let the person's agent work with
// a service the project uses, in plain words. Two tabs: with its CLI (install, sign in, the official
// guide) and with MCP for the agent chosen in the chat (its command and the official MCP page). Footer:
// "Ya lo conecté" asks main again; "Ahora no" closes. Everything comes from servicesViewModel.connectInfo;
// the view only paints it. Accessible: aria-modal, the focus stays inside, Escape closes, and the focus
// goes back where it was.
import { strings } from '../../i18n/es.js';
import { icon } from './icons.js';
import { serviceMark } from './chatCardsView.js';

const S = strings.services;

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function createServiceConnectView({ servicesViewModel: vm, container = document.body }) {
  const backdrop = el('div', 'svc-backdrop');
  backdrop.hidden = true;
  const dialog = el('div', 'svc-modal');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'svc-title');
  dialog.setAttribute('aria-describedby', 'svc-intro');
  backdrop.appendChild(dialog);
  container.appendChild(backdrop);

  let tab = 'cli'; // view state: the tab on screen
  let shownKey = null;
  let returnFocus = null;

  // A button that keeps its place in the focus order across repaints (data-fid)
  const button = (fid, className, label, onClick, iconName = null) => {
    const b = el('button', className);
    b.type = 'button';
    b.dataset.fid = fid;
    if (iconName) b.appendChild(icon(iconName, { size: 15 }));
    b.appendChild(el('span', '', label));
    b.addEventListener('click', onClick);
    return b;
  };

  // A command on one line, with its "Copiar" button (it says "Copiado" for a moment)
  function commandRow(fid, command, copied) {
    const row = el('div', 'svc-command');
    const code = el('code', '', command);
    code.title = command;
    const done = copied === command;
    const copy = button(fid, `svc-copy${done ? ' done' : ''}`, done ? S.copied : S.copy, () => vm.copy(command), done ? 'ok' : null);
    copy.setAttribute('aria-label', `${done ? S.copied : S.copy}: ${command}`);
    row.append(code, copy);
    return row;
  }

  const linkButton = (fid, label, url) => button(fid, 'svc-link', label, () => vm.openLink(url), 'openExternal');

  function cliPanel(info, copied) {
    const panel = el('section', 'svc-panel');
    panel.appendChild(el('p', 'svc-lead', S.cliIntro(info.name)));
    if (info.cli.steps.length) {
      const list = el('ol', 'svc-steps');
      info.cli.steps.forEach((step, i) => {
        const item = el('li', 'svc-step');
        const body = el('div', 'svc-step-body');
        body.append(el('strong', '', step.label), commandRow(`cli-copy-${step.id}`, step.command, copied));
        item.append(el('span', 'svc-step-num', String(i + 1)), body);
        list.appendChild(item);
      });
      panel.appendChild(list);
    }
    if (info.cli.docs) panel.appendChild(linkButton('cli-guide', S.openGuide, info.cli.docs));
    return panel;
  }

  function mcpPanel(info, copied) {
    const panel = el('section', 'svc-panel');
    if (!info.mcp) {
      panel.appendChild(el('p', 'svc-muted', S.noMcp));
      return panel;
    }
    const { mcp } = info;
    panel.appendChild(el('p', 'svc-lead', S.mcpIntro(mcp.agentName)));
    // Which agent the command is for: the chat's, or another one the person picks here
    const agents = el('div', 'svc-agents');
    agents.setAttribute('role', 'radiogroup');
    agents.setAttribute('aria-label', S.tabs.mcp);
    for (const a of mcp.agents) {
      const b = button(`agent-${a}`, `svc-agent${a === mcp.agent ? ' on' : ''}${mcp.ready.includes(a) ? '' : ' none'}`, S.agents[a], () => vm.setAgent(a));
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(a === mcp.agent));
      b.prepend(serviceMark(a, S.agents[a], 'svc-agent-logo'));
      agents.appendChild(b);
    }
    panel.appendChild(agents);
    if (mcp.command) panel.appendChild(commandRow('mcp-copy', mcp.command, copied));
    else panel.appendChild(el('p', 'svc-muted', mcp.missing));
    if (mcp.docs) panel.appendChild(linkButton('mcp-page', S.openMcp, mcp.docs));
    return panel;
  }

  function paint(state) {
    const info = vm.connectInfo(state.open);
    // the CLI tab only when the catalog has one; MCP always (it says when there is no official one);
    // a service the catalog does not know gets neither, only its explanation
    const ids = info.cli ? ['cli', 'mcp'] : info.mcp ? ['mcp'] : [];
    if (info.key !== shownKey || !ids.includes(tab)) {
      shownKey = info.key;
      tab = ids[0] ?? null;
    }
    const focused = dialog.contains(document.activeElement) ? document.activeElement.dataset?.fid : null;

    const head = el('header', 'svc-head');
    const titles = el('div', 'svc-titles');
    const title = el('h2', 'svc-title', info.title);
    title.id = 'svc-title';
    titles.append(title, el('span', `svc-pill ${info.state}`, S.state[info.state] ?? S.state.unknown));
    const close = button('close', 'svc-close', '', () => vm.close(), 'close');
    close.setAttribute('aria-label', S.modal.close);
    close.title = S.modal.close;
    head.append(serviceMark(info.key, info.name, 'svc-logo'), titles, close);

    const intro = el('p', 'svc-intro', info.intro);
    intro.id = 'svc-intro';
    const parts = [head, intro];
    if (info.evidence.length) parts.push(el('p', 'svc-evidence', `${S.evidence}: ${info.evidence.join(' · ')}`));

    // Tabs: arrows move between them, as WAI-ARIA tabs do
    const tabs = el('div', 'svc-tabs');
    tabs.setAttribute('role', 'tablist');
    for (const id of ids) {
      const t = button(`tab-${id}`, `svc-tab${tab === id ? ' on' : ''}`, S.tabs[id], () => { tab = id; paint(vm.store.state); });
      t.setAttribute('role', 'tab');
      t.id = `svc-tab-${id}`;
      t.setAttribute('aria-selected', String(tab === id));
      t.setAttribute('aria-controls', 'svc-tabpanel');
      t.tabIndex = tab === id ? 0 : -1;
      t.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        tab = ids[(ids.indexOf(id) + 1) % ids.length];
        paint(vm.store.state);
        dialog.querySelector(`[data-fid="tab-${tab}"]`)?.focus();
      });
      tabs.appendChild(t);
    }
    if (tab) {
      const panel = tab === 'cli' ? cliPanel(info, state.copied) : mcpPanel(info, state.copied);
      panel.id = 'svc-tabpanel';
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', `svc-tab-${tab}`);
      parts.push(tabs, panel);
    }

    const notice = el('p', `svc-notice${state.notice ? ` ${state.notice.tone}` : ''}`, state.notice?.text ?? '');
    notice.setAttribute('role', 'status');
    notice.hidden = !state.notice;
    parts.push(notice);

    const foot = el('footer', 'svc-foot');
    if (info.dashboard) foot.appendChild(linkButton('dashboard', S.openDashboard, info.dashboard));
    foot.appendChild(el('span', 'svc-spacer'));
    foot.appendChild(button('later', 'svc-later', S.later, () => vm.close()));
    const done = button('done', 'svc-done', state.checking ? S.checking : S.done, () => vm.refresh(), state.checking ? null : 'ok');
    done.disabled = state.checking;
    foot.appendChild(done);
    parts.push(foot);

    dialog.replaceChildren(...parts);
    dialog.setAttribute('aria-busy', String(state.checking));
    // the focus stays on the same control after a repaint (a copy, a tab, "Comprobando…")
    const again = focused && dialog.querySelector(`[data-fid="${focused}"]:not([disabled])`);
    if (again) again.focus();
    else if (focused) dialog.querySelector('[data-fid="later"]')?.focus();
  }

  function show(state) {
    const opening = backdrop.hidden;
    if (opening) returnFocus = document.activeElement;
    backdrop.hidden = false;
    paint(state);
    if (opening) (dialog.querySelector('[role="tab"][aria-selected="true"]') ?? dialog.querySelector('[data-fid="done"]'))?.focus();
  }

  function hide() {
    if (backdrop.hidden) return;
    backdrop.hidden = true;
    dialog.replaceChildren();
    shownKey = null;
    if (returnFocus?.isConnected) returnFocus.focus();
    returnFocus = null;
  }

  // Escape closes; Tab never leaves the dialog
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // the map's Escape (go back up) must not fire too
      vm.close();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = [...dialog.querySelectorAll(FOCUSABLE)].filter((n) => n.tabIndex >= 0 && !n.closest('[hidden]'));
    if (!items.length) return;
    const first = items[0], last = items.at(-1);
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    else if (!dialog.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  });
  // A click on the dimmed area outside closes it, like "Ahora no"
  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) vm.close(); });

  vm.store.subscribe((state, previous) => {
    if (!state.open) return hide();
    const changed = !previous || ['open', 'catalog', 'agent', 'checking', 'notice', 'copied', 'services'].some((k) => state[k] !== previous[k]);
    if (changed || backdrop.hidden) show(state);
  }, { immediate: true });

  return { element: backdrop };
}
