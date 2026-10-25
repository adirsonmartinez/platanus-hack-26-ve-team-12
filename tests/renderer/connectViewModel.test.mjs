import test from 'node:test';
import assert from 'node:assert/strict';
import { ConnectViewModel } from '../../renderer/viewmodels/connectViewModel.js';

const ORGS = [{ id: 'o1', name: 'Ana' }, { id: 'o2', name: 'Feria' }];
const PROJECTS = [
  { id: 'p1', name: 'tienda-vieja', organizationId: 'o1', status: 'ACTIVE_HEALTHY' },
  { id: 'p2', name: 'pausado', organizationId: 'o1', status: 'INACTIVE' },
  { id: 'p3', name: 'otra', organizationId: 'o2', status: 'ACTIVE_HEALTHY' },
];

// Fake bridge: start() signs in and lists; connect() answers like main
function setup({ start = { ok: true, data: { organizations: ORGS, projects: PROJECTS, suggested: 'mi-tienda' } }, connect = { ok: true, data: { name: 'mi-tienda', envFile: '.env.local' } } } = {}) {
  const calls = [];
  let progress = null;
  const service = {
    available: true,
    start: async () => { calls.push(['start']); return start; },
    connect: async (choice) => { calls.push(['connect', choice]); progress?.({ stage: 'starting' }); return connect; },
    onProgress: (cb) => { progress = cb; return () => {}; },
  };
  const connected = [];
  const vm = new ConnectViewModel({ service, onConnected: (key, result) => connected.push([key, result]) });
  return { vm, calls, connected, state: () => vm.store.state };
}

test('opening shows what Supabase is for and a single "sign in" step', () => {
  const { vm, state } = setup();
  vm.open('supabase');
  assert.equal(state().open, true);
  assert.equal(state().service, 'supabase');
  assert.equal(state().step, 'intro');
});

test('signing in lists the organizations; a new project in the first one is the default', async () => {
  const { vm, state, calls } = setup();
  vm.open('supabase');
  const signing = vm.signIn();
  assert.equal(state().step, 'signing');
  await signing;
  assert.deepEqual(calls, [['start']]);
  assert.equal(state().step, 'choose');
  assert.equal(state().mode, 'new');
  assert.equal(state().organizationId, 'o1');
  assert.equal(state().suggested, 'mi-tienda');
});

test('"use one I have": only the live projects of the chosen organization', async () => {
  const { vm, state } = setup();
  vm.open('supabase');
  await vm.signIn();
  vm.pickMode('existing');
  assert.deepEqual(vm.projectsShown().map((p) => p.id), ['p1']);
  assert.equal(state().projectId, 'p1');
  vm.pickOrganization('o2');
  assert.deepEqual(vm.projectsShown().map((p) => p.id), ['p3']);
  assert.equal(state().projectId, 'p3');
});

test('connecting sends only the pick; the progress shows; when it is done the map is told', async () => {
  const { vm, state, calls, connected } = setup();
  vm.open('supabase');
  await vm.signIn();
  await vm.connect();
  assert.deepEqual(calls.at(-1), ['connect', { mode: 'new', organizationId: 'o1' }]);
  assert.equal(state().step, 'done');
  assert.deepEqual(connected, [['supabase', { name: 'mi-tienda', envFile: '.env.local' }]]);
});

test('an existing project goes by its id', async () => {
  const { vm, calls } = setup();
  vm.open('supabase');
  await vm.signIn();
  vm.pickMode('existing');
  await vm.connect();
  assert.deepEqual(calls.at(-1), ['connect', { mode: 'existing', projectId: 'p1' }]);
});

test('cancelling the native dialog goes back to the choice; an error shows it and can be retried', async () => {
  const cancelled = setup({ connect: { ok: false, cancelled: true } });
  cancelled.vm.open('supabase');
  await cancelled.vm.signIn();
  await cancelled.vm.connect();
  assert.equal(cancelled.state().step, 'choose');
  const failed = setup({ start: { ok: false, error: 'No se pudo iniciar sesión en Supabase.' } });
  failed.vm.open('supabase');
  await failed.vm.signIn();
  assert.equal(failed.state().step, 'error');
  assert.match(failed.state().error, /iniciar sesión/);
});

test('with no organization yet, it says so instead of offering an empty choice', async () => {
  const { vm, state } = setup({ start: { ok: true, data: { organizations: [], projects: [], suggested: 'x' } } });
  vm.open('supabase');
  await vm.signIn();
  assert.equal(state().step, 'error');
  assert.equal(state().errorKey, 'noOrganization');
});

test('closing resets it', async () => {
  const { vm, state } = setup();
  vm.open('supabase');
  await vm.signIn();
  vm.close();
  assert.equal(state().open, false);
  assert.equal(state().step, 'intro');
});
