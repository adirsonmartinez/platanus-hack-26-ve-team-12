// Card that follows the mouse over the map: what the building, floor or file is, its tags,
// its cracks and what a click does. Vibe shows friendly names; Dev shows paths, sizes and rules.
import { strings } from '../../i18n/es.js';
import { TAG_COLOR } from '../../models/folderTags.js';

const H = strings.hover;
const OFFSET = 16;

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

export function createHoverCardView({ card, stage, mapViewModel, modeModel }) {
  let lastKey = '';

  function content(d) {
    const tech = modeModel.tech;
    const title = d.kind === 'folder' ? (tech || !d.friendly ? `${d.name}${d.path ? '/' : ''}` : d.friendly) : d.name;
    const parts = [];
    const head = el('div', 'hc-head');
    const dot = el('span', `level-dot ${d.level}`);
    head.append(dot, el('strong', '', title));
    parts.push(head);
    if (d.kind === 'folder' && !tech && d.path) parts.push(el('span', 'hc-sub mono', `${d.path}/`));
    if (tech && d.path) parts.push(el('span', 'hc-sub mono', d.kind === 'file' ? `${d.path} · ${H.size(d.size ?? 0)}` : `${d.path}/`));

    if (d.tags?.length) {
      const row = el('div', 'tag-row');
      d.tags.forEach((t) => {
        const chip = el('span', 'tag-chip', strings.tags[t] ?? t);
        chip.style.setProperty('--c', TAG_COLOR[t]);
        row.appendChild(chip);
      });
      parts.push(row);
    }

    if (d.kind === 'file') {
      const reason = tech ? strings.security.techReasons[d.reasonKey] ?? d.reason : d.reason;
      parts.push(el('p', 'hc-text', `${strings.security.levels[d.level]} · ${reason}`));
    } else {
      const stats = [H.files(d.files ?? 0), d.red ? H.atRisk(d.red) : H.noRisks];
      if (d.yellow) stats.push(H.toReview(d.yellow));
      parts.push(el('p', `hc-text${d.red ? ' danger' : ''}`, stats.join(' · ')));
    }
    parts.push(el('p', 'hc-hint', { folder: H.clickFolder, file: H.clickFile }[d.kind]));
    return parts;
  }

  function show(pick, clientX, clientY) {
    const d = pick && mapViewModel.describePick(pick);
    if (!d) { card.hidden = true; lastKey = ''; return; }
    const key = `${d.kind}:${d.path}:${modeModel.store.state.mode}:${d.level}`;
    if (key !== lastKey) { card.replaceChildren(...content(d)); lastKey = key; }
    card.hidden = false;
    const box = stage.getBoundingClientRect();
    const x = Math.min(clientX - box.left + OFFSET, box.width - card.offsetWidth - 8);
    const y = Math.min(clientY - box.top + OFFSET, box.height - card.offsetHeight - 8);
    card.style.transform = `translate(${x}px, ${y}px)`;
  }

  return { show };
}
