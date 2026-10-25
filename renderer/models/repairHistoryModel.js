// History of repairs, like a task list: what Qubi (and the user's agent) worked on, what changed and
// what is still pending. Remembered per project in this computer (localStorage).
import { Observable } from '../core/observable.js';

// status: 'queued' | 'working' | 'planned' (plan only) | 'fixed' (agent changed files, to verify)
//       | 'verified' (the person confirmed) | 'failed'
// entry: { id, path, reason, status, agent, plan: [], changes: [{ path, reason, created, backup, at, undone? }],
//          summary, error, startedAt, endedAt }
const KEY = (project) => `platanus.repairs.v1:${project}`;
const MAX_ENTRIES = 60;

export class RepairHistoryModel {
  #project = null;
  #nextId = 1;

  store = new Observable({ entries: [] }); // newest first

  // Switches to a project's history (call when a project opens)
  load(project) {
    this.#project = project;
    let entries = [];
    try { entries = JSON.parse(localStorage.getItem(KEY(project)) ?? '[]'); } catch { entries = []; }
    // A run cut by closing the app cannot be resumed
    entries = entries.map((e) => (e.status === 'working' || e.status === 'queued' ? { ...e, status: 'failed', interrupted: true } : e));
    this.#nextId = Math.max(0, ...entries.map((e) => e.id)) + 1;
    this.store.set({ entries });
  }

  add(entry) {
    const full = { id: this.#nextId++, plan: [], changes: [], summary: '', error: '', startedAt: new Date().toISOString(), endedAt: null, ...entry };
    this.#save([full, ...this.store.state.entries].slice(0, MAX_ENTRIES));
    return full.id;
  }

  update(id, patch) {
    this.#save(this.store.state.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  get(id) {
    return this.store.state.entries.find((e) => e.id === id) ?? null;
  }

  clearFinished() {
    this.#save(this.store.state.entries.filter((e) => e.status === 'working' || e.status === 'queued'));
  }

  #save(entries) {
    this.store.set({ entries });
    if (!this.#project) return;
    try { localStorage.setItem(KEY(this.#project), JSON.stringify(entries)); } catch { /* storage full or private mode */ }
  }
}
