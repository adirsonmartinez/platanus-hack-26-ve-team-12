import './setup.mjs';
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { RobotDialogViewModel } from '../../renderer/viewmodels/robotDialogViewModel.js';
import { SecurityModel } from '../../renderer/models/securityModel.js';
import { Observable } from '../../renderer/core/observable.js';

const file = (path) => ({ type: 'file', path, size: 10 });

function setup({ agentLive = true } = {}) {
  const mapViewModel = { store: new Observable({ status: 'ready', session: 1, welcome: false }) };
  const projectModel = { store: new Observable({ tree: [] }) };
  const securityModel = new SecurityModel();
  const calls = [];
  const touched = [];
  const actions = {
    // true: the request went to an agent; false: no agent yet, it waits until the person picks one
    askAgent: (prompt) => { calls.push(['askAgent', prompt]); return agentLive; },
    openChat: () => calls.push(['openChat']),
    repair: (path) => calls.push(['repair', path]),
    locate: (path) => calls.push(['locate', path]),
    saveProgress: () => calls.push(['saveProgress']),
    devMode: () => calls.push(['devMode']),
    prepareSetup: (integrations) => calls.push(['prepareSetup', integrations]),
    welcomeTouched: (id) => touched.push(id), // the person answered with a tap (not Qubi by voice)
  };
  const vm = new RobotDialogViewModel({ mapViewModel, projectModel, securityModel, actions });
  const welcome = () => mapViewModel.store.set({ welcome: true });
  const setTree = (paths) => projectModel.store.set({ tree: paths.map(file) });
  const bubble = () => vm.store.state.bubble;
  const pressLabel = (text) => {
    const button = bubble().buttons.find((b) => b.label.includes(text));
    assert.ok(button, `no button "${text}" in ${bubble().buttons.map((b) => b.label)}`);
    vm.press(button.id);
  };
  return { vm, mapViewModel, securityModel, calls, touched, welcome, setTree, bubble, pressLabel };
}

test('stays off until a new, empty project opens, then asks about experience first', () => {
  const { vm, welcome, bubble } = setup();
  assert.equal(vm.store.state.phase, 'off');
  welcome();
  assert.equal(vm.store.state.phase, 'interview');
  assert.equal(bubble().id, 'q:experience');
  assert.match(bubble().text, /experiencia/);
  assert.deepEqual(bubble().progress, { step: 1, of: 2 });
  assert.equal(bubble().canBack, false);
  assert.ok(bubble().buttons.some((b) => b.id === 'exp:beginner'));
  assert.ok(bubble().buttons.some((b) => b.id === 'exp:dev'));
});

test('"I already code": the robot says goodbye, then steps aside, opens the chat and switches to Dev', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { vm, welcome, bubble, calls, mapViewModel } = setup();
    welcome();
    vm.press('exp:dev');
    assert.equal(bubble().id, 'farewell');
    assert.deepEqual(bubble().buttons, []);
    assert.deepEqual(calls, [['devMode'], ['openChat']]);
    mock.timers.tick(5000);
    assert.equal(vm.store.state.phase, 'off');
    // The map is still a new project: the interview does not come back on its next change
    mapViewModel.store.set({ welcome: true, version: 2 });
    assert.equal(vm.store.state.phase, 'off');
  } finally {
    mock.timers.reset();
  }
});

test('"I am starting": the technology cards, with logos, all chosen and Next.js as the fixed base', () => {
  const { vm, welcome, bubble } = setup();
  welcome();
  vm.press('exp:beginner');
  assert.equal(bubble().kind, 'stack');
  assert.deepEqual(bubble().progress, { step: 2, of: 2 });
  assert.deepEqual(bubble().cards.map((c) => [c.id, c.logo, c.chosen, c.locked]), [
    ['nextjs', 'nextjs', true, true], ['vercel', 'vercel', true, false], ['supabase', 'supabase', true, false],
  ]);
  assert.ok(bubble().cards.every((c) => c.name && c.text));
  assert.deepEqual(bubble().answers, ['🌱 Estoy empezando']);
  assert.equal(bubble().canBack, true);
  assert.equal(bubble().buttons.find((b) => b.kind === 'primary')?.id, 'start');
});

test('tapping a card chooses or removes it, by the catalog rules', () => {
  const { vm, welcome, bubble } = setup();
  welcome();
  vm.press('exp:beginner');
  vm.press('pick:supabase');
  assert.deepEqual(bubble().cards.map((c) => c.chosen), [true, true, false]);
  vm.press('pick:nextjs'); // the base stays
  assert.equal(bubble().cards[0].chosen, true);
  vm.press('pick:supabase');
  assert.deepEqual(vm.store.state.selection, ['nextjs', 'vercel', 'supabase']);
});

test('back (or the answer chip) returns to the experience question', () => {
  const { vm, welcome } = setup();
  welcome();
  vm.press('exp:beginner');
  vm.press('back');
  assert.equal(vm.store.state.stepId, 'experience');
  vm.press('exp:beginner');
  vm.press('rewind:0');
  assert.equal(vm.store.state.stepId, 'experience');
});

test('"let\'s start" records the integrations to connect and asks the agent for only what was chosen, without keys', () => {
  const { vm, welcome, calls } = setup();
  welcome();
  vm.press('exp:beginner');
  vm.press('pick:vercel');
  vm.press('start');
  assert.equal(vm.store.state.phase, 'coach');
  assert.deepEqual(calls[0], ['prepareSetup', ['supabase']]);
  const [name, prompt] = calls[1];
  assert.equal(name, 'askAgent');
  assert.match(prompt, /Next\.js/);
  assert.match(prompt, /Supabase/);
  assert.doesNotMatch(prompt, /Vercel/);
  assert.match(prompt, /\.env\.example/);
  assert.match(prompt, /no sé programar/);
});

test('"let me explore" goes to coach mode collapsed', () => {
  const { vm, welcome } = setup();
  welcome();
  vm.press('exp:beginner');
  vm.press('dismiss');
  assert.equal(vm.store.state.phase, 'coach');
  assert.equal(vm.store.state.collapsed, true);
});

test('after "let\'s start", while the agent prepares the project, the bubble shows it is working', () => {
  const { vm, welcome, bubble, setTree } = setup();
  welcome();
  vm.press('exp:beginner');
  vm.press('start');
  assert.equal(bubble().id, 'building');
  assert.equal(bubble().loading, true);
  assert.match(bubble().title, /Preparando/);
  assert.deepEqual(bubble().buttons.map((b) => b.id), ['openChat'], 'no options that make no sense while it works');
  setTree(['package.json']);
  assert.equal(bubble().id, 'firstFile');
});

test('with no agent yet, the request waits: no working state, and the choice can still be changed', () => {
  const { vm, welcome, bubble, pressLabel, setTree } = setup({ agentLive: false });
  welcome();
  vm.press('exp:beginner');
  vm.press('start');
  assert.equal(bubble().id, 'waiting');
  assert.ok(!bubble().loading);
  pressLabel('Cambiar');
  assert.equal(vm.store.state.phase, 'interview');
  assert.equal(bubble().kind, 'stack');
  vm.press('start');
  setTree(['package.json']);
  assert.ok(!bubble().buttons.some((b) => b.id === 'reopen'), 'not once files exist');
});

test('skipping the questions leaves nothing to change', () => {
  const { vm, welcome, bubble } = setup();
  welcome();
  vm.press('skip');
  assert.ok(!bubble().buttons.some((b) => b.id === 'reopen'));
});

test('each new bubble bumps seq so the view replays its entrance; a card toggle does not', () => {
  const { vm, welcome } = setup();
  welcome();
  const before = vm.store.state.seq;
  vm.press('exp:beginner');
  const after = vm.store.state.seq;
  assert.ok(after > before);
  vm.press('pick:supabase');
  assert.equal(vm.store.state.seq, after, 'toggling a card is not a new message');
});

test('the robot stays after the first file and coaches: first file, .gitignore, README, then save progress', () => {
  const { vm, welcome, setTree, bubble, mapViewModel, calls } = setup();
  welcome();
  vm.press('skip'); // straight to coach mode
  assert.equal(bubble().id, 'waiting');
  mapViewModel.store.set({ welcome: false }); // the first file arrives
  setTree(['index.html']);
  assert.equal(vm.store.state.phase, 'coach');
  assert.equal(bubble().id, 'firstFile');
  assert.equal(bubble().tone, 'success');
  vm.press('next');
  assert.equal(bubble().id, 'gitignore');
  vm.press('next');
  assert.equal(bubble().id, 'readme');
  setTree(['index.html', 'README.md', '.gitignore']);
  assert.equal(bubble().id, 'saveProgress');
  vm.press('save');
  assert.deepEqual(calls.at(-1), ['saveProgress']);
  assert.equal(bubble().id, 'allSet');
  vm.press('close');
  assert.equal(vm.store.state.phase, 'off');
});

test('a risky file jumps ahead, opens the bubble and can be sent to Qubi', () => {
  const { vm, welcome, setTree, bubble, calls } = setup();
  welcome();
  vm.press('skip');
  vm.press('collapse');
  assert.equal(vm.store.state.collapsed, true);
  setTree(['index.html', '.env']);
  assert.equal(bubble().id, 'risk:.env:red');
  assert.equal(bubble().tone, 'danger');
  assert.equal(vm.store.state.collapsed, false);
  pressLabelOf(vm, 'Qubi');
  assert.deepEqual(calls.at(-1), ['repair', '.env']);
});

test('a calm tip arriving while collapsed only marks the pill as unread', () => {
  const { vm, welcome, setTree } = setup();
  welcome();
  vm.press('skip');
  vm.press('collapse');
  setTree(['index.html']);
  assert.equal(vm.store.state.collapsed, true);
  assert.equal(vm.store.state.unread, true);
  vm.press('expand');
  assert.equal(vm.store.state.unread, false);
});

test('a risk fixed by the agent disappears from the coach', () => {
  const { vm, welcome, setTree, bubble, securityModel } = setup();
  welcome();
  vm.press('skip');
  setTree(['.gitignore', 'README.md', 'login.js']);
  assert.equal(bubble().id, 'risk:login.js:yellow');
  securityModel.setScore('login.js', 'green', 'ok');
  assert.notEqual(bubble().id, 'risk:login.js:yellow');
});

test('closing the project turns the robot off', () => {
  const { vm, welcome, mapViewModel } = setup();
  welcome();
  mapViewModel.store.set({ status: 'empty', welcome: false, session: 2 });
  assert.equal(vm.store.state.phase, 'off');
});

function pressLabelOf(vm, text) {
  const button = vm.store.state.bubble.buttons.find((b) => b.label.includes(text));
  assert.ok(button, `no button "${text}"`);
  vm.press(button.id);
}

// Qubi asks the same questions by voice (docs/features/welcome-robot/): the call answers with press(id, { by: 'voice' })
test('Qubi can answer for the person by voice; only the person\'s own taps tell the app they went manual', () => {
  const { vm, welcome, bubble, touched } = setup();
  welcome();
  assert.deepEqual(vm.voiceState(), { paso: 'experiencia', tecnologias: ['nextjs', 'vercel', 'supabase'] });
  vm.press('exp:beginner', { by: 'voice' });
  assert.equal(bubble().id, 'q:stack');
  assert.deepEqual(vm.voiceState().paso, 'tecnologias');
  vm.press('pick:vercel', { by: 'voice' });
  assert.deepEqual(vm.voiceState().tecnologias, ['nextjs', 'supabase']);
  assert.deepEqual(touched, [], 'the voice is not the person tapping');
  vm.press('pick:vercel');
  assert.deepEqual(touched, ['pick:vercel']);
});

test('collapsing or expanding the bubble is not answering: the call goes on', () => {
  const { vm, welcome, touched } = setup();
  welcome();
  vm.press('collapse');
  vm.press('expand');
  assert.deepEqual(touched, []);
});

test('the voice state follows the bubble to the end: building, then over', () => {
  const { vm, welcome, setTree } = setup();
  assert.deepEqual(vm.voiceState(), { paso: 'terminada', tecnologias: [] });
  welcome();
  vm.press('exp:beginner', { by: 'voice' });
  vm.press('start', { by: 'voice' });
  assert.equal(vm.voiceState().paso, 'construyendo');
  setTree(['package.json']);
  assert.equal(vm.voiceState().paso, 'terminada');
});

test('"I already code" by voice: the same goodbye', () => {
  const { vm, welcome, bubble } = setup();
  welcome();
  vm.press('exp:dev', { by: 'voice' });
  assert.equal(bubble().id, 'farewell');
  assert.equal(vm.voiceState().paso, 'terminada');
});
