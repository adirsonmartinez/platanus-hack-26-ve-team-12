// Qubi, the repairer: walks to the risky file's folder and, while he works on the map, the user's own agent
// (when one is connected) reads the file and repairs it through Qubbot' tools. Every write is
// approved by the person in a dialog and backed up. Without an agent, Qubi leaves a plan from the
// Qubbot guide. Each job is a task in the repair history, and the chat explains what happened.
// With the security audit (auditViewModel) the agent is told exactly what the audit found (rule and line),
// and once it is done the whole project is audited again: only the audit says whether it got fixed
// ('fixed' = verified by the audit, 'partial' = it changed files but the finding is still there).
import { Observable } from '../core/observable.js';
import { EVENTS } from '../core/eventBus.js';
import { strings } from '../i18n/es.js';
import { LEVEL_RANK } from '../models/securityModel.js';

const R = strings.repair;
export const STEPS = R.steps.length; // walk, look, repair, check, done
const WALK_SPEED = 9; // map units per second
const LOOK_MS = 1300;
const MIN_WORK_MS = 1800;
const CHECK_MS = 1600;
const AGENT_TIMEOUT_MS = 5 * 60_000;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Bullet lines of an answer ("- step", "1. step") -> at most 4 steps
function parseSteps(text) {
  return text.split('\n')
    .map((l) => l.trim().match(/^(?:[-*•]|\d+[.)])\s+(.+)$/)?.[1])
    .filter(Boolean)
    .map((s) => s.replace(/\*\*/g, ''))
    .slice(0, 4);
}

// What Qubi (the map's robot, robotView's repair job) does at each step of a job, and what its bubble says:
// the file it is on and what the audit found there (with the line).
//   -> { pose, gesture, look: 'center' | 'camera', title, text }
const STEP_POSE = ['idle', 'scan', 'scan', 'drop', 'wave'];
const DONE_GESTURE = { fixed: 'celebrar', clear: 'celebrar', partial: 'encoger', failed: 'encoger', planned: 'asentir' };
export function repairGuide(job, { tech = false } = {}) {
  const done = job.step >= STEPS - 1;
  const name = tech ? job.path : job.path.split('/').pop();
  const stepNames = job.source === 'agent' ? R.stepsAgent(job.agentLabel) : R.steps;
  const doing = done ? (R.outcome[job.outcome] ?? R.steps[job.step]) : stepNames[job.step];
  return {
    pose: job.step === 3 && !job.hammering ? 'scan' : STEP_POSE[Math.min(job.step, STEPS - 1)],
    gesture: done ? DONE_GESTURE[job.outcome] ?? null : job.step === 2 ? 'pensar' : null,
    look: done ? 'camera' : 'center',
    title: `${R.name} · ${name}`,
    text: done && job.stillRisky ? `${doing}. ${job.stillRisky}` : `${doing}${done ? '' : '…'} ${job.reason ? `— ${job.reason}` : ''}`.trim(),
  };
}

export class RepairViewModel {
  #security;
  #map;
  #camera;
  #connection;
  #history;
  #agentService;
  #bus;
  #runId = 0;
  #changes = null; // the agent's writes, collected only while THIS job's run is executing
  #abort = null; // stops the current job's agent run
  #collected = null; // the writes of the run that just finished
  #startedAt = 0; // when the current job's agent run started

  // job: { historyId, path, reason, reasonKey, folder, from, to, center, height, step, stepMs, plan,
  //        source: 'agent' | 'guide', agentLabel, outcome: 'fixed' | 'planned' | 'clear' | 'failed' | null, hammering }
  store = new Observable({ job: null, queue: [] });

  // voiceMode(): 'vibe' | 'dev' — how the agent explains the repair (agent/voice.json)
  #voiceMode;
  #audit; // AuditViewModel, or null (the web version: the old yellow "to verify")

  constructor({ securityModel, mapViewModel, cameraViewModel, connection, history, agentService, bus, voiceMode = () => 'vibe', audit = null }) {
    this.#voiceMode = voiceMode;
    this.#audit = audit?.available ? audit : null;
    this.#security = securityModel;
    this.#map = mapViewModel;
    this.#camera = cameraViewModel;
    this.#connection = connection;
    this.#history = history;
    this.#agentService = agentService;
    this.#bus = bus;
    agentService.onChanged((change) => this.#onAgentChange(change));
  }

  // the security audit judges the repairs (else the person verifies them by hand)
  get audited() { return Boolean(this.#audit); }

  get busy() {
    const { job } = this.store.state;
    return Boolean(job && job.step < STEPS - 1);
  }

  isQueued(path) {
    const { job, queue } = this.store.state;
    return (job?.path === path && this.busy) || queue.includes(path);
  }

  // Repairs a file; if Qubi is busy it waits in line
  start(path) {
    if (!path || this.isQueued(path)) return;
    if (this.busy) {
      this.store.set({ queue: [...this.store.state.queue, path] });
      return;
    }
    this.#run(path);
  }

  startWorst(files) {
    const worst = [...files]
      .filter((f) => f.level === 'red' || (f.level === 'yellow' && f.by !== 'qubi'))
      .sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level])[0];
    if (!worst) return false;
    this.start(worst.path);
    return true;
  }

  // The person checked the agent's fix, or applied the plan themselves. With the audit it is read again
  // first: it is only verified when the audit no longer finds anything. -> true when verified
  async markFixed(historyId = this.store.state.job?.historyId) {
    const entry = this.#history.get(historyId);
    if (!entry) return false;
    if (this.#audit) {
      await this.#audit.check([entry.path], 'repair');
      const now = this.#security.scoreOf(entry.path);
      if (now.level === 'red' || now.level === 'yellow') {
        this.#history.update(historyId, { stillRisky: now.reason || R.stillRisky });
        return false;
      }
      this.#history.update(historyId, { status: 'verified', verifiedBy: 'audit', stillRisky: '', endedAt: new Date().toISOString() });
      this.#bus.emit(EVENTS.repairFinished, { entry: this.#history.get(historyId) });
      if (this.store.state.job?.historyId === historyId) this.close();
      return true;
    }
    this.#history.update(historyId, { status: 'verified', endedAt: new Date().toISOString() });
    this.#security.setScore(entry.path, 'green', R.fixedReason, 'qubi');
    this.#bus.emit(EVENTS.repairFinished, { entry: this.#history.get(historyId) });
    if (this.store.state.job?.historyId === historyId) this.close();
    return true;
  }

  // Puts back the version before the agent's change (Electron asks first)
  async undo(historyId, change) {
    const r = await this.#agentService.undo(change);
    if (!r.ok) return false;
    const entry = this.#history.get(historyId);
    if (!entry) return true; // the file was restored; the task is no longer in the history
    const changes = entry.changes.map((c) => (c.at === change.at && c.path === change.path ? { ...c, undone: true } : c));
    const allUndone = changes.every((c) => c.undone);
    this.#history.update(historyId, { changes, ...(allUndone ? { status: 'planned' } : {}) });
    // with the audit, the file read again says how it is (the disk change triggers that check too)
    if (this.#audit) await this.#audit.check(changes.map((c) => c.path), 'repair');
    else if (allUndone) this.#security.setScore(entry.path, 'red', entry.reason, 'qubi');
    return true;
  }

  close() {
    this.#stop();
    this.store.set({ job: null });
    this.#next();
  }

  // Another project opens: nothing from this one may keep running or write into the new history
  reset() {
    this.store.set({ queue: [] });
    this.#stop();
    this.store.set({ job: null });
  }

  #stop() {
    const { job } = this.store.state;
    if (job && this.busy) {
      this.#history.update(job.historyId, { status: 'failed', error: R.cancelled, endedAt: new Date().toISOString() });
      this.#bus.emit(EVENTS.repairFinished, { entry: this.#history.get(job.historyId) }); // the chat card closes too
    }
    this.#runId++;
    this.#abort?.abort();
    this.#abort = null;
    this.#changes = null;
  }

  #onAgentChange(change) {
    if (!this.#changes) return; // a change made from the chat or an editor, not by a repair
    if (change.worker) return; // a write of Qubi's team (teamViewModel), which works alongside a repair
    // Asked before this job's agent started (e.g. a dialog approved late): it belongs to someone else
    if (change.requestedAt && Date.parse(change.requestedAt) < this.#startedAt) return;
    this.#changes.push(change);
    const { job } = this.store.state;
    if (job) this.store.set({ job: { ...job, hammering: true } });
    this.#bus.emit(EVENTS.repairChanged, { path: job?.path, change });
  }

  async #run(path) {
    const id = ++this.#runId;
    const alive = () => id === this.#runId;
    const score = this.#security.scoreOf(path);
    const reason = score.reason || strings.security.reasons[score.reasonKey] || '';
    const findings = this.#audit ? this.#security.findingsOf(path) : [];
    const spot = this.#map.locateFile(path);
    const live = Boolean(this.#connection?.live);
    const agentLabel = live ? this.#connection.agentLabel : '';
    const historyId = this.#history.add({ path, reason, status: 'working', agent: agentLabel });

    // The map is now on the file's folder: Qubi walks in from the camera side to the edge of its plaza
    this.#camera.flyTo({ x: spot.x, z: spot.z });
    const az = this.#camera.azimuth;
    const toward = (distance) => ({ x: spot.x + Math.sin(az) * distance, z: spot.z + Math.cos(az) * distance });
    const from = toward(spot.radius + 7);
    const to = toward(spot.radius + 0.8); // just outside the plaza
    const walkMs = Math.min(Math.max((Math.hypot(to.x - from.x, to.z - from.z) / WALK_SPEED) * 1000, 1200), 3200);
    const set = (patch) => alive() && this.store.set({ job: { ...this.store.state.job, ...patch } });

    this.store.set({
      job: {
        historyId, path, reason, reasonKey: score.reasonKey, folder: spot.folder, from, to,
        center: { x: spot.x, z: spot.z }, height: spot.height, step: 0, stepMs: walkMs, plan: [],
        source: live ? 'agent' : 'guide', agentLabel, outcome: null, hammering: false,
      },
    });
    this.#bus.emit(EVENTS.repairStarted, { path, agent: agentLabel });

    // While Qubi walks and looks, the agent already starts working
    this.#changes = null;
    this.#abort = new AbortController();
    const work = live ? this.#repairWithAgent(path, reason, findings, this.#abort.signal, alive) : Promise.resolve(null);
    await wait(walkMs);
    set({ step: 1, stepMs: LOOK_MS });
    await wait(LOOK_MS);
    if (!alive()) return;
    set({ step: 2, stepMs: 0 });
    const [answer] = await Promise.all([work, wait(MIN_WORK_MS)]);
    if (!alive()) return;
    const changes = this.#collected ?? [];
    this.#collected = null;
    // With the audit: the whole project is read again and the audit judges the file. Without it: the
    // agent checked it, changed nothing and marked it green, a false alarm
    if (this.#audit) await this.#audit.auditNow('repair');
    if (!alive()) return;
    const verdict = this.#security.scoreOf(path);
    const stillRisky = verdict.level === 'red' || verdict.level === 'yellow';
    const clear = this.#audit ? !stillRisky && !changes.length : live && !changes.length && verdict.by === 'agent' && verdict.level === 'green';

    // Outcome: the agent changed files (to verify), left a plan, or failed; no agent: the guide's plan
    const guidePlan = R.plans[score.reasonKey] ?? R.plans.other;
    let outcome, plan, summary = '', error = '';
    if (live && answer?.error && !answer.text && !changes.length) {
      outcome = 'failed'; plan = guidePlan; error = answer.error;
    } else if (live) {
      summary = answer?.text ?? '';
      plan = parseSteps(summary);
      outcome = changes.length ? (this.#audit && stillRisky ? 'partial' : 'fixed') : clear ? 'clear' : 'planned';
      if (!plan.length) plan = changes.length ? changes.map((c) => c.reason) : guidePlan;
    } else {
      outcome = clear ? 'clear' : 'planned'; plan = guidePlan;
    }

    set({ step: 3, stepMs: CHECK_MS, plan, outcome, hammering: true });
    await wait(CHECK_MS);
    if (!alive()) return;

    if (this.#audit) {
      // the audit decided: fixed is verified, partial still has its finding (shown with its line)
      const status = outcome === 'fixed' ? 'verified' : outcome === 'partial' ? 'fixed' : outcome;
      this.#history.update(historyId, {
        status, plan, changes, summary, error, endedAt: new Date().toISOString(),
        ...(outcome === 'fixed' ? { verifiedBy: 'audit' } : {}),
        ...(stillRisky ? { stillRisky: verdict.reason || R.stillRisky } : {}),
        audit: { level: verdict.level, score: this.#security.store.state.score },
      });
    } else {
      this.#history.update(historyId, { status: outcome, plan, changes, summary, error, endedAt: new Date().toISOString() });
      // 'clear' keeps the agent's green; 'fixed' and 'planned' wait in yellow for the person
      if (outcome === 'fixed') this.#security.setScore(path, 'yellow', R.fixedToVerify(changes.length), 'qubi');
      else if (outcome === 'planned') this.#security.setScore(path, 'yellow', R.plannedReason(plan[0].toLowerCase()), 'qubi');
    }
    set({ step: 4, stepMs: 0, hammering: false, ...(this.#audit && stillRisky ? { stillRisky: verdict.reason || R.stillRisky } : {}) });
    this.#bus.emit(EVENTS.repairFinished, { entry: this.#history.get(historyId) });

    // With more cracks in line, Qubi moves on by himself
    if (this.store.state.queue.length) {
      await wait(2500);
      if (alive()) this.close();
    }
  }

  // The agent reads the file, repairs it if that is safe (each write approved by the person) and
  // explains in plain words; its answer streams into the chat.
  #repairWithAgent(path, reason, findings, signal, alive) {
    const timeout = wait(AGENT_TIMEOUT_MS).then(() => {
      this.#abort?.abort(); // stop the CLI: a late write must not happen after the job ended
      return { text: '', error: R.timeout };
    });
    const ask = this.#connection.ask(R.agentFixPrompt(path, reason, findings), '', {
      session: 'repair',
      voice: { mode: this.#voiceMode(), recent: [] },
      signal,
      onStart: () => { if (alive()) { this.#changes = []; this.#startedAt = Date.now(); } }, // collect from the moment the CLI runs
      onText: (delta) => alive() && this.#bus.emit(EVENTS.repairText, { path, delta }),
      // Each Qubbot tool the agent uses, with the file it works on and the color it sets (the chat's card)
      onEvent: (e) => e.type === 'tool' && !e.parent && alive() && this.#bus.emit(EVENTS.repairTool, { path, name: e.name, target: e.target ?? '', level: e.level ?? null }),
    }).then((answer) => {
      if (alive()) { this.#collected = this.#changes; this.#changes = null; }
      return answer;
    });
    return Promise.race([ask, timeout]).then((answer) => {
      if (alive() && !this.#collected) { this.#collected = this.#changes; this.#changes = null; }
      return answer;
    });
  }

  #next() {
    const [path, ...rest] = this.store.state.queue;
    if (!path) return;
    this.store.set({ queue: rest });
    this.#run(path);
  }
}
