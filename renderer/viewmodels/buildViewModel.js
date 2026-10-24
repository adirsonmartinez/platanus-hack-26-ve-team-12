// Building live: while an agent (chat or repair) saves files, the robot carries each one as a sheet of
// paper to its folder and drops it in, so the person sees the project being built. The source is the
// chat's run cards: their write_file steps, and each step's diff (diff.created) says whether the file is
// new. Explaining runs (read-only) build nothing; a card that disappears lets its work go. A folder the map does not draw (the map only shows problems) appears as a temporary "site"
// while the work lasts (views/scene/buildSiteView.js); the robot is driven through `guide`
// (views/scene/robotView.js), like the tour. One file at a time, in the order the agent wrote them.
import { Observable } from '../core/observable.js';
import { clamp } from '../core/format.js';
import { strings } from '../i18n/es.js';
import { findNode } from '../models/fileTree.js';
import { placesFor } from './tourPlaces.js';

export const TIMING = { walkPerUnitMs: 80, walkMinMs: 500, walkMaxMs: 1500, dropMs: 700, editMs: 600, failMs: 900, lingerMs: 6000 };
const HOME = { x: 1.1, z: 1.1 };
const B = strings.build;
const nameOf = (path) => path.split('/').filter(Boolean).pop() ?? path;
const folderOf = (path) => (path.includes('/') ? path.split('/')[0] : '');

export class BuildViewModel {
  #chat;
  #map;
  #project;
  #tour;
  #timing;
  #jobs = new Map();     // key -> { key, path, folder, status, created, done }
  #queue = [];           // keys waiting, in order
  #current = null;       // the job being carried
  #arrived = false;
  #timer = null;         // arrival, drop or linger
  #moves = 0;            // the robot's target moved under it (the map rearranged)
  #sites = new Map();    // folder -> { folder, papers, edits }

  // active: there is work (or it just ended); sites: [{ folder, label, kind, x, z, papers, edits, current }]
  // guide: what the robot does { from, to, center, walkMs, stepId, title, text, pose, carrying } or null
  // drop: the last sheet going into a folder { key, folder, from, x, z } (the view animates it)
  store = new Observable({ active: false, sites: [], guide: null, drop: null });

  constructor({ chatViewModel, mapViewModel, projectModel, tourViewModel = null, timing = {} }) {
    this.#chat = chatViewModel;
    this.#map = mapViewModel;
    this.#project = projectModel;
    this.#tour = tourViewModel;
    this.#timing = { ...TIMING, ...timing };
    chatViewModel.store.subscribe((state) => this.#watch(state));
    mapViewModel.store.subscribe(() => { if (this.store.state.active) { this.#publish(); this.#follow(); } }); // folders may move
    // the tour takes the robot and the map: the work on the map stops at once
    tourViewModel?.store.subscribe(({ status }) => { if (status !== 'idle' && this.store.state.active) this.#reset(); });
    let session = projectModel.store.state.session;
    projectModel.store.subscribe(({ session: now }) => { if (now !== session) { session = now; this.#reset(); } });
  }

  // New write steps join the line; known ones update their status; the person's approval is waited for
  #watch(state) {
    const touring = (this.#tour?.store.state.status ?? 'idle') !== 'idle';
    const seen = new Set();
    for (const m of state.messages) {
      const run = m.run;
      if (!run) continue;
      for (const s of run.steps ?? []) {
        if (s.name !== 'write_file' || !s.target) continue;
        const key = `${m.id}:${s.id}`;
        let job = this.#jobs.get(key);
        if (!job) {
          // the same write under a new id: a save reported before its tool event, whose step the tool took over
          job = [...this.#jobs.values()].find((j) => j.run === m.id && j.path === s.target && !run.steps.some((x) => `${m.id}:${x.id}` === j.key));
          if (job) this.#rekey(job, key);
        }
        if (job) {
          seen.add(key);
          job.status = s.status;
          if (typeof s.diff?.created === 'boolean') job.created = s.diff.created; // this write's own answer
          continue;
        }
        // old cards are history, not work; a run that only explains changes nothing
        if (run.status !== 'running' || touring || run.intent === 'explain' || s.status === 'skipped') continue;
        const exists = Boolean(findNode(this.#project.store.state.tree ?? [], s.target));
        this.#jobs.set(key, { key, path: s.target, folder: folderOf(s.target), status: s.status, created: s.diff?.created ?? !exists, run: m.id });
        this.#queue.push(key);
        seen.add(key);
        if (!this.#sites.has(folderOf(s.target))) this.#sites.set(folderOf(s.target), { folder: folderOf(s.target), papers: 0, edits: 0 });
      }
    }
    // a card that is gone (a new chat): its waiting files are dropped and the one in hand is let go
    this.#queue = this.#queue.filter((k) => seen.has(k));
    const holding = this.#current && this.#jobs.get(this.#current);
    if (holding && !seen.has(holding.key) && !holding.done) holding.status = 'gone';
    if (!this.#current && this.#queue.length) return this.#next();
    const job = this.#current && this.#jobs.get(this.#current);
    if (!job) return;
    const run = state.messages.find((m) => m.id === job.run)?.run;
    const waiting = run?.awaiting === job.path && job.status === 'running';
    if (job.status === 'gone') return this.#check();
    const { guide } = this.store.state;
    if (guide?.carrying) {
      const text = waiting ? B.waiting(nameOf(job.path)) : B.saving(nameOf(job.path));
      if (text !== guide.text) this.store.set({ guide: { ...guide, text, pose: waiting ? 'wait' : 'carry' } });
    }
    this.#check();
  }

  #next() {
    clearTimeout(this.#timer);
    this.#current = null;
    const key = this.#queue.shift();
    if (!key) {
      // nothing left: it says what it built and waves; the sites stay a moment, then it is free again
      const { guide } = this.store.state;
      if (guide) {
        const totals = [...this.#sites.values()].reduce((t, s) => ({ papers: t.papers + s.papers, edits: t.edits + s.edits }), { papers: 0, edits: 0 });
        this.store.set({ guide: { ...guide, stepId: `${guide.stepId.split(':').slice(0, -1).join(':')}:done`, pose: 'wave', carrying: false, title: B.finished, text: B.done(totals.papers, totals.edits) } });
      }
      this.#timer = setTimeout(() => this.#reset(), this.#timing.lingerMs);
      return;
    }
    const job = this.#jobs.get(key);
    this.#current = key;
    this.#arrived = false;
    const place = this.#places().get(job.folder);
    const from = this.store.state.guide?.to ?? HOME;
    const t = this.#timing;
    const walkMs = Math.round(clamp(Math.hypot(place.stand.x - from.x, place.stand.z - from.z) * t.walkPerUnitMs, t.walkMinMs, t.walkMaxMs));
    this.store.set({
      active: true,
      guide: { from, to: place.stand, center: { x: place.x, z: place.z }, walkMs, stepId: `${key}:carry`, title: B.title, text: B.saving(nameOf(job.path)), pose: 'carry', carrying: true },
    });
    this.#publish();
    this.#timer = setTimeout(() => { this.#arrived = true; this.#check(); }, walkMs);
  }

  // The file was saved (or not) and the robot is there: drop the sheet, point at the change, or say so
  #check() {
    const job = this.#current && this.#jobs.get(this.#current);
    if (!job || !this.#arrived || job.status === 'running' || job.done) return;
    job.done = true;
    const { guide } = this.store.state;
    const name = nameOf(job.path);
    const site = this.#sites.get(job.folder);
    const t = this.#timing;
    if (job.status === 'gone' || job.status === 'skipped') { // nothing to tell: the card went, or it only explained
      this.store.set({ guide: { ...guide, stepId: `${job.key}:fail`, pose: 'idle', carrying: false } });
      this.#timer = setTimeout(() => this.#next(), t.failMs);
      return;
    }
    if (job.status !== 'done') {
      this.store.set({ guide: { ...guide, stepId: `${job.key}:fail`, pose: 'idle', carrying: false, text: B.notSaved(name) } });
      this.#timer = setTimeout(() => this.#next(), t.failMs);
      return;
    }
    if (job.created) {
      this.store.set({
        guide: { ...guide, stepId: `${job.key}:drop`, pose: 'drop', carrying: false, text: B.saved(name) },
        drop: { key: job.key, folder: job.folder, from: guide.to, x: guide.center.x, z: guide.center.z },
      });
      this.#timer = setTimeout(() => { site.papers++; this.#publish(); this.#next(); }, t.dropMs);
    } else {
      this.store.set({ guide: { ...guide, stepId: `${job.key}:edit`, pose: 'point', carrying: false, text: B.edited(name) } });
      this.#timer = setTimeout(() => { site.edits++; this.#publish(); this.#next(); }, t.editMs);
    }
  }

  #rekey(job, key) {
    this.#jobs.delete(job.key);
    this.#queue = this.#queue.map((k) => (k === job.key ? key : k));
    if (this.#current === job.key) this.#current = key;
    job.key = key;
    this.#jobs.set(key, job);
  }

  // The map rearranged (a new folder appeared): if the folder the robot carries to moved, it follows
  #follow() {
    const job = this.#current && this.#jobs.get(this.#current);
    const { guide } = this.store.state;
    if (!job || !guide?.carrying) return;
    const place = this.#places().get(job.folder);
    if (Math.hypot(place.x - guide.center.x, place.z - guide.center.z) < 0.5) return;
    this.store.set({ guide: { ...guide, from: guide.to, to: place.stand, center: { x: place.x, z: place.z }, walkMs: this.#timing.walkMinMs, stepId: `${job.key}:carry~${++this.#moves}` } });
  }

  // Where each site is: the folder's building, the plaza for root files, or a temporary place
  #places() {
    const steps = [...this.#sites.keys()].map((folder) => ({ id: folder, kind: folder ? 'folder' : 'place', target: folder }));
    return placesFor(steps, this.#map.store.state);
  }

  #publish() {
    const places = this.#places();
    const current = this.#current && this.#jobs.get(this.#current)?.folder;
    const sites = [...this.#sites.values()].map((s) => {
      const p = places.get(s.folder);
      return { ...s, label: s.folder ? `${s.folder}/` : this.#map.store.state.plaza?.name ?? '', kind: p.kind, x: p.x, z: p.z, current: s.folder === current };
    });
    this.store.set({ sites });
  }

  #reset() {
    clearTimeout(this.#timer);
    this.#queue = [];
    this.#current = null;
    this.#sites.clear();
    for (const job of this.#jobs.values()) job.done = true; // what was seen stays seen
    this.store.set({ active: false, sites: [], guide: null, drop: null });
  }
}
