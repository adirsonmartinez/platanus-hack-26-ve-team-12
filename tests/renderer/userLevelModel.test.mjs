import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { UserLevelModel, textSignal } from '../../renderer/models/userLevelModel.js';

const fresh = () => { localStorage.clear(); return new UserLevelModel(); };

test('a new person has no confirmed level yet (the robot asks)', () => {
  const m = fresh();
  assert.equal(m.store.state.level, 'new');
  assert.equal(m.store.state.confirmed, false);
});

test('the chosen level is remembered between sessions', () => {
  const m = fresh();
  m.set('pro');
  const again = new UserLevelModel();
  assert.equal(again.store.state.level, 'pro');
  assert.equal(again.store.state.confirmed, true);
});

test('what the person writes says something about their level', () => {
  assert.equal(textSignal('no entiendo, ¿qué significa eso?'), -1);
  assert.equal(textSignal('haz el deploy y revisa la api y el schema'), 1);
  assert.equal(textSignal('quiero una tienda bonita'), 0);
  assert.equal(textSignal('commit'), 0, 'a single technical word is not enough');
});

test('enough signals in one direction suggest a change, never apply it by themselves', () => {
  const m = fresh();
  m.set('new');
  for (let i = 0; i < 3; i++) m.signal(1);
  assert.equal(m.store.state.suggestion, 'some');
  assert.equal(m.store.state.level, 'new');
  m.accept();
  assert.equal(m.store.state.level, 'some');
  assert.equal(m.store.state.suggestion, null);
});

test('a declined suggestion waits for twice the evidence before asking again', () => {
  const m = fresh();
  m.set('pro');
  for (let i = 0; i < 3; i++) m.signal(-1);
  assert.equal(m.store.state.suggestion, 'some');
  m.decline();
  assert.equal(m.store.state.level, 'pro');
  for (let i = 0; i < 5; i++) m.signal(-1);
  assert.equal(m.store.state.suggestion, null);
  m.signal(-1);
  assert.equal(m.store.state.suggestion, 'some');
});

test('there is nowhere to go below beginner or above developer', () => {
  const m = fresh();
  m.set('new');
  for (let i = 0; i < 10; i++) m.signal(-1);
  assert.equal(m.store.state.suggestion, null);
  m.set('pro');
  for (let i = 0; i < 10; i++) m.signal(1);
  assert.equal(m.store.state.suggestion, null);
});

test('signals toward a level that does not exist are not stored (they never delay the other way)', () => {
  const m = fresh();
  m.set('new');
  for (let i = 0; i < 10; i++) m.signal(-1);
  for (let i = 0; i < 3; i++) m.signal(1);
  assert.equal(m.store.state.suggestion, 'some');
});

test('switching the app to Dev or Vibe moves the level with it', () => {
  const m = fresh();
  m.followMode('tech');
  assert.equal(m.store.state.level, 'pro');
  m.followMode('vibe');
  assert.equal(m.store.state.level, 'some');
  m.set('new');
  m.followMode('vibe');
  assert.equal(m.store.state.level, 'new', 'already a Vibe level: unchanged');
});
