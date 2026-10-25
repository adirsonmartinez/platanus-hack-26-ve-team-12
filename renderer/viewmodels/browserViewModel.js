// Screen state of the browser window (desktop only): pages and images of the project rendered (main serves
// them at qubbot-preview://project/…, electron/preview.js) and the project running on localhost, one tab
// each. Any change on disk reloads the project pages, so what the agent builds shows live.
// docs/features/file-editor/README.md → «Navegador».
import { Observable } from '../core/observable.js';
import { EVENTS } from '../core/eventBus.js';

const PAGE = /\.(html?|svg)$/i;                          // has code the editor can open
const IMAGE = /\.(png|jpe?g|gif|webp|avif|ico|bmp)$/i;
// The project running on this computer: http on localhost or 127.0.0.1 with a port, nothing else
const LOCAL_URL = /^http:\/\/(localhost|127\.0\.0\.1):(\d{1,5})(\/[^\s]*)?$/;
const encodePath = (path) => path.split('/').map(encodeURIComponent).join('/');

export const canPreview = (path) => PAGE.test(String(path)) || IMAGE.test(String(path));

export class BrowserViewModel {
  // tabs: [{ path, name, kind: 'file' | 'web', page, stamp }]; a web tab's path is its address.
  // stamp bumps to load the tab again.
  store = new Observable({ open: false, tabs: [], active: null });

  constructor({ bus }) {
    bus.on(EVENTS.diskChanged, ({ paths } = {}) => this.#diskChanged(paths));
    bus.on(EVENTS.projectOpened, () => this.closeAll());
    bus.on(EVENTS.projectClosed, () => this.closeAll());
  }

  tab(path) {
    return this.store.state.tabs.find((t) => t.path === path) ?? null;
  }

  // A page or image of the project -> false for anything else
  openFile(path) {
    if (!canPreview(path)) return false;
    return this.#add({ path, name: path.split('/').pop(), kind: 'file', page: PAGE.test(path), stamp: 0 });
  }

  // The project running on this computer -> false for anything that is not localhost:<port>
  openUrl(url) {
    const match = LOCAL_URL.exec(String(url ?? ''));
    const port = Number(match?.[2]);
    if (!match || port < 1 || port > 65535) return false;
    return this.#add({ path: url, name: `${match[1]}:${match[2]}`, kind: 'web', page: false, stamp: 0 });
  }

  // What the tab's frame shows
  url(path) {
    const t = this.tab(path);
    if (!t) return null;
    return t.kind === 'web' ? new URL(t.path).href : `qubbot-preview://project/${encodePath(t.path)}?v=${t.stamp}`;
  }

  refresh(path) {
    const t = this.tab(path);
    if (t) this.#patch(path, { stamp: t.stamp + 1 });
  }

  activate(path) {
    if (this.tab(path)) this.store.set({ active: path, open: true });
  }

  close(path) {
    const { tabs, active } = this.store.state;
    const index = tabs.findIndex((t) => t.path === path);
    if (index < 0) return;
    const rest = tabs.filter((t) => t.path !== path);
    const next = active === path ? (rest[index] ?? rest[index - 1] ?? null)?.path ?? null : active;
    this.store.set({ tabs: rest, active: next, open: rest.length > 0 && this.store.state.open });
  }

  closeAll() {
    this.store.set({ open: false, tabs: [], active: null });
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

  #add(tab) {
    if (!this.tab(tab.path)) this.store.set({ tabs: [...this.store.state.tabs, tab] });
    this.store.set({ open: true, active: tab.path });
    return true;
  }

  // a project page may use any changed file (its CSS, a script, an image); a dev server reloads itself
  #diskChanged(paths = []) {
    if (!paths.length) return;
    this.store.set({ tabs: this.store.state.tabs.map((t) => (t.kind === 'file' ? { ...t, stamp: t.stamp + 1 } : t)) });
  }

  #patch(path, patch) {
    this.store.set({ tabs: this.store.state.tabs.map((t) => (t.path === path ? { ...t, ...patch } : t)) });
  }
}
