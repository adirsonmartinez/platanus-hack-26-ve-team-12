// The tour ("Recorrido") of the open project, for someone who does not know it yet:
//   1. the analyzer reads the tree and a few files (models/projectAnalyzer.js) and decides the stops;
//   2. the scripted text plays at once (models/tourSpec.js); a connected agent narrates meanwhile, in
//      its own read-only session ('tour'), and its valid text replaces the script on the stops ahead;
//   3. each stop flies the camera there and walks the guide robot (views/scene/robotView.js), with a
//      temporary "ghost" place for folders the security radar does not draw (views/scene/tourView.js).
// The chat shows one card that follows the tour (EVENTS.tourStarted / tourStep / tourEnded).
import { Observable } from '../core/observable.js';
import { EVENTS } from '../core/eventBus.js';
import { clamp } from '../core/format.js';
import { analyzeProject, pickFilesToRead, planSteps } from '../models/projectAnalyzer.js';
import { factsForAgent, mergeTour, parseTour, scriptedTour } from '../models/tourSpec.js';
import { placesFor } from './tourPlaces.js';

const TIMING = { agentTimeoutMs: 120000, walkPerUnitMs: 90, walkMinMs: 600, walkMaxMs: 1800 };
// The tour only reads: an agent that tries to change anything is stopped
const WRITES = new Set(['write_file', 'set_file_score']);

export class TourViewModel {
  #project;
  #workspace;
  #connection;
  #mode;
  #camera;
  #map;
  #repair;
  #bus;
  #timing;
  #run = 0;          // each start/exit: late answers of an older tour are ignored
  #abort = null;
  #savedView = null;
  #facts = null;
  #slots = [];

  // status: 'idle' | 'analyzing' | 'playing'
  // tour: models/tourSpec.js Tour; index: the stop on screen; writing: the agent is still narrating
  // current: the stop's place (tourPlaces.js); guide: what the robot does { from, to, walkMs, stepId, title, text }
  // ghosts: [{ path, x, z, current }] places drawn only during the tour
  store = new Observable({ status: 'idle', tour: null, index: 0, writing: false, current: null, guide: null, ghosts: [] });
  // Resolves when the agent's narration is done (or there is none); tests and the recorder wait on it
  settled = Promise.resolve();

  constructor({ projectModel, workspace, connection = null, modeModel, camera, mapViewModel, repairViewModel = null, bus, timing = {} }) {
    this.#project = projectModel;
    this.#workspace = workspace;
    this.#connection = connection;
    this.#mode = modeModel;
    this.#camera = camera;
    this.#map = mapViewModel;
    this.#repair = repairViewModel;
    this.#bus = bus;
    this.#timing = { ...TIMING, ...timing };

    let session = projectModel.store.state.session;
    projectModel.store.subscribe((state) => {
      if (state.session !== session) { session = state.session; this.exit({ restore: false }); }
    });
  }

  get active() {
    return this.store.state.status !== 'idle';
  }

  async start() {
    const { open, tree, session } = this.#project.store.state;
    if (!open) return { ok: false, reason: 'closed' };
    if (this.#repair?.busy) return { ok: false, reason: 'busy' };
    if (this.active) this.exit({ restore: false });
    const run = ++this.#run;
    this.#savedView = this.#camera.saveView();
    this.#map.goUp?.();
    this.store.set({ status: 'analyzing', tour: null, index: 0, writing: false, current: null, guide: null, ghosts: [] });
    this.#bus.emit(EVENTS.tourStarted, {});

    const contents = new Map();
    await Promise.all(pickFilesToRead(tree).map(async (path) => {
      const r = await this.#workspace.read(path).catch(() => null);
      if (r?.ok && typeof r.data === 'string') contents.set(path, r.data);
    }));
    if (run !== this.#run || this.#project.store.state.session !== session) return { ok: false, reason: 'cancelled' };

    const facts = analyzeProject(tree, contents);
    const slots = planSteps(facts);
    this.#facts = facts;
    this.#slots = slots;
    const tour = scriptedTour(facts, slots, this.#modeName());
    const narrate = Boolean(this.#connection?.live && this.#connection.ask && !facts.empty);
    this.store.set({ status: 'playing', tour, writing: narrate });
    this.goTo(0);
    this.settled = narrate ? this.#narrate(run, tour) : Promise.resolve();
    return { ok: true };
  }

  next() { this.goTo(this.store.state.index + 1); }

  prev() { this.goTo(this.store.state.index - 1); }

  goTo(index) {
    const { tour, status, guide } = this.store.state;
    if (status !== 'playing' || !tour || index < 0 || index >= tour.steps.length) return;
    const step = tour.steps[index];
    const places = placesFor(tour.steps, this.#map.store.state);
    const place = places.get(step.id);
    const from = guide?.to ?? { x: 1.1, z: 1.1 };
    const distance = Math.hypot(place.stand.x - from.x, place.stand.z - from.z);
    const t = this.#timing;
    const walkMs = Math.round(clamp(distance * t.walkPerUnitMs, t.walkMinMs, t.walkMaxMs));
    const ghosts = [...new Set(places.values())].filter((p) => p.kind === 'ghost').map((p) => ({ path: p.path, x: p.x, z: p.z, current: p === place }));
    this.store.set({
      index, current: place, ghosts,
      guide: { from, to: place.stand, center: { x: place.x, z: place.z }, walkMs, stepId: step.id, title: step.title, text: step.bubble },
    });
    this.#camera.flyTo({ x: place.x, z: place.z }, place.zoom);
    this.#emitStep();
  }

  exit({ restore = true } = {}) {
    if (!this.active) return;
    this.#run++;
    this.#abort?.abort();
    this.#abort = null;
    if (restore && this.#savedView) this.#camera.restoreView(this.#savedView);
    this.#savedView = null;
    this.store.set({ status: 'idle', tour: null, index: 0, writing: false, current: null, guide: null, ghosts: [] });
    this.#bus.emit(EVENTS.tourEnded, {});
  }

  #modeName() {
    return this.#mode?.tech ? 'dev' : 'vibe';
  }

  #emitStep() {
    const { tour, index, writing } = this.store.state;
    this.#bus.emit(EVENTS.tourStep, {
      index, total: tour.steps.length, step: tour.steps[index], writing,
      source: tour.source, agent: tour.agent ?? '', architecture: tour.architecture.kind,
    });
  }

  // The agent writes the text of the stops (agent/voice.json -> tour); its answer is checked against the
  // facts. The script keeps playing meanwhile; a bad, late or writing agent leaves the script.
  async #narrate(run, scripted) {
    const abort = new AbortController();
    this.#abort = abort;
    let wrote = false;
    let timer;
    const timeout = new Promise((resolve) => { timer = setTimeout(() => { abort.abort(); resolve({ text: '', error: 'timeout' }); }, this.#timing.agentTimeoutMs); });
    const asking = this.#connection.ask(JSON.stringify(factsForAgent(this.#facts, this.#slots)), '', {
      session: 'tour',
      voice: { mode: this.#modeName(), purpose: 'tour' },
      signal: abort.signal,
      onEvent: (e) => {
        if (e.type === 'tool' && WRITES.has(String(e.name).replace(/^.*platanus_/, ''))) { wrote = true; abort.abort(); }
      },
    });
    const answer = await Promise.race([asking, timeout]);
    clearTimeout(timer);
    if (run !== this.#run) return;
    this.#abort = null;
    const agentTour = wrote || answer?.error ? null : parseTour(answer?.text, this.#facts, this.#slots);
    const { tour: current, index } = this.store.state;
    const tour = agentTour ? mergeTour(scripted, agentTour, { agent: String(this.#connection.agentLabel ?? '').split(' (')[0] }) : current;
    // stay on the same stop (the agent may have skipped some)
    const id = current.steps[index]?.id;
    const at = tour.steps.findIndex((s) => s.id === id);
    this.store.set({ tour, writing: false });
    if (at < 0) return this.goTo(Math.min(index, tour.steps.length - 1));
    // same stop: only its words change (the robot does not walk again)
    const step = tour.steps[at];
    this.store.set({ index: at, guide: { ...this.store.state.guide, title: step.title, text: step.bubble } });
    this.#emitStep();
  }
}
