// The open project: its name, file tree and the services it uses (Supabase, Vercel, Stripe…), with
// whether the person's agent can work with each one (docs/features/servicios/README.md).
import { Observable } from '../core/observable.js';
import { DEMO_INTEGRATIONS } from './demoIntegrations.js';

// The integrations the files alone can show (the web version, or when main cannot tell), in map order
export const INTEGRATIONS = ['supabase', 'vercel', 'github', 'clerk', 'posthog'];
const SERVICE_STATES = new Set(['connected', 'disconnected', 'unknown']);
// The desktop bridge (window.platanus.services), or null in the web version and in tests
const desktopServices = () => globalThis.window?.platanus?.services ?? null;
// package.json dependencies that give an integration away
const DEPENDENCY = { supabase: '@supabase/', vercel: '@vercel/', clerk: '@clerk/', posthog: 'posthog' };

const RELOAD_DEBOUNCE_MS = 250;

export class ProjectModel {
  #workspace;
  #reloadTimer = null;

  // `session` increases each time a project is opened (to reset per-project state);
  // `version` increases each time the tree is reloaded.
  // integrations: keys in the catalog's order (main's), or INTEGRATIONS order from the files;
  // integrationStatus: key -> 'connected' | 'incident' | 'disconnected' (the map's look; 'unknown' shows as disconnected)
  // services: [{ key, name, state: 'connected' | 'disconnected' | 'unknown', via, evidence }] (servicesViewModel)
  // root: the folder's full path (the project's memory is keyed by it; main accepts only the open or a recent one)
  store = new Observable({ open: false, name: null, root: null, tree: [], usesSupabase: false, integrations: [], integrationStatus: {}, services: [], session: 0, version: 0 });

  #services;

  // services: { detect() -> { ok, data } } (window.platanus.services on the desktop; null: the files decide)
  constructor(workspace, { services = desktopServices() } = {}) {
    this.#workspace = workspace;
    this.#services = services;
  }

  // Shows the folder picker; resolves to the bridge response ({ ok, data }).
  async choose() {
    const response = await this.#workspace.choose();
    if (response.ok) await this.open(response.data);
    return response;
  }

  // New project: the person picks a name and a place, an empty folder is created and opened
  async create() {
    const response = await this.#workspace.create();
    if (response.ok) await this.open(response.data);
    return response;
  }

  // [{ root, name, at }] most recent first
  async recent() {
    return (await this.#workspace.recent()).data ?? [];
  }

  async openRecent(root) {
    const response = await this.#workspace.openRecent(root);
    if (response.ok) await this.open(response.data);
    return response;
  }

  // Reopens the folder the app already had (e.g. after reloading the window)
  async restore() {
    const response = await this.#workspace.current();
    if (response.data) await this.open(response.data);
  }

  // The tree is loaded before publishing, so the map never draws a half-loaded project
  async open({ name, root }) {
    const loaded = await this.#load(name);
    if (!loaded) return;
    const { session, version } = this.store.state;
    this.store.set({ open: true, name: name || null, root: typeof root === 'string' && root ? root : null, ...loaded, session: session + 1, version: version + 1 });
  }

  // Back to the start screen: the main process stops watching the folder and the agent loses access
  async close() {
    if (!this.store.state.open) return;
    clearTimeout(this.#reloadTimer);
    await this.#workspace.close();
    const { session, version } = this.store.state;
    this.store.set({ open: false, name: null, root: null, tree: [], usesSupabase: false, integrations: [], integrationStatus: {}, services: [], session: session + 1, version: version + 1 });
  }

  async reload() {
    if (!this.store.state.open) return;
    const loaded = await this.#load(this.store.state.name);
    if (loaded) this.store.set({ ...loaded, version: this.store.state.version + 1 });
  }

  async #load(name) {
    const response = await this.#workspace.tree();
    if (!response.ok) return null;
    const services = await this.#detectServices(response.data, name);
    const integrations = services.map((s) => s.key);
    // connected, disconnected or "could not check" (unknown, never shown as disconnected); the web demo's incident
    const integrationStatus = Object.fromEntries(services.map((s) => [s.key, s.status ?? (s.state === 'connected' ? 'connected' : s.state === 'unknown' ? 'unknown' : 'disconnected')]));
    return { tree: response.data, integrations, integrationStatus, services: services.map(({ status, ...s }) => s), usesSupabase: integrations.includes('supabase') };
  }

  // Groups bursts of disk changes into a single reload
  scheduleReload() {
    clearTimeout(this.#reloadTimer);
    this.#reloadTimer = setTimeout(() => this.reload(), RELOAD_DEBOUNCE_MS);
  }

  // [{ key, name, state, via, evidence, status? }]: on the desktop main detects them and checks the agent's
  // MCP and CLI sessions (always real: a folder that happens to be called like the demo is a real project);
  // the web version's demo project (DEMO_INTEGRATIONS) shows its own list; otherwise the files.
  // `status` only carries the demo's incident to the map.
  async #detectServices(tree, name) {
    const demo = this.#services?.detect ? null : DEMO_INTEGRATIONS[(name ?? '').toLowerCase()];
    if (demo) {
      return INTEGRATIONS.filter((key) => key in demo).map((key) => ({ key, name: null, state: demo[key] === 'disconnected' ? 'disconnected' : 'connected', via: [], evidence: [], status: demo[key] }));
    }
    const fromMain = await this.#fromMain();
    if (fromMain) return fromMain;
    const found = await this.#fromFiles(tree);
    return INTEGRATIONS.filter((key) => found.has(key)).map((key) => ({ key, name: null, state: 'connected', via: [], evidence: [] }));
  }

  // What main reports, cleaned (its answer crosses IPC); null when it cannot tell
  async #fromMain() {
    if (!this.#services?.detect) return null;
    let response;
    try {
      response = await this.#services.detect();
    } catch {
      return null;
    }
    if (!response?.ok || !Array.isArray(response.data)) return null;
    const seen = new Set();
    return response.data.filter((s) => s && typeof s.key === 'string' && s.key && !seen.has(s.key) && seen.add(s.key)).map((s) => ({
      key: s.key,
      name: typeof s.name === 'string' && s.name ? s.name : null,
      state: SERVICE_STATES.has(s.state) ? s.state : 'unknown',
      via: Array.isArray(s.via) ? s.via.filter((v) => typeof v === 'string') : [],
      evidence: Array.isArray(s.evidence) ? s.evidence.filter((v) => typeof v === 'string') : [],
    }));
  }

  // From the files (supabase/, vercel.json or .vercel/, .github/, package.json dependencies)
  async #fromFiles(tree) {
    const has = (type, path) => tree.some((n) => n.type === type && n.path === path);
    const found = new Set();
    if (has('dir', 'supabase')) found.add('supabase');
    if (has('file', 'vercel.json') || has('dir', '.vercel')) found.add('vercel');
    if (has('dir', '.github')) found.add('github');
    if (has('file', 'package.json')) {
      const response = await this.#workspace.read('package.json');
      if (response.ok) Object.entries(DEPENDENCY).forEach(([key, prefix]) => { if (response.data.includes(`"${prefix}`)) found.add(key); });
    }
    return found;
  }
}
