// Interactive cards in the chat for map events (ChatViewModel `card`): a folder (its traffic light as a
// bar, counts, a hint and next steps) or a file (path, level, reason, who marked it, actions).
// Buttons call vm.choose(action, button), like the chips.
import { strings } from '../../i18n/es.js';
import { icon } from './icons.js';
import { tourCard } from './tourCardView.js';
import { delayedOrb } from './runCardView.js';
import { BRANDS } from '../../icons/brands.js';

const K = strings.chat.cards;
const LEVELS = ['red', 'yellow', 'green'];
const LEVEL_ICON = { red: 'danger', yellow: 'shieldWarn', green: 'shieldOk' };

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

export const CHIP_ICON = { ask: 'ask', repair: 'wrench', audit: 'audit', locate: 'locate', risks: 'alert', open: 'openExternal', reveal: 'folderOpen', tour: 'route', tourNext: 'arrowRight', tourPrev: 'arrowLeft', tourExit: 'close', edit: 'improve', connect: 'plug' };

export function actionButton(action, vm, className = 'card-action') {
  const b = el('button', `${className} ${action.kind ?? ''}`.trim());
  b.type = 'button';
  if (action.kind === 'repair') b.dataset.gesture = 'never'; // the hand cursor never selects it (spec/003-hand-gestures.md, B20)
  b.append(icon(CHIP_ICON[action.kind] ?? 'arrowRight', { size: 15 }), el('span', '', action.label));
  b.addEventListener('click', () => vm.choose(action, b));
  return b;
}

function folderCard(card, vm) {
  const total = LEVELS.reduce((n, l) => n + card.counts[l], 0);
  const head = el('header', 'card-head');
  const badge = el('span', 'card-badge folder');
  badge.appendChild(icon('folder', { size: 18 }));
  const title = el('div', 'card-title');
  title.append(el('strong', '', card.name), el('span', '', `${K.files(card.files)} · ${K.folders(card.folders)}`));
  head.append(badge, title);
  const parts = [head];
  if (total) {
    const bar = el('div', 'level-bar');
    bar.setAttribute('role', 'img');
    bar.setAttribute('aria-label', LEVELS.map((l) => `${card.counts[l]} ${K.levels[l]}`).join(', '));
    LEVELS.filter((l) => card.counts[l]).forEach((l, i) => {
      const seg = el('i', l);
      seg.style.flexGrow = String(card.counts[l]);
      seg.style.setProperty('--i', String(i));
      bar.appendChild(seg);
    });
    const legend = el('ul', 'level-legend');
    LEVELS.forEach((l) => {
      const li = el('li', `${l}${card.counts[l] ? '' : ' zero'}`);
      li.append(el('b', '', String(card.counts[l])), el('span', '', K.levels[l]));
      legend.appendChild(li);
    });
    parts.push(bar, legend);
  }
  parts.push(el('p', 'card-hint', card.hint));
  return parts;
}

// Modo Vibe: what the file is and where it lives, in plain words; no path, no code
function plainFileCard(card) {
  const K = strings.chat.cards;
  const head = el('header', 'card-head');
  const badge = el('span', `card-badge ${card.level}`);
  badge.appendChild(icon(LEVEL_ICON[card.level] ?? 'file', { size: 18 }));
  const title = el('div', 'card-title');
  title.append(el('strong', '', card.name), el('span', 'card-kind', K.kinds[card.fileKind] ?? K.kinds.other));
  head.append(badge, title, el('span', `level-pill ${card.level}`, strings.security.levels?.[card.level] ?? card.level));
  const facts = [card.where && K.where(card.where), card.level !== 'grey' && card.reason].filter(Boolean); // the pill already says "Sin evaluar"
  return facts.length ? [head, el('p', 'card-facts', facts.join(' · '))] : [head];
}

function fileCard(card) {
  const head = el('header', 'card-head');
  const badge = el('span', `card-badge ${card.level}`);
  badge.appendChild(icon(LEVEL_ICON[card.level] ?? 'file', { size: 18 }));
  const title = el('div', 'card-title');
  title.appendChild(el('strong', '', card.name));
  if (card.path !== card.name) title.appendChild(el('code', 'card-path', card.path)); // a file at the top needs no path
  const pill = el('span', `level-pill ${card.level}`, strings.security.levels?.[card.level] ?? card.level);
  head.append(badge, title, pill);
  const parts = [head];
  if (card.reason) parts.push(el('p', 'card-reason', card.reason));
  const source = el('p', 'card-source');
  source.append(icon('info', { size: 13 }), el('span', '', card.source));
  parts.push(source);
  if (card.preview) parts.push(previewBlock(card));
  return parts;
}

// The first lines of a file opened from the chat (or why they are not shown)
function previewBlock(card) {
  const P = strings.chat.cards.preview;
  if (typeof card.preview === 'string') return el('p', `card-preview-note ${card.preview}`, P[card.preview]);
  const box = el('figure', 'card-preview');
  box.setAttribute('aria-label', P.label(card.name));
  const pre = el('pre');
  card.preview.lines.forEach((line, i) => {
    const row = el('span', 'code-line');
    row.append(el('i', '', String(i + 1)), document.createTextNode(line || ' ')); // text only: never parsed as HTML
    pre.appendChild(row);
  });
  box.appendChild(pre);
  if (card.preview.more) box.appendChild(el('figcaption', '', P.more(card.preview.more)));
  return box;
}

// Files saved on disk (by the agent, Qubi or another program): one button per file opens it here
function changesCard(card) {
  const head = el('header', 'card-head');
  const badge = el('span', 'card-badge changes');
  badge.appendChild(icon('file', { size: 18 }));
  const title = el('div', 'card-title');
  title.appendChild(el('strong', '', strings.chat.cards.changes(card.paths.length)));
  const hidden = card.paths.length - card.actions.length;
  if (hidden > 0) title.appendChild(el('span', '', strings.chat.cards.changesMore(hidden)));
  head.append(badge, title);
  return [head];
}

// Where the robot landed (dragged or thrown onto a folder, or the plaza): what the place is in plain
// words as the title, its path and size below, what lives there, its risks and what to do now
function placeCard(card) {
  const P = strings.robot.chat;
  const head = el('header', 'card-head');
  const badge = el('span', `card-badge place ${card.level}`);
  badge.appendChild(icon('bot', { size: 18 }));
  const title = el('div', 'card-title');
  title.append(el('small', 'place-eyebrow', P.here), el('strong', '', card.title), el('span', 'place-where', card.where));
  head.append(badge, title);
  const status = el('span', `place-status ${card.level}`, card.risks || P.allGood);
  head.appendChild(status);
  return [head, el('p', 'card-hint', card.summary), el('p', 'place-question', card.question)];
}

// A call with Qubi (callViewModel keeps it up to date in place): status and duration, the last lines
// of the conversation, and what Qubi asked the person's agent to do. Text only: never parsed as HTML.
const CALL_LINES = 6;
function callCard(card) {
  const C = strings.call;
  const head = el('header', 'card-head');
  const badge = el('span', `card-badge call ${card.status}`);
  badge.appendChild(icon(card.status === 'ended' || card.status === 'error' ? 'callEnd' : 'call', { size: 18 }));
  const title = el('div', 'card-title');
  const statusText = card.status === 'connecting' ? C.state.connecting
    : card.status === 'ended' ? C.state.ended
      : card.status === 'error' ? C.errors[card.error] ?? C.errors.failed
        : C.state.listening;
  const seconds = card.startedAt ? Math.max(0, Math.round(((card.endedAt ?? Date.now()) - card.startedAt) / 1000)) : null;
  const line = el('span', '', statusText);
  if (seconds != null && card.status !== 'connecting') {
    // while live, chatView's 1 s timer keeps the duration counting (the card repaints only on changes)
    const time = el('span', 'call-time', C.card.duration(seconds));
    if (card.status === 'live') { time.dataset.live = ''; time.dataset.start = String(card.startedAt); }
    line.append(' · ', time);
  }
  title.append(el('strong', '', C.card.title), line);
  head.append(badge, title);
  if (card.simulated) head.appendChild(el('span', 'call-sim-tag', C.state.simulated));
  const parts = [head];
  const lines = (card.lines ?? []).slice(-CALL_LINES);
  if (lines.length) {
    const list = el('div', 'call-lines');
    for (const line of lines) {
      const row = el('p', `call-line ${line.who}`);
      // a system line (a permission granted or denied…) is a muted note, with no speaker
      if (line.who === 'system') row.appendChild(el('span', '', line.text));
      else row.append(el('b', '', `${line.who === 'qubi' ? C.card.qubi : C.card.you}:`), el('span', '', line.text));
      list.appendChild(row);
    }
    parts.push(list);
  } else {
    parts.push(el('p', 'card-hint', C.card.empty));
  }
  const task = card.task;
  if (task) {
    const box = el('div', `call-task ${task.status ?? ''}`.trim());
    box.append(el('small', 'call-task-kind', C.card.task[task.kind] ?? C.card.task.build), el('p', 'call-task-pedido', task.pedido));
    const created = task.created?.length ?? 0;
    const changed = task.changed?.length ?? 0;
    const outcome = task.status === 'error' ? C.tools.progress.failed
      : task.status === 'running' || task.status === 'waiting' ? (task.kind === 'ask' ? C.state.asking : C.state.working)
        : task.kind === 'ask' && task.status === 'done' ? C.notices.answered
          : created || changed ? C.notices.built(created, changed) : null;
    if (outcome) box.appendChild(el('span', 'call-task-state', outcome));
    parts.push(box);
  }
  return parts;
}

// The services the project uses (servicesViewModel keeps it up to date through chatViewModel.upsertServicesCard):
// one row per service with its logo (or initial), a state pill, and "Conectar" on the ones the agent cannot use yet
function servicesCard(card, vm) {
  const SV = strings.services;
  const head = el('header', 'card-head');
  const badge = el('span', 'card-badge services');
  badge.appendChild(icon('plug', { size: 18 }));
  const title = el('div', 'card-title');
  title.append(el('strong', '', SV.card.title), el('span', '', SV.card.intro));
  head.append(badge, title);
  const list = el('ul', 'services-list');
  for (const s of card.services ?? []) {
    const row = el('li', `services-row ${s.state}`);
    row.append(serviceMark(s.key, s.name), el('span', 'services-name', s.name));
    row.appendChild(el('span', `services-pill ${s.state}`, SV.state[s.state] ?? SV.state.unknown));
    if (s.connect) row.appendChild(actionButton(s.connect, vm, 'card-action services-connect'));
    list.appendChild(row);
  }
  return [head, list];
}

// A service's brand logo (renderer/icons/brands.js) when there is one, otherwise its initial
export function serviceMark(key, name, className = 'service-mark') {
  const mark = el('span', className);
  mark.setAttribute('aria-hidden', 'true');
  if (BRANDS[key]) {
    const template = document.createElement('template');
    template.innerHTML = BRANDS[key]; // generated at build time from the MIT icon set, never from the network
    mark.appendChild(template.content.firstChild);
  } else {
    mark.classList.add('initial');
    mark.textContent = (name || key || '?').trim().charAt(0).toUpperCase();
  }
  return mark;
}

// Qubi's team of workers (teamViewModel keeps it up to date through chatViewModel.upsertTeamCard): the
// phase, then one row per worker with its number, task, folder, status, files and Qubi's audit. At most
// one orb per row: on the status while it works (or waits), on the audit chip while Qubi checks it.
// Text only: never parsed as HTML (titles and notes come from the voice and the agent).
const TEAM_NOTES = 2;
const WORKER_ORB = { queued: 'breathing', working: 'composing', waiting: 'listening' };
const AUDIT_ICON = { approved: 'ok', flagged: 'alert' };
function teamCard(card) {
  const T = strings.team;
  const head = el('header', 'card-head');
  const badge = el('span', 'card-badge team');
  badge.dataset.phase = card.phase;
  badge.appendChild(icon('subagent', { size: 18 }));
  const title = el('div', 'card-title');
  // idle with a card on screen means the team was cancelled halfway
  title.append(el('strong', '', T.title), el('span', '', card.phase === 'idle' ? T.status.cancelled : T.phase[card.phase] ?? ''));
  head.append(badge, title);
  const list = el('ol', 'team-workers');
  for (const w of card.workers ?? []) list.appendChild(workerRow(w, T));
  return card.workers?.length ? [head, list] : [head];
}

function workerRow(w, T) {
  const row = el('li', 'team-worker');
  row.dataset.status = w.status;
  if (w.audit) row.dataset.audit = w.audit.status;
  const num = el('span', 'team-num', String(w.n));
  num.title = T.worker(w.n);
  const main = el('div', 'team-main');
  const top = el('div', 'team-top');
  const folder = el('code', 'team-folder', `${w.folder}/`);
  folder.title = `${w.folder}/`;
  top.append(el('strong', 'team-title', w.title), folder);
  const meta = el('div', 'team-meta');
  const status = el('span', 'team-status');
  const live = WORKER_ORB[w.status];
  if (live) status.appendChild(delayedOrb(live, w.startedAt ?? Date.now(), 20, `team-${w.id}`));
  status.appendChild(el('span', '', T.status[w.status] ?? ''));
  meta.appendChild(status);
  const created = w.created?.length ?? 0;
  const changed = w.changed?.length ?? 0;
  if (created || changed) meta.appendChild(el('span', 'team-files', T.files(created, changed)));
  if (w.audit) {
    const chip = el('span', 'team-audit');
    chip.dataset.audit = w.audit.status;
    chip.appendChild(w.audit.status === 'checking'
      ? delayedOrb('searching', w.endedAt ?? Date.now(), 20, `team-${w.id}-audit`)
      : icon(AUDIT_ICON[w.audit.status] ?? 'info', { size: 13 }));
    chip.appendChild(el('span', '', T.audit[w.audit.status] ?? ''));
    meta.appendChild(chip);
  }
  main.append(top, meta);
  for (const note of (w.audit?.notes ?? []).slice(0, TEAM_NOTES)) main.appendChild(el('p', 'team-note', note));
  row.append(num, main);
  return row;
}

// plain (Modo Vibe): an opened file is told in plain words with small buttons in one row
export function renderChatCard(container, card, vm, { plain = false } = {}) {
  const simple = plain && card.kind === 'file' && card.fileKind;
  const parts = card.kind === 'call' ? callCard(card) : card.kind === 'team' ? teamCard(card) : card.kind === 'services' ? servicesCard(card, vm) : card.kind === 'folder' ? folderCard(card, vm) : card.kind === 'place' ? placeCard(card) : card.kind === 'tour' ? tourCard(card, vm) : card.kind === 'changes' ? changesCard(card) : simple ? plainFileCard(card) : fileCard(card);
  const actions = simple ? card.actions.filter((a) => a.kind !== 'reveal') : card.actions ?? [];
  if (actions.length) {
    const row = el('div', `card-actions${simple ? ' compact' : ''}`);
    const short = strings.chat.cards.short;
    actions.forEach((a) => row.appendChild(actionButton(simple ? { ...a, label: short[a.kind] ?? a.label } : a, vm)));
    parts.push(row);
  }
  container.classList.toggle('plain', Boolean(simple));
  // the call card is rebuilt on every line: a screen reader would read it all again over Qubi's voice
  // (the voice and the bar's status already tell how the call goes); the team card, on every saved file
  if (card.kind === 'call' || card.kind === 'team') container.setAttribute('aria-live', 'off');
  container.replaceChildren(...parts);
}
