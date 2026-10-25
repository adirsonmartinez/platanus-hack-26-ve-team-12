import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { RobotDialogViewModel } from '../../renderer/viewmodels/robotDialogViewModel.js';
import { SecurityModel } from '../../renderer/models/securityModel.js';
import { Observable } from '../../renderer/core/observable.js';

const file = (path) => ({ type: 'file', path, size: 10 });

function setup() {
  const mapViewModel = { store: new Observable({ status: 'ready', session: 1, welcome: false }) };
  const projectModel = { store: new Observable({ tree: [] }) };
  const securityModel = new SecurityModel();
  const calls = [];
  const actions = {
    askAgent: (prompt) => calls.push(['askAgent', prompt]),
    openChat: () => calls.push(['openChat']),
    repair: (path) => calls.push(['repair', path]),
    locate: (path) => calls.push(['locate', path]),
    saveProgress: () => calls.push(['saveProgress']),
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
  return { vm, mapViewModel, securityModel, calls, welcome, setTree, bubble, pressLabel };
}

test('stays off until a new, empty project opens, then starts the interview', () => {
  const { vm, welcome, bubble } = setup();
  assert.equal(vm.store.state.phase, 'off');
  welcome();
  assert.equal(vm.store.state.phase, 'interview');
  assert.equal(bubble().kind, 'question');
  assert.deepEqual(bubble().progress, { step: 1, of: 3 });
  assert.equal(bubble().canBack, false);
});

test('questions talk about the idea, never about technology', () => {
  const { welcome, bubble } = setup();
  welcome();
  const text = [bubble().text, ...bubble().buttons.map((b) => b.label)].join(' ');
  assert.doesNotMatch(text, /React|Node|API|backend|framework|lenguaje/i);
});

test('answers advance the interview, are kept as chips, and back undoes the last one', () => {
  const { vm, welcome, bubble, pressLabel } = setup();
  welcome();
  pressLabel('página para mostrar');
  assert.equal(vm.store.state.stepId, 'site');
  assert.equal(bubble().progress.step, 2);
  assert.equal(bubble().answers.length, 1);
  assert.equal(bubble().canBack, true);
  vm.press('back');
  assert.equal(vm.store.state.stepId, 'start');
  assert.deepEqual(bubble().answers, []);
});

test('any earlier answer can be changed by tapping its chip: back to that question, later answers dropped', () => {
  const { vm, welcome, bubble, pressLabel } = setup();
  welcome();
  pressLabel('Vender algo');
  pressLabel('WhatsApp');
  assert.equal(bubble().kind, 'recommend');
  assert.equal(bubble().answers.length, 2);
  vm.press('rewind:0');
  assert.equal(vm.store.state.stepId, 'start');
  assert.deepEqual(bubble().answers, []);
  pressLabel('juego');
  assert.equal(vm.store.state.stepId, 'game');
});

test('after the interview, while nothing was created yet, the answers can still be changed', () => {
  const { vm, welcome, bubble, pressLabel, setTree } = setup();
  welcome();
  pressLabel('juego');
  pressLabel('Mario');
  pressLabel('Me encanta');
  assert.equal(bubble().id, 'waiting');
  pressLabel('Cambiar mis respuestas');
  assert.equal(vm.store.state.phase, 'interview');
  assert.equal(bubble().kind, 'recommend');
  assert.equal(bubble().answers.length, 2);
  pressLabel('Me encanta');
  setTree(['index.html']);
  assert.ok(!bubble().buttons.some((b) => b.label.includes('Cambiar mis respuestas')), 'not once files exist');
});

test('skipping the questions leaves nothing to change', () => {
  const { vm, welcome, bubble } = setup();
  welcome();
  vm.press('skip');
  assert.ok(!bubble().buttons.some((b) => b.id === 'reopen'));
});

test('each new bubble bumps seq so the view replays its entrance', () => {
  const { vm, welcome, pressLabel } = setup();
  welcome();
  const before = vm.store.state.seq;
  pressLabel('juego');
  assert.ok(vm.store.state.seq > before);
});

test('the answers lead to a stack recommended in plain words, with perks and the real tech in small print', () => {
  const { welcome, bubble, pressLabel } = setup();
  welcome();
  pressLabel('Vender algo');
  pressLabel('WhatsApp');
  assert.equal(bubble().kind, 'recommend');
  assert.match(bubble().text, /tienda-catálogo/);
  assert.match(bubble().stack.tech, /WhatsApp/);
  assert.ok(bubble().stack.perks.length > 0);
  assert.equal(bubble().buttons.find((b) => b.kind === 'primary')?.label.includes('empecemos'), true);
});

test('accounts for several people recommend a web app with a database', () => {
  const { welcome, bubble, pressLabel } = setup();
  welcome();
  pressLabel('organizarme');
  pressLabel('Varias personas');
  assert.match(bubble().stack.tech, /Supabase/);
});

test('"what does that mean?" explains the stack with an analogy, once', () => {
  const { vm, welcome, bubble, pressLabel } = setup();
  welcome();
  pressLabel('juego');
  pressLabel('Mario');
  const seq = vm.store.state.seq;
  pressLabel('Qué significa');
  assert.match(bubble().text, /LEGO/);
  assert.ok(vm.store.state.seq > seq, 'the analogy is typed as a new message');
  assert.ok(!bubble().buttons.some((b) => b.label.includes('Qué significa')));
  vm.press('back');
  assert.equal(vm.store.state.stepId, 'game');
});

test('"let\'s start" hands the agent the answers, the stack and a no-jargon request, then coaches', () => {
  const { vm, welcome, calls, pressLabel } = setup();
  welcome();
  pressLabel('Vender algo');
  pressLabel('tarjeta');
  pressLabel('Me encanta');
  assert.equal(vm.store.state.phase, 'coach');
  const [name, prompt] = calls.at(-1);
  assert.equal(name, 'askAgent');
  assert.match(prompt, /tarjeta/);
  assert.match(prompt, /Stripe/);
  assert.match(prompt, /no sé programar/);
});

test('"talk it over" asks the agent to interview the person first', () => {
  const { welcome, calls, pressLabel } = setup();
  welcome();
  pressLabel('Tengo una idea');
  pressLabel('Divertir');
  pressLabel('conversarlo');
  const [name, prompt] = calls.at(-1);
  assert.equal(name, 'askAgent');
  assert.match(prompt, /preguntas simples/);
});

test('"let me explore" goes to coach mode collapsed', () => {
  const { vm, welcome, pressLabel } = setup();
  welcome();
  pressLabel('juego');
  pressLabel('Sorpréndeme');
  pressLabel('exploro yo');
  assert.equal(vm.store.state.phase, 'coach');
  assert.equal(vm.store.state.collapsed, true);
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
