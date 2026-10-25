import './setup.mjs';
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { strings } from '../../renderer/i18n/es.js';
import { RepairViewModel } from '../../renderer/viewmodels/repairViewModel.js';
import { RepairHistoryModel } from '../../renderer/models/repairHistoryModel.js';
import { SecurityModel } from '../../renderer/models/securityModel.js';
import { createEventBus, EVENTS } from '../../renderer/core/eventBus.js';

function setup({ live = false, answer = { text: '- Paso uno\n- Paso dos' }, writes = [], scores = [], hold = false, audit = null } = {}) {
  const security = new SecurityModel();
  const history = new RepairHistoryModel();
  history.load(`p-${Math.random()}`);
  const bus = createEventBus();
  let changed = () => {};
  const agentService = { onChanged: (cb) => { changed = cb; }, undo: async () => ({ ok: true }) };
  const asks = [];
  const connection = {
    live,
    agentLabel: 'Claude',
    store: { state: { agents: [{ id: 'claude', label: 'Claude' }], selected: live ? 'claude' : null } },
    // hold: the run stays open until the test calls asks[i].finish()
    ask: (_p, _s, { signal, onStart } = {}) => new Promise((resolve) => {
      const entry = { prompt: _p, signal, finish: () => resolve(answer), aborted: false };
      asks.push(entry);
      signal?.addEventListener('abort', () => { entry.aborted = true; resolve({ text: '', error: 'cancelled' }); });
      onStart?.(String(asks.length));
      writes.forEach((w) => changed(w));
      scores.forEach(([path, level, reason]) => security.setScore(path, level, reason, 'agent')); // platanus_set_file_score
      if (!hold) resolve(answer);
    }),
  };
  const vm = new RepairViewModel({
    securityModel: security,
    mapViewModel: { locateFile: () => ({ folder: 'electron', x: 0, z: 0, height: 1, radius: 2.5 }) },
    cameraViewModel: { azimuth: 0, flyTo() {} },
    connection, history, agentService, bus, audit: audit?.(security),
  });
  const events = [];
  for (const name of ['repairStarted', 'repairFinished', 'repairChanged']) bus.on(EVENTS[name], (p) => events.push([name, p]));
  return { vm, security, history, events, asks, change: (c) => changed(c) };
}

async function runAll() {
  for (let i = 0; i < 20; i++) { mock.timers.tick(1000); await new Promise((r) => setImmediate(r)); }
}

test('without an agent: the guide plan, a yellow light and a "planned" task', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { vm, security, history, events } = setup();
    vm.start('electron/main.js');
    await runAll();
    const [entry] = history.store.state.entries;
    assert.equal(entry.status, 'planned');
    assert.ok(entry.plan.length > 0);
    assert.equal(security.scoreOf('electron/main.js').level, 'yellow');
    assert.equal(vm.store.state.job.step, 4);
    assert.deepEqual(events.map((e) => e[0]), ['repairStarted', 'repairFinished']);
  } finally { mock.timers.reset(); }
});

test('with an agent that writes: "fixed" with its changes; verifying turns it green', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const change = { path: 'electron/main.js', reason: 'Valida el origen', created: false, backup: { id: 'b1', root: '/p' }, at: 't1' };
    const { vm, security, history } = setup({ live: true, writes: [change] });
    vm.start('electron/main.js');
    await runAll();
    const [entry] = history.store.state.entries;
    assert.equal(entry.status, 'fixed');
    assert.equal(entry.changes.length, 1);
    assert.deepEqual(entry.plan, ['Paso uno', 'Paso dos']);
    vm.markFixed(entry.id);
    assert.equal(history.get(entry.id).status, 'verified');
    assert.equal(security.scoreOf('electron/main.js').level, 'green');
    assert.equal(vm.store.state.job, null);
  } finally { mock.timers.reset(); }
});

test('agent error with no changes: "failed" and the guide plan as fallback', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { vm, history } = setup({ live: true, answer: { text: '', error: 'sin sesión' } });
    vm.start('a.sql');
    await runAll();
    const [entry] = history.store.state.entries;
    assert.equal(entry.status, 'failed');
    assert.equal(entry.error, 'sin sesión');
  } finally { mock.timers.reset(); }
});

test('closing while working marks the task as failed (never stuck "working") and runs the queue', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { vm, history } = setup();
    vm.start('a.js');
    vm.start('b.js'); // queued
    assert.deepEqual(vm.store.state.queue, ['b.js']);
    vm.close();
    const a = history.store.state.entries.find((e) => e.path === 'a.js');
    assert.equal(a.status, 'failed');
    assert.equal(vm.store.state.job.path, 'b.js');
    await runAll();
    assert.equal(history.store.state.entries.find((e) => e.path === 'b.js').status, 'planned');
  } finally { mock.timers.reset(); }
});

test('undoing every change puts the file back in red and the task back to "planned"', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const change = { path: 'x.js', reason: 'r', backup: { id: 'b', root: '/p' }, at: 't' };
    const { vm, security, history } = setup({ live: true, writes: [change] });
    vm.start('x.js');
    await runAll();
    const [entry] = history.store.state.entries;
    assert.equal(await vm.undo(entry.id, change), true);
    assert.equal(history.get(entry.id).status, 'planned');
    assert.equal(security.scoreOf('x.js').level, 'red');
  } finally { mock.timers.reset(); }
});

test('a change made outside this job (chat, editor) is not credited to the repair', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { vm, history, change } = setup({ live: true, hold: true });
    change({ path: 'other.js', reason: 'from the chat', backup: { id: 'z' }, at: 'before' }); // before Qubi starts
    vm.start('a.js');
    await runAll();
    const [entry] = history.store.state.entries;
    assert.equal(entry.status, 'working'); // still waiting for the agent
    assert.equal(vm.store.state.job.step, 2);
  } finally { mock.timers.reset(); }
});

test("a write of Qubi's team while a repair runs is not credited to the repair", async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const team = { path: 'apps/web/index.html', reason: 'parte 1', created: true, backup: { id: 'w' }, at: 'w', worker: 'w1-abcd12' };
    const { vm, history, events } = setup({ live: true, writes: [team] });
    vm.start('electron/main.js');
    await runAll();
    const [entry] = history.store.state.entries;
    assert.notEqual(entry.status, 'fixed');
    assert.deepEqual(entry.changes ?? [], []);
    assert.ok(!events.some(([name]) => name === 'repairChanged'));
  } finally { mock.timers.reset(); }
});

test('closing mid-run stops the agent, and its late write does not land in the next job', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { vm, history, asks, change } = setup({ live: true, hold: true });
    vm.start('a.js');
    vm.start('b.js');
    await runAll();
    vm.close(); // a.js: agent still working
    assert.equal(asks[0].aborted, true);
    // a.js's write was requested before b.js's run started, and approved only now
    change({ path: 'a.js', reason: 'late write', backup: { id: 'late' }, requestedAt: new Date(Date.now() - 60_000).toISOString(), at: 'late' });
    asks[1].finish();
    await runAll();
    const b = history.store.state.entries.find((e) => e.path === 'b.js');
    assert.equal(b.status, 'planned');
    assert.equal(b.changes.length, 0);
  } finally { mock.timers.reset(); }
});

test('switching project cancels the job and the queue before the history changes', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { vm, history, asks } = setup({ live: true, hold: true });
    vm.start('a.js');
    vm.start('b.js');
    vm.reset();
    assert.equal(vm.store.state.job, null);
    assert.deepEqual(vm.store.state.queue, []);
    assert.equal(asks[0].aborted, true);
    assert.equal(history.store.state.entries[0].status, 'failed');
  } finally { mock.timers.reset(); }
});

test('undo survives a missing history entry and a created file counts as undoable', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const created = { path: 'new.js', reason: 'r', created: true, backup: { id: 'c' }, at: 't' };
    const { vm, history } = setup({ live: true, writes: [created] });
    vm.start('new.js');
    await runAll();
    const [entry] = history.store.state.entries;
    assert.equal(await vm.undo(entry.id, created), true);
    assert.equal(history.get(entry.id).status, 'planned');
    assert.equal(await vm.undo(999, created), true); // entry gone: no crash
  } finally { mock.timers.reset(); }
});

test('a false alarm: the agent changes nothing and marks it green, so it stays green ("clear")', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const path = 'tests/secrets.test.mjs';
    const { vm, security, history, events } = setup({ live: true, answer: { text: 'Es una falsa alarma.' }, scores: [[path, 'green', 'Es un vigilante, no guarda claves']] });
    security.setScore(path, 'red', 'Parece una clave', 'demo');
    vm.start(path);
    await runAll();
    const [entry] = history.store.state.entries;
    assert.equal(entry.status, 'clear');
    assert.equal(security.scoreOf(path).level, 'green');
    assert.equal(vm.store.state.job.outcome, 'clear');
    assert.equal(events.at(-1)[1].entry.status, 'clear');
  } finally { mock.timers.reset(); }
});

test('a repair cancelled midway says so (repairFinished, failed), so the chat card closes', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { vm, events } = setup();
    vm.start('a.js');
    vm.close();
    const finished = events.filter((e) => e[0] === 'repairFinished');
    assert.equal(finished.length, 1);
    assert.equal(finished[0][1].entry.status, 'failed');
  } finally { mock.timers.reset(); }
});

// A stand-in for AuditViewModel: each audit applies the next state of the disk to the security model
function fakeAudit(states) {
  return (security) => {
    const calls = [];
    const apply = (cause) => {
      const files = states.length > 1 ? states.shift() : states[0];
      security.applyAudit({ at: 'now', files, score: 100 - Object.values(files).filter((f) => f.level === 'red').length * 15, counts: {}, history: [] });
      calls.push(cause);
    };
    apply('open');
    return { available: true, calls, auditNow: async (cause) => apply(cause), check: async (_p, cause) => apply(cause) };
  };
}
const SQL = { level: 'red', findings: [{ rule: 'sqlInjection', level: 'red', line: 12 }] };
const CLEAN = { level: 'green', findings: [] };

test('with the audit: the agent is told the rule and line, and only a new audit says it is fixed', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const change = { path: 'api/orders.ts', reason: 'Usa parámetros', created: false, backup: { id: 'b1', root: '/p' }, at: 't1' };
    const t = setup({ live: true, writes: [change], audit: fakeAudit([{ 'api/orders.ts': SQL }, { 'api/orders.ts': CLEAN }]) });
    t.vm.start('api/orders.ts');
    await runAll();
    const [entry] = t.history.store.state.entries;
    assert.equal(entry.status, 'verified', 'the audit found nothing: verified, no extra click');
    assert.equal(entry.verifiedBy, 'audit');
    assert.equal(entry.audit.score, 100);
    assert.equal(t.vm.store.state.job.outcome, 'fixed');
    assert.equal(t.security.scoreOf('api/orders.ts').level, 'green');
    assert.match(t.asks[0].prompt, /Línea 12: sqlInjection/, 'the agent fixes exactly what the audit found');
  } finally { mock.timers.reset(); }
});

test('with the audit: a change that does not remove the finding is "partial", and stays red', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const change = { path: 'api/orders.ts', reason: 'Comentario', created: false, backup: { id: 'b1', root: '/p' }, at: 't1' };
    const t = setup({ live: true, writes: [change], scores: [['api/orders.ts', 'green', 'Ya está bien']], audit: fakeAudit([{ 'api/orders.ts': SQL }]) });
    t.vm.start('api/orders.ts');
    await runAll();
    const [entry] = t.history.store.state.entries;
    assert.equal(t.vm.store.state.job.outcome, 'partial');
    assert.equal(entry.status, 'fixed');
    assert.match(entry.stillRisky, /^Línea 12:/);
    assert.equal(t.security.scoreOf('api/orders.ts').level, 'red', 'the agent saying green does not hide it');
    assert.equal(await t.vm.markFixed(entry.id), false, '"Volver a auditar" while it is still there');
    assert.equal(t.history.get(entry.id).status, 'fixed');
  } finally { mock.timers.reset(); }
});

test('with the audit: the person applies the plan; "Ya lo apliqué" audits and verifies', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const t = setup({ audit: fakeAudit([{ Dockerfile: { level: 'yellow', findings: [{ rule: 'dockerRoot', level: 'yellow', line: 1 }] } }, { Dockerfile: { level: 'yellow', findings: [{ rule: 'dockerRoot', level: 'yellow', line: 1 }] } }, { Dockerfile: CLEAN }]) });
    t.vm.start('Dockerfile');
    await runAll();
    const [entry] = t.history.store.state.entries;
    assert.equal(entry.status, 'planned');
    assert.deepEqual(entry.plan, ['Añadir un usuario sin permisos de administrador (USER node)', 'Volver a auditar'], 'the plan of the rule the audit found');
    assert.equal(await t.vm.markFixed(entry.id), true);
    assert.equal(t.history.get(entry.id).status, 'verified');
  } finally { mock.timers.reset(); }
});

test('repairGuide: Qubi walks, looks, thinks, works on the exact file and shows what was found', async () => {
  const { repairGuide } = await import('../../renderer/viewmodels/repairViewModel.js');
  const job = { path: 'apps/api/src/routes/orders.ts', reason: 'Línea 12: consulta SQL insegura', source: 'agent', agentLabel: 'Claude', step: 0, outcome: null, hammering: false };
  const walk = repairGuide(job);
  assert.deepEqual([walk.pose, walk.look, walk.gesture], ['idle', 'center', null]);
  assert.equal(walk.title, `${strings.repair.name} · orders.ts`);
  assert.match(walk.text, /Línea 12: consulta SQL insegura/);
  assert.ok(repairGuide(job, { tech: true }).title.endsWith('apps/api/src/routes/orders.ts'));
  assert.equal(repairGuide({ ...job, step: 1 }).pose, 'scan');
  assert.equal(repairGuide({ ...job, step: 2 }).gesture, 'pensar');
  assert.match(repairGuide({ ...job, step: 2 }).text, /Claude está reparando/);
  assert.equal(repairGuide({ ...job, step: 3, hammering: true }).pose, 'drop');
  const done = repairGuide({ ...job, step: 4, outcome: 'fixed' });
  assert.deepEqual([done.pose, done.look, done.gesture], ['wave', 'camera', 'celebrar']);
  const partial = repairGuide({ ...job, step: 4, outcome: 'partial', stillRisky: 'Línea 12: consulta SQL insegura' });
  assert.equal(partial.gesture, 'encoger');
  assert.match(partial.text, /sigue el riesgo\. Línea 12/);
});
