import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ComposerViewModel } from '../../renderer/viewmodels/composerViewModel.js';

const tree = [{ path: 'src/api/login.js', type: 'file' }];
const projectModel = { store: { state: { tree } } };
const spec = { objective: 'Cerrar el login', problem: '', scope: ['src/api/login.js'], constraints: [], tasks: [{ do: 'Probar', accept: 'Falla' }], test: { red: 'a', green: 'b', refactor: 'c' } };

function setup({ live = true, answer = JSON.stringify(spec), error = null, tech = false } = {}) {
  const calls = [];
  const connection = { get live() { return live; }, ask: async (prompt, system, opts) => { calls.push({ prompt, system, opts }); return { text: answer, error }; } };
  const vm = new ComposerViewModel({ connection, projectModel, modeModel: { tech } });
  return { vm, calls };
}

test('typing updates the hints and the completions', () => {
  const { vm } = setup();
  vm.setDraft('revisa @log');
  assert.equal(vm.store.state.completions[0].detail, 'src/api/login.js');
  assert.ok(!vm.store.state.hints.some((h) => h.kind === 'noTarget'), 'no "which file?" while one is being completed');
  vm.accept(0);
  assert.equal(vm.store.state.draft, 'revisa `src/api/login.js` ');
  assert.deepEqual(vm.store.state.completions, []);
});

test('improve asks the agent for a spec (refine voice, its own session) and can be undone', async () => {
  const { vm, calls } = setup();
  vm.setDraft('arregla el login');
  await vm.improve();
  assert.equal(calls[0].prompt, 'arregla el login');
  assert.equal(calls[0].opts.session, 'refine');
  assert.deepEqual(calls[0].opts.voice, { mode: 'vibe', purpose: 'refine' });
  assert.match(vm.store.state.draft, /^## Qué quiero\nCerrar el login/);
  assert.equal(vm.store.state.notice, 'agent');
  assert.equal(vm.store.state.improving, false);
  vm.undo();
  assert.equal(vm.store.state.draft, 'arregla el login');
  assert.equal(vm.store.state.notice, null);
});

test('no agent or a bad answer: a local spec, and it says so', async () => {
  const offline = setup({ live: false });
  offline.vm.setDraft('repara el login');
  await offline.vm.improve();
  assert.equal(offline.calls.length, 0);
  assert.equal(offline.vm.store.state.notice, 'local');
  assert.match(offline.vm.store.state.draft, /`src\/api\/login.js`/);

  const bad = setup({ answer: 'no sé', tech: true });
  bad.vm.setDraft('repara el login');
  await bad.vm.improve();
  assert.equal(bad.vm.store.state.notice, 'local');
  assert.match(bad.vm.store.state.draft, /^## Objetivo/);
});

test('an empty box is not improved', async () => {
  const { vm, calls } = setup();
  await vm.improve();
  assert.equal(calls.length, 0);
  assert.equal(vm.store.state.notice, 'empty');
});
