// Qubi's team (docs/features/llamada/FASE2.md): a request with independent parts is handed out to 2 or 3
// workers, each one another run of the person's agent in its own session and its own folder (main's MCP
// route for that worker refuses writes anywhere else). On the map, mini robots leave Qubi and carry their
// sheets (views/scene/teamView.js). When a worker ends, Qubi audits it: the fixed checks first (only its
// folder, no secrets, no red file, the run ended well), then, if enabled, a read-only review by the agent.
// The plan decides: the review only adds a note, it never turns a flagged job into an approved one.
//   start(tasks) -> { ok: true, workers: [{ id, title, folder }] } | { ok: false, motivo }
//   cancel(), summary() -> short Spanish for the voice (never the agents' own words)
// Each worker's place also carries `spot`: where its mini robot stands (workerSpots below). The placement
// and bubble math is pure and exported, so the 3D views only draw what it decides.
import { Observable } from '../core/observable.js';
import { EVENTS } from '../core/eventBus.js';
import { clamp } from '../core/format.js';
import { strings } from '../i18n/es.js';
import { isSecretFile } from '../models/fileOpen.js';
import { demoScore, worstLevel } from '../models/securityModel.js';
import { FOLDER } from './layout.js';
import { placesFor } from './tourPlaces.js';

// --- Where robots stand (docs/features/llamada/MEJORAS.md §7) ---
// Never inside a folder's footprint (its square platform, FOLDER.platform wide) nor on another robot.
// gap: from the platform's edge; apart: between two robots; plaza: the project has no platform, so its
// workers stand on a ring of this radius around it; margin: a little air past a platform's edge.
export const SPOTS = { gap: 2.2, apart: 1.6, plaza: 2.6, margin: 0.4 };
const HALF = FOLDER.platform / 2;
const MAX_PASSES = 24;

// From a place's center to SPOTS.gap past its platform's edge, going in the direction (ux, uz) (unit)
const ringRadius = (kind, ux, uz) => (kind === 'plaza' ? SPOTS.plaza : HALF / Math.max(Math.abs(ux), Math.abs(uz), 1e-6) + SPOTS.gap);
const unit = (x, z) => { const l = Math.hypot(x, z); return l > 1e-9 ? { x: x / l, z: z / l } : null; };
const round = (p) => ({ x: Math.round(p.x * 1000) / 1000, z: Math.round(p.z * 1000) / 1000 });

// Every folder the map draws (the top-level ones and those of the open path), as footprint centers. Pure.
export function foldersOf(map = {}) {
  const { buildings = [], branches = [] } = map ?? {};
  return [...buildings, ...branches.flatMap((b) => b.folders ?? [])]
    .filter((f) => Number.isFinite(f?.x) && Number.isFinite(f?.z))
    .map((f) => ({ x: f.x, z: f.z }));
}

// A point moved just out of every folder footprint it falls in (along the shortest way out). Pure.
export function clearOfFolders(point, folders = [], margin = SPOTS.margin) {
  const p = { x: point.x, z: point.z };
  const lim = HALF + margin;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let moved = false;
    for (const f of folders) {
      const dx = p.x - f.x, dz = p.z - f.z;
      if (Math.abs(dx) >= lim - 1e-9 || Math.abs(dz) >= lim - 1e-9) continue;
      if (lim - Math.abs(dx) <= lim - Math.abs(dz)) p.x = f.x + (dx < 0 ? -1 : 1) * lim;
      else p.z = f.z + (dz < 0 ? -1 : 1) * lim;
      moved = true;
    }
    if (!moved) break;
  }
  return p;
}

// Pushes robots that stand too close apart (both move, half each), keeping them off the folders. Pure.
function spread(points, folders) {
  const out = points.map((p) => clearOfFolders(p, folders));
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let moved = false;
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i], b = out[j];
        const d = Math.hypot(b.x - a.x, b.z - a.z);
        if (d >= SPOTS.apart - 1e-6) continue;
        // on the same spot: a fixed direction per pair, so the result never depends on chance
        const u = unit(b.x - a.x, b.z - a.z) ?? { x: Math.cos(i + j), z: Math.sin(i + j) };
        const push = (SPOTS.apart - d) / 2 + 0.01;
        out[i] = clearOfFolders({ x: a.x - u.x * push, z: a.z - u.z * push }, folders);
        out[j] = clearOfFolders({ x: b.x + u.x * push, z: b.z + u.z * push }, folders);
        moved = true;
      }
    }
    if (!moved) break;
  }
  return out.map(round);
}

// Where each worker stands: around its place, SPOTS.gap off the platform's edge, on an arc that faces its
// stand (the way to the plaza), SPOTS.apart or more from each other (also when two folders show at the
// same building: apps/web and apps/api at apps/), never on a folder. Pure.
//   workers: [{ id, place: { kind, x, z, stand } }]; folders: footprint centers to keep off (foldersOf)
//   -> Map(worker id -> { x, z })
export function workerSpots(workers, { folders = [] } = {}) {
  const groups = new Map();
  for (const w of workers) {
    if (!w.place) continue;
    const key = `${w.place.x.toFixed(2)},${w.place.z.toFixed(2)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(w);
  }
  // the places themselves are footprints too (a ghost folder is drawn only while the team works)
  const keepOff = [...folders, ...[...groups.values()].map((g) => g[0].place).filter((p) => p.kind !== 'plaza')];
  const ids = [];
  const points = [];
  for (const group of groups.values()) {
    const { kind, x, z, stand } = group[0].place;
    const toward = unit((stand?.x ?? 0) - x, (stand?.z ?? 0) - z) ?? unit(-x, -z) ?? unit(1, 1);
    const base = Math.atan2(toward.z, toward.x);
    const step = (SPOTS.apart + 0.3) / ringRadius(kind, toward.x, toward.z);
    group.forEach((w, i) => {
      const angle = base + (i - (group.length - 1) / 2) * step;
      const u = { x: Math.cos(angle), z: Math.sin(angle) };
      const r = ringRadius(kind, u.x, u.z);
      ids.push(w.id);
      points.push({ x: x + u.x * r, z: z + u.z * r });
    });
  }
  const spots = spread(points, keepOff);
  return new Map(ids.map((id, i) => [id, spots[i]]));
}

// Where Qubi stands to audit a place: on the camera's side of it (so the person sees him in front of the
// folder), off its platform, and never on a worker; when the camera's side is taken he steps around the
// ring. Pure. azimuth: the camera's (it looks from (sin az, cos az) on the ground).
export function auditSpot({ center, kind = 'building', azimuth = 0, avoid = [], folders = [] }) {
  const cam = { x: Math.sin(azimuth), z: Math.cos(azimuth) };
  const base = Math.atan2(cam.z, cam.x);
  const step = (SPOTS.apart + 0.3) / ringRadius(kind, cam.x, cam.z);
  const keepOff = kind === 'plaza' ? folders : [...folders, center];
  let best = null;
  for (let i = 0; i < 9; i++) {
    const angle = base + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * step; // 0, +1, -1, +2, -2…
    const u = { x: Math.cos(angle), z: Math.sin(angle) };
    const r = ringRadius(kind, u.x, u.z);
    const p = clearOfFolders({ x: center.x + u.x * r, z: center.z + u.z * r }, keepOff);
    const room = Math.min(Infinity, ...avoid.map((a) => Math.hypot(a.x - p.x, a.z - p.z)));
    if (room >= SPOTS.apart) return round(p);
    if (!best || room > best.room) best = { p, room };
  }
  return round(best.p);
}

// --- Bubbles on screen (MEJORAS §7): never more than one big bubble per area ---
// boxes: [{ id, x, y, w, h, lead?, pill?: { w, h }, keep? }] in screen pixels, (x, y) the bubble's anchor:
// the middle of its bottom edge (labels sit above their point). lead: Qubi's, which never shrinks nor moves.
// keep: a worker the pointer is on (it stays big). A worker whose full bubble touches another bubble
// becomes its one-line pill; then, from the nearest to the camera (lowest on screen) up, a bubble that
// still touches one already placed goes up just above it. Pure.
//   -> Map(id -> { collapse: boolean, lift: px upward })
export function stackBubbles(boxes, { gap = 6 } = {}) {
  const rect = (b, w, h, lift = 0) => ({ left: b.x - w / 2, right: b.x + w / 2, top: b.y - h - lift, bottom: b.y - lift });
  const touch = (a, b) => a.left < b.right + gap && b.left < a.right + gap && a.top < b.bottom + gap && b.top < a.bottom + gap;
  const full = new Map(boxes.map((b) => [b.id, rect(b, b.w, b.h)]));
  const out = new Map();
  for (const b of boxes) {
    const collapse = !b.lead && !b.keep && Boolean(b.pill) && boxes.some((o) => o !== b && touch(full.get(b.id), full.get(o.id)));
    out.set(b.id, { collapse, lift: 0 });
  }
  const size = (b) => (out.get(b.id).collapse ? b.pill : b);
  const order = [...boxes].sort((a, b) => (b.lead ? 1 : 0) - (a.lead ? 1 : 0) || b.y - a.y);
  const placed = [];
  for (const b of order) {
    const { w, h } = size(b);
    let lift = 0;
    if (!b.lead) {
      for (let pass = 0; pass <= placed.length; pass++) {
        const mine = rect(b, w, h, lift);
        const hit = placed.find((p) => touch(mine, p));
        if (!hit) break;
        lift = b.y - (hit.top - gap) + 0.5; // its bottom just above the one it touched
      }
    }
    out.get(b.id).lift = Math.max(0, Math.round(lift));
    placed.push(rect(b, w, h, lift));
  }
  return out;
}

export const TEAM_TIMING = { walkPerUnitMs: 80, walkMinMs: 500, walkMaxMs: 1500, dispatchMs: 900, verdictMs: 1800, reviewMs: 90_000, lingerMs: 8000 };
export const MAX_TASKS = 3;
const MAX_DROPS = 20;
const MAX_PEDIDO = 2000;    // characters of a task handed to a worker (as construir)
const MAX_TITLE = 80;
const MAX_MEMORY = 800;     // projectMemoryModel.memoryText limit
const MAX_BUFFER = 20_000;  // a worker's streamed text kept to find its last sentence
const HOME = { x: 1.1, z: 1.1 };
const T = strings.team;
const ENDED = new Set(['done', 'failed', 'cancelled']);

// '..' never counts as inside: main refuses it for workers, and 'apps/web/../api' is not apps/web
const inside = (path, dir) => !path.split('/').includes('..') && (path === dir || path.startsWith(`${dir}/`));
// A path as main's scope check reads it (posix normalize): './apps/web/a.js' and 'apps//web/./a.js' are
// 'apps/web/a.js', so a worker that wrote inside its folder is never judged outside
const normalPath = (raw) => {
  const path = raw.replace(/\\/g, '/');
  return (path.startsWith('/') ? '/' : '') + path.split('/').filter((part) => part && part !== '.').join('/');
};
const lower = (s) => s.toLowerCase();

// A task's folder, cleaned: relative, inside the project, no '..', never a secret. null = not usable.
export function cleanFolder(raw) {
  if (typeof raw !== 'string') return null;
  const path = raw.trim().replace(/\\/g, '/').replace(/^(?:\.\/)+/, '').replace(/\/+$/, '');
  if (!path || path.length > 200 || path.startsWith('/') || /^[a-z]:/i.test(path) || /[\u0000-\u001f]/.test(path)) return null;
  if (path.split('/').some((part) => !part || part === '.' || part === '..')) return null;
  return isSecretFile(path) ? null : path;
}

// The last plain sentence of a worker's streamed answer, for its bubble and card: code blocks (even one
// still open), inline code marks and markdown are left out; at most `max` characters.
const looksLikeCode = (line) => /[{};]$|=>|^(?:import|export|const|let|var|function|return|class)\b|^<\/?[a-z]/i.test(line);
export function shortText(raw, max = 80) {
  const plain = String(raw ?? '').replace(/```[\s\S]*?(?:```|$)/g, '\n');
  const lines = plain.split('\n')
    .map((l) => l.replace(/`([^`\s]{1,80})`/g, '$1').replace(/`[^`]*`/g, '').replace(/`/g, '').replace(/\*+/g, '')
      .replace(/^\s*(?:#+|>|[-+]|\d+[.)])\s+/, '').replace(/\s+/g, ' ').trim())
    .filter((l) => l && !looksLikeCode(l));
  const last = lines.at(-1) ?? '';
  return last.length > max ? `${last.slice(0, max - 1).trimEnd()}…` : last;
}

// 'w1-k3x9q2': matches main's ^w[1-3]-[a-z0-9]{4,12}$; random so a late event of an old team never
// lands on a new worker
const workerId = (n) => `w${n}-${Math.random().toString(36).slice(2).padEnd(6, '0').slice(0, 6)}`;

export class TeamViewModel {
  #connection;
  #project;
  #map;
  #security;
  #memory;
  #review;
  #timing;
  #team = 0;              // which team is on: a run of a cancelled team that ends late is ignored
  #controllers = new Map(); // worker id -> AbortController
  #buffers = new Map();   // worker id -> streamed text
  #audits = [];           // worker ids waiting for their audit, in the order they ended
  #auditing = null;       // { id, arrived, reviewed, note, controller }
  #dispatchTimer = null;
  #timer = null;          // the audit's walk / verdict, or the linger at the end
  #reviewTimer = null;
  #drops = 0;
  #last = [];             // the last team, told by summary() once it is gone from the map

  // workers: [{ id, n, title, pedido, folder, status, created, changed, steps, text, audit, place, startedAt, endedAt }]
  // guide: what Qubi does on the map (as buildViewModel) · drops: new sheets the view animates (last 20)
  store = new Observable({ phase: 'idle', workers: [], guide: null, drops: [] });

  constructor({ connection, projectModel, mapViewModel, securityModel = null, memory = null, bus = null, timing = {}, review = true }) {
    this.#connection = connection;
    this.#project = projectModel;
    this.#map = mapViewModel;
    this.#security = securityModel;
    this.#memory = memory;
    this.#review = review;
    this.#timing = { ...TEAM_TIMING, ...timing };
    // Writes and approvals of a worker's tools carry its id (main's worker route); the chat's do not
    bus?.on(EVENTS.agentChanged, (change) => this.#onChanged(change));
    bus?.on(EVENTS.agentAwaiting, (detail) => this.#onAwaiting(detail));
    // The tour takes the robot and the map; a closed or another project ends the team at once
    bus?.on(EVENTS.tourStarted, () => this.cancel());
    bus?.on(EVENTS.projectClosed, () => this.cancel());
    let session = projectModel.store.state.session;
    projectModel.store.subscribe(({ session: now }) => { if (now !== session) { session = now; this.cancel(); } });
    mapViewModel?.store.subscribe(() => this.#replace()); // folders may move or appear on the map
  }

  start(tasks) {
    const { phase } = this.store.state;
    if (phase === 'working' || phase === 'auditing') return { ok: false, motivo: 'ocupado' };
    if (!this.#project.store.state.open) return { ok: false, motivo: 'sin-proyecto' };
    if (!this.#connection?.live) return { ok: false, motivo: 'sin-agente' };
    if (!Array.isArray(tasks) || !tasks.length || tasks.length > MAX_TASKS) return { ok: false, motivo: 'muchas-tareas' };
    const clean = tasks.map((task, i) => {
      const folder = cleanFolder(task?.folder ?? task?.carpeta);
      const title = String(task?.title ?? task?.titulo ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE);
      const pedido = String(task?.pedido ?? '').trim().slice(0, MAX_PEDIDO) || title;
      return folder && pedido ? { folder, title: title || T.worker(i + 1), pedido } : null;
    });
    if (clean.some((t) => !t)) return { ok: false, motivo: 'carpeta-invalida' };
    // each worker owns its folder: none twice, none inside another (case-insensitive, like macOS disks)
    const overlap = clean.some((a, i) => clean.some((b, j) => i !== j && inside(lower(a.folder), lower(b.folder))));
    if (overlap) return { ok: false, motivo: 'carpetas-repetidas' };

    this.#reset();
    const team = this.#team;
    const now = Date.now();
    const workers = clean.map((t, i) => ({
      id: workerId(i + 1), n: i + 1, title: t.title, pedido: t.pedido, folder: t.folder,
      status: 'queued', created: [], changed: [], steps: 0, text: '', audit: null, place: null, startedAt: now, endedAt: null,
    }));
    const places = this.#places(workers);
    for (const w of workers) w.place = places.get(w.id);
    this.store.set({ phase: 'working', workers, guide: null, drops: [] });
    const memory = this.#memoryText();
    for (const w of workers) this.#runWorker(w, memory, team);
    this.#dispatch(0);
    return { ok: true, workers: workers.map(({ id, title, folder }) => ({ id, title, folder })) };
  }

  // Stops every run (waiting ones never start) and the work on the map ends at once
  cancel() {
    if (this.store.state.phase === 'idle') return;
    const at = Date.now();
    // a finished team (phase 'done') keeps its workers as they are: a new array would read as a change
    if (!this.store.state.workers.every((w) => ENDED.has(w.status))) {
      this.#setWorkers((w) => (ENDED.has(w.status) ? w : { ...w, status: 'cancelled', endedAt: at }));
    }
    this.#reset();
  }

  summary() {
    const { phase, workers } = this.store.state;
    const list = workers.length ? workers : this.#last;
    return T.summary(workers.length ? phase : 'idle', list.map((w) => ({
      n: w.n, title: w.title, folder: w.folder, status: w.status,
      created: w.created.length, changed: w.changed.length, audit: w.audit?.status ?? null,
    })));
  }

  // One worker: the agent the person picked, in session worker-N, allowed to write only in its folder
  async #runWorker(w, memory, team) {
    const controller = new AbortController();
    this.#controllers.set(w.id, controller);
    let result;
    try {
      result = await this.#connection.ask(T.prompt.worker({ pedido: w.pedido, folder: w.folder, memory }), '', {
        session: `worker-${w.n}`, worker: w.id, scope: [w.folder], voice: { purpose: 'worker' }, signal: controller.signal,
        onStart: () => { if (team === this.#team) this.#patch(w.id, (x) => (x.status === 'queued' ? { ...x, status: 'working' } : x)); },
        onEvent: (e) => { if (team === this.#team) this.#onEvent(w.id, e); },
      });
    } catch (err) {
      result = { text: '', error: err?.message ?? String(err) };
    }
    if (team !== this.#team) return;
    const status = controller.signal.aborted || result?.error === 'cancelled' ? 'cancelled' : result?.error ? 'failed' : 'done';
    this.#patch(w.id, (x) => ({ ...x, status, endedAt: Date.now() }));
    if (status !== 'cancelled') this.#audits.push(w.id);
    this.#nextAudit();
    this.#settlePhase(); // the last one ended while Qubi was still checking another: now it is 'auditing'
  }

  #onEvent(id, e) {
    if (e?.type === 'tool') this.#patch(id, (x) => ({ ...x, steps: x.steps + 1, status: x.status === 'queued' ? 'working' : x.status }));
    else if (e?.type === 'text' && !e.parent) {
      const buffer = `${this.#buffers.get(id) ?? ''}${e.delta ?? ''}`.slice(-MAX_BUFFER);
      this.#buffers.set(id, buffer);
      const text = shortText(buffer);
      if (text && text !== this.#worker(id)?.text) this.#patch(id, (x) => ({ ...x, text }));
    }
  }

  #onChanged(change) {
    const w = change?.worker && this.#worker(change.worker);
    const path = typeof change?.path === 'string' ? normalPath(change.path) : '';
    if (!w || !path || w.status === 'cancelled') return;
    const created = typeof change.created === 'boolean' ? change.created : Boolean(change.diff?.created);
    const known = w.created.includes(path) || w.changed.includes(path);
    this.#patch(w.id, (x) => ({
      ...x,
      created: created && !known ? [...x.created, path] : x.created,
      changed: !created && !known ? [...x.changed, path] : x.changed,
      status: x.status === 'waiting' ? 'working' : x.status,
    }));
    if (created && !known) {
      const drop = { id: `${w.id}:${++this.#drops}`, worker: w.id, folder: w.folder, path, x: w.place.x, z: w.place.z };
      this.store.set({ drops: [...this.store.state.drops, drop].slice(-MAX_DROPS) });
    }
  }

  #onAwaiting(detail) {
    const w = detail?.worker && this.#worker(detail.worker);
    if (!w || ENDED.has(w.status)) return;
    const status = detail.waiting ? 'waiting' : 'working';
    if (status !== w.status) this.#patch(w.id, (x) => ({ ...x, status }));
  }

  // Qubi points at each folder while its worker is born, then is free until the first audit. He points
  // from where he stands (no from/to): the mini robots come out of him, wherever the person left him.
  #dispatch(i) {
    clearTimeout(this.#dispatchTimer);
    if (this.#auditing) return;
    const w = this.store.state.workers[i];
    if (!w) return void this.store.set({ guide: null });
    this.store.set({ guide: { from: null, to: null, center: { x: w.place.x, z: w.place.z }, walkMs: 0, stepId: `${w.id}:dispatch`, title: T.title, text: T.guide.dispatch(w.title), pose: 'point' } });
    this.#dispatchTimer = setTimeout(() => this.#dispatch(i + 1), this.#timing.dispatchMs);
  }

  // One audit at a time, so Qubi walks to each folder: the fixed verdict is decided here, before the
  // review is even asked
  #nextAudit() {
    if (this.#auditing) return;
    const id = this.#audits.shift();
    const w = id && this.#worker(id);
    if (!w) return this.#settlePhase();
    clearTimeout(this.#dispatchTimer);
    const notes = this.#fixedNotes(w);
    const files = [...w.created, ...w.changed];
    const audit = { id, notes, arrived: false, reviewed: true, note: null, controller: null };
    this.#auditing = audit;
    this.#patch(id, (x) => ({ ...x, audit: { status: 'checking', notes } }));
    const from = this.store.state.guide?.to ?? HOME;
    const t = this.#timing;
    const walkMs = Math.round(clamp(Math.hypot(w.place.stand.x - from.x, w.place.stand.z - from.z) * t.walkPerUnitMs, t.walkMinMs, t.walkMaxMs));
    this.store.set({ guide: { from, to: w.place.stand, center: { x: w.place.x, z: w.place.z }, walkMs, stepId: `${id}:scan`, title: T.title, text: T.guide.scan(w.folder), pose: 'scan' } });
    this.#settlePhase();
    this.#timer = setTimeout(() => { audit.arrived = true; this.#verdict(audit); }, walkMs);
    if (this.#review && w.status === 'done' && files.length) this.#askReview(audit, w, files);
  }

  // Fixed checks: every file inside its folder, no secret, not red on the semáforo, the run ended well.
  // The light is the worst of the fixed rule (demoScore) and the current one: an agent can override the
  // current light (platanus_set_file_score), so a green override never hides what the rule marks red.
  #fixedNotes(w) {
    const notes = [];
    if (w.status !== 'done') notes.push(T.auditNotes.failed);
    for (const path of [...w.created, ...w.changed]) {
      if (!inside(path, w.folder)) notes.push(T.auditNotes.outside(path));
      if (isSecretFile(path)) notes.push(T.auditNotes.secret(path));
      else if (worstLevel([demoScore(path).level, this.#security?.scoreOf?.(path)?.level ?? 'grey']) === 'red') notes.push(T.auditNotes.red(path));
    }
    return notes;
  }

  // Read-only review in its own session; its words become one short note, nothing more. A review that
  // never answers is stopped: the fixed verdict does not wait forever.
  #askReview(audit, w, files) {
    audit.reviewed = false;
    audit.controller = new AbortController();
    const team = this.#team;
    this.#reviewTimer = setTimeout(() => audit.controller.abort(), this.#timing.reviewMs);
    this.#connection.ask(T.prompt.review({ folder: w.folder, files }), '', { session: 'review', readOnly: true, signal: audit.controller.signal })
      .catch(() => ({ text: '', error: 'failed' }))
      .then((r) => {
        if (team !== this.#team || this.#auditing !== audit) return;
        clearTimeout(this.#reviewTimer);
        const said = !r?.error && shortText(r?.text ?? '', 160);
        if (said) audit.note = T.auditNotes.review(said);
        audit.reviewed = true;
        this.#verdict(audit);
      });
  }

  #verdict(audit) {
    if (this.#auditing !== audit || !audit.arrived || !audit.reviewed) return;
    const w = this.#worker(audit.id);
    const status = audit.notes.length ? 'flagged' : 'approved'; // decided by the fixed checks only
    this.#patch(audit.id, (x) => ({ ...x, audit: { status, notes: audit.note ? [...audit.notes, audit.note] : audit.notes } }));
    const { guide } = this.store.state;
    const text = status === 'approved' ? T.guide.approved(w.folder) : T.guide.flagged(w.folder);
    this.store.set({ guide: { ...guide, stepId: `${audit.id}:${status}`, text, pose: status === 'approved' ? 'wave' : 'point' } });
    this.#timer = setTimeout(() => { this.#auditing = null; this.#nextAudit(); }, this.#timing.verdictMs);
  }

  // working while someone works; auditing once all ended and Qubi still checks; done when all is checked
  #settlePhase() {
    const { workers, phase, guide } = this.store.state;
    if (phase === 'idle' || phase === 'done' || !workers.length) return;
    if (!workers.every((w) => ENDED.has(w.status))) return;
    if (this.#auditing || this.#audits.length) {
      if (phase !== 'auditing') this.store.set({ phase: 'auditing' });
      return;
    }
    clearTimeout(this.#dispatchTimer);
    const approved = workers.filter((w) => w.audit?.status === 'approved').length;
    const at = guide?.to ?? HOME;
    this.store.set({
      phase: 'done',
      guide: { from: at, to: at, center: guide?.center ?? at, walkMs: 0, stepId: 'team:done', title: T.title, text: T.guide.done(approved, workers.length), pose: 'wave' },
    });
    this.#timer = setTimeout(() => this.#reset(), this.#timing.lingerMs);
  }

  // The map changed: each worker's place is computed again; Qubi follows a folder that moved under it
  #replace() {
    const { workers, guide } = this.store.state;
    if (!workers.length) return;
    const places = this.#places(workers);
    const moved = workers.some((w) => {
      const p = places.get(w.id);
      return p.x !== w.place.x || p.z !== w.place.z || p.kind !== w.place.kind || p.spot?.x !== w.place.spot?.x || p.spot?.z !== w.place.spot?.z;
    });
    if (!moved) return;
    this.#setWorkers((w) => ({ ...w, place: places.get(w.id) }));
    const auditing = this.#auditing && this.#worker(this.#auditing.id);
    if (auditing && guide && Math.hypot(auditing.place.x - guide.center.x, auditing.place.z - guide.center.z) >= 0.5) {
      this.store.set({ guide: { ...guide, from: guide.to, to: auditing.place.stand, center: { x: auditing.place.x, z: auditing.place.z }, walkMs: this.#timing.walkMinMs } });
    }
  }

  // Each worker's folder on the map: its building, or a temporary ghost place (tourPlaces.js), and the spot
  // its mini robot stands on (workerSpots: off every folder, apart from the others)
  #places(workers) {
    const map = this.#map?.store.state ?? {};
    const steps = workers.map((w) => ({ id: w.id, kind: 'folder', target: w.folder }));
    const found = placesFor(steps, map);
    const places = new Map(workers.map((w) => {
      const p = found.get(w.id);
      return [w.id, { kind: p.kind, x: p.x, z: p.z, stand: { ...p.stand } }];
    }));
    const spots = workerSpots(workers.map((w) => ({ id: w.id, place: places.get(w.id) })), { folders: foldersOf(map) });
    for (const [id, place] of places) place.spot = spots.get(id);
    return places;
  }

  // What the project memory says (projectMemoryModel.memoryText), for the workers' prompts; optional
  #memoryText() {
    const m = this.#memory;
    try {
      const text = typeof m === 'function' ? m() : typeof m?.text === 'function' ? m.text() : typeof m === 'string' ? m : m?.memoryText;
      return typeof text === 'string' ? text.trim().slice(0, MAX_MEMORY) : '';
    } catch {
      return '';
    }
  }

  #worker(id) {
    return this.store.state.workers.find((w) => w.id === id) ?? null;
  }

  #patch(id, fn) {
    this.#setWorkers((w) => (w.id === id ? fn(w) : w));
  }

  #setWorkers(fn) {
    this.store.set({ workers: this.store.state.workers.map(fn) });
  }

  // Back to idle: runs stopped, timers cleared, the mini robots leave (the last team stays for summary())
  #reset() {
    this.#team++;
    clearTimeout(this.#dispatchTimer);
    clearTimeout(this.#timer);
    clearTimeout(this.#reviewTimer);
    for (const c of this.#controllers.values()) c.abort();
    this.#auditing?.controller?.abort();
    this.#controllers.clear();
    this.#buffers.clear();
    this.#audits = [];
    this.#auditing = null;
    if (this.store.state.workers.length) this.#last = this.store.state.workers;
    if (this.store.state.phase !== 'idle' || this.store.state.workers.length) this.store.set({ phase: 'idle', workers: [], guide: null, drops: [] });
  }
}
