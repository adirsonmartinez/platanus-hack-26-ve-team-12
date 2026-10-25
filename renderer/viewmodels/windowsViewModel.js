// Where the floating windows (the editor and the browser) go on the map: a zone of models/windowLayout.js
// or their own place. When both are open they split in halves by themselves (editor left, browser right);
// Qubi places them by voice (acomodar_ventanas); a window the person drags is theirs until it closes.
// The view (windowsView.js) measures the stage and moves them.
import { Observable } from '../core/observable.js';
import { WINDOWS, opposite, windowOf, zoneOf, ZONES } from '../models/windowLayout.js';

const AUTO = { editor: 'izquierda', navegador: 'derecha' };

export class WindowsViewModel {
  #windows;
  #manual = new Set(); // windows the person dragged since they opened
  #wasOpen = {};

  // editor / navegador: { zone, by: 'auto' | 'qubi' } or null (its own place)
  store = new Observable({ editor: null, navegador: null });

  // windows: { editor, navegador }, each { store: Observable({ open, tabs }), show() -> boolean }
  constructor({ windows }) {
    this.#windows = windows;
    for (const name of WINDOWS) {
      this.#wasOpen[name] = this.#isOpen(name);
      windows[name].store.subscribe(() => this.#changed(name));
    }
    this.#auto();
  }

  // Qubi's acomodar_ventanas (plain words allowed) -> { ok, ventana, zona } | { ok: false, motivo }
  place(windowWord, zoneWord) {
    const name = WINDOWS.includes(windowWord) ? windowWord : windowOf(windowWord);
    const zone = ZONES.includes(zoneWord) ? zoneWord : zoneOf(zoneWord);
    if (!name || !zone) return { ok: false, motivo: 'no-entendido' };
    if (!this.#isOpen(name) && !this.#windows[name].show()) return { ok: false, motivo: 'no-abierta', ventana: name };
    this.#manual.delete(name);
    const patch = { [name]: { zone, by: 'qubi' } };
    const other = WINDOWS.find((w) => w !== name);
    const half = opposite(zone);
    // the other open window takes the other half (unless the person placed it by hand)
    if (half && this.#isOpen(other) && !this.#manual.has(other)) patch[other] = { zone: half, by: 'qubi' };
    this.store.set(patch);
    return { ok: true, ventana: name, zona: zone };
  }

  // The person started dragging it
  grab(name) {
    if (!WINDOWS.includes(name)) return;
    this.#manual.add(name);
    if (this.store.state[name]) this.store.set({ [name]: null });
  }

  #isOpen(name) {
    return Boolean(this.#windows[name]?.store.state.open);
  }

  #changed(name) {
    const open = this.#isOpen(name);
    if (open === this.#wasOpen[name]) return;
    this.#wasOpen[name] = open;
    if (!open) {
      // closed: it forgets its zone and the drag; a window that was only split for it goes back to its place
      this.#manual.delete(name);
      const patch = { [name]: null };
      for (const other of WINDOWS) if (other !== name && this.store.state[other]?.by === 'auto') patch[other] = null;
      this.store.set(patch);
      return;
    }
    this.#auto();
  }

  // Both open, nobody placed them: halves
  #auto() {
    if (!WINDOWS.every((w) => this.#isOpen(w))) return;
    if (WINDOWS.some((w) => this.store.state[w] || this.#manual.has(w))) return;
    this.store.set(Object.fromEntries(WINDOWS.map((w) => [w, { zone: AUTO[w], by: 'auto' }])));
  }
}
