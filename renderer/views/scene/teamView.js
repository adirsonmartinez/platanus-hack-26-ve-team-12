// Qubi's team on the map (TeamViewModel, docs/features/llamada/FASE2.md). Each worker is a mini robot (the
// same guide robot at 0.55, with its own color on its heart, ring and thruster) that pops out of Qubi with a
// little overshoot, walks to the folder it works in and faces it:
//   - working: it holds a sheet and bobs; each file it saves (store.drops) flies from its hands into the
//     folder, which gains a sheet. A folder the map does not draw rises from the ground (as buildSiteView);
//   - waiting for the person's permission: it turns to the camera and says so;
//   - Qubi's audit: approved, it waves with a green flash under it; flagged, a red ring stays under it and
//     its face is worried;
//   - phase 'idle': they walk back to Qubi, shrink away and everything they made is freed.
// Bubbles stay short: «Trabajador N · título» and one line (state, audit or the last thing it said). When
// bubbles touch on screen, the workers' become one-line pills («2 · Ruta de contacto ✓») and the one that
// collides goes up (stackBubbles); Qubi's stays as it is, on top.
// Where each one stands is the view model's place.spot (off every folder, apart from each other).
// Nothing here is clickable: `pointer` (for the input controller) only lets the person point at a mini
// robot, which then shows its whole task and state, big and on top. The view model decides everything.
import * as THREE from 'three';
import { createGuideRobot } from './guideRobot.js';
import { buildGlassFolder } from './builders/glassFolderBuilder.js';
import { PALETTE, materials as M } from './materials.js';
import { FOLDER } from '../../viewmodels/layout.js';
import { stackBubbles } from '../../viewmodels/teamViewModel.js';
import { CAMERA } from '../../viewmodels/cameraViewModel.js';
import { escapeHtml } from '../../core/format.js';
import { strings } from '../../i18n/es.js';

const MINI = 0.55;                 // Qubi is 1.25
const TINTS = [0x4da3ff, 0xff6fb5, 0x3fe0d0]; // worker 1, 2, 3: none is the green, amber or red of a verdict
const TITLE_MAX = 28;
const TEXT_MAX = 60;
const PILL_MAX = 24;               // the title in a collapsed one-line pill
const HOVER_TITLE_MAX = 60;        // pointed at, it shows its whole task
const EXPAND_AFTER_S = 0.5;        // a pill opens again only once it has been clear this long (no flicker)
const LIFT_SPEED = 12;
const SPREAD = 1.1;                // workers that share a stand stand side by side
const STAGGER_S = 0.45;            // they come out of Qubi one after the other
const POP_S = 0.55;
const SHRINK_S = 0.4;
const WALK_PER_UNIT_MS = 340;
const WALK_MIN_MS = 700;
const WALK_MAX_MS = 3200;
const DROP_POSE_S = 0.45;          // the push of a sheet into the folder
const WAVE_S = 2.6;                // approved: it waves this long, then rests facing the camera
const FLASH_S = 1.6;
const RISE_S = 0.5;
const FLY_S = 0.6;
const MAX_SHEETS = 4;
const filesFor = (sheets) => 2 ** (2 * Math.min(Math.max(sheets, 1), MAX_SHEETS)) - 1; // as buildSiteView

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
// overshoots a little past 1 and settles: a pop
const easeOutBack = (k) => 1 + 2.70158 * (k - 1) ** 3 + 1.70158 * (k - 1) ** 2;
const keyOf = (p) => `${p.x.toFixed(2)},${p.z.toFixed(2)}`;

// One line for a bubble: cut at a word, with an ellipsis. Pure.
export function clip(text, max) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:·-]+$/, '')}…`;
}

// How a worker looks right now: its pose, whether it holds a sheet, where it looks, its face, its rings and
// its bubble. The audit wins over the run's state (Qubi's verdict is the last word). Pure.
export function lookOf(worker, T = strings.team) {
  const title = `${T.worker(worker.n)} · ${clip(worker.title, TITLE_MAX)}`;
  const look = (pose, text, more = {}) => ({ pose, carry: false, face: 'folder', worried: false, flagged: false, approved: false, title, text: clip(text, TEXT_MAX), ...more });
  const audit = worker.audit?.status;
  if (audit === 'approved') return look('wave', T.audit.approved, { face: 'camera', approved: true });
  if (audit === 'flagged') return look('idle', worker.audit.notes?.[0] || T.audit.flagged, { face: 'camera', worried: true, flagged: true });
  if (audit === 'checking') return look('idle', T.audit.checking);
  switch (worker.status) {
    case 'working': return look('carry', worker.text || T.status.working, { carry: true });
    case 'waiting': return look('wait', T.status.waiting, { carry: true, face: 'camera' });
    case 'failed': return look('idle', T.status.failed, { face: 'camera', worried: true });
    case 'done': case 'cancelled': case 'queued': return look('idle', T.status[worker.status]);
    default: return look('idle', T.status.queued);
  }
}

// A worker's one-line pill: its number, its short title and a mark for how it went. Pure.
export function pillOf(worker) {
  const audit = worker.audit?.status;
  const mark = audit === 'approved' || (!audit && worker.status === 'done') ? ' ✓'
    : audit === 'flagged' || worker.status === 'failed' ? ' !'
      : worker.status === 'waiting' ? ' ?'
        : worker.status === 'cancelled' ? ' ✕' : '';
  return `${worker.n} · ${clip(worker.title, PILL_MAX)}${mark}`;
}

// Where each worker stands when its place has no spot (older states): beside its place's stand, across the way to the folder, never on it. The stand
// is where Qubi goes to audit, so he never walks into his worker; workers that share a place flank it, one
// on each side, then further out. Pure. -> Map(worker id -> { x, z })
export function standsFor(workers) {
  const groups = new Map();
  for (const w of workers) {
    const stand = w.place?.stand;
    if (!stand) continue;
    const key = keyOf(stand);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(w);
  }
  const out = new Map();
  for (const group of groups.values()) {
    group.forEach((w, i) => {
      const { stand } = w.place;
      const dx = stand.x - (w.place.x ?? stand.x), dz = stand.z - (w.place.z ?? stand.z);
      const length = Math.hypot(dx, dz);
      const across = length ? { x: -dz / length, z: dx / length } : { x: 1, z: 0 };
      const shift = (i % 2 ? -1 : 1) * (Math.floor(i / 2) + 1) * SPREAD;
      out.set(w.id, { x: stand.x + across.x * shift, z: stand.z + across.z * shift });
    });
  }
  return out;
}

// origin(): where Qubi is (the workers come out of him and go back to him), robotView's qubi()
// qubiBubble(): Qubi's bubble element while it shows, else null (robotView's bubble; origin.bubble too)
export function createTeamView({ sceneView, labels, teamViewModel, origin = () => ({ x: 1.1, z: 1.1 }), cameraViewModel = null, qubiBubble = origin.bubble ?? null }) {
  const layer = sceneView.layers.map;
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const minis = new Map();   // worker id -> mini (see spawn)
  const sites = new Map();   // siteKey -> { key, group, top, label, sheets, rise, sink, kind, x, z, folder }
  const flights = [];        // sheets flying into a folder { mesh, from, to, t, site }
  const seen = new Set();    // drop ids already flown
  let state = teamViewModel.store.state;
  let clock = 0;
  let disposed = false;
  let hovered = null;        // the mini the pointer is on
  let candidate = null;      // the mini nearest the pointer, from the last pointer.hit

  // Shared by every worker of this view (freed on dispose): the flying sheet, the green flash, the red ring
  const sheetGeometry = new THREE.BoxGeometry(0.62, 0.04, 0.8);
  const discGeometry = new THREE.CircleGeometry(1, 40);
  const ringGeometry = new THREE.RingGeometry(0.82, 1, 48);
  const glowMaterial = (color, opacity) => new THREE.MeshBasicMaterial({
    color: new THREE.Color(color).multiplyScalar(1.3), transparent: true, opacity, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
  });
  const flat = (geometry, material) => {
    const m = new THREE.Mesh(geometry, material);
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    layer.add(m);
    return m;
  };

  const walkMs = (from, to) => clamp(Math.hypot(to.x - from.x, to.z - from.z) * WALK_PER_UNIT_MS, WALK_MIN_MS, WALK_MAX_MS);
  const cameraYaw = () => ({ yaw: () => cameraViewModel?.azimuth ?? CAMERA.azimuth }); // read every frame: the workers turn with the map

  // --- Mini robots ---
  function spawn(worker, order) {
    const robot = createGuideRobot({ sceneView, labels, scale: MINI, accent: TINTS[(worker.n - 1) % TINTS.length], pop: false });
    const mini = {
      id: worker.id, n: worker.n, robot, worker,
      delay: still ? 0 : order * STAGGER_S,
      born: false, popT: 0, sent: false, arrivedOnce: false,
      stand: null, center: null, words: '', leaving: false, shrinkT: 0,
      lift: 0, full: null, pillSize: null, clearFor: 0, // its bubble on screen (stack)
      dropUntil: 0, approvedAt: null, flashT: FLASH_S,
      flash: flat(discGeometry, glowMaterial(PALETTE.ok, 0)),
      wave: flat(ringGeometry, glowMaterial(PALETTE.ok, 0)),
      flag: flat(ringGeometry, glowMaterial(PALETTE.danger, 0.85)),
    };
    minis.set(worker.id, mini);
    return mini;
  }

  // Walks back into Qubi; once there it shrinks away and is freed (frame loop)
  function leave(mini) {
    if (mini.leaving) return;
    mini.leaving = true;
    if (hovered === mini) hovered = null;
    const { robot } = mini;
    robot.compact(null);
    robot.bubble.style.translate = '';
    if (!mini.born) { free(mini); return; } // it never came out
    robot.say(null);
    robot.carry(false);
    robot.lift(0);
    robot.mood({ worried: false });
    robot.pose('idle');
    mini.flag.visible = mini.flash.visible = mini.wave.visible = false;
    const home = origin();
    robot.moveTo(home, walkMs(robot.position, home));
  }

  function free(mini) {
    mini.robot.dispose();
    for (const m of [mini.flash, mini.wave, mini.flag]) { layer.remove(m); m.material.dispose(); }
    minis.delete(mini.id);
  }

  // What a worker shows; called on every change of the view model (frame-by-frame motion is in the loop)
  function dress(mini) {
    if (mini.leaving || !mini.born) return;
    const { robot, worker } = mini;
    const look = lookOf(worker);
    // pointed at: its whole task
    const title = hovered === mini ? `${strings.team.worker(worker.n)} · ${clip(worker.title, HOVER_TITLE_MAX)}` : look.title;
    const words = `${title}\n${look.text}`;
    if (words !== mini.words) {
      mini.words = words;
      if (!robot.compacted) mini.full = null; // measured again (a pill keeps the size it last had open)
      robot.say({ title, text: look.text });
    }
    if (robot.compacted) robot.compact(pillOf(worker));
    robot.mood({ worried: look.worried });
    robot.carry(look.carry);
    if (look.approved && mini.approvedAt == null) { mini.approvedAt = clock; mini.flashT = still ? FLASH_S : 0; }
    if (!look.approved) mini.approvedAt = null;
    mini.look = look;
  }

  // --- Sites: the folders the team saves into ---
  // A folder the map does not draw has its own glass folder, which follows the folder: its ghost slot
  // shifts when another folder gets drawn. A drawn folder has a counter under its building or plaza,
  // shared by the workers whose folders are there.
  const siteKey = (worker) => (worker.place.kind === 'ghost' ? `ghost:${worker.folder}` : `at:${keyOf(worker.place)}`);

  function siteFor(worker) {
    const place = worker.place;
    if (!place) return null;
    const key = siteKey(worker);
    let s = sites.get(key);
    if (s?.sink) { clearSite(s); s = null; } // the last team's folder is still sinking: a new one rises
    if (!s) {
      s = { key, kind: place.kind, x: place.x, z: place.z, folder: worker.folder, sheets: 0, group: null, top: place.kind === 'plaza' ? 1 : 3, rise: 1, sink: 0, label: null };
      sites.set(key, s);
      drawSite(s, true);
    } else if (s.x !== place.x || s.z !== place.z) {
      // the same ghost folder in another slot: it moves there with its sheets
      s.x = place.x;
      s.z = place.z;
      s.group?.position.set(s.x, 0, s.z);
      const anchor = anchorOf(s);
      s.label?.setAnchor(anchor.x, anchor.y, anchor.z);
    }
    return s;
  }

  // The map moved the team's folders: a site nobody's folder is at any more goes (its folder is drawn now,
  // so the building shows it), a ghost moves with its folder, and each worker that already reached its
  // folder gets its site at the new place
  function rearrangeSites() {
    const keys = new Set(state.workers.filter((w) => w.place).map(siteKey));
    for (const s of [...sites.values()]) if (!s.sink && !keys.has(s.key)) clearSite(s);
    for (const w of state.workers) {
      if (w.place && (sites.has(siteKey(w)) || minis.get(w.id)?.arrivedOnce)) siteFor(w);
    }
  }

  const anchorOf = (s) => (s.kind === 'plaza' ? { x: s.x, y: 0.6, z: s.z + 3.4 }
    : s.kind === 'building' ? { x: s.x, y: 0.2, z: s.z + 2.6 }
      : { x: s.x, y: s.top + 1.1, z: s.z });

  // A folder the map does not draw is a glass folder rising from the ground, with a sheet per file; one the
  // map draws keeps its building and gets only a small counter under it
  function drawSite(s, isNew = false) {
    if (s.kind === 'ghost') {
      if (s.group) dropGroup(s.group);
      const built = buildGlassFolder({ size: FOLDER.size, files: filesFor(s.sheets + 1), level: 'green' });
      built.group.position.set(s.x, 0, s.z);
      layer.add(built.group);
      s.group = built.group;
      s.top = built.top;
      if (isNew && !still) { built.group.scale.y = 0.001; s.rise = 0; } else s.rise = 1;
      if (!isNew && !still) built.group.scale.setScalar(1.06); // a little bump when a sheet goes in
    }
    const anchor = anchorOf(s);
    s.label ??= labels.add({ className: `build-site${s.kind === 'ghost' ? '' : ' counter'}`, anchor });
    s.label.setAnchor(anchor.x, anchor.y, anchor.z);
  }

  // The site's label: the folder (when the map does not show it) and the files its workers made
  function labelSite(s) {
    if (!s.label) return;
    const here = state.workers.filter((w) => w.place && siteKey(w) === s.key);
    const created = here.reduce((n, w) => n + (w.created?.length ?? 0), 0);
    const changed = here.reduce((n, w) => n + (w.changed?.length ?? 0), 0);
    const count = escapeHtml(strings.team.files(created, changed));
    s.label.el.innerHTML = s.kind === 'ghost' ? `<strong>${escapeHtml(`${s.folder}/`)}</strong><span>${count}</span>` : `<span>${count}</span>`;
    s.label.el.classList.toggle('current', here.some((w) => w.status === 'working' || w.status === 'waiting'));
  }

  // The glass folder's geometries and most materials are cached by its builder; only its status rim is its own
  function dropGroup(group) {
    layer.remove(group);
    group.traverse((o) => { if (o.isMesh && o.material.isMeshBasicMaterial) o.material.dispose(); });
  }

  function clearSite(s) {
    if (s.group) dropGroup(s.group);
    s.label?.remove();
    sites.delete(s.key);
  }

  // --- Sheets: from a worker's hands into its folder ---
  function fly(drop) {
    const worker = state.workers.find((w) => w.id === drop.worker);
    const mini = minis.get(drop.worker);
    const site = worker ? siteFor(worker) : null;
    const hands = mini?.born && !mini.leaving ? mini.robot.hands : { x: drop.x, y: 1.4, z: drop.z };
    const mesh = new THREE.Mesh(sheetGeometry, M.white);
    mesh.castShadow = true;
    mesh.scale.setScalar(0.7);
    mesh.position.set(hands.x, hands.y, hands.z);
    layer.add(mesh);
    const to = { x: site?.x ?? drop.x, y: (site?.top ?? 2) - 0.6, z: site?.z ?? drop.z };
    flights.push({ mesh, from: hands, to, t: still ? FLY_S : 0, site });
    if (mini && !still) mini.dropUntil = clock + DROP_POSE_S;
  }

  // --- The view model ---
  const unsubscribe = teamViewModel.store.subscribe((next) => {
    state = next;
    const ids = new Set(state.workers.map((w) => w.id));
    if (state.phase === 'idle') {
      minis.forEach(leave);
      for (const s of [...sites.values()]) s.sink = still ? 1 : Math.max(s.sink, 0.0001);
      // the next team starts clean: drops of this one are never flown again
      state.drops.forEach((d) => seen.add(d.id));
      return;
    }
    for (const mini of minis.values()) if (!ids.has(mini.id)) leave(mini); // cancelled and started again
    const stands = standsFor(state.workers);
    let order = 0;
    for (const worker of state.workers) {
      let mini = minis.get(worker.id);
      if (mini?.leaving) continue;
      mini ??= spawn(worker, order++);
      mini.worker = worker;
      const stand = worker.place?.spot ?? stands.get(worker.id) ?? null;
      // the map rearranged (a new folder appeared): it walks to its folder's new place
      if (stand && mini.sent && mini.stand && keyOf(stand) !== keyOf(mini.stand)) mini.robot.moveTo(stand, walkMs(mini.robot.position, stand));
      mini.stand = stand;
      mini.center = worker.place ? { x: worker.place.x, z: worker.place.z } : null;
      dress(mini);
    }
    rearrangeSites();
    for (const drop of state.drops) {
      if (seen.has(drop.id)) continue;
      seen.add(drop.id);
      fly(drop);
    }
    sites.forEach(labelSite);
  }, { immediate: true });

  // --- Every frame ---
  sceneView.onFrame((time, dt) => {
    if (disposed) return;
    clock += dt;
    const a = still ? 0 : 1;
    for (const mini of [...minis.values()]) {
      const { robot } = mini;
      if (!mini.born) {
        mini.delay -= dt;
        if (mini.delay > 0) continue;
        // out of Qubi, with a pop
        mini.born = true;
        robot.place(origin());
        robot.face(cameraYaw());
        robot.grow(still ? 1 : 0);
        robot.show(true);
        mini.popT = still ? POP_S : 0;
        dress(mini);
      }
      if (mini.popT < POP_S) {
        mini.popT = Math.min(POP_S, mini.popT + dt);
        robot.grow(easeOutBack(mini.popT / POP_S));
      } else if (!mini.sent && !mini.leaving) {
        mini.sent = true;
        if (mini.stand) robot.moveTo(mini.stand, walkMs(robot.position, mini.stand));
      }
      if (mini.leaving) {
        if (robot.moving) { robot.update(dt); continue; }
        mini.shrinkT += still ? SHRINK_S : dt;
        const k = Math.min(mini.shrinkT / SHRINK_S, 1);
        robot.grow(1 - k * k);
        robot.update(dt);
        if (k >= 1) free(mini);
        continue;
      }
      const look = mini.look;
      const arrived = mini.sent && !robot.moving;
      if (arrived && !mini.arrivedOnce) {
        mini.arrivedOnce = true;
        const site = siteFor(mini.worker); // its folder rises as it gets there
        if (site) labelSite(site);
      }
      if (look) {
        const waving = look.approved && mini.approvedAt != null && clock - mini.approvedAt < WAVE_S;
        const pose = clock < mini.dropUntil ? 'drop' : look.approved ? (waving ? 'wave' : 'idle') : look.pose;
        robot.pose(pose);
        if (arrived) robot.face(look.face === 'camera' ? cameraYaw() : mini.center ?? cameraYaw());
        // working: a little bob, as someone busy
        robot.lift(arrived && look.pose === 'carry' ? (0.05 + Math.sin(clock * 5 + mini.n * 1.7) * 0.05) * a : 0);
      }
      robot.update(dt);
      // under it: the green flash of an approval (a disc and a ring that spreads), the red ring of a flag
      const p = robot.position;
      mini.flashT = Math.min(FLASH_S, mini.flashT + dt);
      const f = mini.flashT / FLASH_S;
      mini.flash.visible = mini.wave.visible = f < 1;
      if (f < 1) {
        mini.flash.position.set(p.x, 0.32, p.z);
        mini.flash.scale.setScalar(0.8 + f * 0.4);
        mini.flash.material.opacity = 0.55 * Math.sin(Math.PI * Math.min(f * 2, 1)) * (1 - f);
        mini.wave.position.set(p.x, 0.33, p.z);
        mini.wave.scale.setScalar(0.7 + f * 1.6);
        mini.wave.material.opacity = 0.8 * (1 - f);
      }
      mini.flag.visible = Boolean(look?.flagged);
      if (mini.flag.visible) {
        mini.flag.position.set(p.x, 0.32, p.z);
        mini.flag.scale.setScalar(0.85 + Math.sin(time * 3) * 0.05 * a);
        mini.flag.material.opacity = 0.7 + Math.sin(time * 3) * 0.15 * a;
      }
    }
    stack(dt);
    // folders rising, settling after a bump, and sinking when the team goes home
    for (const s of [...sites.values()]) {
      if (s.sink > 0) {
        s.sink = Math.min(1, s.sink + dt / RISE_S);
        if (s.group) s.group.scale.y = Math.max(0.001, 1 - s.sink * s.sink);
        if (s.label) s.label.el.style.opacity = String(1 - s.sink);
        if (s.sink >= 1 || still) clearSite(s);
        continue;
      }
      if (!s.group) continue;
      if (s.rise < 1) { s.rise = Math.min(1, s.rise + dt / RISE_S); s.group.scale.y = 1 - (1 - s.rise) ** 3; }
      else if (s.group.scale.x !== 1) s.group.scale.setScalar(Math.max(1, s.group.scale.x - dt * 0.4));
    }
    // sheets in flight (buildSiteView's arc): up and over, turning upright to slide in
    for (let i = flights.length - 1; i >= 0; i--) {
      const fl = flights[i];
      fl.t = Math.min(FLY_S, fl.t + dt);
      const k = fl.t / FLY_S;
      const e = 1 - (1 - k) ** 2;
      fl.mesh.position.set(fl.from.x + (fl.to.x - fl.from.x) * e, fl.from.y + (fl.to.y - fl.from.y) * e + Math.sin(Math.PI * k) * 1.4, fl.from.z + (fl.to.z - fl.from.z) * e);
      fl.mesh.rotation.x = -0.35 + k * 1.9;
      if (k >= 1) {
        layer.remove(fl.mesh);
        flights.splice(i, 1);
        // the folder gains its sheet as it lands (a gone site, or one sinking, is left alone)
        if (fl.site && sites.get(fl.site.key) === fl.site && !fl.site.sink) { fl.site.sheets += 1; drawSite(fl.site); labelSite(fl.site); }
      }
    }
  });

  // --- Bubbles on screen: pills when they touch, the one that collides goes up (stackBubbles) ---
  // Measured from the page (last frame's spots: the labels move after every view); the lift this view gave
  // a bubble is taken out, so it is measured where it would be.
  function stack(dt) {
    if (!sceneView.canvas) return;
    const shown = [...minis.values()].filter((m) => m.born && !m.leaving && !m.robot.bubble.hidden);
    if (!shown.length) return;
    const boxes = [];
    for (const m of shown) {
      const r = m.robot.bubble.getBoundingClientRect();
      if (!r.width) continue;
      if (m.robot.compacted) m.pillSize = { w: r.width, h: r.height }; else m.full = { w: r.width, h: r.height };
      const full = m.full ?? { w: r.width, h: r.height };
      boxes.push({ id: m.id, x: r.left + r.width / 2, y: r.bottom + m.lift, w: full.w, h: full.h, pill: m.pillSize ?? { w: Math.min(full.w, 180), h: 28 }, keep: m === hovered });
    }
    const lead = typeof qubiBubble === 'function' ? qubiBubble() : null;
    if (lead) {
      const r = lead.getBoundingClientRect();
      if (r.width) boxes.push({ id: '@qubi', lead: true, x: r.left + r.width / 2, y: r.bottom, w: r.width, h: r.height });
    }
    const out = stackBubbles(boxes);
    for (const m of shown) {
      const o = out.get(m.id);
      if (!o) continue;
      // it shrinks at once; it opens again only after a moment clear, so it does not flicker
      m.clearFor = o.collapse ? 0 : m.clearFor + dt;
      const pill = o.collapse || (m.robot.compacted && m.clearFor < EXPAND_AFTER_S && m !== hovered);
      m.robot.compact(pill ? pillOf(m.worker) : null);
      m.lift = still ? o.lift : m.lift + (o.lift - m.lift) * Math.min(dt * LIFT_SPEED, 1);
      m.robot.bubble.style.translate = m.lift > 0.5 ? `0 ${-Math.round(m.lift)}px` : '';
      m.robot.bubble.style.zIndex = m === hovered ? '4' : '1';
    }
  }

  // The input controller's pointer for the mini robots: it finds the nearest one under the pointer (generous
  // reach on screen) and, while on it, that one shows its whole task. No drag: only Qubi is grabbed.
  const pointer = {
    hit(x, y) {
      let best = null;
      let near = Infinity;
      for (const m of minis.values()) {
        if (!m.born || m.leaving) continue;
        const d = m.robot.screenDistance(x, y);
        if (d < near) { near = d; best = m; }
      }
      candidate = best;
      if (hovered && best && best !== hovered) pointer.hover(true); // from one mini straight to another
      return Boolean(best);
    },
    hover(on) {
      const next = on ? candidate : null;
      if (next === hovered) return;
      const before = hovered;
      hovered = next;
      for (const m of [before, next]) if (m && !m.leaving) dress(m);
    },
  };

  return {
    pointer,
    // Frees everything this view made (the workers, their folders and the sheets in the air)
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      [...minis.values()].forEach(free);
      [...sites.values()].forEach(clearSite);
      flights.splice(0).forEach((fl) => layer.remove(fl.mesh));
      [sheetGeometry, discGeometry, ringGeometry].forEach((g) => g.dispose());
    },
  };
}
