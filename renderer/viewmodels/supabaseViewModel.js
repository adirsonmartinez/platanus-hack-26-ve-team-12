// Supabase node on the map: whether it is shown, its status and the schema view.
// demo (the web version only): example tables, a latency that moves and the RLS vulnerability a few seconds
// after opening. On the desktop nothing is invented: the status is the one main detected (status), there
// are no tables (Qubbot does not read the project's database) and no latency.
import { Observable } from '../core/observable.js';
import { EVENTS } from '../core/eventBus.js';
import { integrationToWorld, SCHEMA_CENTER } from './layout.js';

const VULNERABILITY_DELAY_MS = 5000; // demo project only: the vulnerability shows up a few seconds after opening
const LATENCY_INTERVAL_MS = 1200;
const SCHEMA_ZOOM = 1.1;

export class SupabaseViewModel {
  #model;
  #camera;
  #bus;
  #vulnerabilityTimer = null;
  #returnView = null;
  #session = 0;
  #inProject = false; // the open project uses Supabase
  #onScreen = true;   // the map is showing the root level (the node lives there)

  // status: 'connected' | 'disconnected' | 'unknown' (projectModel.integrationStatus.supabase)
  store = new Observable({ visible: false, vulnerable: false, latencyMs: null, schemaOpen: false, tables: [], status: 'unknown', demo: true });
  #demo;

  constructor({ supabaseModel, projectModel, camera, bus, demo = true }) {
    this.#demo = demo;
    this.store.set({ demo, latencyMs: demo ? 12 : null });
    this.#model = supabaseModel;
    this.#camera = camera;
    this.#bus = bus;

    projectModel.store.subscribe((project) => this.#onProject(project), { immediate: true });
    supabaseModel.store.subscribe((state, previous) => {
      if (!this.#demo) return;
      this.store.set({ vulnerable: state.vulnerable, tables: this.#tables() });
      if (state.vulnerable && !previous.vulnerable) this.#bus.emit(EVENTS.supabaseVulnerable);
    });
    this.store.set({ tables: this.#tables() });

    if (demo) {
      setInterval(() => {
        if (!this.store.state.vulnerable) this.store.set({ latencyMs: 8 + Math.round(Math.random() * 14) });
      }, LATENCY_INTERVAL_MS);
    }
  }

  openSchema(on) {
    if (on === this.store.state.schemaOpen) return;
    if (on && !this.store.state.tables.length) return; // nothing to show: Qubbot has not read any table
    if (on) {
      this.#returnView = this.#camera.saveView();
      this.#camera.flyTo(integrationToWorld(SCHEMA_CENTER), SCHEMA_ZOOM);
    } else {
      this.#camera.flyTo(this.#returnView?.target ?? { x: 0, z: 0 }, 1);
      this.#returnView = null;
    }
    this.store.set({ schemaOpen: on });
  }

  selectTable(name) {
    const table = this.#model.tables.find((t) => t.name === name);
    if (!table) return;
    this.#bus.emit(EVENTS.tableSelected, { name, columns: table.columns, rlsEnabled: !this.#model.isExposed(table) });
  }

  #tables() {
    if (!this.#demo) return [];
    return this.#model.tables.map((t) => ({ ...t, exposed: this.#model.isExposed(t) }));
  }

  // The map tells whether the root level is on screen
  setOnScreen(on) {
    this.#onScreen = on;
    this.#updateVisibility();
  }

  #updateVisibility() {
    const visible = this.#inProject && this.#onScreen;
    if (!visible && this.store.state.schemaOpen) this.openSchema(false);
    if (visible !== this.store.state.visible) this.store.set({ visible });
  }

  #onProject({ open, usesSupabase, session, integrationStatus, demo = false }) {
    const status = integrationStatus?.supabase ?? 'unknown';
    if (status !== this.store.state.status) this.store.set({ status });
    if (session !== this.#session) {
      // New project: start clean and arm the demo vulnerability again
      this.#session = session;
      clearTimeout(this.#vulnerabilityTimer);
      this.#vulnerabilityTimer = null;
      this.#model.setVulnerable(false);
    }
    this.#inProject = open && usesSupabase;
    this.#updateVisibility();
    // Only the web demo's project gets the made-up alarm: a real project never does
    if (this.#demo && demo && this.#inProject && !this.#vulnerabilityTimer) {
      this.#vulnerabilityTimer = setTimeout(() => this.#model.setVulnerable(true), VULNERABILITY_DELAY_MS);
    }
  }
}
