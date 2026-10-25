// Rows that tell what is happening in the chat outside an agent's run card: Qubi's and the agent's
// steps ("Leyendo un archivo…") and the result of a repair. A working step shows a thinking orb
// (libraries.dev: one per active step, from the first moment, its state names the activity); a finished
// one its tool icon with a check. Results show their own icon. Text only (textContent): never parsed as HTML.
import { icon, TOOL_ICONS } from './icons.js';
import { STEP_ORB } from './thinkingOrb.js';
import { delayedOrb, RESULT_ICON } from './runCardView.js';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

export function renderStep(container, { text, step }) {
  const box = el('span', `run-icon ${step.status}`);
  box.appendChild(icon(step.status === 'error' ? 'danger' : TOOL_ICONS[step.tool] ?? step.icon ?? 'arrowRight', { size: 15 }));
  if (step.status === 'running') box.appendChild(delayedOrb(STEP_ORB[step.tool] ?? step.orb ?? 'working', step.startedAt));
  if (step.status === 'done') box.appendChild(el('span', 'run-check'));
  container.classList.toggle('running', step.status === 'running');
  container.replaceChildren(box, el('span', 'step-text', text));
}

export function renderResult(container, { text, result }) {
  const badge = el('span', `result-icon ${result}`);
  badge.appendChild(icon(RESULT_ICON[result] ?? 'info', { size: 15 }));
  container.replaceChildren(badge, el('span', 'result-text', text));
}
