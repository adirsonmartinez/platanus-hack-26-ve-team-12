// Qubi's card (brutalist, bottom-right of the stage): avatar, current step, the plan being ticked off,
// a progress strip and, at the end, "Ya lo apliqué" / "Cerrar".
import { strings } from '../../i18n/es.js';
import { drawSprite, SPRITE_H, SPRITE_W, STEP_FPS, STEP_FRAMES } from '../qubiSprite.js';
import { STEPS } from '../../viewmodels/repairViewModel.js';

const R = strings.repair;
const SCALE = 4;

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

export function createRepairPanelView({ container, repairViewModel: vm, modeModel, actions }) {
  const card = el('aside', 'qubi-card');
  card.setAttribute('role', 'status');
  card.setAttribute('aria-live', 'polite');
  card.hidden = true;
  container.appendChild(card);

  const canvas = el('canvas', 'qubi-avatar');
  canvas.width = SPRITE_W * SCALE;
  canvas.height = SPRITE_H * SCALE;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let tick = 0;
  let timer = null;

  function animate(step) {
    clearInterval(timer);
    const frames = STEP_FRAMES[step] ?? ['idle'];
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawSprite(ctx, frames[tick++ % frames.length], SCALE);
    };
    draw();
    if (!still && frames.length > 1) timer = setInterval(draw, 1000 / STEP_FPS[step]);
  }

  let lastStep = -1;
  function render({ job, queue }) {
    card.hidden = !job;
    if (!job) { clearInterval(timer); lastStep = -1; return; }
    if (job.step !== lastStep) { lastStep = job.step; animate(job.step); }
    const done = job.step === STEPS - 1;
    card.classList.toggle('done', done);

    const head = el('header', 'qubi-head');
    head.append(el('span', '', R.name), el('span', 'qubi-progress', R.step(job.step + 1, STEPS) + (queue.length ? ` · ${R.queued(queue.length)}` : '')));

    const frame = el('div', 'qubi-frame');
    frame.appendChild(canvas);
    const info = el('div', 'qubi-info');
    const path = modeModel.tech ? job.path : job.path.split('/').pop();
    const stepNames = job.source === 'agent' ? R.stepsAgent(job.agentLabel) : R.steps;
    const stepText = done ? R.outcome[job.outcome] ?? R.steps[job.step] : `${stepNames[job.step]}…`;
    info.append(el('p', 'qubi-kicker', R.working), el('p', 'qubi-title', path), el('p', `qubi-step${done ? ` ok ${job.outcome}` : ''}`, stepText));
    if (modeModel.tech) info.appendChild(el('p', 'qubi-reason', strings.security.techReasons[job.reasonKey] ?? job.reason));
    if (done && job.stillRisky) info.appendChild(el('p', 'qubi-reason', job.stillRisky));
    const top = el('div', 'qubi-top');
    top.append(frame, info);

    const parts = [head, top];
    if (job.plan.length) {
      const plan = el('div', 'qubi-plan');
      plan.appendChild(el('p', 'qubi-kicker', `${R.myPlan} · ${job.source === 'agent' ? R.fromAgent(job.agentLabel) : R.fromGuide}`));
      const list = el('ol');
      // Plan items get ticked while Qubi shores the crack up, and stay ticked afterwards
      const progress = job.step > 3 ? job.plan.length : job.step === 3 ? Math.ceil(job.plan.length / 2) : 0;
      job.plan.forEach((s, i) => {
        const item = el('li', i < progress ? 'ok' : '');
        item.append(el('span', 'qubi-check', i < progress ? '✓' : String(i + 1)), el('span', '', s));
        list.appendChild(item);
      });
      plan.appendChild(list);
      parts.push(plan);
    }
    if (done) {
      parts.push(el('p', 'qubi-honest', R.honest));
      const row = el('div', 'qubi-actions');
      const button = (label, run, primary = false) => {
        const b = el('button', `qubi-btn${primary ? ' primary' : ''}`, label);
        b.type = 'button';
        b.addEventListener('click', run);
        row.appendChild(b);
      };
      // with the audit, 'fixed' is already verified; 'partial' and a plan are checked again on request
      if (job.outcome === 'fixed' && !vm.audited) button(R.history.verify, () => vm.markFixed(), true);
      else if (job.outcome === 'partial') button(R.auditAgain, () => vm.markFixed(), true);
      else if (job.outcome === 'planned') button(R.markFixed, () => vm.markFixed(), true);
      button(R.history.title, () => actions?.showRepairs());
      button(R.close, () => vm.close());
      parts.push(row);
    }
    const strip = el('ol', 'qubi-strip');
    R.steps.forEach((label, i) => {
      const cell = el('li', i < job.step ? 'past' : i === job.step ? 'now' : '');
      cell.title = label;
      strip.appendChild(cell);
    });
    parts.push(strip);
    card.replaceChildren(...parts);
  }

  vm.store.subscribe(render, { immediate: true });
  modeModel.store.subscribe(() => render(vm.store.state));
}
