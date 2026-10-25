import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatViewModel } from '../../renderer/viewmodels/chatViewModel.js';
import { createEventBus, EVENTS } from '../../renderer/core/eventBus.js';

const connection = { live: true, agentLabel: 'Claude', store: { state: { selected: 'claude', model: '', effort: 'low' } } };
const worker = (n, extra = {}) => ({ id: `w${n}-abcd`, n, title: `Parte ${n}`, folder: `apps/p${n}`, status: 'working', created: [], changed: [], audit: null, ...extra });
const teamCards = (vm) => vm.store.state.messages.filter((m) => m.card?.kind === 'team');

// A chat question that keeps working until finish() (its card is the one that writes)
function workingChat() {
  const bus = createEventBus();
  let finish;
  let emit;
  const agentModel = { reply: (_t, { onEvent, onText, onStart }) => new Promise((resolve) => { onStart(); emit = onEvent; finish = () => { onText('Listo'); resolve({ text: 'Listo' }); }; }) };
  const vm = new ChatViewModel({ agentModel, bus, connection });
  const sending = vm.send('arregla a.js');
  const run = () => vm.store.state.messages.find((m) => m.run).run;
  return { bus, vm, run, emit: (e) => emit(e), done: async () => { finish(); await sending; } };
}

test('the team is one card that updates in place while it works', () => {
  const vm = new ChatViewModel({ agentModel: { reply: async () => ({ text: '' }) }, bus: createEventBus() });
  const id = vm.upsertTeamCard({ phase: 'working', workers: [worker(1), worker(2)] });
  assert.equal(vm.store.state.welcome, false);
  const again = vm.upsertTeamCard({ phase: 'auditing', workers: [worker(1, { status: 'done', audit: { status: 'checking', notes: [] } }), worker(2)] });
  assert.equal(again, id);
  const cards = teamCards(vm);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].role, 'bot');
  assert.equal(cards[0].card.phase, 'auditing');
  assert.equal(cards[0].card.workers[0].audit.status, 'checking');
});

test('a finished team is history: the next team gets its own card, and "idle" never adds an empty one', () => {
  const vm = new ChatViewModel({ agentModel: { reply: async () => ({ text: '' }) }, bus: createEventBus() });
  const first = vm.upsertTeamCard({ phase: 'working', workers: [worker(1)] });
  vm.upsertTeamCard({ phase: 'done', workers: [worker(1, { status: 'done', audit: { status: 'approved', notes: [] } })] });
  // the team goes back to idle a few seconds later (the mini robots leave): the done card stays as it was
  assert.equal(vm.upsertTeamCard({ phase: 'idle', workers: [] }), null);
  assert.equal(teamCards(vm).length, 1);
  assert.equal(teamCards(vm)[0].card.phase, 'done');
  const second = vm.upsertTeamCard({ phase: 'working', workers: [worker(1), worker(2)] });
  assert.notEqual(second, first);
  assert.equal(teamCards(vm).length, 2);
});

test('a repeated "done" while the finished team lingers updates its card instead of adding a second one', () => {
  const vm = new ChatViewModel({ agentModel: { reply: async () => ({ text: '' }) }, bus: createEventBus() });
  const id = vm.upsertTeamCard({ phase: 'working', workers: [worker(1)] });
  const finished = [worker(1, { status: 'done', audit: { status: 'approved', notes: [] } })];
  assert.equal(vm.upsertTeamCard({ phase: 'done', workers: finished }), id);
  // the workers are rebuilt (map relayout, cancel on the tour) while the mini robots still linger
  assert.equal(vm.upsertTeamCard({ phase: 'done', workers: finished.map((w) => ({ ...w })) }), id);
  assert.equal(teamCards(vm).length, 1);
  assert.equal(vm.upsertTeamCard({ phase: 'idle', workers: [] }), null);
  assert.equal(teamCards(vm)[0].card.phase, 'done');
  assert.notEqual(vm.upsertTeamCard({ phase: 'working', workers: [worker(2)] }), id);
  assert.equal(teamCards(vm).length, 2);
});

test('a team cancelled while working closes its own card (idle) instead of leaving it working', () => {
  const vm = new ChatViewModel({ agentModel: { reply: async () => ({ text: '' }) }, bus: createEventBus() });
  const id = vm.upsertTeamCard({ phase: 'working', workers: [worker(1)] });
  assert.equal(vm.upsertTeamCard({ phase: 'idle', workers: [worker(1, { status: 'cancelled' })] }), id);
  assert.equal(teamCards(vm)[0].card.workers[0].status, 'cancelled');
  vm.upsertTeamCard({ phase: 'working', workers: [worker(1)] });
  assert.equal(teamCards(vm).length, 2);
});

test("a worker's saved change never lands on the chat's working card", async () => {
  const { bus, run, emit, done } = workingChat();
  await new Promise((r) => setTimeout(r, 0));
  const diff = { added: 1, removed: 0, created: true, truncated: false, hunks: [] };
  bus.emit(EVENTS.agentChanged, { path: 'apps/p1/index.js', reason: 'x', diff, worker: 'w1-abcd' });
  assert.equal(run().steps.length, 0, 'the change belongs to the team');
  // a write the chat's own agent is doing on the same path keeps only its own diff
  emit({ type: 'tool', id: 'c1', name: 'write_file', target: 'a.js', parent: null });
  bus.emit(EVENTS.agentChanged, { path: 'a.js', reason: 'x', diff, worker: 'w2-abcd' });
  assert.equal(run().steps[0].diff ?? null, null);
  bus.emit(EVENTS.agentChanged, { path: 'a.js', reason: 'x', diff });
  assert.deepEqual(run().steps[0].diff, diff);
  await done();
});

test("a worker waiting for permission does not mark the chat's card, nor clears its own wait", async () => {
  const { bus, run, emit, done } = workingChat();
  await new Promise((r) => setTimeout(r, 0));
  emit({ type: 'tool', id: 'c1', name: 'write_file', target: 'a.js', parent: null });
  const diff = { added: 1, removed: 0, created: false, truncated: false, hunks: [] };
  bus.emit(EVENTS.agentAwaiting, { path: 'apps/p1/a.js', waiting: true, diff, worker: 'w1-abcd' });
  assert.equal(run().awaiting ?? null, null);
  assert.equal(run().steps[0].proposed ?? null, null);
  bus.emit(EVENTS.agentAwaiting, { path: 'a.js', waiting: true, diff });
  assert.equal(run().awaiting, 'a.js');
  // a worker done waiting on the same path is not the chat's approval
  bus.emit(EVENTS.agentAwaiting, { path: 'a.js', waiting: false, worker: 'w1-abcd' });
  assert.equal(run().awaiting, 'a.js');
  bus.emit(EVENTS.agentAwaiting, { path: 'a.js', waiting: false });
  assert.equal(run().awaiting, null);
  await done();
});
