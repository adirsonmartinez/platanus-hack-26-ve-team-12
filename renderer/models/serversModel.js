// Servers listening on this computer and their traffic light (spec/001-running-servers.md).
// Rule: reachable from the network = yellow; only this computer = green (calm, no glow).
// Also the servers stopped from Qubbot in this session, which it can reactivate (they then run inside it).
import { Observable } from '../core/observable.js';

const MAX_SERVERS = 200;
const STOPPED_ID = /^[a-f0-9]{16}$/;
const STOPPED_STATES = new Set(['stopped', 'starting', 'exited']);

const isPort = (p) => typeof p === 'number' && Number.isInteger(p) && p >= 1 && p <= 65535;

// Keeps only rows that look like a server; anything unknown about exposure counts as exposed
function normalize(row) {
  if (!row || !isPort(row.port)) return null;
  const exposed = row.exposed !== false;
  return {
    port: row.port,
    process: typeof row.process === 'string' && row.process ? row.process : null,
    address: typeof row.address === 'string' ? row.address : '',
    exposed,
    paused: row.paused === true,
    managed: row.managed === true, // started by Qubbot: it stops when the app closes
    level: exposed ? 'yellow' : 'green',
  };
}

function normalizeStopped(row) {
  if (!row || typeof row.id !== 'string' || !STOPPED_ID.test(row.id) || !isPort(row.port)) return null;
  return {
    id: row.id,
    port: row.port,
    process: typeof row.process === 'string' && row.process ? row.process : null,
    canRestart: row.canRestart === true,
    state: STOPPED_STATES.has(row.state) ? row.state : 'stopped', // 'starting': reactivated, not listening yet
    exitCode: Number.isInteger(row.exitCode) ? row.exitCode : null, // 'exited': closed on its own
    hasOutput: row.hasOutput === true,
    at: typeof row.at === 'number' ? row.at : 0,
  };
}

const byRisk = (a, b) => Number(b.exposed) - Number(a.exposed) || a.port - b.port;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export class ServersModel {
  #service;
  #inFlight = null;

  store = new Observable({
    status: 'idle', // 'idle' | 'loading' | 'ready' | 'error'
    servers: [], // [{ port, process, address, exposed, paused, level }]
    stopped: [], // [{ id, port, process, canRestart, state, exitCode, hasOutput, at }] newest first
    error: null, // Spanish message from the main process, or null (the view shows a generic one)
    demo: false, // web demo: example servers
  });

  constructor(service) {
    this.#service = service;
    this.store.set({ demo: !service.isDesktop });
  }

  // One request at a time: a slow system is not asked again until it answers
  refresh() {
    this.#inFlight ??= this.#load().finally(() => { this.#inFlight = null; });
    return this.#inFlight;
  }

  // browser: 'default' | 'other' | an installed browser id
  open(port, browser = 'default') {
    return this.#service.open(port, browser);
  }

  // The main process asks the person before stopping; both lists are read again afterwards
  stop(port) {
    return this.#then(this.#service.stop(port));
  }

  pause(port) {
    return this.#then(this.#service.pause(port));
  }

  resume(port) {
    return this.#then(this.#service.resume(port));
  }

  // Reactivates a stopped server inside Qubbot (the main process asks first)
  restart(id) {
    return this.#then(this.#service.restart(id));
  }

  cancelStart(id) {
    return this.#then(this.#service.cancelStart(id));
  }

  // Last lines printed by a server Qubbot started: key = its port (running) or its row id (Detenidos)
  async output(key) {
    const response = await Promise.resolve(this.#service.output(key)).catch(() => null);
    return response?.ok && typeof response.data === 'string' ? response.data : '';
  }

  forget(id) {
    return this.#then(this.#service.forget(id));
  }

  // Installed browsers: [{ id, name }] (no paths)
  async browsers() {
    const response = await this.#service.browsers().catch(() => null);
    return response?.ok && Array.isArray(response.data)
      ? response.data.filter((b) => typeof b?.id === 'string' && typeof b?.name === 'string')
      : [];
  }

  async #then(request) {
    const response = await Promise.resolve(request).catch(() => ({ ok: false, error: null }));
    if (response?.ok) await this.refresh();
    return response;
  }

  async #load() {
    if (this.store.state.status === 'idle') this.store.set({ status: 'loading' });
    const [response, stoppedResponse] = await Promise.all([
      this.#service.list().catch(() => ({ ok: false, error: null })),
      this.#service.stopped().catch(() => null),
    ]);
    const stopped = stoppedResponse?.ok && Array.isArray(stoppedResponse.data)
      ? stoppedResponse.data.map(normalizeStopped).filter(Boolean)
      : this.store.state.stopped;
    if (!response?.ok) {
      const error = typeof response?.error === 'string' ? response.error : null;
      const { status, error: previousError, stopped: previousStopped } = this.store.state;
      if (status !== 'error' || previousError !== error || !same(previousStopped, stopped)) this.store.set({ status: 'error', error, servers: [], stopped });
      return;
    }
    const rows = Array.isArray(response.data) ? response.data.slice(0, MAX_SERVERS) : [];
    const servers = rows.map(normalize).filter(Boolean).sort(byRisk);
    const state = this.store.state;
    if (state.status === 'ready' && same(state.servers, servers) && same(state.stopped, stopped)) return; // no flicker
    this.store.set({ status: 'ready', error: null, servers, stopped });
  }
}
