// A live "run" card for an answer of the user's own agent: header (agent, model, effort, timer), the
// steps it takes (Platanus tools and subagents, nested, each with its status and time), its reasoning
// folded, the answer as Markdown, and time/turns/tokens at the end.
// Rebuilt on every update, but what the person opened or closed stays as it was.
// Modo Vibe (`plain`) tells the same run in plain words instead: what it is doing now, what it did
// (file names link to the map, traffic lights as colored dots) and how long it took; no model, effort,
// reasoning or tokens.
import { strings } from '../../i18n/es.js';
import { modelLabel } from '../../models/agentConnectionModel.js';
import { markdownToHtml } from './markdown.js';
import { splitAnswer } from '../../models/answerFormat.js';
import { stepLine, runHeadline, runRecap } from '../../models/runStory.js';
import { applyIcons } from '../icons.js';
import { icon, TOOL_ICONS } from './icons.js';
import { thinkingOrb, STEP_ORB } from './thinkingOrb.js';

const R = strings.chat.run;
const C = strings.connect;
const S = strings.chat.story;

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

// libraries.dev suggests no orb under 2 s; the team chose orbs from the start (never dots or an empty
// slot), so it only fades in. Raise this to bring the delay back.
export const ORB_AFTER_MS = 0;
const elapsed = (step) => (step.endedAt ? R.seconds(step.endedAt - step.startedAt) : '');

// An orb that fades in once the work has lasted ORB_AFTER_MS. The card is rebuilt on every streamed word:
// with a `key`, the canvas already on screen is moved into the new card (it keeps animating) instead of
// a new canvas and context being made each time.
const liveOrbs = new Map(); // key -> canvas
export function delayedOrb(state, startedAt, size = 20, key = '') {
  const old = key && liveOrbs.get(key);
  if (old && old.isConnected && old.dataset.state === state) return old;
  const orb = thinkingOrb(state, { size });
  orb.dataset.state = state;
  orb.classList.add('late');
  orb.style.animationDelay = `${ORB_AFTER_MS - (Date.now() - startedAt)}ms`;
  if (key) liveOrbs.set(key, orb);
  return orb;
}
const sweepOrbs = () => { for (const [key, canvas] of liveOrbs) if (!canvas.isConnected) liveOrbs.delete(key); };

// Which activity the agent is doing in this message: a STEP_ORB key (its orb state and its label in
// strings.chat.orbLabels). Run cards, activity rows (Remi, tools) or an answer being written.
export function orbKeyOf(message) {
  if (message?.run?.awaiting) return 'approval';
  if (message?.step?.status === 'running') return message.step.tool ?? 'repair';
  const step = message?.run?.steps.findLast((s) => s.status === 'running');
  if (step) return step.kind === 'subagent' ? 'subagent' : step.name;
  return message?.role === 'bot' && message.text ? 'writing' : 'thinking';
}
export function orbStateOf(message) {
  return STEP_ORB[orbKeyOf(message)] ?? message?.step?.orb ?? 'working';
}

// Icon of a step: its tool's icon (and a check when done). The step that runs is lit; its orb is the
// card's status pill, so a card never animates more than one orb.
function stepIcon(step) {
  const box = el('span', `run-icon ${step.status}`);
  const name = step.status === 'error' ? 'danger' : step.kind === 'subagent' ? 'subagent' : TOOL_ICONS[step.name] ?? 'arrowRight';
  box.appendChild(icon(name, { size: 14 }));
  if (step.status === 'done') box.appendChild(el('span', 'run-check'));
  return box;
}

// A file change on its step, live: proposed while the person is asked, applied once saved, or not
// approved. Dev shows it open with line numbers; Vibe folds it behind "Ver lo que cambió".
function diffBlock(step, isOpen, plain) {
  const diff = step.diff ?? step.proposed;
  if (!diff || step.name !== 'write_file') return null;
  const D = plain ? strings.chat.story.diff : R.diff;
  const stage = step.diff ? 'applied' : step.status === 'error' ? 'rejected' : 'proposed';
  const box = el('details', `run-diff ${stage}`);
  box.dataset.key = `diff-${step.id}-${stage}`;
  box.open = isOpen(box.dataset.key, !plain || stage === 'proposed');
  const summary = el('summary');
  summary.append(el('span', 'diff-title', diff.created && !plain && stage !== 'rejected' ? R.diff.created : D[stage]), el('span', 'diff-counts', D.counts(diff.added, diff.removed)));
  box.appendChild(summary);
  const pre = el('div', 'diff-body');
  for (const hunk of diff.hunks) {
    const block = el('div', 'diff-hunk');
    for (const line of hunk.lines) {
      const row = el('div', `diff-line ${line.type}`);
      row.append(el('span', 'diff-num', String(line.old ?? '')), el('span', 'diff-num', String(line.new ?? '')), el('span', 'diff-sign', line.type === 'add' ? '+' : line.type === 'del' ? '−' : ' '), el('span', 'diff-text', line.text || ' '));
      block.appendChild(row);
    }
    pre.appendChild(block);
  }
  if (diff.truncated) pre.appendChild(el('p', 'diff-more', R.diff.more));
  box.appendChild(pre);
  return box;
}

// Steps already on screen do not replay their entrance when the card is rebuilt
const shownSteps = (root) => new Set([...root.querySelectorAll('li[data-step]')].map((n) => n.dataset.step));
const markStep = (li, step, known) => {
  li.dataset.step = step.id;
  if (!known.has(step.id)) li.classList.add('enter');
};

// The card's avatar: the agent's orb. While it works it breathes slowly (the pill below carries the
// orb of the exact activity); once done it is a still frame.
function orbAvatar(state, message = null) {
  const box = el('span', 'run-avatar orb-avatar');
  const running = message?.run?.status === 'running';
  box.appendChild(running ? avatarOrb(message) : thinkingOrb(state, { size: 32, still: true }));
  return box;
}
// One canvas per working card, kept across redraws so its motion never restarts
const avatarOrbs = new Map();
function avatarOrb(message) {
  const old = avatarOrbs.get(message.id);
  if (old?.isConnected) return old;
  const orb = thinkingOrb('breathing', { size: 32, speed: 0.6 });
  avatarOrbs.set(message.id, orb);
  for (const [id, canvas] of avatarOrbs) if (id !== message.id && !canvas.isConnected) avatarOrbs.delete(id);
  return orb;
}

// While it works: one pill, the live orb whose state names the activity and the sentence that says it
// ("Leyendo vercel.json…"). The only animated orb of the card.
function orbPill(message, label) {
  const { run } = message;
  const pill = el('div', 'orb-pill');
  const orb = run.queued
    ? thinkingOrb('breathing', { size: 20, speed: 0.45 }) // waiting its turn: slow
    : delayedOrb(orbStateOf(message), run.startedAt, 20, `run-${message.id}`);
  pill.dataset.state = run.queued ? 'breathing' : orbStateOf(message);
  pill.append(orb, el('span', '', run.queued ? R.queued : label));
  return pill;
}

// "Agente" (who answers is in the composer's picker); comparing two agents, each card says which
const agentTitle = (run) => (run.compare ? (run.agent ?? '').split(' (')[0] : R.agentTitle);
// The place the question was about (the robot was there): "Sobre Base de datos · db/"
function aboutLine(about) {
  const line = el('span', 'run-about');
  line.append(icon('bot', { size: 13 }), el('span', '', `${strings.chat.focus.about} ${about.title}`));
  if (about.path) line.appendChild(el('code', '', about.path));
  return line;
}
const agentShort = (run) => (run.agent ?? '').split(' (')[0];

// Done or failed: an icon on the right (while it works the avatar's orb says it)
function doneState(run, iconName) {
  const state = el('span', `run-state ${run.status}`);
  if (run.status !== 'running') state.appendChild(icon(iconName ?? (run.status === 'error' ? 'danger' : 'ok'), { size: 15 }));
  return state;
}

function stepRow(step, all, ctx) {
  const li = el('li', `run-step ${step.kind} ${step.status}`);
  markStep(li, step, ctx.known);
  const line = el('div', 'run-step-line');
  if (step.kind === 'tool') {
    line.append(stepIcon(step), el('span', 'run-step-name', R.tools[step.name] ?? R.tool));
    if (step.target) line.appendChild(el('code', 'run-step-target', step.target));
  } else {
    line.append(stepIcon(step), el('span', 'run-step-badge', R.subagent(step.agentKind)), el('span', 'run-step-name', step.description));
  }
  line.appendChild(el('span', 'run-step-time', elapsed(step)));
  li.appendChild(line);
  const change = diffBlock(step, ctx.isOpen, false);
  if (change) li.appendChild(change);

  if (step.kind === 'subagent') {
    const children = all.filter((x) => x.parent === step.id);
    if (children.length) {
      const ol = el('ol', 'run-steps-nested');
      children.forEach((child) => ol.appendChild(stepRow(child, all, ctx)));
      li.appendChild(ol);
    }
    if (step.output) {
      const out = el('details', 'run-step-output');
      out.dataset.key = `out-${step.id}`;
      const body = el('div', 'md');
      body.innerHTML = markdownToHtml(step.output); // escaped by markdownToHtml
      out.append(el('summary', '', R.output), body);
      li.appendChild(out);
    }
  }
  return li;
}

// Keep the person's open/closed choices across redraws
const openState = (root) => {
  const opened = new Map([...root.querySelectorAll('details[data-key]')].map((d) => [d.dataset.key, d.open]));
  return (key, fallback) => (opened.has(key) ? opened.get(key) : fallback);
};

// The answer itself (the suggestions block becomes chips under the chat)
function answerBlock(message, { waiting }) {
  const running = message.run.status === 'running';
  const answer = el('div', `md${running ? ' streaming' : ''}`);
  const body = splitAnswer(message.text).body;
  answer.innerHTML = body ? markdownToHtml(body) : running && waiting ? `<p>${strings.chat.thinking}</p>` : '';
  return answer;
}

function errorBlock(run) {
  const fail = el('div', 'run-error');
  fail.innerHTML = run.error; // our own message (strings.agent.liveFailed), already escaped
  return fail;
}

// One plain sentence; the file name inside it is a link to the map
function storyRow(step, all, ctx) {
  const line = stepLine(step);
  const li = el('li', `story-step ${step.kind} ${line.status}`);
  markStep(li, step, ctx.known);
  const sentence = el('span', 'story-text');
  const at = line.name ? line.text.indexOf(line.name) : -1;
  if (at < 0) sentence.textContent = line.text;
  else {
    const ref = el('code', 'file-ref', line.name);
    ref.dataset.path = line.path;
    ref.title = line.path;
    ref.setAttribute('role', 'button');
    ref.tabIndex = 0;
    sentence.append(line.text.slice(0, at), ref, line.text.slice(at + line.name.length));
  }
  li.append(stepIcon(step), sentence);
  if (line.level && line.status === 'done') li.appendChild(el('span', `story-light ${line.level}`));
  const change = diffBlock(step, ctx.isOpen, true);
  if (change) li.appendChild(change);
  const children = all.filter((x) => x.parent === step.id);
  if (children.length) {
    const ol = el('ol', 'story-nested');
    children.forEach((child) => ol.appendChild(storyRow(child, all, ctx)));
    li.appendChild(ol);
  }
  return li;
}

function renderPlainRunCard(el0, message) {
  const { run, text } = message;
  const isOpen = openState(el0);
  const running = run.status === 'running';
  const ctx = { id: message.id, known: shownSteps(el0), isOpen: openState(el0) };
  sweepOrbs();

  const head = el('header', 'run-head story-head');
  const who = el('div', 'run-who');
  const now = running ? agentShort(run) : run.status === 'error' ? S.failedRun : S.doneIn(R.seconds((run.endedAt ?? Date.now()) - run.startedAt));
  who.append(el('strong', '', agentTitle(run)), el('span', `story-now ${run.status}`, now));
  if (run.about) who.appendChild(aboutLine(run.about));
  head.append(orbAvatar('breathing', message), who, doneState(run));
  if (running) {
    const timer = el('span', 'run-time', R.seconds(Date.now() - run.startedAt));
    timer.dataset.start = String(run.startedAt);
    timer.dataset.live = '1';
    head.appendChild(timer);
  }
  const parts = [head];
  if (running) parts.push(orbPill(message, runHeadline(run, text)));

  if (run.steps.length) {
    const box = el('details', 'run-steps story');
    box.dataset.key = running ? 'story-live' : 'story-end'; // open while it works, folded into the recap when it ends
    box.open = isOpen(box.dataset.key, running);
    box.appendChild(el('summary', '', runRecap(run.steps)));
    const ol = el('ol');
    run.steps.filter((s) => !s.parent).forEach((s) => ol.appendChild(storyRow(s, run.steps, ctx)));
    box.appendChild(ol);
    parts.push(box);
  }
  parts.push(answerBlock(message, { waiting: !run.steps.length }));
  if (run.error) parts.push(errorBlock(run)); // after what it managed to write
  el0.replaceChildren(...parts);
  applyIcons(el0);
}

// The icon that closes a repair, by its outcome
export const RESULT_ICON = { fixed: 'ok', planned: 'step', failed: 'danger', verified: 'shieldOk', clear: 'shieldOk' };

// A repair (Remi + the agent) as one card, like a run: what it is doing now, its steps folded into a
// recap when it ends, the agent's explanation and the result at the foot
function renderRepairCard(el0, message) {
  const { run, text } = message;
  const isOpen = openState(el0);
  const running = run.status === 'running';
  const ctx = { id: message.id, known: shownSteps(el0), isOpen: openState(el0) };
  sweepOrbs();
  const name = run.path.split('/').pop();

  const head = el('header', 'run-head story-head');
  const avatar = orbAvatar('solving', message);
  const who = el('div', 'run-who');
  const now = running ? name : strings.repair.outcome[run.result?.status] ?? (run.status === 'error' ? S.failedRun : R.done);
  who.append(el('strong', '', run.agent), el('span', `story-now ${run.status}`, now));
  head.append(avatar, who, doneState(run, RESULT_ICON[run.result?.status]));
  const parts = [head];
  if (running) parts.push(orbPill(message, run.awaiting || run.steps.some((s) => s.status === 'running') ? runHeadline(run, '') : strings.repair.chat.working(name)));

  if (run.steps.length) {
    const box = el('details', 'run-steps story');
    box.dataset.key = running ? 'story-live' : 'story-end';
    box.open = isOpen(box.dataset.key, running);
    box.appendChild(el('summary', '', runRecap(run.steps)));
    const ol = el('ol');
    run.steps.forEach((s) => ol.appendChild(storyRow(s, run.steps, ctx)));
    box.appendChild(ol);
    parts.push(box);
  }
  const body = splitAnswer(text).body;
  if (body) {
    const answer = el('div', `md${running ? ' streaming' : ''}`);
    answer.innerHTML = markdownToHtml(body); // escaped by markdownToHtml
    parts.push(answer);
  }
  if (run.result) {
    const foot = el('footer', `run-result ${run.result.status}`);
    const badge = el('span', 'result-icon');
    badge.appendChild(icon(RESULT_ICON[run.result.status] ?? 'info', { size: 15 }));
    foot.append(badge, el('span', 'result-text', run.result.text));
    parts.push(foot);
  }
  el0.replaceChildren(...parts);
  el0.classList.add('repair-card');
  applyIcons(el0);
}

export function renderRunCard(el0, message, { plain = false } = {}) {
  if (message.run.kind === 'repair') return renderRepairCard(el0, message);
  if (plain) return renderPlainRunCard(el0, message);
  const { run, text, thinking } = message;
  // Default: steps open while it works
  const isOpen = openState(el0);
  const running = run.status === 'running';
  const ctx = { id: message.id, known: shownSteps(el0), isOpen: openState(el0) };
  sweepOrbs();

  const head = el('header', 'run-head');
  const avatar = orbAvatar('breathing', message);
  const who = el('div', 'run-who');
  // Dev keeps the detail one line below: which agent, model and effort
  who.append(el('strong', '', agentTitle(run)), el('span', 'run-model', `${agentShort(run)} · ${modelLabel(run.agentId, run.model) ?? C.planDefault} · ${C.efforts[run.effort] ?? ''}`));
  if (run.about) who.appendChild(aboutLine(run.about));
  const state = doneState(run);
  if (!running) state.appendChild(el('span', '', run.status === 'error' ? R.failed : R.done));
  const timer = el('span', 'run-time', R.seconds((run.endedAt ?? Date.now()) - run.startedAt));
  timer.dataset.start = String(run.startedAt);
  if (running) timer.dataset.live = '1';
  head.append(avatar, who, ...(run.compare ? [el('span', 'run-compare', strings.hub.compare)] : []), state, timer);
  const parts = [head];
  // While it works: the pill says what (the running tool's name in Dev words, or thinking / writing)
  if (running) {
    const step = run.steps.findLast((x) => x.status === 'running');
    const doing = run.awaiting ? runHeadline(run, '') : step ? (step.kind === 'subagent' ? R.subagent(step.agentKind) : R.tools[step.name] ?? R.tool) : strings.chat.orbLabels[orbKeyOf(message)] ?? R.working;
    parts.push(orbPill(message, doing));
  }

  const top = run.steps.filter((s) => !s.parent);
  if (run.steps.length) {
    const box = el('details', 'run-steps');
    box.dataset.key = 'steps';
    box.open = isOpen('steps', true);
    const subagents = run.steps.filter((s) => s.kind === 'subagent').length;
    box.appendChild(el('summary', '', R.summary(run.steps.length, subagents)));
    const ol = el('ol');
    top.forEach((s) => ol.appendChild(stepRow(s, run.steps, ctx)));
    box.appendChild(ol);
    parts.push(box);
  }

  if (thinking) {
    const why = el('details', 'reasoning');
    why.dataset.key = 'reasoning';
    why.open = isOpen('reasoning', !text);
    const body = el('div');
    body.innerHTML = markdownToHtml(thinking);
    why.append(el('summary', '', strings.chat.reasoning), body);
    parts.push(why);
  }

  parts.push(answerBlock(message, { waiting: !run.steps.length && !thinking }));
  if (run.error) parts.push(errorBlock(run)); // after what it managed to write

  if (run.result) parts.push(el('footer', 'run-foot', R.foot(run.result, R.seconds)));
  el0.replaceChildren(...parts);
  applyIcons(el0); // callout icons in the answer
  // keep nested details state
  for (const d of el0.querySelectorAll('details[data-key]')) d.open = isOpen(d.dataset.key, d.open);
}

// Running timers tick once per second (only while some run is working)
export function tickRunTimers(root) {
  for (const t of root.querySelectorAll('.run-time[data-live]')) {
    t.textContent = R.seconds(Date.now() - Number(t.dataset.start));
  }
}
