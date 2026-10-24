// The tour's card in the chat (ChatViewModel card.kind 'tour'): the stop on screen, its words, the
// progress, and Anterior / Siguiente / Salir. While the project is analyzed, or the agent still
// writes, an orb says so. The text is shown as plain text (it may come from the agent).
import { strings } from '../../i18n/es.js';
import { icon } from './icons.js';
import { thinkingOrb } from './thinkingOrb.js';

const T = strings.tour;

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

export function tourCard(card, vm) {
  const head = el('header', 'card-head');
  const badge = el('span', 'card-badge tour');
  const busy = card.status === 'analyzing' || card.writing;
  badge.appendChild(busy
    ? thinkingOrb(card.status === 'analyzing' ? 'searching' : 'composing', { size: 32, label: card.status === 'analyzing' ? T.analyzing : T.writing })
    : icon('route', { size: 18 }));
  const title = el('div', 'card-title');
  const detail = card.status === 'analyzing' ? T.analyzing
    : card.status === 'done' ? T.ended
      : [T.stepOf(card.index + 1, card.total), T.kinds[card.architecture] ?? '', card.writing ? T.writing : card.source === 'agent' ? T.narratedBy(card.agent) : T.automatic].filter(Boolean).join(' · ');
  title.append(el('strong', '', T.title), el('span', '', detail));
  head.append(badge, title);
  const parts = [head];
  if (card.status !== 'playing' || !card.step) return parts;

  const dots = el('div', 'tour-dots');
  dots.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < card.total; i++) dots.appendChild(el('i', i === card.index ? 'now' : i < card.index ? 'seen' : ''));
  const body = el('div', 'tour-step');
  body.dataset.kind = card.step.kind;
  body.append(el('strong', 'tour-title', card.step.title), el('p', 'tour-say', card.step.say));
  parts.push(dots, body);

  // A use case: the files it goes through, each one opens here
  if (card.step.flow?.length > 1) {
    const flow = el('div', 'tour-flow');
    flow.appendChild(el('span', 'tour-flow-label', T.flow));
    card.step.flow.forEach((path, i) => {
      if (i) flow.appendChild(el('span', 'tour-flow-arrow', '→'));
      const b = el('button', 'tour-file', path.split('/').pop());
      b.type = 'button';
      b.title = path;
      b.addEventListener('click', () => vm.openFile(path));
      flow.appendChild(b);
    });
    parts.push(flow);
  }
  return parts;
}
