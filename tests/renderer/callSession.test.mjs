// The call with Qubi has one adapter for the real call (ElevenLabs client, injected fake here) and the
// simulated one (fixed script). Neither shows the app's own notices as the person's words.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { openSession, openSimulatedSession, NOTICE_PREFIX, reasonOf, warmSession } from '../../renderer/models/callSession.js';
import { strings } from '../../renderer/i18n/es.js';

const SIM = strings.call.sim;
const TIMING = { connectMs: 100, thinkMs: 50, wordMs: 10, minSpeakMs: 200 };

function recorder() {
  const events = [];
  const on = {
    status: (s) => events.push(['status', s]),
    mode: (m) => events.push(['mode', m]),
    line: (l) => events.push(['line', l.who, l.text]),
    error: (r) => events.push(['error', r]),
    ended: (r) => events.push(['ended', r]),
  };
  const lines = () => events.filter((e) => e[0] === 'line').map((e) => [e[1], e[2]]);
  return { on, events, lines };
}

// A fake ElevenLabs client: keeps the options and what the app sent
function fakeSdk({ fail = null } = {}) {
  const sent = { user: [], context: [], muted: [], ended: 0 };
  let options = null;
  const conversation = {
    endSession: async () => { sent.ended++; },
    setMicMuted: (m) => sent.muted.push(m),
    sendContextualUpdate: (t) => sent.context.push(t),
    sendUserMessage: (t) => sent.user.push(t),
    getInputVolume: () => 1.7,
    getOutputVolume: () => -0.2,
  };
  const sdk = {
    Conversation: {
      startSession: async (o) => {
        options = o;
        if (fail) throw fail;
        o.onConnect?.({ conversationId: 'c1' });
        return conversation;
      },
    },
  };
  return { sdk, sent, options: () => options };
}

test('real call: starts over websocket with the signed address, the worklet files and the client tools', async () => {
  const { sdk, options } = fakeSdk();
  const { on, events } = recorder();
  const clientTools = { construir: () => ({ ok: true }) };
  const session = await openSession({ signedUrl: 'wss://firmada', dynamicVariables: { project_name: 'Tienda' }, clientTools, on, sdk });
  const o = options();
  assert.equal(o.signedUrl, 'wss://firmada');
  assert.equal(o.connectionType, 'websocket');
  assert.deepEqual(o.dynamicVariables, { project_name: 'Tienda' });
  assert.equal(o.clientTools, clientTools);
  assert.match(o.workletPaths.rawAudioProcessor, /vendor\/elevenlabs\/rawAudioProcessor\.js$/);
  assert.match(o.workletPaths.audioConcatProcessor, /vendor\/elevenlabs\/audioConcatProcessor\.js$/);
  assert.equal(session.simulated, false);
  assert.deepEqual(events[0], ['status', 'connected']);
});

test('real call: Qubi and the person become lines; the app notices never show as the person speaking', async () => {
  const { sdk, options, sent } = fakeSdk();
  const { on, lines } = recorder();
  const session = await openSession({ signedUrl: 'wss://x', on, sdk });
  const o = options();
  o.onMessage({ message: 'Hola, soy Qubi.', source: 'ai', role: 'agent' });
  o.onMessage({ message: 'Haz una página de contacto', source: 'user', role: 'user' });
  session.notify('Listo: 2 archivos nuevos.');
  assert.deepEqual(sent.user, [`${NOTICE_PREFIX} Listo: 2 archivos nuevos.`]);
  o.onMessage({ message: `${NOTICE_PREFIX} Listo: 2 archivos nuevos.`, source: 'user', role: 'user' });
  assert.deepEqual(lines(), [['qubi', 'Hola, soy Qubi.'], ['person', 'Haz una página de contacto']]);
});

test('real call: typed text is one person line (its echo is not repeated) and goes to the agent', async () => {
  const { sdk, options, sent } = fakeSdk();
  const { on, lines } = recorder();
  const session = await openSession({ signedUrl: 'wss://x', on, sdk });
  session.type('agrega un botón');
  options().onMessage({ message: 'agrega un botón', source: 'user', role: 'user' });
  assert.deepEqual(lines(), [['person', 'agrega un botón']]);
  assert.deepEqual(sent.user, ['agrega un botón']);
});

test('real call: mute, context, levels clamped to 0..1, hang up and the disconnect reason', async () => {
  const { sdk, options, sent } = fakeSdk();
  const { on, events } = recorder();
  const session = await openSession({ signedUrl: 'wss://x', on, sdk });
  session.setMuted(true);
  session.sendContext('Va bien');
  assert.deepEqual(session.levels(), { input: 1, output: 0 });
  session.end();
  await Promise.resolve();
  assert.deepEqual(sent.muted, [true]);
  assert.deepEqual(sent.context, ['Va bien']);
  assert.equal(sent.ended, 1);
  options().onModeChange({ mode: 'speaking' });
  options().onDisconnect({ reason: 'agent' });
  assert.deepEqual(events.slice(-2), [['mode', 'speaking'], ['ended', 'agent']]);
});

test('real call: a refused microphone fails with reason "mic"; a failed client tool does not end the call', async () => {
  const denied = Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
  const { sdk } = fakeSdk({ fail: denied });
  await assert.rejects(openSession({ signedUrl: 'wss://x', on: recorder().on, sdk }), (e) => e.reason === 'mic');
  assert.equal(reasonOf(new Error('WebSocket closed')), 'network');
  assert.equal(reasonOf(new Error('algo raro')), 'failed');

  const ok = fakeSdk();
  const { on, events } = recorder();
  await openSession({ signedUrl: 'wss://x', on, sdk: ok.sdk });
  ok.options().onError('Client tool execution failed', { clientToolName: 'construir' });
  assert.equal(events.some((e) => e[0] === 'error'), false);
  ok.options().onError('NotAllowedError: microphone');
  assert.deepEqual(events.at(-1), ['error', 'mic']);
});

test('simulated call: greets, and a request to build calls construir with the whole request', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  try {
    const { on, events, lines } = recorder();
    const asked = [];
    const clientTools = { construir: async (p) => { asked.push(p); return { ok: true, estado: 'empezó', agente: 'Claude Code' }; } };
    const session = await openSimulatedSession({ dynamicVariables: { project_name: 'Tienda' }, clientTools, on, timing: TIMING });
    assert.equal(session.simulated, true);
    assert.deepEqual(events[0], ['status', 'connecting']);
    mock.timers.tick(TIMING.connectMs);
    assert.ok(events.some((e) => e[0] === 'status' && e[1] === 'connected'));
    assert.deepEqual(lines(), [['qubi', SIM.greeting('Tienda')]]);
    assert.ok(session.levels().output > 0, 'a wave while Qubi speaks');
    mock.timers.tick(5000);
    assert.equal(session.levels().output, 0);
    assert.equal(events.filter((e) => e[0] === 'mode').at(-1)[1], 'listening');

    session.type('Crea una página de contacto con un formulario');
    mock.timers.tick(TIMING.thinkMs);
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(asked, [{ pedido: 'Crea una página de contacto con un formulario' }]);
    assert.deepEqual(lines().slice(1), [['person', 'Crea una página de contacto con un formulario'], ['qubi', SIM.building('Claude Code')]]);
    session.end();
    assert.deepEqual(events.at(-1), ['ended', 'user']);
  } finally { mock.timers.reset(); }
});

test('simulated call: "¿qué hay…?" looks at the project; other words get the fixed answer; busy is said', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  try {
    const { on, lines } = recorder();
    const tools = [];
    const clientTools = {
      ver_proyecto: () => { tools.push('ver_proyecto'); return { resumen: 'Proyecto: Tienda.\nSemáforo: 1 en riesgo.' }; },
      construir: () => { tools.push('construir'); return { ok: false, motivo: 'ocupado' }; },
    };
    const session = await openSimulatedSession({ dynamicVariables: {}, clientTools, on, timing: TIMING });
    mock.timers.tick(TIMING.connectMs);
    const say = async (text) => { session.type(text); mock.timers.tick(TIMING.thinkMs); await new Promise((r) => setImmediate(r)); };
    await say('¿Qué hay en mi proyecto?');
    await say('hola Qubi');
    await say('arregla el login');
    assert.deepEqual(tools, ['ver_proyecto', 'construir']);
    const qubi = lines().filter(([who]) => who === 'qubi').map(([, t]) => t);
    assert.deepEqual(qubi, [SIM.greeting(SIM.anyProject), SIM.project('Proyecto: Tienda. Semáforo: 1 en riesgo.'), SIM.fallback, SIM.busy]);
  } finally { mock.timers.reset(); }
});

test('simulated call: a notice is read aloud by Qubi and never appears as the person', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  try {
    const { on, lines } = recorder();
    const session = await openSimulatedSession({ dynamicVariables: { project_name: 'Tienda' }, clientTools: {}, on, timing: TIMING });
    mock.timers.tick(TIMING.connectMs);
    session.notify('Listo: 1 archivo nuevo.');
    mock.timers.tick(TIMING.thinkMs);
    assert.deepEqual(lines().at(-1), ['qubi', 'Listo: 1 archivo nuevo.']);
    assert.equal(lines().some(([who, text]) => who === 'person' || text.includes(NOTICE_PREFIX)), false);
    session.end();
    session.notify('otra cosa');
    mock.timers.tick(1000);
    assert.equal(lines().at(-1)[1], 'Listo: 1 archivo nuevo.', 'nothing after hanging up');
  } finally { mock.timers.reset(); }
});

test('the expressive voice tags ([confused], [laughs]) are not shown as words', async () => {
  const { spokenText } = await import('../../renderer/models/callSession.js');
  assert.equal(spokenText('[confused] ¿No a qué? [laughs] Claro.'), '¿No a qué? Claro.');
  assert.equal(spokenText('Revisé apps/web [sin cambios]'), 'Revisé apps/web');
  assert.equal(spokenText('Hola'), 'Hola');
});

test('real call: the voice picked in the settings goes as overrides; none when not given', async () => {
  const a = fakeSdk();
  await openSession({ signedUrl: 'wss://x', on: recorder().on, sdk: a.sdk, overrides: { tts: { voiceId: 'GRGd9ooJazPy9jV7czfS' } } });
  assert.deepEqual(a.options().overrides, { tts: { voiceId: 'GRGd9ooJazPy9jV7czfS' } });
  const b = fakeSdk();
  await openSession({ signedUrl: 'wss://x', on: recorder().on, sdk: b.sdk });
  assert.equal('overrides' in b.options(), false);
});

test('simulated call: "ve a…" sends Qubi there, "vente" brings it back, "abre…" asks permission and waits', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  try {
    const { on, lines } = recorder();
    const called = [];
    let permit;
    const clientTools = {
      ir_a: (p) => { called.push(['ir_a', p]); return { ok: true }; },
      volver: () => { called.push(['volver']); return { ok: true }; },
      abrir_archivo: (p) => { called.push(['abrir_archivo', p]); return new Promise((r) => { permit = r; }); },
      construir: () => { called.push(['construir']); return { ok: true, agente: 'x' }; },
    };
    const session = await openSimulatedSession({ dynamicVariables: {}, clientTools, on, timing: TIMING });
    mock.timers.tick(TIMING.connectMs);
    const say = async (text) => { session.type(text); mock.timers.tick(TIMING.thinkMs); await new Promise((r) => setImmediate(r)); };
    await say('Ve a la carpeta src/lib.');
    await say('Muéstrame apps');
    await say('Vente, Qubi');
    await say('Abre el archivo app/page.tsx');
    assert.deepEqual(called, [['ir_a', { ruta: 'src/lib' }], ['ir_a', { ruta: 'apps' }], ['volver'], ['abrir_archivo', { ruta: 'app/page.tsx' }]]);
    const qubi = () => lines().filter(([who]) => who === 'qubi').map(([, t]) => t);
    assert.deepEqual(qubi().slice(1), [SIM.going, SIM.going, SIM.back, SIM.askPermission]);
    // the person's answer is for the permission (the app reads it), not a new request to Qubi
    await say('sí, dale');
    assert.equal(called.length, 4);
    permit({ ok: true });
    await new Promise((r) => setImmediate(r));
    assert.equal(qubi().at(-1), SIM.done);
    await say('Abre src/app.js');
    await say('no');
    permit({ ok: false, motivo: 'sin-permiso' });
    await new Promise((r) => setImmediate(r));
    assert.equal(qubi().at(-1), SIM.denied);
    session.end();
  } finally { mock.timers.reset(); }
});

test('warmSession: loads the SDK ahead of the first call and never throws', async () => {
  let loads = 0;
  assert.equal(await warmSession(async () => { loads++; return {}; }), true);
  assert.equal(loads, 1);
  assert.equal(await warmSession(async () => { throw new Error('offline'); }), false);
});
