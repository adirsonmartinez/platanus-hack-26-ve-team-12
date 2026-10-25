// Git history of the open project (read only): commits, branches, tags and HEAD.
// Commits that add or modify a file the security rules mark red (a .env, a private key…) are flagged:
// even if a later commit deletes the file, it stays in the history.
import { Observable } from '../core/observable.js';
import { demoScore } from './securityModel.js';

const RELOAD_DEBOUNCE_MS = 400;

// status: 'idle' | 'loading' | 'ready' | 'not-repo' | 'error'
const EMPTY = { status: 'idle', head: { branch: null, sha: null }, branches: [], tags: [], commits: [], error: null };

export class GitModel {
  #workspace;
  #reloadTimer = null;
  #loading = null;

  store = new Observable({ ...EMPTY, version: 0 });

  constructor(workspace) {
    this.#workspace = workspace;
  }

  async load() {
    // Concurrent calls share the same request
    this.#loading ??= this.#fetch().finally(() => { this.#loading = null; });
    return this.#loading;
  }

  scheduleReload() {
    clearTimeout(this.#reloadTimer);
    this.#reloadTimer = setTimeout(() => this.load(), RELOAD_DEBOUNCE_MS);
  }

  clear() {
    this.store.set({ ...EMPTY, version: this.store.state.version + 1 });
  }

  async #fetch() {
    if (this.store.state.status === 'idle') this.store.set({ status: 'loading' });
    const response = await this.#workspace.gitHistory();
    const version = this.store.state.version + 1;
    if (!response.ok) return this.store.set({ ...EMPTY, status: 'error', error: response.error, version });
    const history = response.data;
    if (!history.isRepo) return this.store.set({ ...EMPTY, status: 'not-repo', error: history.error ?? null, version });
    this.store.set({
      status: 'ready',
      head: history.head,
      branches: history.branches,
      tags: history.tags,
      commits: history.commits.map((c) => ({ ...c, risk: riskOf(c) })),
      error: null,
      version,
    });
  }
}

// { files: [path], reasonKey } when the commit added/modified red files, otherwise null
function riskOf(commit) {
  const flagged = commit.files
    .filter((f) => f.status !== 'D')
    .map((f) => ({ path: f.path, score: demoScore(f.path) }))
    .filter((f) => f.score.level === 'red');
  return flagged.length ? { files: flagged.map((f) => f.path), reasonKey: flagged[0].score.reasonKey } : null;
}
