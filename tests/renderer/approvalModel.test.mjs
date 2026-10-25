import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ApprovalModel } from '../../renderer/models/approvalModel.js';

const service = (answer = (mode) => ({ ok: true, data: mode })) => {
  const calls = [];
  return { calls, setApproval: async (mode) => { calls.push(mode); return answer(mode); } };
};

test('starts in manual and tells the app the saved mode (auto is remembered)', async () => {
  localStorage.removeItem('platanus.approval.v1');
  const svc = service();
  const m = new ApprovalModel(svc);
  assert.equal(m.store.state.mode, 'manual');
  await m.set('auto');
  assert.equal(m.store.state.mode, 'auto');
  const again = new ApprovalModel(service());
  await again.init();
  assert.equal(again.store.state.mode, 'auto');
});

test('bypass is never remembered: the next start is manual again', async () => {
  localStorage.removeItem('platanus.approval.v1');
  const m = new ApprovalModel(service());
  await m.set('bypass');
  assert.equal(m.store.state.mode, 'bypass');
  const next = new ApprovalModel(service());
  await next.init();
  assert.equal(next.store.state.mode, 'manual');
});

test('a cancelled confirmation keeps the previous mode; unknown modes are ignored', async () => {
  localStorage.removeItem('platanus.approval.v1');
  const m = new ApprovalModel(service((mode) => (mode === 'bypass' ? { ok: false, error: 'cancelled', data: 'manual' } : { ok: true, data: mode })));
  await m.set('bypass');
  assert.equal(m.store.state.mode, 'manual');
  await m.set('yolo');
  assert.equal(m.store.state.mode, 'manual');
});

test('on start the app always tells the main process the mode (a reload never leaves "Sin preguntar" behind)', async () => {
  localStorage.removeItem('platanus.approval.v1');
  const svc = service();
  const m = new ApprovalModel(svc);
  await m.init();
  assert.deepEqual(svc.calls, ['manual']);
});
