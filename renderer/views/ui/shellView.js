// IDE shell: title bar (menus, Vibe/Dev toggle, search), icon rail with hover cards, sidebar
// (explorer as a guide or as the full tree, risks with "Reparar"), stage tabs, project map and status bar.
// Only draws ShellViewModel and forwards clicks to view model actions.
import { strings } from '../../i18n/es.js';
import { daysAgo } from '../../core/format.js';
import { createDevTree } from './devTreeView.js';
import { icon } from '../icons.js';
import { createFloatingMenu } from './floatingMenu.js';

const S = strings.shell;
const LEVEL_LABEL = strings.security.levels;
const RISK_ICON = {
  red: icon('alert'),
  yellow: icon('eye'),
};

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

// Hover card for icon buttons: name + one line of what it is for
function addTip(button, title, info) {
  button.setAttribute('aria-label', title);
  const tip = el('span', 'tip');
  tip.append(el('strong', '', title), el('small', '', info));
  button.appendChild(tip);
}

// auditViewModel / securityModel (optional): the security audit's score, history and "Auditar de nuevo"
export function createShellView({ shellViewModel: vm, modeModel, approval = null, repairViewModel, repairHistory, serversViewModel, actions, auditViewModel = null, securityModel = null }) {
  const $ = (id) => document.getElementById(id);
  const body = document.body;
  const devTree = createDevTree({
    onOpenFolder: (path) => vm.showFolder(path),
    onOpenFile: (path) => vm.showFile(path),
    onRepair: (path, button) => actions.repair(path, button),
    isRepairing: (path) => repairViewModel.isQueued(path),
  });

  // --- Menus (title bar). Items can be a function so they are rebuilt when the menu opens. ---
  const MENUS = [
    {
      key: 'file',
      items: () => [
        { label: S.actions.newProject, run: () => vm.newProject() },
        { label: S.actions.openProject, run: () => vm.openProject() },
        { separator: true, label: S.actions.openRecent },
        ...(vm.store.state.recent.length
          ? vm.store.state.recent.map((r) => ({ label: r.name, hint: r.root, run: () => vm.openRecent(r.root) }))
          : [{ label: S.actions.noRecent, disabled: true }]),
        { separator: true },
        { label: S.actions.closeProject, disabled: !vm.store.state.open, run: () => vm.closeProject() },
      ],
    },
  ];

  const menuBar = $('menu');
  let openMenu = null;
  const closeMenus = () => {
    openMenu?.classList.remove('open');
    openMenu = null;
  };
  for (const menu of MENUS) {
    const wrap = el('div', 'menu');
    const button = el('button', 'menu-button', S.menus[menu.key]);
    button.type = 'button';
    button.setAttribute('aria-haspopup', 'menu');
    const list = el('div', 'menu-list glass-pop');
    list.setAttribute('role', 'menu');
    const fill = () => list.replaceChildren(...menu.items().map((item) => {
      if (item.separator) return el('div', 'menu-sep', item.label ?? '');
      const entry = el('button', 'menu-item', item.label);
      entry.type = 'button';
      entry.disabled = Boolean(item.disabled);
      entry.setAttribute('role', 'menuitem');
      if (item.hint) entry.title = item.hint;
      entry.addEventListener('click', () => { closeMenus(); item.run(); });
      return entry;
    }));
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasOpen = openMenu === wrap;
      closeMenus();
      if (!wasOpen) {
        fill();
        wrap.classList.add('open');
        openMenu = wrap;
      }
    });
    wrap.append(button, list);
    menuBar.appendChild(wrap);
  }
  document.addEventListener('click', closeMenus);
  document.addEventListener('keydown', (e) => e.key === 'Escape' && closeMenus());

  $('search-label').textContent = S.search;
  $('search-shortcut').textContent = S.searchShortcut;
  $('brand-name').textContent = S.brand;

  // --- Vibe / Dev toggle (title bar and explorer header) ---
  function modeToggle(container) {
    container.replaceChildren();
    container.classList.add('mode-toggle');
    container.title = strings.mode.info;
    for (const mode of ['vibe', 'tech']) {
      const b = el('button', '', strings.mode[mode]);
      b.type = 'button';
      b.dataset.mode = mode;
      b.addEventListener('click', () => modeModel.set(mode));
      container.appendChild(b);
    }
  }
  modeToggle($('mode-toggle'));
  const explorerToggle = el('div');
  modeToggle(explorerToggle);
  $('sidebar-actions').appendChild(explorerToggle);
  $('sidebar-close').addEventListener('click', () => vm.toggleSidebar()); // "–" in the panel's header, like the chat's

  // --- Rail (icons with a hover card: name + what it is for) ---
  for (const button of document.querySelectorAll('#side-dock [data-side]')) {
    const side = button.dataset.side;
    addTip(button, S.rail[side], S.railInfo[side]);
    button.addEventListener('click', () => vm.setSide(side));
  }
  const stageButtons = [...document.querySelectorAll('[data-stage-button]')];
  for (const button of stageButtons) {
    const stage = button.dataset.stageButton;
    addTip(button, S.rail[stage], S.railInfo[stage]);
    button.addEventListener('click', () => {
      if (stage === 'map' && vm.store.state.stage === 'map') vm.showFolder('');
      vm.setStage(stage);
    });
  }
  // The chat opens from its own floating button (bottom-right), so the bar has no chat icon
  const chatButton = $('rail-chat');
  if (chatButton) {
    addTip(chatButton, S.rail.chat, S.railInfo.chat);
    chatButton.addEventListener('click', () => vm.toggleChat());
  }

  // --- Sidebar ---
  const sidebarTitle = $('sidebar-title');
  const sidebarBody = $('sidebar-body');

  // Folder or file icon, tinted by its traffic light (safe stays grey)
  const entryIcon = (name, level) => {
    const d = el('span', `entry-icon ${level}`);
    d.innerHTML = icon(name); // static icon
    d.title = LEVEL_LABEL[level];
    return d;
  };

  function counters(red, yellow) {
    const wrap = el('span', 'counters');
    if (red) wrap.appendChild(el('span', 'count red', String(red)));
    if (yellow) wrap.appendChild(el('span', 'count yellow', String(yellow)));
    return wrap;
  }

  // Vibe: a guide with friendly names, one sentence and tags per part
  function renderGuide(state) {
    const parts = [el('p', 'side-intro', S.explorerGuide)];
    for (const g of state.guide.filter((x) => x.depth === 0)) {
      const card = el('button', 'guide-card');
      card.type = 'button';
      const head = el('div', 'guide-head');
      head.append(entryIcon('folder', g.red ? 'red' : g.yellow ? 'yellow' : 'green'), el('strong', '', g.name), counters(g.red, g.yellow));
      card.append(head, el('span', 'guide-folder', `${g.folder}/`), el('p', 'guide-summary', g.summary));
      card.addEventListener('click', () => vm.showFolder(g.path));
      parts.push(card);
      const subs = state.guide.filter((x) => x.depth === 1 && x.path.startsWith(`${g.path}/`));
      if (subs.length) {
        const list = el('div', 'guide-subs');
        subs.forEach((sub) => {
          const row = el('button', 'guide-sub');
          row.type = 'button';
          row.title = sub.summary;
          row.append(entryIcon('folder', sub.red ? 'red' : sub.yellow ? 'yellow' : 'green'), el('span', '', sub.name), counters(sub.red, sub.yellow));
          row.addEventListener('click', () => vm.showFolder(g.path));
          list.appendChild(row);
        });
        parts.push(list);
      }
    }
    const loose = state.folders.find((f) => f.path === '');
    if (loose) {
      parts.push(el('p', 'side-label', S.allFiles));
      loose.files.slice(0, 30).forEach((f) => parts.push(fileRow(f)));
    }
    return parts;
  }

  function fileRow(file, depth = 0) {
    const row = el('button', 'side-row file');
    row.type = 'button';
    row.style.paddingLeft = `${8 + depth * 12}px`;
    row.append(entryIcon('file', file.level), el('span', 'side-name', file.name));
    row.title = file.path;
    row.addEventListener('click', () => vm.showFile(file.path));
    return row;
  }

  function renderExplorer(state) {
    if (!state.open) return [el('p', 'side-empty', S.sidebar.noProject)];
    return modeModel.tech ? devTree.render(state.tree) : renderGuide(state);
  }

  function repairButton(file) {
    const queued = repairViewModel.isQueued(file.path);
    const b = el('button', `pill repair${queued ? ' active' : ''}`);
    b.innerHTML = icon('wrench'); // static icon
    b.append(el('span', '', queued ? strings.repair.repairing : strings.repair.repair));
    b.type = 'button';
    b.disabled = queued;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      actions.repair(file.path, b);
    });
    return b;
  }

  // The audit: the project's score, when it was read, "Auditar de nuevo" and how the score moved
  const A = S.audit;
  function auditHead() {
    if (!auditViewModel?.available || !securityModel) return [];
    const sec = securityModel.store.state;
    const { status, last } = auditViewModel.store.state;
    const box = el('div', 'audit-head');
    const top = el('div', 'audit-top');
    const score = el('strong', `audit-score ${sec.counts?.red ? 'red' : sec.counts?.yellow ? 'yellow' : 'green'}`, sec.score == null ? '–' : `${sec.score}%`);
    const when = el('span', 'audit-when', status === 'auditing' ? A.auditing : sec.at ? A.when(strings.repair.history.ago(sec.at)) : A.never);
    const again = el('button', 'pill active', status === 'auditing' ? A.auditing : A.again);
    again.type = 'button';
    again.disabled = status === 'auditing';
    again.addEventListener('click', (e) => { e.stopPropagation(); auditViewModel.auditNow(); });
    top.append(score, el('span', 'audit-label', A.label), when, again);
    box.appendChild(top);
    if (status === 'error') box.appendChild(el('p', 'task-error', A.error));
    if (last) box.appendChild(el('p', 'side-summary', A.lastChange(last)));
    const history = (sec.history ?? []).slice(-8).reverse();
    if (history.length > 1) {
      const details = el('details', 'audit-history');
      details.appendChild(el('summary', '', A.history));
      const list = el('ol');
      history.forEach((h, i) => {
        const prev = history[i + 1];
        const delta = prev ? h.score - prev.score : 0;
        const row = el('li', delta > 0 ? 'up' : delta < 0 ? 'down' : '');
        row.append(
          el('strong', '', `${h.score}%`),
          el('span', 'audit-delta', delta ? `${delta > 0 ? '+' : ''}${delta}` : ''),
          el('span', '', `${A.causes[h.cause] ?? h.cause}${h.paths?.length ? ` · ${h.paths.map((p) => p.split('/').pop()).join(', ')}` : ''}`),
          el('small', '', strings.repair.history.ago(h.at)),
        );
        list.appendChild(row);
      });
      details.appendChild(list);
      box.appendChild(details);
    }
    return [box];
  }

  function renderRisks(state) {
    if (!state.open) return [el('p', 'side-empty', S.sidebar.noProject)];
    if (!state.risks.length) return [...auditHead(), el('p', 'side-empty', S.sidebar.noRisks)];
    const red = state.risks.filter((r) => r.level === 'red').length;
    return [
      ...auditHead(),
      el('p', 'side-summary', S.sidebar.risksSummary(red, state.risks.length - red)),
      ...state.risks.map((file) => {
        const card = el('div', `risk-card ${file.level}`);
        card.tabIndex = 0;
        const head = el('div', 'risk-head');
        const badge = el('span', `risk-icon ${file.level}`);
        badge.innerHTML = file.level === 'red' ? RISK_ICON.red : RISK_ICON.yellow; // static SVG, no project data
        head.append(badge, el('span', 'risk-level', LEVEL_LABEL[file.level]), repairButton(file));
        const first = file.findings?.[0];
        const reason = modeModel.tech
          ? (first ? strings.security.atLine(first.line, strings.security.techReasons[first.rule] ?? first.rule) : strings.security.techReasons[file.reasonKey] ?? file.reason)
          : file.reason || strings.security.reasons[file.reasonKey] || '';
        card.append(head, el('strong', 'risk-path', file.path), el('span', 'risk-reason', reason));
        // every finding of the audit with its line (the first one is already the reason)
        if (file.findings?.length > 1) {
          const list = el('ul', 'risk-findings');
          for (const f of file.findings) {
            const text = modeModel.tech ? strings.security.techReasons[f.rule] : strings.security.reasons[f.rule];
            list.appendChild(el('li', f.level, strings.security.atLine(f.line, text ?? f.rule)));
          }
          card.appendChild(list);
        }
        // a yellow finding the person looked at can be accepted as it is (red ones must be repaired)
        if (file.level === 'yellow' && file.by === 'audit' && auditViewModel?.available) {
          const ok = el('button', 'pill', A.accept);
          ok.type = 'button';
          ok.title = A.acceptTitle;
          ok.addEventListener('click', (e) => { e.stopPropagation(); auditViewModel.accept(file.path); });
          card.appendChild(ok);
        }
        card.addEventListener('click', () => vm.showFile(file.path));
        return card;
      }),
    ];
  }

  // --- Servers listening on this computer: exposed ones in yellow, local ones calm ---
  // Each row: one minimal icon (stop, or resume when paused) and a ⋯ button. The ⋯ menu is a single
  // floating layer (floatingMenu.js) anchored to that button, so the side panel never cuts it off.
  const SV = S.servers;
  const SERVER_ICON = { stop: icon('stop'), play: icon('play'), more: icon('more'), close: icon('close') };
  const serverMenu = createFloatingMenu({ id: 'server-menu', onDismiss: () => serversViewModel.closeMenu() });

  function iconButton(icon, label, onClick, { disabled = false, menuKey = null, expanded = false } = {}) {
    const b = el('button', `icon-btn${menuKey !== null ? ' more' : ''}`);
    b.type = 'button';
    b.innerHTML = SERVER_ICON[icon];
    b.title = label;
    b.setAttribute('aria-label', label);
    b.disabled = disabled;
    if (menuKey !== null) {
      b.dataset.menuKey = String(menuKey);
      b.setAttribute('aria-haspopup', 'menu');
      b.setAttribute('aria-controls', 'server-menu');
      b.setAttribute('aria-expanded', String(expanded));
      b.classList.toggle('active', expanded);
    }
    b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    return b;
  }

  // What the ⋯ menu offers for a running (or paused) server, and for a row in "Detenidos".
  // "Ver salida" only appears while its panel is closed; the panel closes with its own ×.
  const outputEntry = (key, outputKey, available) =>
    (available && outputKey !== key ? [{ label: SV.showOutput, icon: 'output', run: () => serversViewModel.showOutput(key) }] : []);

  function runningEntries(server, browsers, outputKey) {
    const s = serversViewModel;
    const output = outputEntry(server.port, outputKey, server.managed);
    if (server.paused) {
      return [
        { label: SV.resume, icon: 'play', run: () => s.resume(server.port), primary: true },
        ...output,
        { separator: true },
        { label: SV.stop, icon: 'stop', run: () => s.stop(server.port) },
      ];
    }
    return [
      { heading: SV.openWith },
      { label: SV.openDefault, icon: 'open', run: () => s.open(server.port, 'default') },
      ...browsers.map((b) => ({ label: b.name, icon: 'browser', run: () => s.open(server.port, b.id) })),
      { label: SV.openOther, icon: 'app', run: () => s.open(server.port, 'other') },
      { separator: true },
      ...output,
      { label: SV.pause, icon: 'pause', run: () => s.pause(server.port) },
      { label: SV.stop, icon: 'stop', run: () => s.stop(server.port) },
    ];
  }

  function stoppedEntries(row, outputKey) {
    const s = serversViewModel;
    const output = outputEntry(row.id, outputKey, row.hasOutput || row.state === 'starting');
    if (row.state === 'starting') {
      const cancel = { label: SV.cancelStart, icon: 'stop', run: () => s.cancelStart(row.id) };
      return output.length ? [...output, { separator: true }, cancel] : [cancel];
    }
    return [
      ...(row.canRestart ? [{ label: SV.restart, icon: 'play', run: () => s.restart(row.id), primary: true }] : []),
      ...output,
      { separator: true },
      { label: SV.forget, icon: 'remove', run: () => s.forget(row.id) },
    ];
  }

  // The output panel under a row (last lines, follows the end). A discreet × (visible on hover or focus)
  // or Esc inside it closes it.
  function outputPanel(key, label, { output }) {
    if (output?.key !== key) return [];
    const wrap = el('div', 'server-output-wrap');
    const pre = el('pre', 'server-output', output.text || SV.noOutput);
    pre.setAttribute('aria-label', label);
    pre.tabIndex = 0;
    pre.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      serversViewModel.closeOutput();
    });
    const close = el('button', 'server-output-close');
    close.type = 'button';
    close.innerHTML = SERVER_ICON.close;
    close.title = SV.closeOutput;
    close.setAttribute('aria-label', SV.closeOutput);
    close.addEventListener('click', (e) => { e.stopPropagation(); serversViewModel.closeOutput(); });
    wrap.append(pre, close);
    requestAnimationFrame(() => { pre.scrollTop = pre.scrollHeight; });
    return [wrap];
  }

  function menuEntries(key, { servers, stopped, browsers, demo }) {
    if (demo) return null;
    const outputKey = serversViewModel.store.state.output?.key;
    if (typeof key === 'number') {
      const server = servers.find((s) => s.port === key);
      return server ? runningEntries(server, browsers, outputKey) : null;
    }
    const row = stopped.find((r) => r.id === key);
    return row ? stoppedEntries(row, outputKey) : null;
  }

  // Shows, moves or hides the floating menu after every render of the side panel
  function syncServerMenu() {
    const state = serversViewModel.store.state;
    const shell = vm.store.state;
    if (state.openMenu === null || shell.side !== 'servers' || !shell.sidebarOpen) return serverMenu.hide();
    const anchor = [...sidebarBody.querySelectorAll('[data-menu-key]')].find((b) => b.dataset.menuKey === String(state.openMenu));
    const entries = menuEntries(state.openMenu, state);
    if (!anchor || !entries) {
      serverMenu.hide();
      serversViewModel.closeMenu(); // its row is gone
      return;
    }
    serverMenu.show(state.openMenu, anchor, entries);
  }

  function serverCard(server, state) {
    const { demo, openMenu, busy } = state;
    const card = el('div', `risk-card server-card${server.exposed ? ' yellow' : ''}${server.paused ? ' paused' : ''}`);
    const head = el('div', 'risk-head');
    if (server.exposed) {
      const badge = el('span', 'risk-icon yellow');
      badge.innerHTML = RISK_ICON.yellow; // static SVG, no server data
      head.append(badge);
    }
    const level = el('span', 'risk-level', server.exposed ? SV.network : SV.local);
    if (server.exposed) level.title = modeModel.tech ? SV.exposedReasonTech(server.address) : SV.exposedReason; // on hover only
    head.append(level);
    if (server.paused) head.append(el('span', 'server-chip', SV.pausedChip));
    if (server.managed) {
      const chip = el('span', 'server-chip managed', SV.managedChip);
      chip.title = SV.managedTitle;
      head.append(chip);
    }
    if (demo) head.append(el('span', 'server-demo', SV.demo));
    else {
      const waiting = busy.includes(server.port);
      const box = el('div', 'server-actions');
      box.append(
        server.paused
          ? iconButton('play', SV.resumeTitle(server.port), () => serversViewModel.resume(server.port), { disabled: waiting })
          : iconButton('stop', SV.stopTitle(server.port), () => serversViewModel.stop(server.port), { disabled: waiting }),
        iconButton('more', SV.more(server.port), () => serversViewModel.toggleOpenMenu(server.port), { disabled: waiting, menuKey: server.port, expanded: openMenu === server.port }),
      );
      head.append(box);
    }
    const name = el('strong', 'risk-path', `:${server.port}`);
    name.append(el('span', 'server-process', ` · ${server.process ?? SV.unknownProcess}`));
    card.append(head, name);
    if (modeModel.tech && server.address) card.append(el('span', 'server-address', server.address));
    if (server.paused) card.append(el('span', 'risk-reason', SV.pausedReason));
    card.append(...outputPanel(server.port, SV.outputLabel(server.port), state));
    return card;
  }

  const clock = (at) => new Date(at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });

  // A row in "Detenidos": stopped by the person, starting again inside Qubbot, or closed on its own
  function stoppedCard(row, state) {
    const { openMenu, busy } = state;
    const starting = row.state === 'starting';
    const card = el('div', `risk-card server-card stopped ${row.state}`);
    const head = el('div', 'risk-head');
    const chip = { stopped: SV.stoppedChip, starting: SV.startingChip, exited: SV.exitedChip }[row.state];
    const detail = starting ? SV.startingDetail(row.port) : row.state === 'exited' ? SV.exitedDetail(row.exitCode, clock(row.at)) : SV.stoppedAt(clock(row.at));
    head.append(el('span', `server-chip ${row.state}`, chip), el('span', 'risk-level', detail));
    const waiting = busy.includes(row.id);
    const box = el('div', 'server-actions');
    if (starting) box.append(iconButton('stop', SV.cancelStartTitle(row.port), () => serversViewModel.cancelStart(row.id), { disabled: waiting }));
    else if (row.canRestart) box.append(iconButton('play', SV.restartTitle(row.port), () => serversViewModel.restart(row.id), { disabled: waiting }));
    box.append(iconButton('more', SV.more(row.port), () => serversViewModel.toggleOpenMenu(row.id), { disabled: waiting, menuKey: row.id, expanded: openMenu === row.id }));
    head.append(box);
    const name = el('strong', 'risk-path', `:${row.port}`);
    name.append(el('span', 'server-process', ` · ${row.process ?? SV.unknownProcess}`));
    card.append(head, name);
    if (row.state === 'exited') card.append(el('span', 'risk-reason', SV.exitedReason));
    else if (!row.canRestart && !starting) card.append(el('span', 'risk-reason', SV.cannotRestart));
    card.append(...outputPanel(row.id, SV.outputLabel(row.port), state));
    return card;
  }

  function renderServers() {
    const state = serversViewModel.store.state;
    const { status, servers, stopped, error, demo, empty, exposed, notice } = state;
    const parts = [el('p', 'side-intro', demo ? SV.demoNote : SV.intro)];
    if (notice) {
      const box = el('p', `server-notice ${notice.tone}`, notice.text);
      const close = el('button', 'server-notice-close', '×');
      close.type = 'button';
      close.setAttribute('aria-label', SV.dismiss);
      close.addEventListener('click', () => serversViewModel.dismissNotice());
      box.append(close);
      parts.push(box);
    }
    const stoppedPart = stopped.length ? [el('p', 'side-label', SV.stoppedTitle), ...stopped.map((r) => stoppedCard(r, state))] : [];
    if (status === 'idle' || status === 'loading') return [...parts, el('p', 'side-empty', SV.loading)];
    if (status === 'error') return [...parts, el('p', 'side-empty', error || SV.error), ...stoppedPart];
    if (empty) return [...parts, el('p', 'side-empty', SV.empty), ...stoppedPart];
    return [...parts, el('p', 'side-summary', SV.summary(servers.length, exposed)), ...servers.map((s) => serverCard(s, state)), ...stoppedPart];
  }

  // The menu closes with a click outside, Esc or a window resize; it follows its button when the panel
  // scrolls, and closes if the button scrolls out of sight
  document.addEventListener('click', (e) => { if (!serverMenu.contains(e.target)) serversViewModel.closeMenu(); });
  document.addEventListener('keydown', (e) => e.key === 'Escape' && serversViewModel.closeMenu());
  window.addEventListener('resize', () => serversViewModel.closeMenu());
  let menuFrame = 0;
  sidebarBody.addEventListener('scroll', () => {
    if (serversViewModel.store.state.openMenu === null || menuFrame) return;
    menuFrame = requestAnimationFrame(() => {
      menuFrame = 0;
      const anchor = serverMenu.anchor;
      if (!anchor) return;
      const a = anchor.getBoundingClientRect();
      const box = sidebarBody.getBoundingClientRect();
      if (a.bottom < box.top || a.top > box.bottom) serversViewModel.closeMenu();
      else serverMenu.position();
    });
  }, { passive: true });

  // --- Repair history: a task list of what Qubi and the agent did ---
  const H = strings.repair.history;
  const expanded = new Set(); // entries opened by the person (the newest unfinished one opens by itself)

  function repairEntry(entry, isNewest) {
    const open = expanded.has(entry.id) || (isNewest && entry.status !== 'verified');
    const card = el('article', `task-card ${entry.status}${open ? ' open' : ''}`);
    const head = el('button', 'task-head');
    head.type = 'button';
    head.setAttribute('aria-expanded', String(open));
    head.append(
      el('span', `task-status ${entry.status}`, H.status[entry.status]),
      el('strong', 'task-path', entry.path),
      el('span', 'task-meta', `${H.by(entry.agent)} · ${H.ago(entry.endedAt ?? entry.startedAt)}`),
    );
    head.addEventListener('click', () => {
      if (open) expanded.delete(entry.id); else expanded.add(entry.id);
      render(vm.store.state);
    });
    card.appendChild(head);
    if (!open) return card;

    const body = el('div', 'task-body');
    if (entry.reason) body.appendChild(el('p', 'task-reason', entry.reason));
    if (entry.changes.length) {
      body.appendChild(el('p', 'side-label', H.changes));
      for (const change of entry.changes) {
        const row = el('div', `task-change${change.undone ? ' undone' : ''}`);
        row.append(el('strong', 'mono', change.path + (change.created ? ` · ${H.created}` : '')), el('span', '', change.reason));
        if (change.backup && !change.undone) {
          const undo = el('button', 'pill', strings.repair.undo);
          undo.type = 'button';
          undo.addEventListener('click', () => repairViewModel.undo(entry.id, change));
          row.appendChild(undo);
        } else if (change.undone) row.appendChild(el('span', 'task-undone', strings.repair.undone));
        body.appendChild(row);
      }
    }
    if (entry.plan.length) {
      body.appendChild(el('p', 'side-label', H.plan));
      const list = el('ol', 'task-plan');
      entry.plan.forEach((step) => list.appendChild(el('li', '', step)));
      body.appendChild(list);
    }
    if (entry.summary) {
      const details = el('details', 'task-summary');
      details.append(el('summary', '', H.explanation), el('p', '', entry.summary));
      body.appendChild(details);
    }
    if (entry.error || entry.interrupted) body.appendChild(el('p', 'task-error', entry.interrupted ? H.interrupted : entry.error));
    if (entry.stillRisky && entry.status !== 'verified') body.appendChild(el('p', 'task-error', entry.stillRisky));
    if (entry.verifiedBy === 'audit') body.appendChild(el('p', 'task-reason', H.byAudit(entry.audit?.score)));
    const buttons = el('div', 'task-actions');
    const button = (label, run, primary = false) => {
      const b = el('button', `pill${primary ? ' active' : ''}`, label);
      b.type = 'button';
      b.addEventListener('click', (e) => run(e.currentTarget));
      buttons.appendChild(b);
    };
    if (entry.status === 'fixed' || entry.status === 'planned') button(repairViewModel.audited ? strings.repair.auditAgain : H.verify, () => repairViewModel.markFixed(entry.id), true);
    if (entry.status === 'failed') button(H.retry, (b) => actions.repair(entry.path, b), true);
    button(H.open, () => vm.showFile(entry.path));
    body.appendChild(buttons);
    card.appendChild(body);
    return card;
  }

  function renderRepairs() {
    const { entries } = repairHistory.store.state;
    if (!entries.length) return [el('p', 'side-intro', H.intro), el('p', 'side-empty', H.empty)];
    const parts = [el('p', 'side-intro', H.intro)];
    if (entries.some((e) => e.status !== 'working' && e.status !== 'queued')) {
      // On its own row above the cards, so it never reads as part of the first one
      const bar = el('div', 'repairs-bar');
      const clear = el('button', 'repairs-clear', H.clear);
      clear.type = 'button';
      clear.addEventListener('click', () => repairHistory.clearFinished());
      bar.appendChild(clear);
      parts.push(bar);
    }
    entries.forEach((entry, i) => parts.push(repairEntry(entry, i === 0)));
    return parts;
  }

  // --- Stage tabs (map / git) with icon, badge and hover card ---
  const tabs = [...document.querySelectorAll('.icon-bar [data-stage]')]; // map and git on top, the rest in the side dock
  for (const tab of tabs) tab.addEventListener('click', () => vm.setStage(tab.dataset.stage));

  function renderTabs(state) {
    const cracked = state.guide.filter((g) => g.depth === 0 && g.red).length;
    const info = {
      map: [S.rail.map, S.tabInfo.map(state.guide.filter((g) => g.depth === 0).length, cracked), cracked],
      git: [S.rail.git, S.railInfo.git, 0],
    };
    for (const tab of tabs) {
      const [title, text, badge] = info[tab.dataset.stage];
      const active = tab.dataset.stage === state.stage;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
      const em = tab.querySelector('.tab-badge');
      // Totals live in the HUD only: no repeated badges on the view tabs
      em.textContent = '';
      em.hidden = true;
      tab.querySelector('.tip').replaceChildren(el('strong', '', title), el('small', '', state.open ? text : S.status.noProject));
    }
  }

  // --- Empty state: recent projects (all the ones kept, most recent first, with when they were opened) ---
  const emptyRecent = $('empty-recent');
  function renderRecent(state) {
    const label = el('p', 'empty-label', S.recent);
    if (!state.recent.length) return emptyRecent.replaceChildren(label, el('p', 'empty-none', strings.emptyState.recentNone));
    emptyRecent.replaceChildren(label, ...state.recent.map((r) => {
      const b = el('button', 'recent-row');
      b.type = 'button';
      b.title = r.root;
      const tile = el('span', 'recent-tile');
      tile.innerHTML = icon('folder'); // static icon
      const days = daysAgo(r.at);
      b.append(tile, el('strong', '', r.name), el('span', 'recent-path', r.root.replace(/^\/Users\/[^/]+/, '~')));
      if (days !== null) b.append(el('span', 'recent-when', strings.emptyState.when(days)));
      b.addEventListener('click', () => vm.openRecent(r.root));
      return b;
    }));
  }

  // --- Status bar ---
  const status = $('status-items'); // the breadcrumb (panelsView) sits before these items

  function render(state) {
    body.classList.toggle('sidebar-closed', !state.sidebarOpen);
    body.classList.toggle('no-project', !state.open); // start screen: only the empty card and the chat
    body.classList.toggle('chat-closed', !state.chatOpen);
    body.classList.toggle('mode-tech', modeModel.tech);
    for (const button of document.querySelectorAll('#side-dock [data-side]')) {
      button.classList.toggle('active', state.sidebarOpen && button.dataset.side === state.side);
    }
    chatButton?.classList.toggle('active', state.chatOpen);
    for (const button of stageButtons) button.classList.toggle('active', button.dataset.stageButton === state.stage);
    for (const b of document.querySelectorAll('.mode-toggle button')) b.classList.toggle('active', b.dataset.mode === modeModel.store.state.mode);
    body.classList.toggle('stage-git', state.stage === 'git');
    renderTabs(state);
    renderRecent(state);

    sidebarTitle.textContent = S.sidebar[state.side];
    explorerToggle.hidden = state.side !== 'explorer';
    const agentView = state.side === 'agent';
    sidebarBody.hidden = agentView;
    $('agent-connect').hidden = !agentView;
    if (!agentView) {
      const scroll = sidebarBody.scrollTop;
      const views = { risks: renderRisks, repairs: renderRepairs, servers: renderServers, explorer: renderExplorer };
      const nodes = (views[state.side] ?? renderExplorer)(state);
      // The Dev tree keeps its own root: re-inserting it would drop the focus of its search box
      const same = nodes.length === sidebarBody.childNodes.length && nodes.every((n, i) => n === sidebarBody.childNodes[i]);
      if (!same) sidebarBody.replaceChildren(...nodes);
      sidebarBody.scrollTop = scroll;
    }
    syncServerMenu();

    // Repairs waiting for the person (to verify) show a badge on the rail
    const pending = repairHistory.store.state.entries.filter((e) => e.status === 'fixed' || e.status === 'planned').length;
    const badge = $('rail-repairs-badge');
    if (badge) { // only while a repairs button exists
      badge.hidden = !pending;
      badge.textContent = String(pending);
    }

    const { red, yellow, green } = state.counts;
    $('project-chip').hidden = !state.open;
    $('project-chip-name').textContent = state.projectName || strings.map.defaultProjectName;
    $('project-chip').classList.toggle('danger', red > 0);
    const job = repairViewModel.store.state.job;
    status.replaceChildren(
      ...(state.open ? [] : [el('span', 'status-strong', S.status.noProject)]), // when open, the breadcrumb names it
      ...(job ? [el('span', 'status-qubi', `${strings.repair.name}: ${(job.source === 'agent' ? strings.repair.stepsAgent(job.agentLabel) : strings.repair.steps)[job.step]}`)] : []),
      el('span', 'status-mode', `${strings.mode.title}: ${strings.mode[modeModel.store.state.mode]}`),
      // Only when changes are not approved one by one, so the person always knows
      ...(approval && approval.store.state.mode !== 'manual'
        ? [el('span', `status-perm ${approval.store.state.mode}`, strings.chat.permissions.status(strings.chat.permissions.names[approval.store.state.mode]))]
        : []),
      el('span', 'status-agent', S.status.agent),
    );
  }

  // The sidebar animates its content only when the view changes (not on every score update)
  vm.store.subscribe((state, previous) => {
    render(state);
    if (!previous || previous.side !== state.side) {
      for (const node of [sidebarBody, sidebarTitle, $('agent-connect')]) {
        node.classList.remove('enter');
        void node.offsetWidth; // restart the CSS animation
        node.classList.add('enter');
      }
    }
  }, { immediate: true });
  modeModel.store.subscribe(() => render(vm.store.state));
  approval?.store.subscribe(() => render(vm.store.state));
  repairViewModel.store.subscribe(() => render(vm.store.state));
  repairHistory.store.subscribe(() => render(vm.store.state));
  auditViewModel?.store.subscribe(() => (vm.store.state.side === 'risks' ? render(vm.store.state) : null));
  securityModel?.store.subscribe(() => (vm.store.state.side === 'risks' ? render(vm.store.state) : null));
  serversViewModel.store.subscribe(() => (vm.store.state.side === 'servers' ? render(vm.store.state) : syncServerMenu()));
}
