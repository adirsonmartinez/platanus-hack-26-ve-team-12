import test from 'node:test';
import assert from 'node:assert/strict';
import { Observable } from '../../renderer/core/observable.js';
import { DatabaseViewModel } from '../../renderer/viewmodels/databaseViewModel.js';

const STATS = {
  project: { id: 'abcdefghijabcdefghij', name: 'mi-tienda', status: 'ACTIVE_HEALTHY', region: 'sa-east-1', postgres: '17.6', createdAt: '2026-10-24' },
  plan: 'free', limitBytes: 500 * 1024 ** 2, tables: 3, rows: 1250, bytes: 9 * 1024 ** 2,
  top: [{ name: 'orders', rows: 1000, bytes: 65536 }],
};

function setup({ demo = false, link = { projectId: 'abcdefghijabcdefghij', name: 'mi-tienda' }, stats = { ok: true, data: STATS }, fromEnv = null } = {}) {
  const calls = [];
  const saved = [];
  const service = {
    linked: async () => { calls.push(['linked']); return { ok: true, data: fromEnv }; },
    stats: async (id) => { calls.push(['stats', id]); return stats; },
    dashboard: async (id) => { calls.push(['dashboard', id]); return { ok: true }; },
  };
  const projectModel = { store: new Observable({ open: true, root: '/p/mi-tienda', demo, session: 1 }) };
  const setupModel = {
    linkOf: (root, key) => (root === '/p/mi-tienda' && key === 'supabase' ? link : null),
    link: (root, key, value) => { saved.push([root, key, value]); link = value; },
  };
  const supabaseModel = { tables: [{ name: 'users', columns: [] }, { name: 'orders', columns: [] }] };
  const vm = new DatabaseViewModel({ service, projectModel, setupModel, supabaseModel, onConnect: () => calls.push(['connect']) });
  return { vm, calls, saved, projectModel, state: () => vm.store.state };
}

test('a linked project: loads its numbers (tables, rows, size against what the plan includes)', async () => {
  const { vm, calls, state } = setup();
  const loading = vm.load();
  assert.equal(state().status, 'loading');
  await loading;
  assert.deepEqual(calls, [['stats', 'abcdefghijabcdefghij']]);
  assert.equal(state().status, 'ready');
  assert.equal(state().tables, 3);
  assert.equal(state().rows, 1250);
  assert.equal(state().project.region, 'sa-east-1');
  assert.ok(Math.abs(vm.usage() - (9 / 500)) < 1e-9, 'share of the plan used');
});

test('the demo project shows example numbers, marked as such, without calling Supabase', async () => {
  const { vm, calls, state } = setup({ demo: true });
  await vm.load();
  assert.deepEqual(calls, []);
  assert.equal(state().status, 'ready');
  assert.equal(state().demo, true);
  assert.equal(state().tables, 2);
  assert.ok(state().rows > 0 && state().bytes > 0);
  assert.ok(state().top.every((t) => t.rows > 0 && t.bytes > 0), 'never negative, however many example tables');
});

test('Supabase found in the files but no project known anywhere: offers to connect', async () => {
  const { vm, calls, state } = setup({ link: null });
  await vm.load();
  assert.equal(state().status, 'unlinked');
  vm.connect();
  assert.deepEqual(calls, [['linked'], ['connect']]);
});

test('no link saved but the env files name the project: it is linked from there and loads', async () => {
  const { vm, calls, saved, state } = setup({ link: null, fromEnv: { projectId: 'abcdefghijabcdefghij' } });
  await vm.load();
  assert.deepEqual(saved, [['/p/mi-tienda', 'supabase', { projectId: 'abcdefghijabcdefghij', name: '' }]]);
  assert.deepEqual(calls, [['linked'], ['stats', 'abcdefghijabcdefghij']]);
  assert.equal(state().status, 'ready');
});

test('signed out (or another error): says so and can retry', async () => {
  const out = setup({ stats: { ok: false, error: 'signed-out' } });
  await out.vm.load();
  assert.equal(out.state().status, 'signedOut');
  const failed = setup({ stats: { ok: false, error: 'timeout' } });
  await failed.vm.load();
  assert.equal(failed.state().status, 'error');
  assert.equal(failed.state().error, 'timeout');
});

test('opening the dashboard names the linked project; another project resets the panel', async () => {
  const { vm, calls, state, projectModel } = setup();
  await vm.load();
  vm.openDashboard();
  assert.deepEqual(calls.at(-1), ['dashboard', 'abcdefghijabcdefghij']);
  projectModel.store.set({ session: 2, root: '/q/otro' });
  assert.equal(state().status, 'idle');
});

test('no plan limit known: no usage share', async () => {
  const { vm } = setup({ stats: { ok: true, data: { ...STATS, plan: 'enterprise', limitBytes: null } } });
  await vm.load();
  assert.equal(vm.usage(), null);
});
