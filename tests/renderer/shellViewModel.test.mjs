import test from 'node:test';
import assert from 'node:assert/strict';
import { Observable } from '../../renderer/core/observable.js';
import { SecurityModel } from '../../renderer/models/securityModel.js';
import { ShellViewModel } from '../../renderer/viewmodels/shellViewModel.js';

const setup = () => new ShellViewModel({
  projectModel: { store: new Observable({ open: true, name: 'x', tree: [] }), recent: async () => [] },
  securityModel: new SecurityModel(),
  mapViewModel: { store: new Observable({}) },
});

test('a click on the map opens the Supabase panel and keeps it open (it never toggles it closed)', () => {
  const vm = setup();
  vm.showSide('supabase');
  assert.deepEqual([vm.store.state.side, vm.store.state.sidebarOpen], ['supabase', true]);
  vm.showSide('supabase');
  assert.equal(vm.store.state.sidebarOpen, true);
  vm.showSide('nope');
  assert.equal(vm.store.state.side, 'supabase');
});

test('the dock still toggles: the active view clicked again folds the sidebar', () => {
  const vm = setup();
  vm.setSide('risks');
  vm.setSide('risks');
  assert.equal(vm.store.state.sidebarOpen, false);
});
