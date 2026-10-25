import test from 'node:test';
import assert from 'node:assert/strict';
import { ProjectModel } from '../../renderer/models/projectModel.js';
import { createWorkspaceService } from '../../renderer/services/workspaceService.js';

// Fake bridge: only what ProjectModel uses
function fakeWorkspace({ create, onClose = () => {} }) {
  return {
    create: async () => create,
    close: async () => { onClose(); return { ok: true }; },
    tree: async () => ({ ok: true, data: [] }),
    read: async () => ({ ok: false }),
  };
}

test('creating a project opens the new, empty folder', async () => {
  const model = new ProjectModel(fakeWorkspace({ create: { ok: true, data: { name: 'mi-proyecto', root: '/tmp/mi-proyecto' } } }));
  const response = await model.create();
  assert.equal(response.ok, true);
  assert.equal(model.store.state.open, true);
  assert.equal(model.store.state.name, 'mi-proyecto');
  // the full path is kept: the project's memory is keyed by it (main only accepts the open or a recent root)
  assert.equal(model.store.state.root, '/tmp/mi-proyecto');
  assert.deepEqual(model.store.state.tree, []);
});

test('a cancelled or refused creation leaves the current state as it was', async () => {
  const model = new ProjectModel(fakeWorkspace({ create: { ok: false, error: 'cancelado' } }));
  const response = await model.create();
  assert.equal(response.ok, false);
  assert.equal(model.store.state.open, false);
});

test('closing a project empties the state, starts a new session and releases the folder', async () => {
  let released = false;
  const model = new ProjectModel(fakeWorkspace({ create: { ok: true, data: { name: 'mi-proyecto', root: '/tmp/mi-proyecto' } }, onClose: () => { released = true; } }));
  await model.create();
  const { session } = model.store.state;
  await model.close();
  assert.equal(released, true);
  assert.equal(model.store.state.open, false);
  assert.equal(model.store.state.name, null);
  assert.equal(model.store.state.root, null);
  assert.deepEqual(model.store.state.tree, []);
  assert.equal(model.store.state.session, session + 1);
});

test('closing when nothing is open does nothing', async () => {
  let released = false;
  const model = new ProjectModel(fakeWorkspace({ create: null, onClose: () => { released = true; } }));
  await model.close();
  assert.equal(released, false);
  assert.equal(model.store.state.session, 0);
});

test('browser demo: a new project is empty and has no git, opening one shows the demo again', async () => {
  const ws = createWorkspaceService(null);
  assert.equal((await ws.create()).ok, true);
  assert.deepEqual((await ws.tree()).data, []);
  assert.equal((await ws.gitHistory()).data.isRepo, false);
  await ws.choose();
  assert.ok((await ws.tree()).data.length > 0);
  assert.equal((await ws.gitHistory()).data.isRepo, true);
});

// A project on disk: a tree and the text of some files
function diskWorkspace(name, tree, files = {}) {
  return {
    choose: async () => ({ ok: true, data: { name, root: `/tmp/${name}` } }),
    tree: async () => ({ ok: true, data: tree }),
    read: async (path) => (path in files ? { ok: true, data: files[path] } : { ok: false }),
  };
}
const f = (path) => ({ type: 'file', path });
const d = (path, children = []) => ({ type: 'dir', path, children });

test('integrations are detected from the project files', async () => {
  const model = new ProjectModel(diskWorkspace('tienda', [f('vercel.json'), f('package.json'), d('.github', [f('.github/ci.yml')])], {
    'package.json': JSON.stringify({ dependencies: { '@clerk/nextjs': '5', 'posthog-js': '1' } }),
  }));
  await model.choose();
  assert.deepEqual(model.store.state.integrations, ['vercel', 'github', 'clerk', 'posthog']);
  assert.equal(model.store.state.usesSupabase, false);
  // What the files show is connected
  assert.deepEqual(model.store.state.integrationStatus, { vercel: 'connected', github: 'connected', clerk: 'connected', posthog: 'connected' });
});

test('a project without any shows no integrations', async () => {
  const model = new ProjectModel(diskWorkspace('notas', [f('README.md')]));
  await model.choose();
  assert.deepEqual(model.store.state.integrations, []);
});

// The desktop app asks main which services the project uses and whether the agent can work with them
// (window.platanus.services.detect(), docs/features/servicios/README.md)
const detected = (data, calls = []) => ({ detect: async () => { calls.push('detect'); return { ok: true, data }; } });

test('desktop: integrations come from main, in its order, and "unknown" stays unknown (never shown as disconnected)', async () => {
  const services = detected([
    { key: 'supabase', name: 'Supabase', state: 'connected', via: ['mcp:claude'], evidence: ['package.json: @supabase/supabase-js'] },
    { key: 'stripe', name: 'Stripe', state: 'disconnected', via: [], evidence: ['package.json: stripe'] },
    { key: 'sentry', name: 'Sentry', state: 'unknown', via: [], evidence: ['.env.example: SENTRY_DSN'] },
  ]);
  const model = new ProjectModel(diskWorkspace('tienda', [f('vercel.json')]), { services });
  await model.choose();
  const s = model.store.state;
  // what main says wins over the files (vercel.json alone is not reported here)
  assert.deepEqual(s.integrations, ['supabase', 'stripe', 'sentry']);
  assert.deepEqual(s.integrationStatus, { supabase: 'connected', stripe: 'disconnected', sentry: 'unknown' });
  assert.equal(s.usesSupabase, true);
  // the full list (names, how it is connected, where it was found) stays for servicesViewModel
  assert.deepEqual(s.services.map((x) => [x.key, x.name, x.state]), [['supabase', 'Supabase', 'connected'], ['stripe', 'Stripe', 'disconnected'], ['sentry', 'Sentry', 'unknown']]);
  assert.deepEqual(s.services[1].evidence, ['package.json: stripe']);
});

test('desktop: if main cannot tell, the files decide as before', async () => {
  const failing = { detect: async () => ({ ok: false, error: 'boom' }) };
  const model = new ProjectModel(diskWorkspace('tienda', [f('vercel.json')]), { services: failing });
  await model.choose();
  assert.deepEqual(model.store.state.integrations, ['vercel']);
  assert.deepEqual(model.store.state.integrationStatus, { vercel: 'connected' });
  const throwing = { detect: async () => { throw new Error('no ipc'); } };
  const again = new ProjectModel(diskWorkspace('tienda', [f('vercel.json')]), { services: throwing });
  await again.choose();
  assert.deepEqual(again.store.state.integrations, ['vercel']);
  assert.deepEqual(again.store.state.services.map((x) => [x.key, x.state]), [['vercel', 'connected']]);
});

test('desktop: entries main sends malformed are ignored', async () => {
  const services = detected([null, { key: '' }, { key: 'stripe', state: 'weird' }, { key: 'github', name: 'GitHub', state: 'connected' }]);
  const model = new ProjectModel(diskWorkspace('tienda', []), { services });
  await model.choose();
  assert.deepEqual(model.store.state.integrations, ['stripe', 'github']);
  // a state main should never send is treated as "could not check"
  assert.equal(model.store.state.services[0].state, 'unknown');
  assert.equal(model.store.state.integrationStatus.stripe, 'unknown', 'a state main should never send is "could not check"');
});

test('on the desktop a folder named like the demo is a real project: its services are detected, never invented', async () => {
  const calls = [];
  const model = new ProjectModel(diskWorkspace('Qubbot', [f('README.md')]), { services: detected([{ key: 'github', name: 'GitHub', state: 'connected' }], calls) });
  await model.choose();
  assert.deepEqual(model.store.state.integrations, ['github']);
  assert.equal(calls.length, 1, 'main was asked');
});

test('closing a project empties its services', async () => {
  const services = detected([{ key: 'stripe', name: 'Stripe', state: 'disconnected' }]);
  const model = new ProjectModel({ ...diskWorkspace('tienda', []), close: async () => ({ ok: true }) }, { services });
  await model.choose();
  await model.close();
  assert.deepEqual(model.store.state.services, []);
  assert.deepEqual(model.store.state.integrations, []);
});

test('demo: the Qubbot project shows all the demo integrations, Supabase included', async () => {
  const model = new ProjectModel(diskWorkspace('Qubbot', [f('README.md')]));
  await model.choose();
  assert.deepEqual(model.store.state.integrations, ['supabase', 'vercel', 'github', 'clerk', 'posthog']);
  assert.equal(model.store.state.usesSupabase, true);
  // The demo shows every state: connected, with an incident, disconnected
  const status = model.store.state.integrationStatus;
  assert.equal(status.vercel, 'connected');
  assert.equal(status.clerk, 'incident');
  assert.equal(status.posthog, 'disconnected');
});
