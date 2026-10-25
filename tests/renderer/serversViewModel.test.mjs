// Servers listening on this computer: model rules and the view model's polling (spec/001-running-servers.md).
import './setup.mjs';
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { ServersModel } from '../../renderer/models/serversModel.js';
import { ServersViewModel, SERVER_POLL_MS } from '../../renderer/viewmodels/serversViewModel.js';
import { createServerService } from '../../renderer/services/serverService.js';

const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); };

// Fake service: answers each list() with the next response (the last one repeats)
function fakeService(responses, { isDesktop = true, stopReply = null, openReply = null, stopped = [] } = {}) {
  const calls = { list: 0, open: [], stop: [], browsers: 0, pause: [], resume: [], restart: [], forget: [], stopped: 0, output: [], cancelStart: [] };
  let i = 0;
  let stoppedRows = stopped;
  return {
    pause: async (port) => { calls.pause.push(port); return { ok: true, data: { port, processes: ['Python'] } }; },
    resume: async (port) => { calls.resume.push(port); return { ok: true, data: { port, processes: ['Python'] } }; },
    stopped: async () => { calls.stopped += 1; return { ok: true, data: stoppedRows }; },
    restart: async (id) => { calls.restart.push(id); stoppedRows = stoppedRows.filter((r) => r.id !== id); return { ok: true, data: { port: 8000, process: 'Python' } }; },
    forget: async (id) => { calls.forget.push(id); stoppedRows = stoppedRows.filter((r) => r.id !== id); return { ok: true, data: null }; },
    output: async (key) => { calls.output.push(key); return { ok: true, data: `out ${key} #${calls.output.length}` }; },
    cancelStart: async (id) => { calls.cancelStart.push(id); stoppedRows = stoppedRows.map((r) => (r.id === id ? { ...r, state: 'stopped' } : r)); return { ok: true, data: null }; },
    calls,
    isDesktop,
    list: async () => {
      calls.list += 1;
      const r = responses[Math.min(i++, responses.length - 1)];
      if (r instanceof Error) throw r;
      return r;
    },
    open: async (port, browser) => { calls.open.push([port, browser]); return openReply ?? { ok: true, data: `http://localhost:${port}` }; },
    stop: async (port) => { calls.stop.push(port); return stopReply ?? { ok: true, data: { port, processes: ['Python'] } }; },
    browsers: async () => { calls.browsers += 1; return { ok: true, data: [{ id: 'chrome', name: 'Google Chrome' }] }; },
  };
}

const ok = (data) => ({ ok: true, data });
const PY = { port: 8000, process: 'Python', address: '*', exposed: true };
const NODE = { port: 5173, process: 'node', address: '127.0.0.1', exposed: false };

test('B3/B4: exposed servers are yellow, local ones calm (green, no glow)', async () => {
  const model = new ServersModel(fakeService([ok([PY, NODE])]));
  await model.refresh();
  const { status, servers } = model.store.state;
  assert.equal(status, 'ready');
  assert.deepEqual(servers.map((s) => [s.port, s.level]), [[8000, 'yellow'], [5173, 'green']]);
});

test('B2: a server without a process name keeps a null name (the view says "desconocido")', async () => {
  const model = new ServersModel(fakeService([ok([{ port: 9000, process: null, address: '0.0.0.0', exposed: true }])]));
  await model.refresh();
  assert.equal(model.store.state.servers[0].process, null);
});

test('rows that do not look like a server are dropped', async () => {
  const bad = [{ port: '80; rm', process: 'x', exposed: true }, { port: 0, exposed: false }, null, { port: 22, process: 5, address: 1, exposed: 'yes' }];
  const model = new ServersModel(fakeService([ok([...bad, NODE])]));
  await model.refresh();
  assert.deepEqual(model.store.state.servers.map((s) => s.port), [22, 5173]);
  const fixed = model.store.state.servers[0];
  assert.deepEqual([fixed.process, fixed.address, fixed.exposed], [null, '', true]); // unknown exposure counts as exposed
});

test('B8: nothing listening is an empty, ready list', async () => {
  const vm = new ServersViewModel({ serversModel: new ServersModel(fakeService([ok([])])) });
  await vm.refresh();
  assert.equal(vm.store.state.status, 'ready');
  assert.equal(vm.store.state.empty, true);
});

test('B9: an error from the system is shown, and a thrown error too', async () => {
  const model = new ServersModel(fakeService([{ ok: false, error: 'No pude leer la lista de servidores.' }, new Error('boom')]));
  await model.refresh();
  assert.deepEqual([model.store.state.status, model.store.state.error], ['error', 'No pude leer la lista de servidores.']);
  await model.refresh();
  assert.deepEqual([model.store.state.status, model.store.state.error], ['error', null]);
  assert.deepEqual(model.store.state.servers, []);
});

test('B5: while visible the list refreshes every few seconds; hidden, it stops', async () => {
  mock.timers.enable({ apis: ['setInterval'] });
  try {
    const service = fakeService([ok([PY]), ok([])]);
    const vm = new ServersViewModel({ serversModel: new ServersModel(service) });
    vm.setVisible(true);
    await flush();
    assert.deepEqual(vm.store.state.servers.map((s) => s.port), [8000]);
    mock.timers.tick(SERVER_POLL_MS);
    await flush();
    assert.deepEqual(vm.store.state.servers, []); // the server stopped
    vm.setVisible(false);
    const calls = service.calls.list;
    mock.timers.tick(SERVER_POLL_MS * 5);
    await flush();
    assert.equal(service.calls.list, calls);
  } finally { mock.timers.reset(); }
});

test('B5: setVisible(true) twice does not start two timers', async () => {
  mock.timers.enable({ apis: ['setInterval'] });
  try {
    const service = fakeService([ok([NODE])]);
    const vm = new ServersViewModel({ serversModel: new ServersModel(service) });
    vm.setVisible(true);
    vm.setVisible(true);
    await flush();
    mock.timers.tick(SERVER_POLL_MS);
    await flush();
    assert.equal(service.calls.list, 2); // one on open + one tick
    vm.setVisible(false);
  } finally { mock.timers.reset(); }
});

test('a slow system is not asked again until it answers', async () => {
  let release;
  const service = fakeService([ok([NODE])]);
  const slowList = service.list;
  service.list = () => new Promise((r) => { release = () => r(slowList()); });
  const model = new ServersModel(service);
  const first = model.refresh();
  model.refresh();
  model.refresh();
  release();
  await first;
  assert.equal(service.calls.list, 1);
});

test('the same answer twice does not notify the view (no flicker)', async () => {
  const model = new ServersModel(fakeService([ok([NODE]), ok([NODE])]));
  await model.refresh();
  let notified = 0;
  model.store.subscribe(() => { notified += 1; });
  await model.refresh();
  assert.equal(notified, 0);
});

test('B6/B11: "Abrir" shows the choices for that server; picking one opens it and closes the choices', async () => {
  const service = fakeService([ok([NODE])]);
  const vm = new ServersViewModel({ serversModel: new ServersModel(service) });
  vm.toggleOpenMenu(5173);
  assert.equal(vm.store.state.openMenu, 5173);
  vm.toggleOpenMenu(8000);
  assert.equal(vm.store.state.openMenu, 8000); // only one open at a time
  vm.toggleOpenMenu(8000);
  assert.equal(vm.store.state.openMenu, null);
  vm.toggleOpenMenu(5173);
  await vm.open(5173, 'chrome');
  await vm.open(5173);
  assert.deepEqual(service.calls.open, [[5173, 'chrome'], [5173, 'default']]);
  assert.equal(vm.store.state.openMenu, null);
});

test('B11: the installed browsers are asked once, when the view first opens', async () => {
  mock.timers.enable({ apis: ['setInterval'] });
  try {
    const service = fakeService([ok([NODE])]);
    const vm = new ServersViewModel({ serversModel: new ServersModel(service) });
    vm.setVisible(true);
    vm.setVisible(false);
    vm.setVisible(true);
    await flush();
    assert.equal(service.calls.browsers, 1);
    assert.deepEqual(vm.store.state.browsers, [{ id: 'chrome', name: 'Google Chrome' }]);
    vm.setVisible(false);
  } finally { mock.timers.reset(); }
});

test('B12: cancelling the app picker shows no message; a real error does', async () => {
  const cancelled = new ServersViewModel({ serversModel: new ServersModel(fakeService([ok([NODE])], { openReply: { ok: false, code: 'cancelled', error: 'cancelado' } })) });
  await cancelled.open(5173, 'other');
  assert.equal(cancelled.store.state.notice, null);
  const failed = new ServersViewModel({ serversModel: new ServersModel(fakeService([ok([NODE])], { openReply: { ok: false, code: 'launchFailed', error: 'No pude abrir ese navegador.' } })) });
  await failed.open(5173, 'chrome');
  assert.deepEqual(failed.store.state.notice, { tone: 'error', text: 'No pude abrir ese navegador.' });
});

test('B13: stopping a server refreshes the list and says it stopped', async () => {
  const service = fakeService([ok([PY, NODE]), ok([NODE])]);
  const vm = new ServersViewModel({ serversModel: new ServersModel(service) });
  await vm.refresh();
  await vm.stop(8000);
  assert.deepEqual(service.calls.stop, [8000]);
  assert.deepEqual(vm.store.state.servers.map((s) => s.port), [5173]);
  assert.equal(vm.store.state.notice.tone, 'ok');
  assert.match(vm.store.state.notice.text, /8000/);
});

test('B13: saying no in the dialog leaves no message; a refused stop explains why', async () => {
  const no = new ServersViewModel({ serversModel: new ServersModel(fakeService([ok([PY])], { stopReply: { ok: false, code: 'stopRejected', error: 'cancelado' } })) });
  await no.stop(8000);
  assert.equal(no.store.state.notice, null);
  const refused = new ServersViewModel({ serversModel: new ServersModel(fakeService([ok([PY])], { stopReply: { ok: false, code: 'protected', error: 'Ese proceso es Qubbot o del sistema.' } })) });
  await refused.stop(7811);
  assert.deepEqual(refused.store.state.notice, { tone: 'error', text: 'Ese proceso es Qubbot o del sistema.' });
});

test('B13: while a stop is waiting for the dialog, the same server cannot be stopped twice', async () => {
  let answer;
  const service = fakeService([ok([PY])]);
  service.stop = (port) => { service.calls.stop.push(port); return new Promise((r) => { answer = r; }); };
  const vm = new ServersViewModel({ serversModel: new ServersModel(service) });
  const first = vm.stop(8000);
  assert.deepEqual(vm.store.state.busy, [8000]);
  vm.stop(8000);
  vm.pause(8000); // any other action on the same server waits too
  answer({ ok: false, code: 'stopRejected' });
  await first;
  assert.deepEqual(service.calls.stop, [8000]);
  assert.deepEqual(service.calls.pause, []);
  assert.deepEqual(vm.store.state.busy, []);
});

test('B16/B17: pausing and resuming go through the service and refresh the list; paused rows are flagged', async () => {
  const service = fakeService([ok([PY]), ok([{ ...PY, paused: true }]), ok([PY])]);
  const vm = new ServersViewModel({ serversModel: new ServersModel(service) });
  await vm.refresh();
  assert.equal(vm.store.state.servers[0].paused, false);
  await vm.pause(8000);
  assert.deepEqual(service.calls.pause, [8000]);
  assert.equal(vm.store.state.servers[0].paused, true);
  assert.match(vm.store.state.notice.text, /8000/);
  await vm.resume(8000);
  assert.deepEqual(service.calls.resume, [8000]);
  assert.equal(vm.store.state.servers[0].paused, false);
});

const STOPPED_PY = { id: 'a000000000000001', port: 8000, process: 'Python', canRestart: true, state: 'stopped', exitCode: null, hasOutput: false, at: 5 };

test('B18: servers stopped from Qubbot are listed apart; bad rows are dropped', async () => {
  const bad = [{ id: '../x', port: 1 }, { id: 'a000000000000002', port: 'x' }, null];
  const vm = new ServersViewModel({ serversModel: new ServersModel(fakeService([ok([])], { stopped: [...bad, STOPPED_PY] })) });
  await vm.refresh();
  assert.deepEqual(vm.store.state.stopped, [STOPPED_PY]);
});

test('B18: stopping refreshes the stopped list too; reopening and forgetting remove the row', async () => {
  const service = fakeService([ok([PY]), ok([])], { stopped: [] });
  const vm = new ServersViewModel({ serversModel: new ServersModel(service) });
  await vm.refresh();
  const before = service.calls.stopped;
  await vm.stop(8000);
  assert.ok(service.calls.stopped > before);

  const two = fakeService([ok([])], { stopped: [STOPPED_PY, { ...STOPPED_PY, id: 'a000000000000009', port: 3000 }] });
  const vm2 = new ServersViewModel({ serversModel: new ServersModel(two) });
  await vm2.refresh();
  await vm2.restart('a000000000000001');
  assert.deepEqual(two.calls.restart, ['a000000000000001']);
  assert.deepEqual(vm2.store.state.stopped.map((r) => r.port), [3000]);
  await vm2.forget('a000000000000009');
  assert.deepEqual(vm2.store.state.stopped, []);
});

test('the ⋯ menu also opens for a stopped row (by id) and only one menu is open', async () => {
  const vm = new ServersViewModel({ serversModel: new ServersModel(fakeService([ok([PY])])) });
  vm.toggleOpenMenu('a000000000000001');
  assert.equal(vm.store.state.openMenu, 'a000000000000001');
  vm.toggleOpenMenu(8000);
  assert.equal(vm.store.state.openMenu, 8000);
});

test('B10: in the web demo the servers are examples, marked as such, with at least one exposed', async () => {
  const service = createServerService(null);
  assert.equal(service.isDesktop, false);
  const vm = new ServersViewModel({ serversModel: new ServersModel(service) });
  await vm.refresh();
  assert.equal(vm.store.state.demo, true);
  assert.ok(vm.store.state.servers.length > 0);
  assert.ok(vm.store.state.servers.some((s) => s.level === 'yellow'));
  assert.equal((await service.open(3000)).ok, false); // nothing to open in the browser demo
  assert.equal((await service.stop(3000)).ok, false); // nor to stop
  assert.deepEqual((await service.browsers()).data, []);
});

test('the view model counts the exposed servers', async () => {
  const vm = new ServersViewModel({ serversModel: new ServersModel(fakeService([ok([PY, NODE])])) });
  await vm.refresh();
  assert.equal(vm.store.state.exposed, 1);
});

test('B19: rows started by Qubbot are flagged; stopped rows carry their state, exit code and whether there is output', async () => {
  const exited = { ...STOPPED_PY, id: 'a000000000000002', state: 'exited', exitCode: 1, hasOutput: true };
  const weird = { ...STOPPED_PY, id: 'a000000000000003', state: 'hacked', exitCode: 'x', hasOutput: 'yes' };
  const vm = new ServersViewModel({ serversModel: new ServersModel(fakeService([ok([{ ...NODE, managed: true }, PY])], { stopped: [exited, weird] })) });
  await vm.refresh();
  assert.deepEqual(vm.store.state.servers.map((s) => [s.port, s.managed]), [[8000, false], [5173, true]]);
  assert.deepEqual(vm.store.state.stopped[0], exited);
  assert.deepEqual([vm.store.state.stopped[1].state, vm.store.state.stopped[1].exitCode, vm.store.state.stopped[1].hasOutput], ['stopped', null, false]);
});

test('B19: "Ver salida" shows the output of that server and follows it while open; the panel closes on its own ×', async () => {
  mock.timers.enable({ apis: ['setInterval'] });
  try {
    const service = fakeService([ok([{ ...NODE, managed: true }])]);
    const vm = new ServersViewModel({ serversModel: new ServersModel(service) });
    vm.setVisible(true);
    await flush();
    await vm.showOutput(5173);
    assert.deepEqual(vm.store.state.output, { key: 5173, text: 'out 5173 #1' });
    assert.equal(vm.store.state.openMenu, null);
    mock.timers.tick(SERVER_POLL_MS);
    await flush();
    assert.equal(vm.store.state.output.text, 'out 5173 #2');
    await vm.showOutput(5173); // asking again keeps it open (there is no "hide" in the menu)
    assert.equal(vm.store.state.output.key, 5173);
    vm.closeOutput();
    assert.equal(vm.store.state.output, null);
    vm.setVisible(false);
  } finally { mock.timers.reset(); }
});

test('B19: only one output panel is open: showing another server moves it there', async () => {
  const vm = new ServersViewModel({ serversModel: new ServersModel(fakeService([ok([{ ...NODE, managed: true }, { ...PY, managed: true }])])) });
  await vm.showOutput(5173);
  await vm.showOutput(8000);
  assert.equal(vm.store.state.output.key, 8000);
});

test('B19: a server that is starting can be cancelled from its row', async () => {
  const starting = { ...STOPPED_PY, state: 'starting' };
  const service = fakeService([ok([])], { stopped: [starting] });
  const vm = new ServersViewModel({ serversModel: new ServersModel(service) });
  await vm.refresh();
  await vm.cancelStart('a000000000000001');
  assert.deepEqual(service.calls.cancelStart, ['a000000000000001']);
  assert.equal(vm.store.state.stopped[0].state, 'stopped');
});
