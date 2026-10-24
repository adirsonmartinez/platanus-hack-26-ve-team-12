// Chat with the agent: visible messages, "typing…" state, suggestion chips and minimize.
// Messages coming from the map (alerts, a folder was opened…) are queued while the agent is typing.
import { opensInBrowser, isSecretFile, previewOf, fileKind } from '../models/fileOpen.js';
import { folderGuide } from '../models/folderTags.js';
import { Observable } from '../core/observable.js';
import { EVENTS } from '../core/eventBus.js';
import { strings } from '../i18n/es.js';
import { splitAnswer } from '../models/answerFormat.js';
import { escapeHtml } from '../core/format.js';
import { questionIntent } from '../models/questionIntent.js';

const CHAT = strings.chat;
const CARDS = CHAT.cards;
const RECENT_MESSAGES = 6;
const nameOf = (path) => path.split('/').filter(Boolean).at(-1) ?? path;
// A Platanus tool's short name, whatever prefix the agent CLI adds (mcp__platanus__platanus_read_file -> read_file)
const toolKey = (name) => String(name).replace(/^(?:mcp__)?platanus(?:__|_)?(?:platanus_)?/, '');
// Text the agent writes after using a tool: a new paragraph (unless the text so far is empty or already breaks)
const paragraph = (before, delta) => (before && !/\n\s*$/.test(before) && !/^\s*\n/.test(delta) ? `\n\n${delta}` : delta);
// The newest write step for `path` in a run, changed by fn (the proposed or the applied diff)
const withWriteStep = (run, path, fn) => {
  const index = run.steps.findLastIndex((x) => x.name === 'write_file' && x.target === path);
  return index < 0 ? run : { ...run, steps: run.steps.map((x, i) => (i === index ? fn(x) : x)) };
};
// Tools that change the project (refused when the person only wants to understand)
const CHANGE_TOOLS = new Set(['write_file', 'set_file_score']);
const typingDelay = (reply) => 600 + Math.min((reply.text ?? reply.html ?? '').length * 10, 1600);

export class ChatViewModel {
  #agent;
  #queue = [];
  #showing = null; // the queued reply in its "typing" pause
  #nextId = 1;

  #actions;

  // message: { id, role: 'bot' | 'user' | 'sys' | 'tool', text?, html?, tone?, card? }
  // card: { kind: 'folder' | 'file', ...data, actions: [chip] } (a map event shown as an interactive card)
  // chip: a label (sent as a message) or { label, kind, prompt?, run? }: `run` does an app action (Remi
  //   repairs a file…), otherwise `prompt ?? label` is sent. kind picks its icon (ask, repair, audit, locate…)
  // welcome: the empty conversation shows a welcome screen with suggestions (as in Obra) instead of bubbles
  // gitPrefill: string set momentarily when a git chip is clicked; the view reads it and fills the textarea
  // focus: the place the robot is on ({ title, path, level, kind }), shown on top of the chat and attached to
  // what the person asks meanwhile (the agent is told what "aquí" is); null when there is none
  store = new Observable({ messages: [], typing: false, chips: null, minimized: false, welcome: true, projectName: '', gitPrefill: '', focus: null });

  #connection;

  #shownFromChat = null; // a file the chat asked the map to show (its map card is not repeated)
  #isTech;

  // isTech(): Dev mode (files saved by other programs are only posted in the conversation there)
  constructor({ agentModel, bus, actions = {}, connection = null, isTech = () => true }) {
    this.#isTech = isTech;
    this.#agent = agentModel;
    this.#connection = connection;
    this.#actions = actions;

    bus.on(EVENTS.projectCreated, ({ name }) => this.sayFromMap({ text: CHAT.projectCreated(name) }));
    bus.on(EVENTS.projectCreateFailed, ({ error }) => this.sayFromMap({ text: CHAT.projectCreateFailed(error), tone: 'alert' }));

    bus.on(EVENTS.projectOpened, ({ name }) => {
      this.store.set({ chips: null, projectName: name, focus: null });
      this.#push({ role: 'sys', text: CHAT.projectOpened(name) });
      this.store.set({ chips: this.suggestions() });
    });

    bus.on(EVENTS.projectClosed, ({ name }) => {
      this.store.set({ chips: null, projectName: '', focus: null });
      this.#push({ role: 'sys', text: CHAT.projectClosed(name) });
    });

    // Repairs: one card per repair, shaped like the agent's run card (run.kind 'repair'): Remi's steps,
    // the agent's explanation streaming in, and the result at the end. Nothing else is posted around it.
    const RC = strings.repair.chat;
    let repairId = null;
    let repairStep = 0;
    const repair = (fn) => repairId !== null && this.#update(repairId, (m) => ({ ...m, run: fn(m.run) }));
    // running steps end; a write that never got its saved change (rejected, failed) ends as not saved
    const settle = (status = 'done') => repair((r) => ({ ...r, steps: r.steps.map((x) => (x.status !== 'running' ? x : { ...x, status: x.name === 'write_file' && !x.diff ? 'error' : status, endedAt: Date.now() })) }));
    bus.on(EVENTS.repairStarted, ({ path, agent }) => {
      this.store.set({ minimized: false, chips: null, welcome: false });
      // The map card Remi's flight just queued (waiting, or already in its "typing" pause) is not shown
      this.#queue = this.#queue.filter((reply) => !reply.card);
      if (this.#showing?.card) this.#showing.dropped = true;
      repairId = this.#push({
        role: 'bot', text: '',
        run: { kind: 'repair', path, agent: RC.title(agent), agentId: 'remi', startedAt: Date.now(), endedAt: null, status: 'running', steps: [], result: null },
      });
    });
    let repairBreak = false; // a tool ran since the last text: the next text starts a new paragraph
    bus.on(EVENTS.repairText, ({ delta }) => {
      if (repairId === null) return;
      settle();
      this.#append(repairId, repairBreak ? paragraph(this.#textOf(repairId), delta) : delta);
      repairBreak = false;
    });
    bus.on(EVENTS.repairTool, ({ name, target = '', level = null }) => {
      settle();
      repairBreak = true;
      // its change was already reported (saved first): the tool takes that step instead of adding one
      const early = repairId !== null && this.store.state.messages.find((m) => m.id === repairId)?.run.steps.find((x) => x.fromChange && x.name === toolKey(name) && x.target === target);
      if (early) return void repair((r) => ({ ...r, steps: r.steps.map((x) => (x === early ? { ...x, fromChange: false } : x)) }));
      repair((r) => ({ ...r, steps: [...r.steps, { id: `r${++repairStep}`, kind: 'tool', name: toolKey(name), target, level, parent: null, status: 'running', startedAt: Date.now(), endedAt: null }] }));
    });
    bus.on(EVENTS.repairChanged, ({ change }) => {
      repair((r) => {
        const saved = (x) => ({ ...x, status: 'done', endedAt: Date.now(), diff: change.diff ?? null, reason: change.reason });
        // its write step (started by the tool call) is completed; a change with no step gets one
        if (r.steps.some((x) => x.name === 'write_file' && x.target === change.path)) return withWriteStep(r, change.path, saved);
        return { ...r, steps: [...r.steps, saved({ id: `r${++repairStep}`, kind: 'tool', name: 'write_file', target: change.path, parent: null, startedAt: Date.now(), fromChange: true })] };
      });
    });
    bus.on(EVENTS.repairFinished, ({ entry }) => {
      const done = RC.finished;
      const text = {
        fixed: () => done.fixed(entry.path, entry.changes.length),
        planned: () => `${done.planned(entry.path)}${entry.summary ? '' : `\n${RC.planTitle}\n${entry.plan.map((s, i) => `${i + 1}. ${s}`).join('\n')}`}`,
        failed: () => done.failed(entry.path, entry.error),
        clear: () => done.clear(entry.path),
        verified: () => done.verified(entry.path),
      }[entry.status]?.();
      if (!text) return;
      const chips = this.#actions.showRepairs ? [{ label: strings.repair.history.title, run: this.#actions.showRepairs }] : undefined;
      const card = repairId !== null && this.store.state.messages.find((m) => m.id === repairId)?.run;
      if (card?.status === 'running' && card.path === entry.path) {
        const failed = entry.status === 'failed';
        settle(failed ? 'error' : 'done');
        repair((r) => ({ ...r, status: failed ? 'error' : 'done', endedAt: Date.now(), result: { status: entry.status, text } }));
        repairId = null;
        if (chips) this.store.set({ chips });
        return;
      }
      // A result with no card on screen (verifying later from the history): one row with its icon
      this.sayFromMap({ text, result: entry.status, tone: entry.status === 'failed' ? 'alert' : '', chips });
    });
    // Another project opens (or this one closes): a repair card still working stops there, and the map
    // cards it was hiding come back
    const dropRepair = () => {
      const card = repairId !== null && this.store.state.messages.find((m) => m.id === repairId)?.run;
      if (card?.status === 'running') {
        settle('error');
        repair((r) => ({ ...r, status: 'error', endedAt: Date.now(), result: { status: 'failed', text: RC.finished.failed(card.path, strings.repair.cancelled) } }));
      }
      repairId = null;
    };
    bus.on(EVENTS.projectOpened, dropRepair);
    bus.on(EVENTS.projectClosed, dropRepair);

    // The agent waits for the person to approve a change (Manual mode): the working card says so
    // …and the change it proposes is shown on its write step, so the person sees what they approve
    // (the card that is writing that file; a question waiting its turn never gets it)
    bus.on(EVENTS.agentAwaiting, ({ path, waiting, diff }) => {
      if (!waiting) {
        for (const m of this.store.state.messages.filter((x) => x.run?.awaiting === path)) this.#update(m.id, (x) => ({ ...x, run: { ...x.run, awaiting: null } }));
        return;
      }
      const card = this.#writingCard(path);
      if (card) this.#update(card.id, (m) => ({ ...m, run: { ...withWriteStep(m.run, path, (x) => (diff ? { ...x, proposed: diff } : x)), awaiting: path } }));
    });
    // A change the agent saved: its diff goes on the write step of the card that asked for it. Agents that
    // report a tool only after it ends (OpenCode) get the step here; their tool event joins it later.
    bus.on(EVENTS.agentChanged, (change) => {
      const card = this.#writingCard(change.path, { chatOnly: true });
      if (!card) return;
      const saved = (x) => ({ ...x, diff: change.diff ?? null, reason: change.reason });
      this.#update(card.id, (m) => {
        if (m.run.steps.some((x) => x.name === 'write_file' && x.target === change.path)) return { ...m, run: withWriteStep(m.run, change.path, saved) };
        const step = saved({ id: `change-${this.#nextId++}`, kind: 'tool', name: 'write_file', target: change.path, parent: null, status: 'done', fromChange: true, startedAt: Date.now(), endedAt: Date.now() });
        return { ...m, run: { ...m.run, steps: [...m.run.steps, step] } };
      });
    });

    // The robot dropped on a folder (or the plaza) asks what to do there (robotViewModel.js)
    bus.on(EVENTS.robotLanded, (place) => {
      const RC = strings.robot.chat;
      const folder = place.kind === 'folder';
      const name = folder ? `${place.name}/` : place.name;
      const risks = RC.risks(place.red, place.yellow);
      const actions = this.placeActions(place);
      // A card with a clear title: what the place is in plain words, where it is, what it holds, its risks
      const guide = folder ? folderGuide(place.path) : null;
      const tag = guide?.tags.find((t) => strings.tour.parts[t]) ?? 'other';
      const card = {
        kind: 'place',
        title: folder ? strings.describeFolder(guide, place.name).name : place.name,
        path: folder ? `${place.path}/` : '',
        where: folder ? RC.where(`${place.path}/`, place.files ?? 0) : RC.wholeProject,
        summary: folder ? strings.tour.parts[tag] : RC.projectSummary,
        level: place.red ? 'red' : place.yellow ? 'yellow' : 'green',
        risks,
        question: strings.robot.ask,
        actions,
      };
      this.sayFromMap({ card, tone: place.red ? 'alert' : '' });
      this.store.set({ focus: { title: card.title, path: card.path, level: card.level, kind: place.kind } });
    });

    // The tour ("Recorrido", tourViewModel.js): one card that follows it, with its buttons
    let tourId = null;
    const TOUR = strings.tour;
    const setTour = (card) => tourId !== null && this.#update(tourId, (m) => ({ ...m, card }));
    bus.on(EVENTS.tourStarted, () => {
      this.store.set({ minimized: false, chips: null, welcome: false });
      tourId = this.#push({ role: 'bot', card: { kind: 'tour', status: 'analyzing', actions: [this.#tourButton('tourExit', TOUR.exit)] } });
    });
    bus.on(EVENTS.tourStep, (state) => setTour({ kind: 'tour', status: 'playing', ...state, actions: this.#tourActions(state) }));
    bus.on(EVENTS.tourEnded, () => {
      const card = this.store.state.messages.find((m) => m.id === tourId)?.card;
      if (card) setTour({ ...card, status: 'done', actions: this.#actions.startTour ? [{ kind: 'tour', label: TOUR.again, run: this.#actions.startTour, quiet: true }] : [] });
      tourId = null;
    });

    // Editors and tools write temporary files (x.tmp.123, x~, .swp…): they are not changes worth a message
    bus.on(EVENTS.diskChanged, ({ paths }) => {
      if (!this.#isTech()) return; // Vibe: the map shows it; the conversation stays on what the person asked
      const real = paths.filter((p) => !/(\.tmp(\.|$)|~$|\.sw[op]$|(^|\/)\.![0-9]+!|\.DS_Store$|(^|\/)\.atl\/)/.test(p));
      if (!real.length) return;
      // A card with a button per file (up to three); saves in a row join the last card instead of piling up
      const last = this.store.state.messages.at(-1);
      const all = [...new Set([...(last?.card?.kind === 'changes' ? last.card.paths : []), ...real])];
      const card = { kind: 'changes', paths: all, actions: this.#actions.entryOf ? all.slice(0, 3).map((p) => ({ kind: 'open', label: CHAT.suggest.open(nameOf(p)), run: () => this.openFile(p), quiet: true })) : [] };
      if (last?.card?.kind === 'changes') this.#update(last.id, (m) => ({ ...m, card }));
      else this.#push({ card });
    });

    bus.on(EVENTS.supabaseVulnerable, () =>
      this.sayFromMap({ html: strings.agent.vulnerability.alert, tone: 'alert', chips: CHAT.chips.vulnerability }));

    bus.on(EVENTS.tableSelected, ({ name, columns, rlsEnabled }) => {
      if (rlsEnabled) {
        const keys = columns.filter((c) => c.key).map((c) => `${c.name} (${c.key})`).join(', ');
        this.sayFromMap({ text: CHAT.tableOk(name, columns.length, keys) });
      } else {
        const exposed = columns.filter((c) => c.sensitive).map((c) => c.name).join(', ');
        this.sayFromMap({ html: CHAT.tableExposed(name, exposed), tone: 'alert', chips: [CHAT.chips.fixNow] });
      }
    });

    // While a repair runs, Remi moves the map: its folder and file cards would only interrupt the repair's card
    bus.on(EVENTS.folderOpened, (detail) => repairId === null && this.sayFromMap({ card: this.#folderCard(detail), tone: detail.counts.red ? 'alert' : '' }));

    bus.on(EVENTS.fileSelected, (file) => {
      if (repairId !== null) return;
      // "Ver en el mapa" from a card already in the chat: the map shows it, no second card
      if (file.path === this.#shownFromChat) { this.#shownFromChat = null; return; }
      this.sayFromMap({ card: this.#fileCard(file), tone: file.level === 'red' ? 'alert' : '' });
    });

    bus.on(EVENTS.commitSelected, (commit) => {
      const lane = strings.git.laneNames[commit.lane] ?? commit.lane;
      const laneText = commit.laneLive ? lane : `${lane} (${strings.git.deleted})`;
      const text = strings.git.commitSelected({ ...commit, lane: laneText }) + (commit.risk ? strings.git.riskWarning(commit.risk.files) : '');
      const GIT_STR = strings.agent.git;
      // Actionable chips: clicking them runs the git command directly in one click
      const chips = GIT_STR ? [
        { label: GIT_STR.chipRevert(commit.short), directCommand: `rollback al commit ${commit.short}` },
        { label: GIT_STR.chipReset(commit.short),  directCommand: `reset al commit ${commit.short}` },
      ] : undefined;
      this.sayFromMap({ text, tone: commit.risk ? 'alert' : '', chips });
    });

    this.store.set({ chips: [CHAT.chips.openFolder] });
  }

  // Back to the welcome screen with a fresh conversation
  newChat() {
    if (this.store.state.typing) return;
    this.#queue = [];
    this.store.set({ messages: [], welcome: true, chips: this.store.state.projectName ? this.suggestions() : [CHAT.chips.openFolder], minimized: false, focus: null });
  }

  // The person closes the place on top of the chat: what they ask next is not about it
  clearFocus() {
    this.store.set({ focus: null });
  }

  // intent: 'explain' | 'change' | 'other' (chips can say it; otherwise it comes from the words,
  // models/questionIntent.js). To explain, the agent only reads and no repair is offered after.
  async send(text, { intent = null } = {}) {
    text = text.trim();
    if (!text || this.store.state.typing) return;
    const recent = this.#recentUserTexts();
    const { focus } = this.store.state;
    const wants = intent ?? questionIntent(text);
    this.store.set({ chips: null, welcome: false });
    this.#push({ role: 'user', text, intent: wants, ...(focus ? { context: focus } : {}) });
    // what the agent is told besides the question (the bubble keeps the plain text): where the robot is,
    // so "aquí" means that place, and that the person only wants to understand
    const notes = [focus && CHAT.contextNote(focus), wants === 'explain' && CHAT.explainNote].filter(Boolean);
    const asked = notes.length ? `${notes.join('\n')}\n\n${text}` : text;
    if (this.#connection?.live) {
      // With "Comparar respuestas", the same question goes to a second agent at the same time
      const second = this.#connection.store.state.compareWith;
      this.store.set({ typing: true });
      await Promise.all([this.#sendLive(asked, null, recent, focus, wants), second && this.#sendLive(asked, second, recent, focus, wants)].filter(Boolean));
      this.store.set({ typing: false });
      this.#next(); // map messages that arrived while the answers were streaming
      return;
    }
    // Scripted demo (or no agent): show "typing…" and the reply
    // A connected agent streams its answer into a bubble that grows; a tool use starts a new one.
    this.store.set({ typing: true });
    let streamId = null;
    let streamed = false;
    let reply;
    try {
      reply = await this.#agent.reply(asked, {
        recent,
        onTool: (name) => { streamId = null; this.#startStep({ tool: toolKey(name) }, CHAT.toolUsed(name)); },
        onText: (delta) => {
          this.#finishSteps();
          if (streamId === null) { streamId = this.#push({ role: 'bot', text: '' }); this.store.set({ typing: false }); }
          streamed = true;
          this.#append(streamId, delta);
        },
        // The agent's reasoning goes in the same bubble, folded above the answer
        onThinking: (delta) => {
          if (streamId === null) { streamId = this.#push({ role: 'bot', text: '', thinking: '' }); this.store.set({ typing: false }); }
          this.#appendThinking(streamId, delta);
        },
      });
    } catch (error) {
      // Never leave the chat stuck on "typing…" if the agent throws
      reply = { html: strings.agent.git.failed(escapeHtml(String(error?.message ?? error))), tone: 'alert' };
    }
    this.store.set({ typing: false });
    this.#finishSteps();
    if (!streamed || reply.tone === 'alert') this.#enqueue(reply);
    else {
      this.store.set({ chips: this.#suggestionChips(reply.text) ?? reply.chips ?? null });
      this.#next(); // map messages that arrived while the answer was streaming
    }
  }

  // The user's own agent answers as one "run": a live card with its steps (reasoning, Platanus tools,
  // subagents and their tools), the answer as it streams, and time/turns/tokens at the end.
  // run: { agent, model, effort, startedAt, endedAt, status: 'running'|'done'|'error', steps, result }
  // step: { id, kind: 'tool'|'subagent', name?, target?, description?, agentKind?, parent, status, startedAt, endedAt, output? }
  // The running card (not one waiting its turn) that writes `path`: the one with its write step, else
  // the newest one working. chatOnly: repairs get their changes through repairChanged.
  #writingCard(path, { chatOnly = false } = {}) {
    const working = this.store.state.messages.filter((m) => m.run?.status === 'running' && !m.run.queued && !(chatOnly && m.run.kind === 'repair'));
    return working.findLast((m) => m.run.steps.some((x) => x.name === 'write_file' && x.target === path)) ?? working.at(-1) ?? null;
  }

  async #sendLive(text, otherAgent = null, recent = [], about = null, intent = 'other') {
    const state = this.#connection.store.state;
    const agentId = otherAgent ?? state.selected;
    const label = state.agents?.find((a) => a.id === agentId)?.label ?? (otherAgent ? agentId : this.#connection.agentLabel);
    const model = otherAgent ? '' : state.model;
    const effort = otherAgent ? null : state.effort;
    const id = this.#push({
      role: 'bot', text: '', thinking: '',
      // queued: waiting in line behind another run of the same agent (a repair…) until onStart
      run: { agent: label, agentId, model, effort: effort ?? state.effort, compare: Boolean(state.compareWith), startedAt: Date.now(), endedAt: null, status: 'running', queued: true, steps: [], result: null, intent, ...(about ? { about } : {}) },
    });
    const run = (fn) => this.#update(id, (m) => ({ ...m, run: fn(m.run) }));
    const step = (stepId, fn) => run((r) => ({ ...r, steps: r.steps.map((x) => (x.id === stepId ? fn(x) : x)) }));
    let textBreak = false; // a tool ran since the last text: the next text starts a new paragraph
    const onEvent = (e) => {
      switch (e.type) {
        case 'thinking':
          if (e.parent) step(e.parent, (x) => ({ ...x, thinking: (x.thinking ?? '') + e.delta }));
          else this.#update(id, (m) => ({ ...m, thinking: m.thinking + e.delta }));
          break;
        case 'text': // a subagent's text belongs to its step; the main text arrives through onText
          if (e.parent) step(e.parent, (x) => ({ ...x, output: (x.output ?? '') + e.delta }));
          break;
        case 'tool':
          if (!e.parent) textBreak = true;
          run((r) => {
            if (r.steps.some((x) => x.id === e.id)) return r; // the same call reported twice
            // a write the app already showed (its change arrived first): the tool event takes that step
            const early = r.steps.findIndex((x) => x.fromChange && x.name === e.name && x.target === (e.target ?? ''));
            if (early >= 0) return { ...r, steps: r.steps.map((x, i) => (i === early ? { ...x, id: e.id, fromChange: false, status: 'running' } : x)) };
            return { ...r, steps: [...r.steps, { id: e.id, kind: 'tool', name: e.name, target: e.target ?? '', level: e.level ?? null, parent: e.parent ?? null, status: 'running', startedAt: Date.now(), endedAt: null }] };
          });
          break;
        case 'subagent':
          run((r) => ({ ...r, steps: [...r.steps, { id: e.id, kind: 'subagent', description: e.description, agentKind: e.kind ?? '', parent: e.parent ?? null, status: 'running', startedAt: Date.now(), endedAt: null, output: '' }] }));
          break;
        case 'tool_done':
          // explaining runs read-only: a change it tried and was refused is "skipped", not a failure
          step(e.id, (x) => ({ ...x, status: e.error ? (intent === 'explain' && CHANGE_TOOLS.has(x.name) ? 'skipped' : 'error') : 'done', endedAt: Date.now() }));
          break;
        case 'result':
          run((r) => ({ ...r, result: { durationMs: e.durationMs, turns: e.turns, inputTokens: e.inputTokens, outputTokens: e.outputTokens } }));
          break;
        default:
      }
    };
    const reply = await this.#agent.reply(text, {
      readOnly: intent === 'explain', // to explain, its tools can only read
      recent,
      onEvent,
      onStart: () => run((r) => ({ ...r, queued: false, startedAt: Date.now() })),
      onText: (delta) => { this.#append(id, textBreak ? paragraph(this.#textOf(id), delta) : delta); textBreak = false; },
      ...(otherAgent ? { agent: otherAgent } : {}),
    });
    const failed = reply.tone === 'alert';
    run((r) => ({
      ...r,
      status: failed ? 'error' : 'done',
      endedAt: Date.now(),
      steps: r.steps.map((x) => (x.status === 'running' ? { ...x, status: failed ? 'error' : 'done', endedAt: Date.now() } : x)),
    }));
    if (failed) this.#update(id, (m) => ({ ...m, run: { ...m.run, error: reply.html ?? '' } }));
    else if (!this.store.state.messages.find((m) => m.id === id)?.text && reply.text) this.#update(id, (m) => ({ ...m, text: reply.text }));
    const answer = this.store.state.messages.find((m) => m.id === id)?.text ?? '';
    const chips = failed ? null : this.#suggestionChips(answer, intent);
    if (chips ?? reply.chips) this.store.set({ chips: chips ?? reply.chips });
  }

  // The person's last messages, oldest first (the agent adapts to how they write)
  #recentUserTexts() {
    return this.store.state.messages.filter((m) => m.role === 'user' && m.text).slice(-RECENT_MESSAGES).map((m) => m.text);
  }

  // The answer's ```sugerencias block -> chips (only actions the app can do here)
  // After an explanation, only ways to keep understanding (open, see, ask): never repair or audit
  #suggestionChips(text, intent = 'other') {
    const a = this.#actions;
    const explaining = intent === 'explain';
    const chips = splitAnswer(text).suggestions.filter((s) => !(explaining && (s.kind === 'repair' || s.kind === 'audit'))).map((s) => {
      const name = s.path ? nameOf(s.path) : '';
      switch (s.kind) {
        case 'repair': return a.repair && { kind: 'repair', label: CHAT.suggest.repair(name), run: (from) => a.repair(s.path, from) };
        case 'audit': return { kind: 'audit', label: CHAT.suggest.audit(name), prompt: CHAT.auditPrompt(s.path, '') };
        case 'locate': return a.locate && { kind: 'locate', label: CHAT.suggest.locate(name), run: () => a.locate(s.path) };
        case 'open': return a.entryOf && { kind: 'open', label: CHAT.suggest.open(name), run: () => this.openFile(s.path) };
        default: return { kind: 'ask', label: s.text };
      }
    }).filter(Boolean);
    return chips.length ? chips : null;
  }

  #folderCard({ name, files, folders, counts }) {
    const a = this.#actions;
    const risky = counts.red + counts.yellow > 0;
    return {
      kind: 'folder', name, files, folders, counts,
      hint: !files ? CARDS.folderEmpty : risky ? CARDS.folderHintRisk : CARDS.folderHint,
      actions: [
        risky && a.showRisks && { kind: 'risks', label: CARDS.seeRisks, run: () => a.showRisks() },
        risky && a.repairWorst && { kind: 'repair', label: strings.repair.chipWorst, run: (from) => a.repairWorst(from) },
        files > 0 && { kind: 'ask', label: CARDS.explainFolder, prompt: CARDS.explainFolderPrompt(name), intent: 'explain' },
      ].filter(Boolean),
    };
  }

  // fromChat: opened from the chat (a file name, a chip): it also offers to show it on the map
  #fileCard({ path, level: scored, reason, by }, { fromChat = false } = {}) {
    const a = this.#actions;
    // Green only by the demo rule means nobody checked it yet: it says so instead of "Seguro"
    const unchecked = by === 'demo' && scored === 'green';
    const level = unchecked ? 'grey' : scored;
    const risky = level === 'red' || level === 'yellow';
    const open = (how) => () => a.openFile(path, how).then((r) => { if (!r?.ok) this.#push({ role: 'sys', text: r?.error && r.error !== 'desktop-only' ? r.error : CARDS.openFailed }); });
    return {
      kind: 'file', path, name: nameOf(path), level, reason,
      source: unchecked ? CARDS.notReviewed : { agent: strings.security.byAgent, remi: strings.security.byRemi }[by] ?? strings.security.byDemo,
      actions: [
        a.openFile && opensInBrowser(path) && !isSecretFile(path) && { kind: 'open', label: CARDS.openBrowser, run: open('default'), quiet: true },
        { kind: 'ask', label: CARDS.whatIsIt, prompt: CARDS.whatIsItPrompt(path), intent: 'explain' },
        risky && a.repair && { kind: 'repair', label: strings.repair.chip, run: (from) => a.repair(path, from) },
        risky && { kind: 'audit', label: CARDS.audit, prompt: CHAT.auditPrompt(path, reason) },
        level === 'grey' && { kind: 'audit', label: CARDS.reviewIt, prompt: CHAT.auditPrompt(path, '') },
        // The map (a security radar) only draws files with problems
        fromChat && risky && a.locate && { kind: 'locate', label: CARDS.onMap, run: () => { this.#shownFromChat = path; a.locate(path); }, quiet: true },
        a.openFile && { kind: 'reveal', label: CARDS.reveal, run: open('reveal'), quiet: true },
      ].filter(Boolean),
    };
  }

  // A file name tapped in the chat (or an "Abrir x" chip): its card with the first lines and what can be
  // done with it. A folder goes to the map; secrets are never shown.
  async openFile(path) {
    const a = this.#actions;
    const entry = await a.entryOf?.(path);
    if (entry?.type === 'dir') return a.locate?.(path);
    if (!entry) return this.#push({ role: 'sys', text: CHAT.notInProject(path) });
    const secret = isSecretFile(path);
    const parent = path.split('/').slice(0, -1).join('/');
    const card = {
      ...this.#fileCard({ ...a.fileInfo?.(path), path }, { fromChat: true }),
      fileKind: fileKind(path), // Modo Vibe says what it is instead of showing code
      where: parent ? strings.describeFolder(folderGuide(parent), nameOf(parent)).name : null,
      preview: secret ? 'secret' : 'loading',
    };
    const id = this.#push({ card, tone: card.level === 'red' ? 'alert' : '' });
    if (secret || !a.readFile) return id;
    a.readFile(path).then((r) => {
      const preview = r?.ok ? previewOf(r.data) ?? 'binary' : 'error';
      this.#update(id, (m) => ({ ...m, card: { ...m.card, preview } }));
    });
    return id;
  }

  #update(id, fn) {
    this.store.set({ messages: this.store.state.messages.map((m) => (m.id === id ? fn(m) : m)) });
  }

  // A chip with an action runs it; a plain chip is sent as a message
  // `source`: the clicked button (Remi jumps from there to the map)
  choose(chip, source = null) {
    if (typeof chip === 'string') return this.send(chip);
    if (chip.directCommand) return this.send(chip.directCommand);
    if (!chip.run) return this.send(chip.prompt ?? chip.label, { intent: chip.intent ?? null });
    chip.run(source); // first, while the button is still on screen
    this.store.set({ chips: null, welcome: false });
    if (!chip.quiet) this.#push({ role: 'user', text: chip.label }); // opening or showing a file says nothing
  }

  // What the person can do where the robot landed (its chat card and its bubble on the map show the same)
  placeActions(place) {
    const RC = strings.robot.chat;
    const a = this.#actions;
    const folder = place.kind === 'folder';
    const name = folder ? `${place.name}/` : place.name;
    return [
      { kind: 'ask', label: folder ? RC.explain : RC.explainProject, prompt: folder ? RC.explainPrompt(name) : RC.explainProjectPrompt, intent: 'explain' },
      a.draft && { kind: 'edit', label: RC.change, run: () => a.draft(RC.changeDraft(name)), quiet: true },
      folder && RC.risks(place.red, place.yellow) && a.locate && { kind: 'locate', label: RC.risks2, run: () => a.locate(place.path), quiet: true },
      !folder && a.startTour && { kind: 'tour', label: RC.tour, run: a.startTour, quiet: true },
    ].filter(Boolean);
  }

  #tourButton(kind, label) {
    const run = this.#actions[kind];
    return { kind, label, run: () => run?.(), quiet: true };
  }

  // Buttons of the tour card: the stop's own chips on the last one (open the doc, see the folder, ask)
  #tourActions({ index, total, step }) {
    const T = strings.tour;
    const a = this.#actions;
    const last = index === total - 1;
    const own = last ? [
      step.open && a.openFile && { kind: 'open', label: T.chips.open(nameOf(step.open)), run: () => this.openFile(step.open), quiet: true },
      step.folder && a.locate && { kind: 'locate', label: T.chips.folder(nameOf(step.folder)), run: () => a.locate(step.folder), quiet: true },
      step.ask && { kind: 'ask', label: T.chips.ask, prompt: step.ask },
    ] : [];
    return [
      ...own,
      index > 0 && this.#tourButton('tourPrev', T.prev),
      !last && this.#tourButton('tourNext', T.next),
      this.#tourButton('tourExit', last ? T.finish : T.exit),
    ].filter(Boolean);
  }

  suggestions() {
    const a = this.#actions;
    return [
      a.startTour && { kind: 'tour', label: strings.tour.chip, run: a.startTour, quiet: true },
      a.repairWorst && { kind: 'repair', label: strings.repair.chipWorst, run: a.repairWorst },
      ...CHAT.chips.suggestions.slice(2),
    ].filter(Boolean);
  }

  // Map messages open the chat if it was minimized
  sayFromMap(reply) {
    this.store.set({ chips: null, minimized: false, welcome: false });
    this.#enqueue(reply);
  }

  toggleMinimized() {
    this.store.set({ minimized: !this.store.state.minimized });
  }

  // Pre-fills the chat textarea with a git command so the user can review and confirm before sending.
  // The store field is cleared after one tick so it only triggers once per click.
  #prefillGitCommand(command) {
    this.store.set({ minimized: false, welcome: false, gitPrefill: command });
    setTimeout(() => this.store.set({ gitPrefill: '' }), 0);
  }

  // Activity rows ("Leyendo un archivo…"): only the newest one works (an orb in the view), the rest are done
  #startStep(step, text) {
    this.#finishSteps();
    return this.#push({ role: 'step', text, step: { ...step, status: 'running', startedAt: Date.now() } });
  }

  #finishSteps(status = 'done') {
    const { messages } = this.store.state;
    if (!messages.some((m) => m.step?.status === 'running')) return;
    this.store.set({ messages: messages.map((m) => (m.step?.status === 'running' ? { ...m, step: { ...m.step, status, endedAt: Date.now() } } : m)) });
  }

  #textOf(id) {
    return this.store.state.messages.find((m) => m.id === id)?.text ?? '';
  }

  #push(message) {
    const id = this.#nextId++;
    this.store.set({ messages: [...this.store.state.messages, { id, ...message }] });
    return id;
  }

  #appendThinking(id, delta) {
    this.store.set({ messages: this.store.state.messages.map((m) => (m.id === id ? { ...m, thinking: (m.thinking ?? '') + delta } : m)) });
  }

  #append(id, delta) {
    this.store.set({ messages: this.store.state.messages.map((m) => (m.id === id ? { ...m, text: m.text + delta } : m)) });
  }

  #enqueue(reply) {
    this.#queue.push(reply);
    if (!this.store.state.typing) this.#next();
  }

  // Shows "typing…", then the reply after a delay that depends on its length
  #next() {
    const reply = this.#queue.shift();
    this.#showing = reply ?? null;
    if (!reply) return;
    this.store.set({ typing: true });
    setTimeout(() => {
      if (reply.dropped) this.store.set({ typing: false });
      else {
        this.#push({ role: 'bot', text: reply.text, html: reply.html, tone: reply.tone, card: reply.card, result: reply.result });
        this.store.set({ typing: false, chips: reply.chips ?? this.store.state.chips });
        reply.then?.();
      }
      this.#next();
    }, typingDelay(reply));
  }
}
