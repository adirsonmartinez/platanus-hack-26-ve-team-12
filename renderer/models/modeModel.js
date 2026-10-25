// How the app talks: 'vibe' (plain words, friendly names) or 'tech' (paths, rules, technical detail).
// Remembered between sessions; every view that shows text subscribes to it.
import { Observable } from '../core/observable.js';

const KEY = 'platanus.mode.v1';
const load = () => {
  try { return localStorage.getItem(KEY) === 'tech' ? 'tech' : 'vibe'; } catch { return 'vibe'; }
};

export class ModeModel {
  store = new Observable({ mode: load() });

  get tech() {
    return this.store.state.mode === 'tech';
  }

  set(mode) {
    if (mode !== 'vibe' && mode !== 'tech') return;
    this.store.set({ mode });
    try { localStorage.setItem(KEY, mode); } catch { /* private mode */ }
  }

  toggle() {
    this.set(this.tech ? 'vibe' : 'tech');
  }
}
