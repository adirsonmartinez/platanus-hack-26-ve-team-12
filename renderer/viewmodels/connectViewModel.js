// "Conectar mi cuenta" (the modal that opens from an integration "por conectar" on the map). Today: Supabase.
// Steps: intro -> signing (the browser opens) -> choose (organization; a new project or one the person has)
// -> working (main asks in a native dialog, creates or checks the project, writes the keys) -> done | error.
// The window never sees a key: it only sends the pick and gets the project's name back.
import { Observable } from '../core/observable.js';

const LIVE = new Set(['ACTIVE_HEALTHY', 'COMING_UP']);
const CLOSED = { open: false, service: null, step: 'intro', organizations: [], projects: [], suggested: '', mode: 'new', organizationId: null, projectId: null, stage: null, error: '', errorKey: null, result: null };

export class ConnectViewModel {
  #service;
  #onConnected;

  // stage: what main is doing while working ('creating' | 'starting' | 'keys')
  store = new Observable({ ...CLOSED });

  constructor({ service, onConnected = () => {} }) {
    this.#service = service;
    this.#onConnected = onConnected;
    service.onProgress?.(({ stage }) => { if (this.store.state.step === 'working') this.store.set({ stage }); });
  }

  open(service) {
    this.store.set({ ...CLOSED, open: true, service });
  }

  close() {
    this.store.set({ ...CLOSED });
  }

  async signIn() {
    this.store.set({ step: 'signing', error: '', errorKey: null });
    const response = await this.#service.start();
    if (!this.store.state.open) return;
    if (!response.ok) return this.store.set({ step: 'error', error: response.error ?? '' });
    const { organizations = [], projects = [], suggested = '' } = response.data ?? {};
    if (!organizations.length) return this.store.set({ step: 'error', errorKey: 'noOrganization' });
    this.store.set({ step: 'choose', organizations, projects, suggested, mode: 'new', organizationId: organizations[0].id, projectId: null });
  }

  // The live projects of the chosen organization (a paused one would never get ready)
  projectsShown() {
    const { projects, organizationId } = this.store.state;
    return projects.filter((p) => p.organizationId === organizationId && LIVE.has(p.status));
  }

  pickMode(mode) {
    if (mode !== 'new' && mode !== 'existing') return;
    this.store.set({ mode });
    this.#keepProject();
  }

  pickOrganization(id) {
    if (!this.store.state.organizations.some((o) => o.id === id)) return;
    this.store.set({ organizationId: id });
    this.#keepProject();
  }

  pickProject(id) {
    if (this.projectsShown().some((p) => p.id === id)) this.store.set({ projectId: id });
  }

  async connect() {
    const { mode, organizationId, projectId, service } = this.store.state;
    if (mode === 'existing' && !projectId) return;
    const choice = mode === 'new' ? { mode, organizationId } : { mode, projectId };
    this.store.set({ step: 'working', stage: mode === 'new' ? 'creating' : 'starting', error: '' });
    const response = await this.#service.connect(choice);
    if (!this.store.state.open) return;
    if (response.cancelled) return this.store.set({ step: 'choose', stage: null });
    if (!response.ok) return this.store.set({ step: 'error', error: response.error ?? '', stage: null });
    this.store.set({ step: 'done', stage: null, result: response.data });
    this.#onConnected(service, response.data);
  }

  // In "use one I have", a project of the chosen organization is always selected
  #keepProject() {
    const shown = this.projectsShown();
    if (!shown.some((p) => p.id === this.store.state.projectId)) this.store.set({ projectId: shown[0]?.id ?? null });
  }
}
