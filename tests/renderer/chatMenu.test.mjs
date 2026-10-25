import test from 'node:test';
import assert from 'node:assert/strict';
import { chatMenuItems } from '../../renderer/viewmodels/chatMenu.js';

const calls = [];
const actions = new Proxy({}, { get: (_t, name) => (...args) => calls.push([name, ...args]) });
const ctx = (info, extra = {}) => ({ actions, modeModel: { tech: false, toggle: () => calls.push(['toggle']) }, chatViewModel: { newChat: () => calls.push(['newChat']) }, info: () => info, ...extra });
const base = { agent: { id: 'claude', name: 'Claude' }, working: false, worst: { path: 'tests/secrets.test.mjs', level: 'red' }, counts: { red: 1, yellow: 2 }, pending: 2 };

test('the floating button opens with a header that says who answers and how the project is', () => {
  const [head] = chatMenuItems(ctx(base, { openChat: () => calls.push(['open']) }));
  assert.equal(head.kind, 'header');
  assert.equal(head.title, 'Claude');
  assert.equal(head.detail, '1 en riesgo · 2 por revisar');
  head.run();
  assert.deepEqual(calls.at(-1), ['open']);
  const [working] = chatMenuItems(ctx({ ...base, working: true }, { openChat: () => {} }));
  assert.equal(working.detail, 'Trabajando…');
  assert.equal(working.working, true);
  const [clean] = chatMenuItems(ctx({ ...base, worst: null, counts: { red: 0, yellow: 0 } }, { openChat: () => {} }));
  assert.equal(clean.detail, 'Todo en verde');
});

test('repair names the worst file, and only shows when there is one; repairs show what is pending', () => {
  const tiles = chatMenuItems(ctx(base)).filter((i) => i.kind === 'tile');
  const repair = tiles.find((t) => t.id === 'repair');
  assert.equal(repair.label, 'Reparar secrets.test.mjs');
  assert.equal(repair.accent, 'red');
  assert.equal(tiles.find((t) => t.id === 'history').badge, 2);
  assert.ok(!chatMenuItems(ctx({ ...base, worst: null })).some((i) => i.id === 'repair'));
  assert.equal(chatMenuItems(ctx({ ...base, pending: 0 })).find((i) => i.id === 'history').badge, 0);
});

test('the "+" menu has no header; connecting and the Vibe / Dev switch are at the foot', () => {
  const items = chatMenuItems(ctx(base));
  assert.ok(!items.some((i) => i.kind === 'header'));
  const foot = items.filter((i) => i.kind === 'foot');
  assert.deepEqual(foot.map((i) => i.id), ['connect', 'mode']);
  foot[1].run();
  assert.deepEqual(calls.at(-1), ['toggle']);
});

test('"Recorrido" is offered when a project with files is open', () => {
  const has = (info) => chatMenuItems(ctx({ ...base, ...info })).some((i) => i.id === 'tour');
  assert.equal(has({ projectOpen: true, empty: false }), true);
  assert.equal(has({ projectOpen: true, empty: true }), false);
  assert.equal(has({ projectOpen: false }), false);
  chatMenuItems(ctx({ ...base, projectOpen: true })).find((i) => i.id === 'tour').run();
  assert.deepEqual(calls.at(-1), ['startTour']);
});

test('with a project open on the desktop, the foot offers to trust the folder, or to stop trusting it', () => {
  const untrusted = chatMenuItems(ctx({ ...base, projectOpen: true, trust: false })).find((i) => i.id === 'trust');
  assert.equal(untrusted.label, 'Confiar en esta carpeta');
  untrusted.run();
  assert.deepEqual(calls.at(-1), ['trustFolder']);
  const trusted = chatMenuItems(ctx({ ...base, projectOpen: true, trust: true })).find((i) => i.id === 'trust');
  assert.equal(trusted.label, 'Dejar de confiar en esta carpeta');
  trusted.run();
  assert.deepEqual(calls.at(-1), ['untrustFolder']);
  assert.ok(!chatMenuItems(ctx({ ...base, projectOpen: true })).some((i) => i.id === 'trust'), 'the web demo has nothing to trust');
});
