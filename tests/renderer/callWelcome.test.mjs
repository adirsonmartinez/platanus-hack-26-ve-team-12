// The welcome call (docs/features/welcome-robot/): on a new project Qubi asks the welcome's questions by voice
// and the bubble's buttons keep working. A fake voice service, session and welcome (robotDialogViewModel).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Observable } from '../../renderer/core/observable.js';
import { createEventBus } from '../../renderer/core/eventBus.js';
import { CallViewModel } from '../../renderer/viewmodels/callViewModel.js';

const flush = () => new Promise((r) => setImmediate(r));
const memoryStorage = () => { const data = new Map(); return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)) }; };

function fakeSession() {
  return { notified: [], context: [], ended: 0, levels: () => ({ input: 0, output: 0 }),
    notify(t) { this.notified.push(t); }, sendContext(t) { this.context.push(t); }, type() {}, setMuted() {}, end() { this.ended++; } };
}

// The welcome bubble as the call sees it: voiceState() and press(id, { by })
function fakeWelcome() {
  const state = { paso: 'experiencia', tecnologias: ['nextjs', 'vercel', 'supabase'] };
  const pressed = [];
  return {
    state, pressed, onStart: null,
    voiceState: () => ({ ...state, tecnologias: [...state.tecnologias] }),
    press(id, opts) {
      pressed.push([id, opts?.by]);
      if (id === 'exp:beginner') state.paso = 'tecnologias';
      if (id === 'exp:dev') state.paso = 'terminada';
      if (id.startsWith('pick:')) {
        const key = id.slice(5);
        state.tecnologias = state.tecnologias.includes(key) ? state.tecnologias.filter((k) => k !== key) : [...state.tecnologias, key];
      }
      if (id === 'start') { state.paso = 'construyendo'; this.onStart?.(); }
    },
  };
}

function setup({ voice = { ok: true, provider: 'elevenlabs', signedUrl: 'wss://firmada', dynamicVariables: {} }, live = true, runService = null, timing = {} } = {}) {
  const cards = [];
  const sent = [];
  const links = [];
  const chatViewModel = {
    store: new Observable({ messages: [], typing: false }),
    send(text, opts) { sent.push([text, opts]); return new Promise(() => {}); },
    upsertCallCard(card) { cards.push(card); return 7; },
  };
  const projectModel = { store: new Observable({ open: true, name: 'Tienda', root: '/p/Tienda', tree: [], session: 1 }) };
  const starts = [];
  const voiceService = { available: true, start: async (req) => { starts.push(req); return voice; }, providers: async () => ({ elevenlabs: { ready: true }, grok: { ready: false } }) };
  const welcome = fakeWelcome();
  let handlers = null;
  let tools = null;
  const sessions = [];
  const vm = new CallViewModel({
    voiceService, chatViewModel, projectModel, connection: { agentLabel: 'Claude Code', live }, bus: createEventBus(), welcome, runService,
    actions: { showLink: (url) => links.push(url) }, storage: memoryStorage(), timing: { ringMs: 0, ...timing },
    openSession: async ({ on, clientTools }) => { handlers = on; tools = clientTools; const s = fakeSession(); sessions.push(s); on.status('connected'); return s; },
  });
  welcome.onStart = () => vm.buildForWelcome('Arma la base del proyecto con Next.js.');
  const say = (text = 'Dale, empecemos') => handlers.line({ who: 'person', text, final: true });
  return { vm, welcome, cards, sent, starts, links, sessions, say, on: () => handlers, tools: () => tools };
}

test('a welcome call tells main it is the welcome; a normal call does not', async () => {
  const t = setup();
  await t.vm.start({ welcome: true });
  assert.equal(t.starts[0].welcome, true);
  assert.equal(t.vm.welcomeCall, true);
  t.vm.hangUp();
  await t.vm.start();
  assert.equal(t.starts[1].welcome, undefined);
  assert.equal(t.vm.welcomeCall, false);
});

test('Qubi answers the experience question for the person and hears the bubble\'s next step', async () => {
  const t = setup();
  await t.vm.start({ welcome: true });
  assert.deepEqual(t.tools().elegir_experiencia({ nivel: 'Empezando' }), { ok: true, paso: 'tecnologias', tecnologias: ['nextjs', 'vercel', 'supabase'] });
  assert.deepEqual(t.welcome.pressed, [['exp:beginner', 'voice']]);
  // the bubble already moved on: the same question is not answered twice
  assert.deepEqual(t.tools().elegir_experiencia({ nivel: 'programo' }), { ok: false, motivo: 'otro-paso', paso: 'tecnologias', tecnologias: ['nextjs', 'vercel', 'supabase'] });
});

test('"ya programo" by voice is the same button; an answer it does not know is not guessed', async () => {
  const t = setup();
  await t.vm.start({ welcome: true });
  assert.equal(t.tools().elegir_experiencia({ nivel: 'quizás' }).motivo, 'no-entendido');
  assert.equal(t.tools().elegir_experiencia({ nivel: 'programo' }).paso, 'terminada');
  assert.deepEqual(t.welcome.pressed, [['exp:dev', 'voice']]);
});

test('the technology cards: marked or unmarked by voice only when it changes something', async () => {
  const t = setup();
  await t.vm.start({ welcome: true });
  t.tools().elegir_experiencia({ nivel: 'empezando' });
  assert.deepEqual(t.tools().marcar_tecnologia({ tecnologia: 'Vercel', elegir: 'no' }).tecnologias, ['nextjs', 'supabase']);
  assert.deepEqual(t.tools().marcar_tecnologia({ tecnologia: 'vercel', elegir: 'no' }).tecnologias, ['nextjs', 'supabase'], 'already off: nothing pressed');
  assert.deepEqual(t.tools().marcar_tecnologia({ tecnologia: 'Next.js', elegir: 'si' }).tecnologias, ['nextjs', 'supabase']);
  assert.deepEqual(t.welcome.pressed.filter(([id]) => id.startsWith('pick:')), [['pick:vercel', 'voice']]);
  assert.equal(t.tools().marcar_tecnologia({ tecnologia: 'firebase', elegir: 'si' }).motivo, 'no-existe');
});

test('the welcome tools say sin-bienvenida in a normal call', async () => {
  const t = setup();
  await t.vm.start();
  for (const [name, params] of [['elegir_experiencia', { nivel: 'empezando' }], ['marcar_tecnologia', { tecnologia: 'vercel', elegir: 'no' }], ['empezar_proyecto', {}], ['seguir_manual', {}]]) {
    assert.equal(t.tools()[name](params).motivo, 'sin-bienvenida', name);
  }
  assert.deepEqual(t.welcome.pressed, []);
});

test('empezar_proyecto needs the person\'s word, then the base project goes to the agent and the call follows it', async () => {
  const t = setup();
  await t.vm.start({ welcome: true });
  t.tools().elegir_experiencia({ nivel: 'empezando' });
  assert.deepEqual(t.tools().empezar_proyecto(), { ok: false, motivo: 'sin-confirmar' });
  assert.equal(t.sent.length, 0);
  t.say();
  assert.deepEqual(t.tools().empezar_proyecto(), { ok: true, estado: 'empezó' });
  assert.deepEqual(t.welcome.pressed.at(-1), ['start', 'voice']);
  assert.deepEqual(t.sent, [['Arma la base del proyecto con Next.js.', { intent: 'change' }]]);
  assert.equal(t.vm.store.state.task.status, 'running', 'the call tells the voice how the work goes');
});

test('with no agent picked, empezar_proyecto says so (the request waits for one)', async () => {
  const t = setup({ live: false });
  await t.vm.start({ welcome: true });
  t.tools().elegir_experiencia({ nivel: 'empezando' });
  t.say();
  assert.deepEqual(t.tools().empezar_proyecto(), { ok: false, motivo: 'sin-agente' });
  assert.equal(t.sent.length, 0);
});

test('only a live welcome call takes the welcome\'s request', async () => {
  const t = setup();
  assert.equal(t.vm.buildForWelcome('x'), false);
  await t.vm.start();
  assert.equal(t.vm.buildForWelcome('x'), false);
  assert.equal(t.sent.length, 0);
});

test('a tap of the person\'s own on the bubble hangs up the welcome call; it never ends a normal call', async () => {
  const t = setup();
  await t.vm.start();
  t.vm.manual();
  assert.equal(t.vm.store.state.status, 'live');
  t.vm.hangUp();
  await t.vm.start({ welcome: true });
  t.vm.manual();
  assert.equal(t.vm.store.state.status, 'idle');
  assert.equal(t.sessions.at(-1).ended, 1);
});

test('seguir_manual: Qubi says goodbye, then the call hangs up once it stops talking', async () => {
  const t = setup({ timing: { manualMs: 5000 } });
  await t.vm.start({ welcome: true });
  assert.deepEqual(t.tools().seguir_manual(), { ok: true });
  t.on().mode('speaking');
  assert.equal(t.vm.store.state.status, 'live', 'not while it says goodbye');
  t.on().mode('listening');
  assert.equal(t.vm.store.state.status, 'idle');
});

test('seguir_manual with no goodbye: it hangs up after a short while anyway', async () => {
  const t = setup({ timing: { manualMs: 10 } });
  await t.vm.start({ welcome: true });
  t.tools().seguir_manual();
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(t.vm.store.state.status, 'idle');
});

test('a welcome call that cannot connect stays quiet: no error and no card (the buttons are there)', async () => {
  const t = setup({ voice: { ok: false, reason: 'network' } });
  await t.vm.start({ welcome: true });
  assert.equal(t.vm.store.state.status, 'idle');
  assert.equal(t.vm.store.state.error, null);
  assert.deepEqual(t.cards, []);
  // a normal call does show its error
  await t.vm.start();
  assert.equal(t.vm.store.state.status, 'error');
});

test('the project running: its link stays on screen (the call panel and the chat)', async () => {
  const runService = { scripts: async () => ({ ok: true, data: [{ id: 's1', script: 'dev', command: 'npm run dev', cwd: '.' }] }), start: async () => ({ ok: true, port: 3000 }) };
  const t = setup({ runService });
  await t.vm.start({ welcome: true });
  t.say('Arráncalo');
  const res = await t.tools().ejecutar_app();
  assert.equal(res.ok, true);
  assert.deepEqual(t.vm.store.state.link, { port: 3000, url: 'http://localhost:3000' });
  assert.deepEqual(t.links, ['http://localhost:3000']);
  // a new call starts without it
  t.vm.hangUp();
  await t.vm.start();
  assert.equal(t.vm.store.state.link, null);
});

test('a welcome call is a normal call once it ends: the next one is not the welcome', async () => {
  const t = setup();
  await t.vm.start({ welcome: true });
  t.vm.hangUp();
  await flush();
  assert.equal(t.vm.welcomeCall, false);
});
