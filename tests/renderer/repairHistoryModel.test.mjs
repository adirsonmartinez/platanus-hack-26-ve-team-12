import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { RepairHistoryModel } from '../../renderer/models/repairHistoryModel.js';

test('entries persist per project, newest first', () => {
  const h = new RepairHistoryModel();
  h.load('alpha');
  const a = h.add({ path: 'a.js', status: 'working' });
  const b = h.add({ path: 'b.js', status: 'working' });
  h.update(a, { status: 'planned' });
  assert.deepEqual(h.store.state.entries.map((e) => e.id), [b, a]);

  const again = new RepairHistoryModel();
  again.load('alpha');
  assert.equal(again.get(a).status, 'planned');
  again.load('beta');
  assert.equal(again.store.state.entries.length, 0);
});

test('a job cut by closing the app comes back as failed, and ids keep growing', () => {
  const h = new RepairHistoryModel();
  h.load('gamma');
  const id = h.add({ path: 'x.js', status: 'working' });
  const reopened = new RepairHistoryModel();
  reopened.load('gamma');
  assert.equal(reopened.get(id).status, 'failed');
  assert.ok(reopened.add({ path: 'y.js', status: 'working' }) > id);
});

test('clearFinished keeps only running jobs', () => {
  const h = new RepairHistoryModel();
  h.load('delta');
  h.add({ path: 'done.js', status: 'verified' });
  h.add({ path: 'run.js', status: 'working' });
  h.clearFinished();
  assert.deepEqual(h.store.state.entries.map((e) => e.path), ['run.js']);
});

test('an interrupted job is flagged (the view translates it), not given an English message', () => {
  const h = new RepairHistoryModel();
  h.load('eps');
  const id = h.add({ path: 'x.js', status: 'working' });
  const again = new RepairHistoryModel();
  again.load('eps');
  assert.equal(again.get(id).interrupted, true);
  assert.equal(again.get(id).error, '');
});
