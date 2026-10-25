// Services the project uses (Supabase, Stripe, Vercel…) and whether the person's agent can work with them
// (docs/features/servicios/README.md). Main detects them and checks the agent's MCP and CLI sessions;
// projectModel keeps that list. This view model tells the person what is offline (one chat card per
// project and session, plus a short bubble from the robot) and drives the "Fuera de conexión: X" modal:
// the CLI steps, the MCP command for the agent chosen in the chat, copy, official links and "Ya lo conecté".
import { Observable } from '../core/observable.js';
import { EVENTS } from '../core/eventBus.js';
import { strings } from '../i18n/es.js';

const S = strings.services;
// The agents an MCP command can be written for, in the order the modal offers them
export const MCP_AGENTS = ['claude', 'codex', 'grok', 'opencode'];
const COPIED_MS = 1400;
const isHttps = (url) => typeof url === 'string' && /^https:\/\//.test(url);
const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);

// The bridge to main: window.platanus.services and window.platanus.links on the desktop. The web version
// has no main: an empty catalog, nothing to refresh, and only https links open (in a new tab).
export function servicesApi(bridge = globalThis.window?.platanus) {
  const services = bridge?.services ?? null;
  const links = bridge?.links ?? null;
  return {
    available: Boolean(services),
    catalog: async () => (services?.catalog ? services.catalog() : { ok: true, data: {} }),
    refresh: async () => (services?.refresh ? services.refresh() : { ok: true }),
    openLink: async (url) => {
      if (links?.open) return links.open(url);
      if (!isHttps(url) || !globalThis.window?.open) return { ok: false };
      globalThis.window.open(url, '_blank', 'noopener');
      return { ok: true };
    },
  };
}

const defaultClipboard = () => globalThis.navigator?.clipboard ?? null;

export class ServicesViewModel {
  // services: [{ key, name, state: 'connected' | 'disconnected' | 'unknown', via, evidence }]
  // open: the key whose modal is open (null: closed); catalog: { key: { name, cli, mcp, dashboard } } from main
  // agent: the agent the modal shows the MCP command for, when the person picks another one there
  // checking: "Ya lo conecté" is asking main again; notice: { tone: 'ok' | 'warn', text } for the modal
  // copied: the text just copied (its button says "Copiado" for a moment)
  store = new Observable({ services: [], open: null, catalog: {}, agent: null, checking: false, notice: null, copied: null });

  #project;
  #chat;
  #api;
  #say;
  #connection;
  #clipboard;
  #catalog = null; // the catalog's load, once
  #suggested = new Set(); // projects (by root) that got their card this session
  #cardOf = new Map(); // project root -> its card's message id
  #announced = null; // the project session the chat already greeted (its card may come later)
  #copiedTimer = null;

  // say(text, actions): the robot companion's short bubble (actions: [{ kind, label, run }])
  // chat: chatViewModel (upsertServicesCard); connection: agentConnectionModel (the agent chosen in the chat)
  constructor({ projectModel, bus, chat, api = servicesApi(), say = () => {}, connection = null, clipboard = defaultClipboard() }) {
    this.#project = projectModel;
    this.#chat = chat;
    this.#api = api;
    this.#say = say;
    this.#connection = connection;
    this.#clipboard = clipboard;

    projectModel.store.subscribe((state, previous) => {
      if (!state.open) {
        if (previous?.open) this.store.set({ services: [], open: null, agent: null, notice: null, checking: false });
        return;
      }
      if (state.services === previous?.services) return;
      this.store.set({ services: this.#named(state.services ?? []) });
      this.#updateCard();
    }, { immediate: true });
    // A project opened: the chat has greeted it, so its card comes right after
    bus.on(EVENTS.projectOpened, () => {
      this.#announced = this.#project.store.state.session;
      this.#suggest();
    });
  }

  // Asks main again (its 60 s cache is emptied) and reloads the project, so the map and the card update.
  // With a modal open, it says whether that service is connected now.
  async refresh() {
    const key = this.store.state.open;
    this.store.set({ checking: true, notice: null });
    try {
      await this.#api.refresh();
    } catch {
      // main could not empty its cache: the reload still asks it
    }
    await this.#project.reload();
    this.store.set({ checking: false });
    if (!key || this.store.state.open !== key) return;
    const service = this.store.state.services.find((s) => s.key === key);
    const name = this.#nameOf(key);
    if (service?.state === 'connected') {
      const done = S.nowConnected(name);
      this.store.set({ open: null, agent: null, notice: { tone: 'ok', text: done } });
      this.#say(done, []);
    } else {
      this.store.set({ notice: { tone: 'warn', text: S.stillOffline(name) } });
    }
  }

  async openConnect(key) {
    if (typeof key !== 'string' || !key) return;
    this.store.set({ open: key, notice: null, copied: null });
    await this.#loadCatalog();
  }

  close() {
    this.store.set({ open: null, agent: null, notice: null, copied: null });
  }

  // The person picks another agent in the modal's MCP tab
  setAgent(agent) {
    if (MCP_AGENTS.includes(agent)) this.store.set({ agent });
  }

  async copy(value) {
    try {
      await this.#clipboard.writeText(value);
    } catch {
      return false; // no clipboard: the command stays on screen to copy by hand
    }
    clearTimeout(this.#copiedTimer);
    this.store.set({ copied: value });
    this.#copiedTimer = setTimeout(() => { if (this.store.state.copied === value) this.store.set({ copied: null }); }, COPIED_MS);
    this.#copiedTimer.unref?.(); // never keeps the test runner alive
    return true;
  }

  // Main opens only the URLs of its catalog (and the voice ones)
  async openLink(url) {
    let response;
    try {
      response = await this.#api.openLink(url);
    } catch {
      response = null;
    }
    if (response?.ok) return true;
    this.store.set({ notice: { tone: 'warn', text: strings.voiceConnect.errors.link } });
    return false;
  }

  // What the modal shows for `key`: its title and one-line explanation, where it was found, the CLI steps
  // (install, sign in) with the official guide, and the MCP command for the chosen agent (null when the
  // service has no official MCP, as the catalog says).
  connectInfo(key) {
    const entry = this.store.state.catalog[key] ?? {};
    const service = this.store.state.services.find((s) => s.key === key);
    const name = this.#nameOf(key);
    const state = service?.state ?? 'disconnected';
    const cli = entry.cli ? {
      steps: [
        text(entry.cli.install) && { id: 'install', label: S.steps.install, command: text(entry.cli.install) },
        text(entry.cli.login) && { id: 'login', label: S.steps.login, command: text(entry.cli.login) },
      ].filter(Boolean),
      docs: isHttps(entry.cli.docs) ? entry.cli.docs : null,
    } : null;
    let mcp = null;
    if (entry.mcp) {
      const agent = this.agentFor();
      // main's publicCatalog() keeps the ready-made commands under mcp.commands, one per agent
      const commands = entry.mcp.commands ?? {};
      const command = text(commands[agent]);
      mcp = {
        agent,
        agentName: S.agents[agent],
        agents: MCP_AGENTS,
        ready: MCP_AGENTS.filter((a) => text(commands[a])),
        command,
        missing: command ? null : S.noCommand(S.agents[agent]),
        docs: isHttps(entry.mcp.docs) ? entry.mcp.docs : null,
        url: isHttps(entry.mcp.url) ? entry.mcp.url : null,
      };
    }
    return {
      key, name, state,
      title: S.modal.title(name),
      intro: state === 'unknown' ? S.modal.unknown(name) : S.modal.intro(name),
      evidence: service?.evidence ?? [],
      cli: cli && (cli.steps.length || cli.docs) ? cli : null,
      mcp,
      dashboard: isHttps(entry.dashboard) ? entry.dashboard : null,
    };
  }

  // The agent the MCP command is for: the one picked in the modal, else the chat's, else Claude Code
  agentFor() {
    const picked = this.store.state.agent;
    if (picked) return picked;
    const selected = this.#connection?.store?.state?.selected;
    return MCP_AGENTS.includes(selected) ? selected : MCP_AGENTS[0];
  }

  #nameOf(key) {
    return this.store.state.services.find((s) => s.key === key)?.name
      ?? this.store.state.catalog[key]?.name
      ?? strings.integrations.names[key]
      ?? key;
  }

  #named(services) {
    return services.map((s) => ({ ...s, name: s.name ?? this.store.state.catalog[s.key]?.name ?? strings.integrations.names[s.key] ?? s.key }));
  }

  async #loadCatalog() {
    this.#catalog ??= (async () => {
      let response = null;
      try {
        response = await this.#api.catalog();
      } catch {
        // the modal still shows the name and its explanation
      }
      if (!response?.ok || !response.data || typeof response.data !== 'object') {
        this.#catalog = null; // try again next time
        return;
      }
      this.store.set({ catalog: response.data, services: this.#named(this.store.state.services) });
    })();
    await this.#catalog;
  }

  #projectKey() {
    const { root, name } = this.#project.store.state;
    return root ?? name ?? '';
  }

  // Once per project and session: the chat card and the robot's bubble, when something is offline
  // ("could not check" alone does not nag; it still shows in the card). It reads the project's own list:
  // the greeting can come before this view model hears about the new project.
  #suggest() {
    const { open, services = [] } = this.#project.store.state;
    const project = this.#projectKey();
    if (!open || this.#suggested.has(project)) return;
    const named = this.#named(services);
    const offline = named.filter((s) => s.state === 'disconnected');
    if (!offline.length) return;
    this.#suggested.add(project);
    this.store.set({ services: named });
    const id = this.#chat?.upsertServicesCard?.(this.#card(), { add: true });
    if (id != null) this.#cardOf.set(project, id);
    this.#say(S.bubble(offline.map((s) => s.name)), [{ kind: 'connect', label: S.connect, run: () => this.openConnect(offline[0].key) }]);
  }

  // A later detection (a reload, "Ya lo conecté") updates the card in place and never adds it again
  // (a new chat that dropped it stays clean). A project that gains an offline service after it was
  // greeted gets its card then.
  #updateCard() {
    const project = this.#projectKey();
    if (this.#cardOf.has(project)) {
      const id = this.#chat?.upsertServicesCard?.(this.#card(), { add: false, id: this.#cardOf.get(project) });
      if (id == null) this.#cardOf.delete(project);
      return;
    }
    if (this.#announced === this.#project.store.state.session) this.#suggest();
  }

  #card() {
    const { name } = this.#project.store.state;
    return {
      project: name ?? '',
      services: this.store.state.services.map((s) => ({
        key: s.key,
        name: s.name,
        state: s.state,
        ...(s.state === 'connected' ? {} : { connect: { kind: 'connect', label: S.connect, run: () => this.openConnect(s.key), quiet: true } }),
      })),
    };
  }
}
