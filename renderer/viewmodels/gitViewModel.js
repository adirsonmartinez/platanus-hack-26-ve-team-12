// Git view: lays the history out as railway lanes. Every commit belongs to one lane (the branch that
// reaches it first through first parents, in git flow priority). Deleted branches are recovered from
// merge subjects ("Merge branch 'feature/x'"). Lanes that do not overlap in time share a row.
import { Observable } from '../core/observable.js';
import { EVENTS } from '../core/eventBus.js';
import { GIT_LAYOUT } from './layout.js';

const PRIORITY = ['main', 'master', 'develop'];
const KIND_ORDER = { main: 0, develop: 1, release: 2, hotfix: 3, feature: 4, other: 5, remote: 6 };

export function branchKind(name, remote = false) {
  if (remote) return 'remote';
  if (name === 'main' || name === 'master') return 'main';
  if (name === 'develop') return 'develop';
  const prefix = name.split('/')[0];
  return ['feature', 'release', 'hotfix'].includes(prefix) ? prefix : 'other';
}

const mergedBranchName = (subject) =>
  subject.match(/Merge (?:remote-tracking )?branch '([^']+)'/)?.[1] ?? subject.match(/^Merge .* from (\S+)$/)?.[1] ?? null;

export class GitViewModel {
  #model;
  #camera;
  #bus;
  #centerWhenReady = false;

  store = new Observable({
    status: 'idle', error: null,
    lanes: [], commits: [], connectors: [], tips: [], tags: [],
    head: null, summary: null, focusLane: null, selected: null, version: 0,
  });

  constructor({ gitModel, camera, bus }) {
    this.#model = gitModel;
    this.#camera = camera;
    this.#bus = bus;
    gitModel.store.subscribe((state) => this.#layout(state), { immediate: true });
  }

  // pick: { type: 'commit', sha } | { type: 'lane', name }
  handlePick(pick) {
    if (pick.type === 'commit') return this.selectCommit(pick.sha);
    if (pick.type === 'lane') return this.focusLane(pick.name);
    return undefined;
  }

  focusLane(name) {
    this.store.set({ focusLane: this.store.state.focusLane === name ? null : name });
  }

  selectCommit(sha) {
    const commit = this.store.state.commits.find((c) => c.sha === sha);
    if (!commit) return;
    this.store.set({ selected: sha });
    const { short, subject, author, date, files, risk, lane, laneLive } = commit;
    this.#bus.emit(EVENTS.commitSelected, { sha, short, subject, author, date, files, risk, lane, laneLive });
  }

  escape() {
    this.store.set({ focusLane: null, selected: null });
  }

  // Aim the camera at HEAD (now, or as soon as the history is loaded)
  centerOnHead() {
    const head = this.store.state.head;
    if (!head) { this.#centerWhenReady = true; return; }
    this.#centerWhenReady = false;
    this.#camera.flyTo(this.#camera.groundBehind(head.x, 0.6, head.z), GIT_LAYOUT.zoom);
  }

  #layout(git) {
    const version = this.store.state.version + 1;
    if (git.status !== 'ready') {
      this.store.set({ status: git.status, error: git.error, lanes: [], commits: [], connectors: [], tips: [], tags: [], head: null, summary: null, version });
      return;
    }

    const ordered = [...git.commits].reverse(); // oldest first
    const byId = new Map(ordered.map((c, i) => [c.sha, { ...c, index: i }]));
    const laneOf = new Map(); // sha -> lane
    const lanes = [];

    const claim = (name, tip, { live, remote = false }) => {
      const chain = [];
      for (let sha = tip; sha && byId.has(sha) && !laneOf.has(sha); sha = byId.get(sha).parents[0]) chain.push(sha);
      if (!chain.length) return;
      const lane = { name, kind: branchKind(name, remote), live, shas: chain.reverse() };
      lane.first = byId.get(lane.shas[0]).index;
      lane.last = byId.get(lane.shas[lane.shas.length - 1]).index;
      chain.forEach((sha) => laneOf.set(sha, lane));
      lanes.push(lane);
    };

    // 1. Live local branches, in git flow priority; then remote branches
    const local = git.branches.filter((b) => !b.remote).sort((a, b) =>
      (PRIORITY.indexOf(a.name) + 1 || 99) - (PRIORITY.indexOf(b.name) + 1 || 99) ||
      KIND_ORDER[branchKind(a.name)] - KIND_ORDER[branchKind(b.name)] || a.name.localeCompare(b.name));
    local.forEach((b) => claim(b.name, b.sha, { live: true }));
    git.branches.filter((b) => b.remote).forEach((b) => claim(b.name, b.sha, { live: true, remote: true }));
    // 2. Deleted branches, through the second parent of merges
    ordered.forEach((c) => c.parents.slice(1).forEach((p) => claim(mergedBranchName(c.subject) ?? 'merged', p, { live: false })));
    // 3. Anything left (e.g. history cut by the commit limit)
    [...ordered].reverse().forEach((c) => { if (!laneOf.has(c.sha)) claim('unknown', c.sha, { live: false }); });

    // Rows: main and develop fixed at the back; the rest packed so lanes that do not overlap share a row
    const rows = [];
    const rowOf = new Map();
    const sorted = [...lanes].sort((a, b) =>
      (KIND_ORDER[a.kind] <= 1 ? KIND_ORDER[a.kind] : 2) - (KIND_ORDER[b.kind] <= 1 ? KIND_ORDER[b.kind] : 2) || a.first - b.first);
    sorted.forEach((lane) => {
      let row = rows.findIndex((end, r) => r >= 2 && end < lane.first - 1);
      if (lane.kind === 'main') row = 0;
      else if (lane.kind === 'develop') row = 1;
      else if (row === -1) row = Math.max(2, rows.length);
      rows[row] = Math.max(rows[row] ?? -1, lane.last);
      rowOf.set(lane, row);
    });

    const { step, laneGap } = GIT_LAYOUT;
    const newest = ordered.length - 1;
    const pos = (index, lane) => ({ x: (index - newest) * step, z: rowOf.get(lane) * laneGap });

    const commits = ordered.map((c, index) => {
      const lane = laneOf.get(c.sha);
      return {
        sha: c.sha, short: c.sha.slice(0, 7), subject: c.subject, author: c.author, date: c.date,
        files: c.files, risk: c.risk, isMerge: c.parents.length > 1,
        lane: lane.name, laneKind: lane.kind, laneLive: lane.live, ...pos(index, lane),
      };
    });
    const commitById = new Map(commits.map((c) => [c.sha, c]));

    // Forks (first parent in another lane) and merges (extra parents)
    const connectors = [];
    ordered.forEach((c) => c.parents.forEach((p, i) => {
      const from = commitById.get(p), to = commitById.get(c.sha);
      if (!from || (i === 0 && from.lane === to.lane)) return;
      connectors.push({ from: { x: from.x, z: from.z }, to: { x: to.x, z: to.z }, lane: i === 0 ? to.lane : from.lane, type: i === 0 ? 'fork' : 'merge' });
    }));

    const laneViews = lanes.map((lane) => {
      const first = commitById.get(lane.shas[0]), last = commitById.get(lane.shas[lane.shas.length - 1]);
      return { name: lane.name, kind: lane.kind, live: lane.live, z: first.z, fromX: first.x, toX: last.x };
    });

    // Live branch tips (several branches can point at the same commit)
    const tipsBySha = new Map();
    git.branches.forEach((b) => {
      if (!commitById.has(b.sha)) return;
      if (!tipsBySha.has(b.sha)) tipsBySha.set(b.sha, []);
      tipsBySha.get(b.sha).push({ name: b.name, kind: branchKind(b.name, b.remote), isHead: !b.remote && b.name === git.head.branch });
    });
    const tips = [...tipsBySha].map(([sha, branches]) => ({ sha, ...commitById.get(sha), branches }));

    const tags = git.tags.filter((t) => commitById.has(t.sha)).map((t) => ({ name: t.name, ...commitById.get(t.sha) }));
    const headCommit = commitById.get(git.head.sha);
    const lastTag = [...tags].sort((a, b) => b.date - a.date)[0]?.name ?? null;

    this.store.set({
      status: 'ready', error: null,
      lanes: laneViews, commits, connectors, tips, tags,
      head: headCommit ? { branch: git.head.branch, sha: headCommit.sha, x: headCommit.x, z: headCommit.z } : null,
      summary: {
        branch: git.head.branch,
        branches: git.branches.filter((b) => !b.remote).length,
        commits: commits.length,
        lastTag,
        risky: commits.filter((c) => c.risk).length,
      },
      focusLane: laneViews.some((l) => l.name === this.store.state.focusLane) ? this.store.state.focusLane : null,
      selected: commitById.has(this.store.state.selected) ? this.store.state.selected : null,
      version,
    });
    if (this.#centerWhenReady) this.centerOnHead();
  }
}
