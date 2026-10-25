// Qubi's team (docs/features/llamada/FASE2.md): 2 or 3 workers in parallel, each in its own folder, then
// Qubi audits each job. The fixed checks decide; the agent's review only adds a note.
import './setup.mjs';
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { Observable } from '../../renderer/core/observable.js';
import { createEventBus, EVENTS } from '../../renderer/core/eventBus.js';
import { TeamViewModel, TEAM_TIMING, cleanFolder, shortText, foldersOf, clearOfFolders, workerSpots, auditSpot, stackBubbles, SPOTS } from '../../renderer/viewmodels/teamViewModel.js';
import { FOLDER } from '../../renderer/viewmodels/layout.js';
import { strings } from '../../renderer/i18n/es.js';

const T = strings.team;
const flush = () => new Promise((r) => setImmediate(r)); // setImmediate is not mocked (only setTimeout)

// A connection whose runs end when the test says so; it records every option it was given
function fakeConnection({ live = true } = {}) {
  const calls = [];
  return {
    calls,
    live,
    ask(prompt, systemPrompt, opts = {}) {
      let resolve;
      const promise = new Promise((r) => { resolve = r; });
      const call = { prompt, systemPrompt, opts, aborted: false, resolve: (v) => resolve(v) };
      opts.signal?.addEventListener('abort', () => { call.aborted = true; resolve({ text: '', error: 'cancelled' }); }, { once: true });
      calls.push(call);
      return promise;
    },
  };
}

function setup({ open = true, live = true, review = true, buildings = [], memory = null, securityModel = null } = {}) {
  const bus = createEventBus();
  const connection = fakeConnection({ live });
  const projectModel = { store: new Observable({ open, tree: [], session: 1 }) };
  const mapViewModel = { store: new Observable({ plaza: { size: 5, name: 'tienda' }, buildings, branches: [] }) };
  const vm = new TeamViewModel({ connection, projectModel, mapViewModel, securityModel, memory, bus, review });
  const worker = (n) => connection.calls.find((c) => c.opts.session === `worker-${n}`);
  const reviews = () => connection.calls.filter((c) => c.opts.session === 'review');
  return { vm, bus, connection, projectModel, mapViewModel, worker, reviews };
}

const TASKS = [
  { titulo: 'La tienda', pedido: 'Haz la página de la tienda', carpeta: 'apps/web' },
  { titulo: 'Los pedidos', pedido: 'Guarda los pedidos', carpeta: 'apps/api' },
];

test('start: N workers run at once, each in its session, with its id, its folder and the memory', async () => {
  const { vm, connection, worker } = setup({ memory: { text: () => 'Ya existe: apps/web/index.html.' } });
  const r = vm.start([...TASKS, { titulo: 'La guía', pedido: 'Escribe la guía', carpeta: 'docs' }]);
  assert.equal(r.ok, true);
  assert.equal(r.workers.length, 3);
  assert.deepEqual(r.workers.map((w) => w.folder), ['apps/web', 'apps/api', 'docs']);
  for (const w of r.workers) assert.match(w.id, /^w[1-3]-[a-z0-9]{6}$/);
  assert.equal(connection.calls.length, 3, 'all three asked at once, nobody waits');
  for (const n of [1, 2, 3]) {
    const call = worker(n);
    const w = r.workers[n - 1];
    assert.equal(call.opts.worker, w.id);
    assert.deepEqual(call.opts.scope, [w.folder]);
    assert.deepEqual(call.opts.voice, { purpose: 'worker' });
    assert.ok(call.opts.signal, 'each run can be stopped');
    assert.equal(call.systemPrompt, '');
    assert.match(call.prompt, new RegExp(`«${w.folder}/»`));
    assert.match(call.prompt, /Ya existe: apps\/web\/index\.html/);
  }
  assert.match(worker(1).prompt, /Haz la página de la tienda/);
  const s = vm.store.state;
  assert.equal(s.phase, 'working');
  assert.deepEqual(s.workers.map((w) => [w.n, w.title, w.status]), [[1, 'La tienda', 'queued'], [2, 'Los pedidos', 'queued'], [3, 'La guía', 'queued']]);
  for (const w of s.workers) assert.ok(Number.isFinite(w.place.x) && Number.isFinite(w.place.stand.z), 'every worker has its place on the map');
  worker(2).opts.onStart('run-2');
  assert.equal(vm.store.state.workers[1].status, 'working');
  vm.cancel();
});

test('start: says why it cannot hand out the work (busy, no project, no agent, folders)', () => {
  assert.equal(setup({ open: false }).vm.start(TASKS).motivo, 'sin-proyecto');
  assert.equal(setup({ live: false }).vm.start(TASKS).motivo, 'sin-agente');
  const { vm, connection } = setup();
  const rejected = [
    [[...TASKS, ...TASKS], 'muchas-tareas'],
    [[], 'muchas-tareas'],
    [[TASKS[0], { ...TASKS[1], carpeta: 'apps/web/' }], 'carpetas-repetidas'],
    [[TASKS[0], { ...TASKS[1], carpeta: 'APPS/web' }], 'carpetas-repetidas'],
    [[{ ...TASKS[0], carpeta: 'apps' }, TASKS[1]], 'carpetas-repetidas'],
    [[TASKS[0], { ...TASKS[1], carpeta: '../fuera' }], 'carpeta-invalida'],
    [[TASKS[0], { ...TASKS[1], carpeta: '/etc' }], 'carpeta-invalida'],
    [[TASKS[0], { ...TASKS[1], carpeta: 'apps/../..' }], 'carpeta-invalida'],
    [[TASKS[0], { ...TASKS[1], carpeta: '.git' }], 'carpeta-invalida'],
    [[TASKS[0], { ...TASKS[1], carpeta: 'config/.env' }], 'carpeta-invalida'],
    [[TASKS[0], { ...TASKS[1], carpeta: '' }], 'carpeta-invalida'],
    [[TASKS[0], { ...TASKS[1], carpeta: 'C:\\Windows' }], 'carpeta-invalida'],
  ];
  for (const [tasks, motivo] of rejected) assert.deepEqual(vm.start(tasks), { ok: false, motivo }, JSON.stringify(tasks));
  assert.equal(connection.calls.length, 0, 'nothing was asked');
  assert.equal(vm.store.state.phase, 'idle');
  assert.equal(vm.start(TASKS).ok, true);
  assert.deepEqual(vm.start(TASKS), { ok: false, motivo: 'ocupado' });
  vm.cancel();
});

test('cleanFolder: relative folders inside the project, never secrets', () => {
  assert.equal(cleanFolder('./apps/web/'), 'apps/web');
  assert.equal(cleanFolder('apps\\api'), 'apps/api');
  for (const bad of ['..', 'a/../b', '/abs', '', '   ', '.ssh', 'keys/id_rsa', null, 3]) assert.equal(cleanFolder(bad), null, String(bad));
});

test('a saved file goes to the worker that wrote it: new files drop a sheet at its folder', () => {
  const { vm, bus } = setup();
  const { workers } = vm.start(TASKS);
  const [w1, w2] = workers;
  bus.emit(EVENTS.agentChanged, { path: 'apps/web/index.html', created: true, worker: w1.id });
  bus.emit(EVENTS.agentChanged, { path: 'apps/api/orders.js', diff: { created: true }, worker: w2.id });
  bus.emit(EVENTS.agentChanged, { path: 'apps/api/db.js', created: false, worker: w2.id });
  bus.emit(EVENTS.agentChanged, { path: 'README.md', created: true }); // the chat's, not the team's
  bus.emit(EVENTS.agentChanged, { path: 'x.js', created: true, worker: 'w3-zzzzzz' }); // no such worker
  const [a, b] = vm.store.state.workers;
  assert.deepEqual([a.created, a.changed], [['apps/web/index.html'], []]);
  assert.deepEqual([b.created, b.changed], [['apps/api/orders.js'], ['apps/api/db.js']]);
  const drops = vm.store.state.drops;
  assert.deepEqual(drops.map((d) => [d.worker, d.folder, d.path]), [[w1.id, 'apps/web', 'apps/web/index.html'], [w2.id, 'apps/api', 'apps/api/orders.js']]);
  assert.deepEqual([drops[0].x, drops[0].z], [a.place.x, a.place.z]);
  assert.notEqual(drops[0].id, drops[1].id);
  vm.cancel();
});

test('waiting for the person: only that worker waits, and works again once answered', () => {
  const { vm, bus, worker } = setup();
  const { workers } = vm.start(TASKS);
  worker(1).opts.onStart('1'); worker(2).opts.onStart('2');
  bus.emit(EVENTS.agentAwaiting, { path: 'apps/api/db.js', waiting: true, worker: workers[1].id });
  bus.emit(EVENTS.agentAwaiting, { path: 'vercel.json', waiting: true }); // the chat's
  assert.deepEqual(vm.store.state.workers.map((w) => w.status), ['working', 'waiting']);
  bus.emit(EVENTS.agentAwaiting, { path: 'apps/api/db.js', waiting: false, worker: workers[1].id });
  assert.deepEqual(vm.store.state.workers.map((w) => w.status), ['working', 'working']);
  vm.cancel();
});

test('steps are counted and the last short sentence is kept (never code)', () => {
  const { vm, worker } = setup();
  vm.start(TASKS);
  const on = worker(1).opts.onEvent;
  on({ type: 'tool', name: 'read_file' });
  on({ type: 'tool', name: 'write_file' });
  on({ type: 'text', delta: 'Voy a crear la **página** principal.\n```js\nconst key = "sk-123";\n' });
  const w = vm.store.state.workers[0];
  assert.equal(w.steps, 2);
  assert.equal(w.text, 'Voy a crear la página principal.');
  on({ type: 'text', delta: '```\nListo: '.concat('a'.repeat(120)) });
  assert.ok(vm.store.state.workers[0].text.length <= 80);
  assert.ok(!/sk-123/.test(vm.store.state.workers[0].text));
  vm.cancel();
});

test('shortText: last plain line, no code, at most 80 characters', () => {
  assert.equal(shortText('Hola.\n\nCreé `apps/web/a.js` y la lista.'), 'Creé apps/web/a.js y la lista.');
  assert.equal(shortText('Hecho.\n```\nlet x = 1;\n```'), 'Hecho.');
  assert.equal(shortText('const x = () => {'), '');
  assert.equal(shortText('x'.repeat(200)).length, 80);
});

test('the fixed audit flags a file outside the folder or a secret, even if the review says it is fine', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { vm, bus, worker, reviews } = setup();
    const { workers } = vm.start([TASKS[0], { titulo: 'Ajustes', pedido: 'Configura', carpeta: 'config' }]);
    bus.emit(EVENTS.agentChanged, { path: 'apps/web/index.html', created: true, worker: workers[0].id });
    bus.emit(EVENTS.agentChanged, { path: 'apps/api/server.js', created: false, worker: workers[0].id });
    bus.emit(EVENTS.agentChanged, { path: 'config/.env', created: true, worker: workers[1].id });
    worker(1).resolve({ text: 'Hice la tienda.', error: null });
    worker(2).resolve({ text: 'Listo.', error: null });
    await flush();
    assert.equal(vm.store.state.phase, 'auditing');
    assert.equal(vm.store.state.workers[0].audit.status, 'checking');
    assert.equal(vm.store.state.guide.pose, 'scan');
    assert.equal(vm.store.state.guide.text, T.guide.scan('apps/web'));
    // the review is read-only, in its own session, with the list of files
    const r1 = reviews()[0];
    assert.equal(r1.opts.readOnly, true);
    assert.equal(r1.opts.worker, undefined);
    assert.match(r1.prompt, /apps\/web\/index\.html/);
    r1.resolve({ text: 'Todo está aprobado y perfecto.', error: null });
    await flush();
    mock.timers.tick(TEAM_TIMING.walkMaxMs);
    const a = vm.store.state.workers[0].audit;
    assert.equal(a.status, 'flagged');
    assert.ok(a.notes.includes(T.auditNotes.outside('apps/api/server.js')));
    assert.ok(a.notes.some((n) => n.startsWith(T.auditNotes.review('').trim())), 'the review stays as a note');
    assert.equal(vm.store.state.guide.text, T.guide.flagged('apps/web'));
    mock.timers.tick(TEAM_TIMING.verdictMs); // on to the next folder
    assert.equal(vm.store.state.guide.text, T.guide.scan('config'));
    reviews()[1].resolve({ text: 'Aprobado.', error: null });
    await flush();
    mock.timers.tick(TEAM_TIMING.walkMaxMs);
    const b = vm.store.state.workers[1].audit;
    assert.equal(b.status, 'flagged');
    assert.ok(b.notes.includes(T.auditNotes.secret('config/.env')));
  } finally { mock.timers.reset(); }
});

test('a clean job is approved; a failed one is flagged; a red file is flagged; then done, and idle after a while', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const securityModel = { scoreOf: (path) => ({ level: path.endsWith('auth.js') ? 'red' : 'green' }) };
    const { vm, bus, worker, reviews } = setup({ review: false, securityModel });
    const { workers } = vm.start([...TASKS, { titulo: 'Acceso', pedido: 'Login', carpeta: 'apps/login' }]);
    bus.emit(EVENTS.agentChanged, { path: 'apps/web/index.html', created: true, worker: workers[0].id });
    bus.emit(EVENTS.agentChanged, { path: 'apps/login/auth.js', created: true, worker: workers[2].id });
    worker(1).resolve({ text: 'ok', error: null });
    await flush();
    assert.equal(vm.store.state.phase, 'working', 'the others still work');
    worker(2).resolve({ text: '', error: 'se cortó' });
    worker(3).resolve({ text: 'ok', error: null });
    await flush();
    for (let i = 0; i < 3; i++) { mock.timers.tick(TEAM_TIMING.walkMaxMs); mock.timers.tick(TEAM_TIMING.verdictMs); }
    assert.equal(reviews().length, 0, 'no review asked when it is off');
    const s = vm.store.state;
    assert.deepEqual(s.workers.map((w) => [w.status, w.audit.status]), [['done', 'approved'], ['failed', 'flagged'], ['done', 'flagged']]);
    assert.deepEqual(s.workers[1].audit.notes, [T.auditNotes.failed]);
    assert.deepEqual(s.workers[2].audit.notes, [T.auditNotes.red('apps/login/auth.js')]);
    assert.ok(s.workers.every((w) => w.endedAt >= w.startedAt));
    assert.equal(s.phase, 'done');
    assert.equal(s.guide.text, T.guide.done(1, 3));
    mock.timers.tick(TEAM_TIMING.lingerMs);
    assert.deepEqual([vm.store.state.phase, vm.store.state.workers, vm.store.state.guide, vm.store.state.drops], ['idle', [], null, []]);
    assert.match(vm.summary(), /El equipo ya terminó/, 'the last result can still be told');
    assert.equal(vm.start(TASKS).ok, true, 'a new team can start');
    vm.cancel();
  } finally { mock.timers.reset(); }
});

test('a review that never answers does not block: the fixed verdict stands', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { vm, bus, worker, reviews } = setup();
    const { workers } = vm.start([TASKS[0]]);
    bus.emit(EVENTS.agentChanged, { path: 'apps/web/a.js', created: true, worker: workers[0].id });
    worker(1).resolve({ text: 'ok', error: null });
    await flush();
    mock.timers.tick(TEAM_TIMING.walkMaxMs);
    assert.equal(vm.store.state.workers[0].audit.status, 'checking');
    mock.timers.tick(TEAM_TIMING.reviewMs);
    await flush();
    assert.equal(reviews()[0].aborted, true);
    assert.equal(vm.store.state.workers[0].audit.status, 'approved');
    vm.cancel();
  } finally { mock.timers.reset(); }
});

test('cancel stops every run, and closing or changing the project or starting the tour cancels too', async () => {
  const { vm, bus, connection, projectModel } = setup();
  vm.start(TASKS);
  vm.cancel();
  assert.ok(connection.calls.every((c) => c.aborted), 'every worker was stopped');
  await flush();
  assert.equal(vm.store.state.phase, 'idle');
  assert.deepEqual(vm.store.state.workers, []);

  vm.start(TASKS);
  projectModel.store.set({ session: 2 });
  assert.equal(vm.store.state.phase, 'idle');
  vm.start(TASKS);
  bus.emit(EVENTS.tourStarted, {});
  assert.equal(vm.store.state.phase, 'idle');
  vm.start(TASKS);
  bus.emit(EVENTS.projectClosed);
  assert.equal(vm.store.state.phase, 'idle');
  assert.ok(connection.calls.every((c) => c.aborted));
});

test('summary() is short Spanish for the voice: titles, folders, states and files, never the agents words', () => {
  const { vm, bus, worker } = setup();
  assert.equal(vm.summary(), T.summary('idle', []));
  const { workers } = vm.start(TASKS);
  worker(1).opts.onStart('1');
  worker(1).opts.onEvent({ type: 'text', delta: 'La clave es sk-secreta' });
  bus.emit(EVENTS.agentChanged, { path: 'apps/web/index.html', created: true, worker: workers[0].id });
  const text = vm.summary();
  assert.match(text, /^El equipo está trabajando\./);
  assert.match(text, /«La tienda» en apps\/web\/: trabajando, 1 archivo nuevo/);
  assert.match(text, /«Los pedidos» en apps\/api\/: en espera/);
  assert.ok(!/sk-secreta/.test(text));
  vm.cancel();
});

test('the places follow the map: a folder that appears on the map moves its worker there', () => {
  const { vm, mapViewModel } = setup();
  vm.start(TASKS);
  assert.equal(vm.store.state.workers[0].place.kind, 'ghost');
  mapViewModel.store.set({ buildings: [{ path: 'apps', x: 9, z: -3 }] });
  const place = vm.store.state.workers[0].place;
  assert.equal(place.kind, 'building');
  assert.deepEqual([place.x, place.z], [9, -3]);
  vm.cancel();
});

test('dispatch: Qubi points at each folder while its worker is born, then is free until the audit', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { vm } = setup();
    vm.start(TASKS);
    const g = vm.store.state.guide;
    assert.equal(g.pose, 'point');
    assert.equal(g.text, T.guide.dispatch('La tienda'));
    assert.deepEqual(g.center, { x: vm.store.state.workers[0].place.x, z: vm.store.state.workers[0].place.z });
    // he points from where he stands: no walk, so he never jumps to the plaza corner
    assert.equal(g.to, null);
    assert.equal(g.from, null);
    mock.timers.tick(TEAM_TIMING.dispatchMs);
    assert.equal(vm.store.state.guide.text, T.guide.dispatch('Los pedidos'));
    mock.timers.tick(TEAM_TIMING.dispatchMs);
    assert.equal(vm.store.state.guide, null);
    vm.cancel();
  } finally { mock.timers.reset(); }
});

test('an agent override to green never hides a file the fixed rule marks red', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    // the worker set its own file green (platanus_set_file_score): scoreOf gives the override first
    const securityModel = { scoreOf: () => ({ level: 'green', by: 'agent' }) };
    const { vm, bus, worker } = setup({ review: false, securityModel });
    const { workers } = vm.start([TASKS[0]]);
    bus.emit(EVENTS.agentChanged, { path: 'apps/web/password.js', created: true, worker: workers[0].id });
    worker(1).resolve({ text: 'ok', error: null });
    await flush();
    mock.timers.tick(TEAM_TIMING.walkMaxMs);
    const a = vm.store.state.workers[0].audit;
    assert.equal(a.status, 'flagged');
    assert.deepEqual(a.notes, [T.auditNotes.red('apps/web/password.js')]);
    vm.cancel();
  } finally { mock.timers.reset(); }
});

test('a path written as ./folder/file (main accepts it inside the folder) is approved and kept clean', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { vm, bus, worker } = setup({ review: false });
    const { workers } = vm.start([TASKS[0]]);
    bus.emit(EVENTS.agentChanged, { path: './apps/web/page.js', created: true, worker: workers[0].id });
    bus.emit(EVENTS.agentChanged, { path: 'apps//web/./page.js', created: false, worker: workers[0].id });
    worker(1).resolve({ text: 'ok', error: null });
    await flush();
    mock.timers.tick(TEAM_TIMING.walkMaxMs);
    const w = vm.store.state.workers[0];
    assert.deepEqual([w.created, w.changed], [['apps/web/page.js'], []]);
    assert.equal(w.audit.status, 'approved');
    vm.cancel();
  } finally { mock.timers.reset(); }
});

test("'..' in a worker's path is never inside its folder", async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { vm, bus, worker } = setup({ review: false });
    const { workers } = vm.start([TASKS[0]]);
    bus.emit(EVENTS.agentChanged, { path: 'apps/web/../api/x.js', created: true, worker: workers[0].id });
    worker(1).resolve({ text: 'ok', error: null });
    await flush();
    mock.timers.tick(TEAM_TIMING.walkMaxMs);
    assert.equal(vm.store.state.workers[0].audit.status, 'flagged');
    vm.cancel();
  } finally { mock.timers.reset(); }
});

test('cancel while the finished team lingers keeps its workers as they are (the chat card is not added twice)', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { vm, worker } = setup({ review: false });
    vm.start([TASKS[0]]);
    worker(1).resolve({ text: 'ok', error: null });
    await flush();
    mock.timers.tick(TEAM_TIMING.walkMaxMs);
    mock.timers.tick(TEAM_TIMING.verdictMs);
    assert.equal(vm.store.state.phase, 'done');
    const seen = [];
    vm.store.subscribe((s) => seen.push([s.phase, s.workers]));
    const done = vm.store.state.workers;
    vm.cancel();
    assert.deepEqual(seen.map(([phase]) => phase), ['idle'], 'no second "done" with new workers');
    assert.equal(vm.summary().includes('La tienda'), true);
    assert.equal(done.every((w) => w.status === 'done'), true);
  } finally { mock.timers.reset(); }
});

// --- Where robots stand and how their bubbles share the screen (MEJORAS §7) ---
const HALF = FOLDER.platform / 2;
const onFootprint = (p, f, margin = 0) => Math.abs(p.x - f.x) < HALF + margin - 1e-6 && Math.abs(p.z - f.z) < HALF + margin - 1e-6;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const pairs = (list) => list.flatMap((a, i) => list.slice(i + 1).map((b) => [a, b]));

test('foldersOf: every folder the map draws, top-level and open path', () => {
  const map = { buildings: [{ path: 'apps', x: 9, z: -3 }], branches: [{ folders: [{ path: 'apps/web', x: 14, z: -3 }] }] };
  assert.deepEqual(foldersOf(map), [{ x: 9, z: -3 }, { x: 14, z: -3 }]);
  assert.deepEqual(foldersOf({}), []);
});

test('clearOfFolders: a point on a platform steps off it the short way; one outside stays', () => {
  const f = { x: 10, z: 0 };
  const p = clearOfFolders({ x: 11.8, z: 0.5 }, [f]);
  assert.ok(!onFootprint(p, f), 'off the platform');
  assert.ok(p.x > 10 && Math.abs(p.z - 0.5) < 1e-9, 'out through the nearest edge');
  assert.deepEqual(clearOfFolders({ x: 20, z: 20 }, [f]), { x: 20, z: 20 });
});

test('workerSpots: never on a folder, 1.6 or more apart, in an arc facing the way to the plaza', () => {
  const building = (x, z) => ({ kind: 'building', x, z, stand: { x: x - 3.3, z } });
  // apps/web and apps/api both show at apps/; a third worker at a neighbor building
  const folders = [{ x: 9, z: 0 }, { x: 15, z: 0 }];
  const workers = [
    { id: 'w1', place: building(9, 0) },
    { id: 'w2', place: building(9, 0) },
    { id: 'w3', place: building(15, 0) },
  ];
  const spots = workerSpots(workers, { folders });
  const list = workers.map((w) => spots.get(w.id));
  for (const s of list) for (const f of folders) assert.ok(!onFootprint(s, f), `${JSON.stringify(s)} is off ${JSON.stringify(f)}`);
  for (const [a, b] of pairs(list)) assert.ok(dist(a, b) >= SPOTS.apart - 1e-6, `${JSON.stringify(a)} and ${JSON.stringify(b)} apart`);
  // the two of apps/ stand on its plaza side, one on each side of the way to it
  const [a, b] = list;
  assert.ok(a.x < 9 && b.x < 9, 'toward the stand');
  assert.ok(Math.abs(a.z + b.z) < 1e-6 && Math.abs(a.z) > 0.5, 'mirrored around the way');
  // about SPOTS.gap off the platform's edge (the arc bends around it)
  for (const s of [a, b]) assert.ok(Math.max(Math.abs(s.x - 9), Math.abs(s.z)) - HALF >= SPOTS.gap - 0.6);
});

test('workerSpots: three at one folder and the plaza never overlap, every time the same', () => {
  const ghost = { kind: 'ghost', x: 0, z: 10, stand: { x: 0, z: 6.7 } };
  const plaza = { kind: 'plaza', x: 0, z: 0, stand: { x: 1.1, z: 1.1 } };
  const workers = [{ id: 'a', place: ghost }, { id: 'b', place: ghost }, { id: 'c', place: ghost }, { id: 'd', place: plaza }];
  const one = workerSpots(workers);
  const list = [...one.values()];
  for (const [p, q] of pairs(list)) assert.ok(dist(p, q) >= SPOTS.apart - 1e-6);
  for (const s of list.slice(0, 3)) assert.ok(!onFootprint(s, ghost), 'off the ghost folder');
  assert.deepEqual([...workerSpots(workers).values()], list, 'deterministic');
  assert.ok(Math.abs(dist(one.get('d'), plaza) - SPOTS.plaza) < 1e-2, 'on the plaza ring');
});

test('the team places carry each worker spot; workers of one building stand apart', () => {
  const { vm } = setup({ buildings: [{ path: 'apps', x: 9, z: -3 }] });
  vm.start(TASKS);
  const [a, b] = vm.store.state.workers;
  assert.equal(a.place.kind, 'building');
  assert.deepEqual([a.place.x, b.place.x], [9, 9], 'apps/web and apps/api show at apps/');
  assert.ok(dist(a.place.spot, b.place.spot) >= SPOTS.apart - 1e-6);
  for (const w of [a, b]) assert.ok(!onFootprint(w.place.spot, { x: 9, z: -3 }));
  vm.cancel();
});

test('auditSpot: Qubi stands on the camera side, off the platform, and steps around a worker there', () => {
  const center = { x: 10, z: 0 };
  const azimuth = Math.PI / 2; // the camera looks from +x
  const free = auditSpot({ center, azimuth });
  assert.ok(free.x > 10 + HALF && Math.abs(free.z) < 1e-6, 'in front of the folder, seen from the camera');
  const taken = auditSpot({ center, azimuth, avoid: [free] });
  assert.ok(dist(taken, free) >= SPOTS.apart, 'never on the worker');
  assert.ok(taken.x > 10, 'still on the camera side');
  assert.ok(!onFootprint(taken, center));
  const plaza = auditSpot({ center: { x: 0, z: 0 }, kind: 'plaza', azimuth: 0 });
  assert.ok(Math.abs(plaza.z - SPOTS.plaza) < 1e-2);
});

test('stackBubbles: touching workers become pills, Qubi stays as he is, the one that collides goes up', () => {
  const pill = { w: 120, h: 26 };
  const boxes = [
    { id: 'qubi', x: 400, y: 300, w: 220, h: 70, lead: true },
    { id: 'w1', x: 420, y: 320, w: 200, h: 54, pill },
    { id: 'w2', x: 900, y: 320, w: 200, h: 54, pill },
  ];
  const out = stackBubbles(boxes);
  assert.deepEqual(out.get('qubi'), { collapse: false, lift: 0 });
  assert.equal(out.get('w1').collapse, true);
  assert.ok(out.get('w1').lift >= 320 - (300 - 70), 'above Qubi bubble');
  assert.deepEqual(out.get('w2'), { collapse: false, lift: 0 }, 'alone: big and in place');
  // the pointer is on w1: it stays big (and still goes up)
  const kept = stackBubbles([boxes[0], { ...boxes[1], keep: true }]);
  assert.equal(kept.get('w1').collapse, false);
  assert.ok(kept.get('w1').lift > 0);
  // two workers alone: both pills, the lower one stays, the other one goes up
  const two = stackBubbles([{ id: 'a', x: 100, y: 200, w: 160, h: 50, pill }, { id: 'b', x: 110, y: 190, w: 160, h: 50, pill }]);
  assert.equal(two.get('a').collapse && two.get('b').collapse, true);
  assert.equal(two.get('a').lift, 0);
  assert.ok(two.get('b').lift >= 190 - (200 - 26) + 6);
});
