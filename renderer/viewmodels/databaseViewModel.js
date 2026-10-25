// The Supabase side panel (opens with a click on the Supabase node of the map): the connection's state and the
// database's numbers (tables, rows, size against what the plan includes, the biggest tables). The numbers come
// from main (integrationService.stats: fixed read-only queries) for the project this folder is linked to
// (setupModel.linkOf, or the ref main finds in the folder's env files); the demo project shows example numbers.
// No DOM.
import { Observable } from '../core/observable.js';

const IDLE = { status: 'idle', demo: false, project: null, plan: '', tables: 0, rows: 0, bytes: 0, limitBytes: null, top: [], error: '', updatedAt: null };

export class DatabaseViewModel {
  #service;
  #project;
  #setup;
  #supabase;
  #onConnect;

  // status: 'idle' | 'loading' | 'ready' | 'unlinked' (found in the files, no account linked) | 'signedOut' | 'error'
  store = new Observable({ ...IDLE });

  constructor({ service, projectModel, setupModel, supabaseModel, onConnect = () => {} }) {
    this.#service = service;
    this.#project = projectModel;
    this.#setup = setupModel;
    this.#supabase = supabaseModel;
    this.#onConnect = onConnect;
    let session = projectModel.store.state.session;
    projectModel.store.subscribe(({ session: now }) => {
      if (now === session) return;
      session = now;
      this.store.set({ ...IDLE });
    });
  }

  async load() {
    const { open, root, demo } = this.#project.store.state;
    if (!open) return this.store.set({ ...IDLE });
    if (demo) return this.store.set({ ...IDLE, ...this.#demoStats(), status: 'ready', demo: true, updatedAt: Date.now() });
    this.store.set({ status: 'loading', error: '' });
    const link = this.#setup.linkOf(root, 'supabase') ?? await this.#linkFromEnv(root);
    if (this.#project.store.state.root !== root) return;
    if (!link) return this.store.set({ ...IDLE, status: 'unlinked' });
    const response = await this.#service.stats(link.projectId);
    if (this.#project.store.state.root !== root) return; // another project opened meanwhile
    if (!response.ok) {
      return this.store.set({ status: response.error === 'signed-out' ? 'signedOut' : 'error', error: response.error ?? '' });
    }
    this.store.set({ ...IDLE, ...response.data, status: 'ready', updatedAt: Date.now() });
  }

  refresh() {
    return this.load();
  }

  connect() {
    this.#onConnect();
  }

  openDashboard() {
    const link = this.#setup.linkOf(this.#project.store.state.root, 'supabase');
    if (link) this.#service.dashboard(link.projectId);
  }

  // A project connected before links were saved, or set up by hand: main reads its ref from the env files
  async #linkFromEnv(root) {
    const response = await this.#service.linked?.();
    const projectId = response?.ok ? response.data?.projectId : null;
    if (!projectId) return null;
    const link = { projectId, name: '' };
    this.#setup.link(root, 'supabase', link);
    return link;
  }

  // Share of what the plan includes (0..1+), or null when the plan's limit is not known
  usage() {
    const { bytes, limitBytes } = this.store.state;
    return limitBytes ? bytes / limitBytes : null;
  }

  // The demo's made-up database: its example tables with example numbers
  #demoStats() {
    const tables = this.#supabase.tables;
    const top = tables.map((t, i) => ({ name: t.name, rows: Math.round(1200 / (i + 1)), bytes: Math.round(96 / (i + 1)) * 1024 }));
    return {
      project: { id: '', name: 'demo', status: 'ACTIVE_HEALTHY', region: 'sa-east-1', postgres: '17', createdAt: '' },
      plan: 'free', limitBytes: 500 * 1024 ** 2,
      tables: tables.length, rows: top.reduce((n, t) => n + t.rows, 0), bytes: 24 * 1024 ** 2, top,
    };
  }
}
