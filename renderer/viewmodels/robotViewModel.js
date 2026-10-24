// The robot companion on the map (views/scene/robotView.js draws it). While a project is open it waits
// on the plaza; the person grabs it, drags or throws it, and it flies to where it would land: beside a
// folder on the map, or the project's plaza. There it asks what to do (EVENTS.robotLanded -> the chat
// offers "explain" and "change something"). The welcome of a new project and the tour drive the same
// robot, so it is hidden from here meanwhile. Positions are world units on the ground.
import { Observable } from '../core/observable.js';
import { EVENTS } from '../core/eventBus.js';
import { clamp } from '../core/format.js';
import { strings } from '../i18n/es.js';
import { FOLDER } from './layout.js';
import { standBy } from './tourPlaces.js';

export const HOME = { x: 1.1, z: 1.1 }; // the plaza's front corner, where the welcome robot stands too
const THROW_S = 0.3;      // how far a throw carries: velocity (units/s) x this
const THROW_MIN = 8;      // slower than this (units/s) is a drop, not a throw
const MAX_THROW = 18;
const MAX_REACH = 30;     // never lands farther than this from the plaza
const FOLDER_REACH = FOLDER.platform / 2 + 2.2; // forgiving: near a folder counts as on it
const R = strings.robot;

export class RobotViewModel {
  #project;
  #map;
  #tour;
  #build;
  #bus;
  #timer = null;

  // mode: 'idle' | 'held' | 'flying' | 'here' (landed on a place, asking)
  // flight: { from, to, ms } while flying; place: { path, kind, name, center } where it landed (center:
  // the folder it points at, null on the plaza)
  // over: the place it would land on if let go now (while held), for the bubble
  // overAt: that place's position (the view draws a ring there)
  store = new Observable({ visible: false, mode: 'idle', at: { ...HOME }, flight: null, place: null, bubble: null, over: null, overAt: null });

  constructor({ projectModel, mapViewModel, tourViewModel = null, buildViewModel = null, bus }) {
    this.#build = buildViewModel;
    this.#project = projectModel;
    this.#map = mapViewModel;
    this.#tour = tourViewModel;
    this.#bus = bus;
    let session = projectModel.store.state.session;
    const refresh = () => {
      const { session: now } = this.#project.store.state;
      if (now !== session) { session = now; this.#home(); }
      const visible = this.#canShow();
      // taken for another job (building, the tour) in the middle of a drag or a throw: it is let go
      if (!visible && ['held', 'flying'].includes(this.store.state.mode)) {
        clearTimeout(this.#timer);
        this.store.set({ mode: 'idle', flight: null, over: null, bubble: null });
      }
      this.store.set({ visible });
    };
    projectModel.store.subscribe(refresh);
    mapViewModel.store.subscribe(refresh);
    tourViewModel?.store.subscribe(refresh);
    buildViewModel?.store.subscribe(refresh);
    refresh();
  }

  #canShow() {
    const map = this.#map.store.state;
    return Boolean(this.#project.store.state.open && map.status === 'ready' && !map.welcome && (this.#tour?.store.state.status ?? 'idle') === 'idle' && !this.#build?.store.state.active);
  }

  grab() {
    const { visible, mode } = this.store.state;
    if (!visible || mode === 'flying') return false;
    clearTimeout(this.#timer);
    this.store.set({ mode: 'held', place: null, bubble: null, flight: null });
    return true;
  }

  drag({ x, z }) {
    if (this.store.state.mode !== 'held') return;
    const target = this.#placeAt({ x, z });
    const over = target?.event ?? null;
    const name = over && (over.kind === 'folder' ? `${over.name}/` : over.name);
    this.store.set({ at: { x, z }, over: name, overAt: target ? target.center ?? { x: 0, z: 0 } : null });
  }

  // Let go at (x, z) moving at (vx, vz) units per second
  release({ x, z, vx = 0, vz = 0 }) {
    if (this.store.state.mode !== 'held') return;
    const thrown = Math.hypot(vx, vz) >= THROW_MIN;
    let dx = thrown ? vx * THROW_S : 0;
    let dz = thrown ? vz * THROW_S : 0;
    const throwLength = Math.hypot(dx, dz);
    if (throwLength > MAX_THROW) { dx *= MAX_THROW / throwLength; dz *= MAX_THROW / throwLength; }
    let land = { x: x + dx, z: z + dz };
    const reach = Math.hypot(land.x, land.z);
    if (reach > MAX_REACH) land = { x: (land.x / reach) * MAX_REACH, z: (land.z / reach) * MAX_REACH };

    // where a throw carries it; a folder right under the hand still counts if the throw lands nowhere
    const target = this.#placeAt(land) ?? this.#placeAt({ x, z });
    const to = target?.stand ?? land;
    const from = { x, z };
    const ms = Math.round(clamp(Math.hypot(to.x - from.x, to.z - from.z) * 60, 450, 1100));
    this.store.set({ mode: 'flying', flight: { from, to, ms }, at: to, over: null, overAt: null });
    this.#timer = setTimeout(() => this.#land(target), ms);
  }

  // Where the robot would land: a folder on the map (closest within reach), else the plaza, else nothing
  #placeAt(point) {
    const { buildings = [], branches = [], plaza } = this.#map.store.state;
    // every folder the map draws: the top-level ones and those of the open path
    const near = [...buildings, ...branches.flatMap((b) => b.folders ?? [])]
      .map((b) => ({ b, d: Math.hypot(b.x - point.x, b.z - point.z) }))
      .filter(({ d }) => d <= FOLDER_REACH)
      .sort((a, b) => a.d - b.d)[0]?.b;
    if (near) {
      return {
        stand: standBy(near.x, near.z, FOLDER.platform / 2 + 1),
        center: { x: near.x, z: near.z },
        event: { path: near.path, kind: 'folder', name: near.name ?? near.path.split('/').pop(), files: near.files, red: near.red ?? 0, yellow: near.yellow ?? 0 },
      };
    }
    const half = (plaza?.size ?? 5) / 2 + 0.5;
    if (Math.abs(point.x) <= half && Math.abs(point.z) <= half) {
      const counts = plaza?.counts ?? {};
      return { stand: { ...HOME }, center: null, event: { path: '', kind: 'project', name: plaza?.name ?? '', red: counts.red ?? 0, yellow: counts.yellow ?? 0 } };
    }
    return null;
  }

  #land(target) {
    if (!this.store.state.visible) return;
    if (!target) {
      this.store.set({ mode: 'idle', flight: null, place: null, bubble: { title: '', text: R.nowhere } });
      return;
    }
    const { event } = target;
    const name = event.kind === 'folder' ? `${event.name}/` : event.name;
    this.store.set({ mode: 'here', flight: null, place: { path: event.path, kind: event.kind, name, center: target.center, event }, bubble: { title: R.at(name), text: R.ask } });
    this.#bus.emit(EVENTS.robotLanded, event);
  }

  // The person answered (or moved on): the bubble goes, the robot stays where it is
  quiet() {
    if (this.store.state.mode === 'here') this.store.set({ bubble: null });
  }

  #home() {
    clearTimeout(this.#timer);
    this.store.set({ mode: 'idle', at: { ...HOME }, flight: null, place: null, bubble: null });
  }
}
