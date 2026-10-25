// Screen state of the "Servidores" side view: refreshes the list every few seconds while it is on screen
// and stops when it is hidden. Each row has one icon (stop, or resume when paused) and a ⋯ menu with the
// rest (open with…, pause, stop, its output); stopped rows can be reactivated inside Qubbot. Only one menu
// is open at a time, and a server busy with an action ignores new ones until it answers. Results are a notice.
import { Observable } from '../core/observable.js';
import { strings } from '../i18n/es.js';

export const SERVER_POLL_MS = 3000;

// The person cancelled a dialog: nothing to say
const SILENT = new Set(['cancelled', 'stopRejected', 'restartRejected', 'desktop-only']);
const SV = () => strings.shell.servers;

export class ServersViewModel {
  #model;
  #timer = null;
  #browsersLoaded = false;

  store = new Observable({
    status: 'idle', servers: [], stopped: [], error: null, demo: false, empty: false, exposed: 0,
    browsers: [], // [{ id, name }] installed browsers
    openMenu: null, // port (running row) or id (stopped row) whose ⋯ menu is open
    busy: [], // ports / ids waiting for an answer (a dialog, a signal)
    notice: null, // { tone: 'ok' | 'error', text }
    output: null, // { key, text }: the output panel open under one row (port or stopped id)
  });

  constructor({ serversModel }) {
    this.#model = serversModel;
    serversModel.store.subscribe((s) => this.store.set({
      status: s.status,
      servers: s.servers,
      stopped: s.stopped,
      error: s.error,
      demo: s.demo,
      empty: s.status === 'ready' && s.servers.length === 0,
      exposed: s.servers.filter((x) => x.exposed).length,
    }), { immediate: true });
  }

  // Called by the shell when the view opens or closes
  setVisible(visible) {
    if (visible && !this.#timer) {
      this.refresh();
      this.#loadBrowsers();
      this.#timer = setInterval(() => this.refresh(), SERVER_POLL_MS);
    } else if (!visible && this.#timer) {
      clearInterval(this.#timer);
      this.#timer = null;
      this.store.set({ openMenu: null });
    }
  }

  // The list, and the open output panel if any (it follows the server while it runs)
  async refresh() {
    await this.#model.refresh();
    await this.#loadOutput();
  }

  toggleOpenMenu(key) {
    this.store.set({ openMenu: this.store.state.openMenu === key ? null : key });
  }

  closeMenu() {
    if (this.store.state.openMenu !== null) this.store.set({ openMenu: null });
  }

  async open(port, browser = 'default') {
    this.store.set({ openMenu: null, notice: null });
    this.#report(await this.#model.open(port, browser));
  }

  stop(port) {
    return this.#run(port, () => this.#model.stop(port), SV().stopped(port));
  }

  pause(port) {
    return this.#run(port, () => this.#model.pause(port), SV().paused(port));
  }

  resume(port) {
    return this.#run(port, () => this.#model.resume(port), SV().resumed(port));
  }

  restart(id) {
    const row = this.store.state.stopped.find((r) => r.id === id);
    return this.#run(id, () => this.#model.restart(id), SV().restarted(row?.port ?? ''));
  }

  forget(id) {
    if (this.store.state.output?.key === id) this.store.set({ output: null });
    return this.#run(id, () => this.#model.forget(id));
  }

  cancelStart(id) {
    return this.#run(id, () => this.#model.cancelStart(id));
  }

  // "Ver salida" (⋯ menu): opens the output under that row; only one panel is open at a time
  async showOutput(key) {
    if (this.store.state.output?.key !== key) this.store.set({ output: { key, text: '' } });
    this.store.set({ openMenu: null });
    await this.#loadOutput();
  }

  // The × of the panel (or Esc inside it)
  closeOutput() {
    if (this.store.state.output) this.store.set({ output: null });
  }

  dismissNotice() {
    this.store.set({ notice: null });
  }

  // One action at a time per server; the menu closes and the old notice goes away
  async #run(key, action, okText = null) {
    if (this.store.state.busy.includes(key)) return;
    this.store.set({ busy: [...this.store.state.busy, key], openMenu: null, notice: null });
    try {
      this.#report(await action(), okText);
    } finally {
      this.store.set({ busy: this.store.state.busy.filter((k) => k !== key) });
    }
  }

  #report(response, okText = null) {
    if (response?.ok) {
      if (okText) this.store.set({ notice: { tone: 'ok', text: okText } });
      return;
    }
    if (SILENT.has(response?.code)) return;
    this.store.set({ notice: { tone: 'error', text: response?.error || SV().actionFailed } });
  }

  async #loadOutput() {
    const key = this.store.state.output?.key;
    if (key == null) return;
    const text = await this.#model.output(key);
    if (this.store.state.output?.key === key && this.store.state.output.text !== text) this.store.set({ output: { key, text } });
  }

  async #loadBrowsers() {
    if (this.#browsersLoaded) return;
    this.#browsersLoaded = true;
    this.store.set({ browsers: await this.#model.browsers() });
  }
}
