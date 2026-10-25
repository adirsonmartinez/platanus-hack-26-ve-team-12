// "Cuánto piensa": a slider instead of buttons. The more effort, the hotter the track (cool violet ->
// amber -> red) and the faster its energy flows; the top level ("Ultracode") also sparks.
// Updates in place (no rebuild) so dragging never loses the thumb.
import { strings } from '../../i18n/es.js';

const C = strings.connect;

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

// efforts: ordered values (lowest first); onChange(effort) when the person moves it
export function createEffortSlider({ efforts, value, onChange }) {
  const root = el('div', 'effort');
  const head = el('div', 'effort-head');
  const name = el('strong', 'effort-name');
  const hint = el('span', 'effort-hint');
  head.append(el('span', 'picker-label', C.effort), name);

  const track = el('div', 'effort-track');
  const fill = el('div', 'effort-fill');
  const sparks = el('div', 'effort-sparks');
  for (let i = 0; i < 6; i++) sparks.appendChild(el('i'));
  const input = el('input', 'effort-input');
  input.type = 'range';
  input.min = '0';
  input.max = String(efforts.length - 1);
  input.step = '1';
  input.setAttribute('aria-label', C.effort);
  const ticks = el('div', 'effort-ticks');
  efforts.forEach(() => ticks.appendChild(el('i')));
  track.append(fill, sparks, ticks, input);
  root.append(head, track, hint);

  function show(effort) {
    const index = Math.max(0, efforts.indexOf(effort));
    const level = efforts.length > 1 ? index / (efforts.length - 1) : 1;
    input.value = String(index);
    input.setAttribute('aria-valuetext', C.efforts[effort]);
    root.style.setProperty('--level', String(level));
    root.dataset.effort = effort;
    root.classList.toggle('max', index === efforts.length - 1 && efforts.length > 2);
    [...ticks.children].forEach((t, i) => t.classList.toggle('on', i <= index));
    name.textContent = C.efforts[effort];
    hint.textContent = C.effortHints[effort] ?? '';
  }

  input.addEventListener('input', () => {
    const effort = efforts[Number(input.value)];
    show(effort);
    onChange(effort);
  });
  show(value);
  return { el: root, set: show };
}
