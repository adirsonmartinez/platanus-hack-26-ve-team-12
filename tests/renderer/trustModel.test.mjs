import test from 'node:test';
import assert from 'node:assert/strict';
import { Observable } from '../../renderer/core/observable.js';
import { TrustModel } from '../../renderer/models/trustModel.js';

// Fake bridge: trust(ask) answers what the person would pick in the native dialog
function setup({ answer = true, already = false, desktop = true } = {}) {
  const asked = [];
  let trusted = already;
  const workspace = {
    isDesktop: desktop,
    trust: async (ask) => { asked.push(ask); if (ask && !trusted) trusted = answer; return { ok: true, data: trusted }; },
    untrust: async () => { trusted = false; return { ok: true, data: false }; },
  };
  const projectModel = { store: new Observable({ open: false, session: 0 }) };
  const model = new TrustModel({ workspace, projectModel });
  const open = (session) => projectModel.store.set({ open: true, session });
  return { model, asked, open, projectModel };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

test('each time a project opens (created or existing), the person is asked whether they trust the folder', async () => {
  const { model, asked, open } = setup({ answer: true });
  open(1);
  await settle();
  assert.deepEqual(asked, [true]);
  assert.equal(model.store.state.trusted, true);
});

test('saying no keeps it untrusted; a folder already trusted answers without a dialog (main decides)', async () => {
  const no = setup({ answer: false });
  no.open(1);
  await settle();
  assert.equal(no.model.store.state.trusted, false);
  const yes = setup({ already: true });
  yes.open(1);
  await settle();
  assert.equal(yes.model.store.state.trusted, true);
});

test('it can be revoked, or asked again later; closing the project forgets it', async () => {
  const { model, open, projectModel } = setup({ answer: true });
  open(1);
  await settle();
  await model.revoke();
  assert.equal(model.store.state.trusted, false);
  await model.ask();
  assert.equal(model.store.state.trusted, true);
  projectModel.store.set({ open: false, session: 2 });
  assert.equal(model.store.state.trusted, false);
});

test('the browser demo never asks (it does not write to disk)', async () => {
  const { model, asked, open } = setup({ desktop: false });
  open(1);
  await settle();
  assert.deepEqual(asked, []);
  assert.equal(model.store.state.available, false);
});
