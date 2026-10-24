// Which agent answers the chat: the scripted demo, or the user's own subscription (Claude, Grok, Codex)
// with a model and an effort level. Also the address of the local MCP server for external agents.
import { Observable } from '../core/observable.js';

export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

// Models per agent, verified against each CLI installed here (Claude Code 2.1.310, Grok 1.0.67, Codex):
// id = what the CLI's model flag takes ('' = the default of the person's plan); label = name + version;
// tier = key of strings.connect.modelNotes. Efforts are the values each CLI accepts, lowest first.
export const CATALOG = {
  claude: {
    models: [
      { id: '', label: null, tier: 'plan' },
      { id: 'fable', label: 'Fable 5.1', tier: 'best' },
      { id: 'opus', label: 'Opus 5.5', tier: 'deep' },
      { id: 'sonnet', label: 'Sonnet 5.5', tier: 'balanced' },
      { id: 'haiku', label: 'Haiku 5.5', tier: 'fast' },
    ],
    efforts: EFFORTS,
    defaultEffort: 'low',
  },
  grok: {
    models: [
      { id: '', label: null, tier: 'plan' },
      { id: 'grok-4.7', label: 'Grok 4.7', tier: 'newest' },
      { id: 'grok-4.7-build-fast', label: 'Grok 4.7 Fast', tier: 'fastPricey' },
      { id: 'grok-4.6', label: 'Grok 4.6', tier: 'previous' },
    ],
    efforts: ['low', 'medium', 'high', 'xhigh'],
    defaultEffort: 'low',
  },
  codex: {
    models: [
      { id: '', label: null, tier: 'plan' },
      { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', tier: 'newest' },
      { id: 'gpt-6-sol', label: 'GPT-6 Sol', tier: 'deep' },
      { id: 'gpt-6-luna', label: 'GPT-6 Luna', tier: 'fast' },
    ],
    efforts: EFFORTS,
    defaultEffort: 'low',
  },
};

// OpenCode: the model its account or keys provide (provider/model ids depend on the person's setup)
CATALOG.opencode = { models: [{ id: '', label: null, tier: 'plan' }], efforts: ['low'], defaultEffort: 'low' };

// The development simulator (PLATANUS_SIM=1, scripts/sim): one model, any effort
CATALOG.sim = { models: [{ id: '', label: null, tier: 'plan' }], efforts: ['low'], defaultEffort: 'low' };

// Display name of a model id for an agent (null = the plan's default)
export const modelLabel = (agent, id) => CATALOG[agent]?.models.find((m) => m.id === id)?.label ?? null;

const CHOICE_KEY = 'platanus.agent.choice.v1';
// Which connected agent answers when the person never chose one
const AUTO_ORDER = ['claude', 'codex', 'grok', 'opencode'];
const STATS_KEY = 'platanus.agent.stats.v1';
const MAX_ACTIVITY = 30;

// Audit log entry of the main process -> activity row ({ at, tool, path, ok, error })
const toActivity = (e) => ({ at: Date.parse(e.at) || Date.now(), tool: String(e.action).replace(/^mcp:(platanus_)?/, ''), path: e.path ?? '', ok: Boolean(e.ok), error: e.detail ?? '' });

export class AgentConnectionModel {
  #service;
  #hadChoice = false;
  #turns = new Map(); // "agent:session" -> messages sent (to continue the conversation)
  #queues = new Map(); // agent -> promise: one run at a time per agent (chat and Remi never talk over
                       // each other); different agents (compare) run at the same time

  // agents: [{ id, label, installed, loggedIn: true | false | null }]
  // stats: { [agent]: { runs, tokens, lastUsedAt, lastError } } · activity: MCP calls, newest first
  // testing / testResult: the "Probar" button per agent · compareWith: second agent for the same question
  store = new Observable({
    agents: [], selected: null, model: '', effort: 'low', compareWith: null,
    mcp: { url: null, running: false }, isDesktop: false,
    stats: {}, activity: [], testing: {}, testResult: {},
  });

  constructor(service) {
    this.#service = service;
    this.store.set({ isDesktop: service.isDesktop, stats: this.#loadStats(), ...this.#loadChoice() });
    service.onMcpStatus((mcp) => this.store.set({ mcp }));
    service.onAudit?.((entry) => {
      if (!String(entry.action).startsWith('mcp:')) return;
      this.store.set({ activity: [toActivity(entry), ...this.store.state.activity].slice(0, MAX_ACTIVITY) });
    });
  }

  async refresh() {
    const [agents, mcp, audit] = await Promise.all([
      this.#service.detect(), this.#service.mcpInfo(), this.#service.auditLog?.() ?? { data: [] },
    ]);
    const list = (agents.data ?? []).filter((a) => a.installed);
    const { selected, compareWith } = this.store.state;
    const activity = (audit.data ?? []).filter((e) => String(e.action).startsWith('mcp:')).map(toActivity).reverse().slice(0, MAX_ACTIVITY);
    // Keep the saved choice only if that agent is still installed. Never chosen before: the best
    // connected agent answers on its own (Claude, then ChatGPT · Codex, then Grok)
    const best = AUTO_ORDER.find((id) => list.some((a) => a.id === id && a.loggedIn === true)) ?? null;
    const keep = list.some((a) => a.id === selected) ? selected : null;
    this.store.set({
      agents: list,
      mcp: mcp.data ?? this.store.state.mcp,
      selected: keep ?? (this.#hadChoice ? null : best),
      compareWith: list.some((a) => a.id === compareWith) ? compareWith : null,
      activity: activity.length ? activity : this.store.state.activity,
    });
  }

  // API key instead of a subscription login (kept encrypted by the main process; never read back)
  async saveKey(provider, value) {
    const result = await this.#service.saveKey(provider, value);
    if (result?.ok) await this.refresh();
    return result;
  }

  async removeKey(provider) {
    const result = await this.#service.removeKey(provider);
    await this.refresh();
    return result;
  }

  select(id) {
    const catalog = CATALOG[id];
    if (id && !catalog) return;
    const keep = id === this.store.state.selected;
    this.store.set({
      selected: id,
      model: keep ? this.store.state.model : '',
      effort: keep ? this.store.state.effort : catalog?.defaultEffort ?? 'low',
    });
    this.#saveChoice();
  }

  setModel(model) {
    const c = CATALOG[this.store.state.selected];
    if (c?.models.some((m) => m.id === model)) { this.store.set({ model }); this.#saveChoice(); }
  }

  setEffort(effort) {
    const c = CATALOG[this.store.state.selected];
    if (c?.efforts.includes(effort)) { this.store.set({ effort }); this.#saveChoice(); }
  }

  // Second agent that answers the same question (null = only one)
  setCompare(id) {
    const { agents, selected } = this.store.state;
    const ok = id === null || (id !== selected && agents.some((a) => a.id === id && a.loggedIn !== false));
    if (ok) this.store.set({ compareWith: id });
  }

  login(id) {
    return this.#service.login(id);
  }

  // "Probar": a minimal question to see that the agent answers (spends a few tokens of the plan)
  async testAgent(id, prompt) {
    if (!CATALOG[id] || this.store.state.testing[id] === 'running') return;
    const mark = (state, result) => this.store.set({
      testing: { ...this.store.state.testing, [id]: state },
      ...(result ? { testResult: { ...this.store.state.testResult, [id]: result } } : {}),
    });
    mark('running');
    const started = Date.now();
    const r = await this.ask(prompt, '', { agent: id, model: '', effort: 'low', session: 'repair' });
    mark(r.text && !r.error ? 'ok' : 'error', { ms: Date.now() - started, error: r.error ?? '' });
  }

  get live() {
    return Boolean(this.store.state.selected);
  }

  get agentLabel() {
    return this.store.state.agents.find((a) => a.id === this.store.state.selected)?.label ?? '';
  }

  // Runs one message with the selected agent. Resolves with { text, error } (never rejects).
  // onTool(name) is called each time the agent uses a Platanus tool; onText(delta) as the answer streams.
  // session: 'chat' (continues the conversation) or 'repair' (Remi's jobs, a separate conversation).
  // signal (AbortSignal): a waiting question never starts; a running one stops its CLI.
  // onStart(runId): called when the CLI actually starts (after waiting in line).
  // agent / model / effort: another agent than the selected one (compare, "Probar")
  // voice: { mode: 'vibe'|'dev', recent: [the person's last messages] } -> the main process builds the
  // prompt from agent/voice.json and the mode's skill (systemPrompt then only replaces the base rules)
  // readOnly: this run gets the read-only MCP address (explaining, the tour): it can look, not change
  ask(prompt, systemPrompt, { onTool, onText, onThinking, onEvent, onStart, signal, session = 'chat', voice = null, readOnly = false, ...choice } = {}) {
    // The choice is taken now: a question waiting in line keeps the agent it was asked to
    const state = this.store.state;
    const agent = choice.agent ?? state.selected;
    const own = agent === state.selected;
    const catalog = CATALOG[agent];
    const model = choice.model ?? (own ? state.model : '');
    const effort = choice.effort ?? (own ? state.effort : catalog?.efforts.includes(state.effort) ? state.effort : catalog?.defaultEffort ?? 'low');
    const run = () => this.#run(prompt, systemPrompt, { onTool, onText, onThinking, onEvent, onStart, signal, session, agent, model, effort, voice, readOnly });
    const queue = this.#queues.get(agent) ?? Promise.resolve();
    const result = queue.then(run, run);
    this.#queues.set(agent, result.catch(() => {}));
    return result;
  }

  async #run(prompt, systemPrompt, { onTool, onText, onThinking, onEvent, onStart, signal, session, agent, model, effort, voice, readOnly }) {
    if (signal?.aborted) return { text: '', error: 'cancelled' };
    const key = `${agent}:${session}`;
    const turns = this.#turns.get(key) ?? 0;
    this.#turns.set(key, turns + 1);
    let text = '';
    let error = null;
    let runId = null;
    let tokens = 0;
    const early = [];
    const finish = (value) => { this.#recordRun(agent, tokens, value.error ?? ''); return value; };
    return new Promise((resolve) => {
      const handle = (e) => {
        onEvent?.(e); // every event (tools, subagents, result) for the live run card
        if (e.type === 'result') tokens += (e.inputTokens ?? 0) + (e.outputTokens ?? 0);
        if (e.type === 'text' && !e.parent) { text += e.delta; onText?.(e.delta); }
        else if (e.type === 'thinking' && !e.parent) onThinking?.(e.delta);
        else if (e.type === 'tool') onTool?.(e.name);
        else if (e.type === 'error') error = e.message;
        else if (e.type === 'done') { off(); resolve(finish({ text: text.trim(), error })); }
      };
      const off = this.#service.onEvent((e) => {
        if (!runId) return void early.push(e);
        if (e.runId === runId) handle(e);
      });
      this.#service.run({ agent, prompt, systemPrompt, model, effort, session, continued: session === 'chat' && turns > 0, ...(voice ? { voice } : {}), ...(readOnly ? { readOnly: true } : {}) }).then((r) => {
        if (!r.ok) { off(); return resolve(finish({ text: '', error: r.error })); }
        runId = r.data;
        onStart?.(runId);
        if (signal?.aborted) this.#service.cancel?.(runId);
        else signal?.addEventListener('abort', () => this.#service.cancel?.(runId), { once: true });
        early.filter((e) => e.runId === runId).forEach(handle);
      }, (err) => { off(); resolve(finish({ text: '', error: err?.message ?? String(err) })); });
    });
  }

  #recordRun(agent, tokens, error) {
    const before = this.store.state.stats[agent] ?? { runs: 0, tokens: 0, lastUsedAt: null, lastError: '' };
    const stats = { ...this.store.state.stats, [agent]: { runs: before.runs + 1, tokens: before.tokens + tokens, lastUsedAt: Date.now(), lastError: error === 'cancelled' ? before.lastError : error } };
    this.store.set({ stats });
    try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch { /* private mode */ }
  }

  #loadStats() {
    try { return JSON.parse(localStorage.getItem(STATS_KEY) ?? '{}') ?? {}; } catch { return {}; }
  }

  #loadChoice() {
    try {
      const saved = JSON.parse(localStorage.getItem(CHOICE_KEY) ?? 'null');
      this.#hadChoice = Boolean(saved); // the person (or the app) chose before: no automatic pick
      const c = saved && CATALOG[saved.selected];
      if (!c) return {};
      return {
        selected: saved.selected,
        model: c.models.some((m) => m.id === saved.model) ? saved.model : '',
        effort: c.efforts.includes(saved.effort) ? saved.effort : c.defaultEffort,
      };
    } catch {
      return {};
    }
  }

  #saveChoice() {
    const { selected, model, effort } = this.store.state;
    this.#hadChoice = true;
    try { localStorage.setItem(CHOICE_KEY, JSON.stringify({ selected, model, effort })); } catch { /* private mode */ }
  }
}
