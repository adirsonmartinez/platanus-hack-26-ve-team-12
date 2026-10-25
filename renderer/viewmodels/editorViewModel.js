// Screen state of the file editor: a floating window with one tab per open file. A file clicked on the map
// (or named in the chat) opens as the active tab; it can be edited and saved. Secret files open too, flagged.
// A save carries the mtime the file was read with, so main refuses it when the file changed on disk meanwhile
// (the tab turns stale: reload or keep editing). Disk changes reload clean tabs and mark edited ones stale.
// Pages and images clicked on the map go to the browser window instead (`preview`, desktop only); a page's
// code can still be opened here, and its tab offers its preview.
import { Observable } from '../core/observable.js';
import { EVENTS } from '../core/eventBus.js';

const nameOf = (path) => path.split('/').pop();

export class EditorViewModel {
  #workspace;

  #preview;

  // tabs: [{ path, name, level, status: 'loading' | 'ready' | 'error', content, saved, mtime, secret,
  //          error, stale, saving, saveError, canPreview }]
  store = new Observable({ open: false, tabs: [], active: null });

  // preview(path, { dryRun }) -> true when the browser window shows that file (desktop; null in the web version)
  constructor({ workspace, bus, preview = null }) {
    this.#workspace = workspace;
    this.#preview = typeof preview === 'function' ? preview : null;
    bus.on(EVENTS.fileSelected, ({ path, level }) => {
      if (!this.#preview?.(path)) this.open(path, { level });
    });
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
    const canPreview = /\.(html?|svg)$/i.test(path) && Boolean(this.#preview);
    const tab = { path, name: nameOf(path), level, status: 'loading', content: '', saved: '', mtime: null, secret: false, error: null, stale: false, saving: false, saveError: null, canPreview };
    this.store.set({ open: true, active: path, tabs: [...this.store.state.tabs, tab] });
    await this.#read(path);
  }

  // «Vista previa» of a page open here: the browser window shows it -> false when it cannot
  showPreview(path) {
    return Boolean(this.tab(path)?.canPreview && this.#preview(path));
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

  // Shows the window again with its tabs (false when it has none)
  show() {
    if (!this.store.state.tabs.length) return false;
    this.store.set({ open: true });
    return true;
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
    for (const path of paths) {
      const t = this.tab(path);
      if (!t || t.status === 'loading' || t.saving) continue;
      if (this.isDirty(path)) this.#patch(path, { stale: true });
      else this.#read(path);
    }
  }

  #patch(path, patch) {
    this.store.set({ tabs: this.store.state.tabs.map((t) => (t.path === path ? { ...t, ...patch } : t)) });
  }
}
