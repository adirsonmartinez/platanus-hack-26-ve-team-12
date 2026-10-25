import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { Observable } from '../../renderer/core/observable.js';
import { createEventBus } from '../../renderer/core/eventBus.js';
import { SupabaseModel } from '../../renderer/models/supabaseModel.js';
import { SupabaseViewModel } from '../../renderer/viewmodels/supabaseViewModel.js';

function setup(project) {
  const projectModel = { store: new Observable({ open: false, usesSupabase: false, session: 0, demo: false }) };
  const supabaseModel = new SupabaseModel();
  const camera = { saveView: () => ({}), flyTo() {} };
  new SupabaseViewModel({ supabaseModel, projectModel, camera, bus: createEventBus() });
  projectModel.store.set({ open: true, usesSupabase: true, session: 1, ...project });
  return { supabaseModel };
}

test('the demo project shows the RLS vulnerability a few seconds after opening', () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  try {
    const { supabaseModel } = setup({ demo: true });
    mock.timers.tick(6000);
    assert.equal(supabaseModel.store.state.vulnerable, true);
  } finally { mock.timers.reset(); }
});

test('a real project connected to Supabase never shows the demo vulnerability', () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  try {
    const { supabaseModel } = setup({ demo: false });
    mock.timers.tick(60000);
    assert.equal(supabaseModel.store.state.vulnerable, false);
  } finally { mock.timers.reset(); }
});
