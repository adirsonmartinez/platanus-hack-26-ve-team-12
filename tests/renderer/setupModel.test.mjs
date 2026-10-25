import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { SetupModel } from '../../renderer/models/setupModel.js';

test('remembers, per project folder, the integrations the welcome set up and still waiting for an account', () => {
  const setup = new SetupModel();
  assert.deepEqual(setup.pendingOf('/a/shop'), []);
  setup.prepare('/a/shop', ['vercel', 'supabase']);
  assert.deepEqual(setup.pendingOf('/a/shop'), ['vercel', 'supabase']);
  assert.deepEqual(setup.pendingOf('/b/shop'), [], 'two folders with the same name do not share it');
});

test('a connected integration stops being pending, and it survives a new model (localStorage)', () => {
  new SetupModel().prepare('/c/app', ['vercel', 'supabase']);
  const setup = new SetupModel();
  setup.markConnected('/c/app', 'vercel');
  assert.deepEqual(new SetupModel().pendingOf('/c/app'), ['supabase']);
});

test('preparing again replaces the list', () => {
  const setup = new SetupModel();
  setup.prepare('/d/app', ['vercel', 'supabase']);
  setup.prepare('/d/app', ['supabase']);
  assert.deepEqual(setup.pendingOf('/d/app'), ['supabase']);
});

test('no folder, nothing to remember', () => {
  const setup = new SetupModel();
  setup.prepare(null, ['vercel']);
  assert.deepEqual(setup.pendingOf(null), []);
});

test('remembers which service project each folder is linked to, and keeps the pending list apart', () => {
  const setup = new SetupModel();
  setup.prepare('/e/app', ['vercel', 'supabase']);
  setup.link('/e/app', 'supabase', { projectId: 'yxkoiradnswnfizcirsc', name: 'app' });
  assert.deepEqual(new SetupModel().linkOf('/e/app', 'supabase'), { projectId: 'yxkoiradnswnfizcirsc', name: 'app' });
  assert.deepEqual(setup.pendingOf('/e/app'), ['vercel', 'supabase'], 'linking does not change what is pending');
  assert.equal(setup.linkOf('/e/app', 'vercel'), null);
  assert.equal(setup.linkOf('/other', 'supabase'), null);
});

test('a list saved by the first version (a plain array) still reads', () => {
  localStorage.setItem('platanus.setup.v1:/f/app', JSON.stringify(['supabase']));
  const setup = new SetupModel();
  assert.deepEqual(setup.pendingOf('/f/app'), ['supabase']);
  setup.link('/f/app', 'supabase', { projectId: 'abcdefghijabcdefghij', name: 'x' });
  assert.deepEqual(setup.pendingOf('/f/app'), ['supabase']);
});
