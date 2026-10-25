// Screen state of the file editor: a floating window with one tab per open file. A file clicked on the map
// (or named in the chat) opens as the active tab; it can be edited and saved. Secret files open too, flagged.
// A save carries the mtime the file was read with, so main refuses it when the file changed on disk meanwhile
// (the tab turns stale: reload or keep editing). Disk changes reload clean tabs and mark edited ones stale.
// Preview (desktop only): pages and images show rendered (main serves them at qubbot-preview://project/…,
// electron/preview.js), and the project running on localhost opens as a tab too.
import { Observable } from '../core/observable.js';
import { EVENTS } from '../core/eventBus.js';

const nameOf = (path) => path.split('/').pop();
const PAGE = /\.(html?|svg)$/i;                          // previewed, and their code can be edited
const IMAGE = /\.(png|jpe?g|gif|webp|avif|ico|bmp)$/i;   // previewed only (not text)
// The project running on this computer: http on localhost or 127.0.0.1 with a port, nothing else
const LOCAL_URL = /^http:\/\/(localhost|127\.0\.0\.1):(\d{1,5})(\/[^\s]*)?$/;
const encodePath = (path) => path.split('/').map(encodeURIComponent).join('/');

export class EditorViewModel {
  #workspace;

  #preview;

  // tabs: [{ path, name, level, status: 'loading' | 'ready' | 'error', content, saved, mtime, secret,
  //          error, stale, saving, saveError,
  //          kind: 'file' | 'web', view: 'code' | 'preview', canPreview, previewOnly, stamp }]
  // A web tab's path is its address (http://localhost:3000); stamp bumps to reload a preview.
  store = new Observable({ open: false, tabs: [], active: null });

  // preview: the window can show previews (desktop; the web version has no qubbot-preview protocol)
  constructor({ workspace, bus, preview = false }) {
    this.#workspace = workspace;
    this.#preview = Boolean(preview);
    bus.on(EVENTS.fileSelected, ({ path, level }) => this.open(path, { level }));
    bus.on(EVENTS.diskChanged, ({ paths }) => this.#diskChanged(paths));
    bus.on(EVENTS.projectOpened, () => this.closeAll());
    bus.on(EVENTS.projectClosed, () => this.closeAll());
  }

  tab(path) {
    return this.store.state.tabs.find((t) => t.path === path) ?? null;
  }

  isDirty(path) {
    const t = this.tab(path);
    return Boolean(t && t.status === 'ready' && t.content !== t.saved);
  }

  get dirtyCount() {
    return this.store.state.tabs.filter((t) => this.isDirty(t.path)).length;
  }

  async open(path, { level = null } = {}) {
    if (this.tab(path)) {
      if (level) this.#patch(path, { level });
      this.store.set({ open: true, active: path });
      return;
    }
    const image = this.#preview && IMAGE.test(path);
    const canPreview = this.#preview && (image || PAGE.test(path));
    const tab = {
      path, name: nameOf(path), level, status: image ? 'ready' : 'loading', content: '', saved: '', mtime: null, secret: false,
      error: null, stale: false, saving: false, saveError: null,
      kind: 'file', view: canPreview ? 'preview' : 'code', canPreview, previewOnly: image, stamp: 0,
    };
    this.store.set({ open: true, active: path, tabs: [...this.store.state.tabs, tab] });
    if (!image) await this.#read(path);
  }

  // The project running on this computer (ejecutar_app, a server of the list) as a preview tab.
  // -> false for anything that is not http://localhost:<port> or http://127.0.0.1:<port>
  openUrl(url) {
    const match = this.#preview ? LOCAL_URL.exec(String(url ?? '')) : null;
    if (!match || Number(match[2]) < 1 || Number(match[2]) > 65535) return false;
    if (this.tab(url)) {
      this.store.set({ open: true, active: url });
      return true;
    }
    const tab = {
      path: url, name: `${match[1]}:${match[2]}`, level: null, status: 'ready', content: '', saved: '', mtime: null,
      secret: false, error: null, stale: false, saving: false, saveError: null,
      kind: 'web', view: 'preview', canPreview: true, previewOnly: true, stamp: 0,
    };
    this.store.set({ open: true, active: url, tabs: [...this.store.state.tabs, tab] });
    return true;
  }

  setView(path, view) {
    const t = this.tab(path);
    if (!t || !t.canPreview || t.previewOnly || (view !== 'code' && view !== 'preview')) return;
    this.#patch(path, { view });
  }

  // Loads the preview again (a web tab: the view reloads its frame when stamp changes)
  refresh(path) {
    const t = this.tab(path);
    if (t?.canPreview) this.#patch(path, { stamp: t.stamp + 1 });
  }

  // What the preview frame shows, or null when the tab has no preview
  previewUrl(path) {
    const t = this.tab(path);
    if (!t?.canPreview) return null;
    if (t.kind === 'web') return new URL(t.path).href;
    return `qubbot-preview://project/${encodePath(t.path)}?v=${t.stamp}`;
  }

  activate(path) {
    if (this.tab(path)) this.store.set({ active: path, open: true });
  }

  edit(path, content) {
    const t = this.tab(path);
    if (!t || t.status !== 'ready' || t.content === content) return;
    this.#patch(path, { content, saveError: null });
  }

  async save(path) {
    const t = this.tab(path);
    if (!t || t.saving || !this.isDirty(path)) return;
    const content = t.content;
    this.#patch(path, { saving: true, saveError: null });
    const response = await this.#workspace.saveFile(path, content, t.mtime);
    if (!this.tab(path)) return; // closed meanwhile
    if (response.ok) return this.#patch(path, { saving: false, saved: content, mtime: response.data.mtime, stale: false });
    if (response.code === 'cancelled') return this.#patch(path, { saving: false });
    if (response.code === 'changedOnDisk') return this.#patch(path, { saving: false, stale: true });
    this.#patch(path, { saving: false, saveError: response.error ?? response.code });
  }

  // Throws the edits away and reads the file from disk again
  reload(path) {
    if (!this.tab(path)) return undefined;
    this.#patch(path, { stale: false, saveError: null });
    return this.#read(path);
  }

  // false when the tab has unsaved changes (the view asks first, then closes with force)
  close(path, { force = false } = {}) {
    const { tabs, active } = this.store.state;
    const index = tabs.findIndex((t) => t.path === path);
    if (index < 0) return true;
    if (!force && this.isDirty(path)) return false;
    const rest = tabs.filter((t) => t.path !== path);
    const next = active === path ? (rest[index] ?? rest[index - 1] ?? null)?.path ?? null : active;
    this.store.set({ tabs: rest, active: next, open: rest.length > 0 && this.store.state.open });
    return true;
  }

  closeAll() {
    this.store.set({ tabs: [], active: null, open: false });
  }

  hide() {
    this.store.set({ open: false });
  }

  async #read(path) {
    this.#patch(path, { status: 'loading' });
    const response = await this.#workspace.openFile(path);
    if (!this.tab(path)) return;
    if (!response.ok) return this.#patch(path, { status: 'error', error: response.code ?? response.error });
    const { content, mtime, secret } = response.data;
    this.#patch(path, { status: 'ready', content, saved: content, mtime, secret: Boolean(secret), error: null, stale: false });
  }

  #diskChanged(paths = []) {
    // a page in preview may use any changed file (its CSS, a script, an image): it reloads
    if (paths.length) {
      const showing = this.store.state.tabs.filter((t) => t.kind === 'file' && t.canPreview && t.view === 'preview');
      for (const t of showing) this.#patch(t.path, { stamp: t.stamp + 1 });
    }
    for (const path of paths) {
      const t = this.tab(path);
      if (!t || t.previewOnly || t.status === 'loading' || t.saving) continue; // an image only reloads its preview
      if (this.isDirty(path)) this.#patch(path, { stale: true });
      else this.#read(path);
    }
  }

  #patch(path, patch) {
    this.store.set({ tabs: this.store.state.tabs.map((t) => (t.path === path ? { ...t, ...patch } : t)) });
  }
}
