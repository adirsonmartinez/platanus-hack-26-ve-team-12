// Interactive cards in the chat for map events (ChatViewModel `card`): a folder (its traffic light as a
// bar, counts, a hint and next steps) or a file (path, level, reason, who marked it, actions).
// Buttons call vm.choose(action, button), like the chips.
import { strings } from '../../i18n/es.js';
import { icon } from './icons.js';
import { tourCard } from './tourCardView.js';

const K = strings.chat.cards;
const LEVELS = ['red', 'yellow', 'green'];
const LEVEL_ICON = { red: 'danger', yellow: 'shieldWarn', green: 'shieldOk' };

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

export const CHIP_ICON = { ask: 'ask', repair: 'wrench', audit: 'audit', locate: 'locate', risks: 'alert', open: 'openExternal', reveal: 'folderOpen', tour: 'route', tourNext: 'arrowRight', tourPrev: 'arrowLeft', tourExit: 'close', edit: 'improve' };

export function actionButton(action, vm, className = 'card-action') {
  const b = el('button', `${className} ${action.kind ?? ''}`.trim());
  b.type = 'button';
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

// Files saved on disk (by the agent, Remi or another program): one button per file opens it here
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

// plain (Modo Vibe): an opened file is told in plain words with small buttons in one row
export function renderChatCard(container, card, vm, { plain = false } = {}) {
  const simple = plain && card.kind === 'file' && card.fileKind;
  const parts = card.kind === 'folder' ? folderCard(card, vm) : card.kind === 'place' ? placeCard(card) : card.kind === 'tour' ? tourCard(card, vm) : card.kind === 'changes' ? changesCard(card) : simple ? plainFileCard(card) : fileCard(card);
  const actions = simple ? card.actions.filter((a) => a.kind !== 'reveal') : card.actions ?? [];
  if (actions.length) {
    const row = el('div', `card-actions${simple ? ' compact' : ''}`);
    const short = strings.chat.cards.short;
    actions.forEach((a) => row.appendChild(actionButton(simple ? { ...a, label: short[a.kind] ?? a.label } : a, vm)));
    parts.push(row);
  }
  container.classList.toggle('plain', Boolean(simple));
  container.replaceChildren(...parts);
}
