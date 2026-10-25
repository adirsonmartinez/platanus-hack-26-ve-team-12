const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  createVoiceCall, agentConfig, configHash, reasonFor, grokTools, REALTIME_MODEL, LIMITS, VOICES, PROVIDERS, DEFAULT_VOICE, GROK_MODEL,
} = require('./voiceCall');
const t = require('./strings');
// The saved hash covers the agent's configuration and its voice mode
const HASH = configHash({ config: agentConfig(), realtime: REALTIME_MODEL });
const JUAN = VOICES.elevenlabs.juan.id;

// Keys are built at run time: written out, they would look like credentials to the repo's own scan
const KEY = ['sk', 'test', 'voice', 'abcdefghijklmnopqrstuvwxyz0123456789'].join('_');
const XKEY = ['xai', 'testvoiceabcdefghijklmnopqrstuvwxyz9876'].join('-');
const keys = (map) => (provider) => map[provider] ?? null;
const ONLY_ELEVEN = keys({ elevenlabs: KEY });
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'voice-')), 'voice-agent.json');
const httpError = (statusCode, body) => Object.assign(new Error(`Status code: ${statusCode}`), { statusCode, body });

// A stand-in for the ElevenLabs SDK client: records every call; `fail` queues errors per operation;
// `missing` lists the voice ids that are not in the account yet (voices.get answers 404)
function fakeClient({ fail = {}, missing = [] } = {}) {
  const calls = [];
  let created = 0;
  const inAccount = new Set();
  const step = (op, ...args) => {
    calls.push([op, ...args]);
    const error = fail[op]?.shift();
    if (error) throw error;
  };
  return {
    calls,
    ops: () => calls.map(([op]) => op),
    voices: {
      get: async (id) => {
        step('voiceGet', id);
        if (missing.includes(id) && !inAccount.has(id)) throw httpError(404, { detail: { status: 'voice_not_found' } });
        return { voiceId: id };
      },
      share: async (owner, id, body) => { step('voiceShare', owner, id, body); inAccount.add(id); return { voiceId: id }; },
    },
    conversationalAi: {
      agents: {
        create: async (body) => { step('create', body); return { agentId: `agent_${++created}` }; },
        // the voice mode (Realtime) goes in its own update with an extra body field: recorded as 'mode'
        update: async (id, body, opts) => { step(opts?.additionalBodyParameters ? 'mode' : 'update', id, body, opts); return { agentId: id }; },
        get: async (id) => { step('get', id); return { agentId: id }; },
      },
      conversations: {
        getSignedUrl: async ({ agentId }) => { step('signedUrl', agentId); return { signedUrl: `wss://example.test/convai?agent_id=${agentId}&conversation_signature=abc` }; },
      },
    },
  };
}

// A stand-in for fetch (xAI client secrets): records the requests, answers `reply` or throws `error`
function fakeFetch({ status = 200, reply = { value: 'ek_live_secret_123', expires_at: 1_900_000_000 }, error, text = '' } = {}) {
  const requests = [];
  const fn = async (url, init) => {
    requests.push({ url, init });
    if (error) throw error;
    return { ok: status >= 200 && status < 300, status, json: async () => reply, text: async () => text };
  };
  fn.requests = requests;
  return fn;
}

const REQ = { projectName: 'Feria Online', context: 'Carpetas: web, api.', builder: 'Claude' };
const voicesCache = (file) => JSON.parse(fs.readFileSync(file, 'utf8')).voices;

test('without a key: no-key, and neither the network client nor fetch is used', async () => {
  let made = 0;
  const fetchFn = fakeFetch();
  const call = createVoiceCall({ getKey: () => null, file: tmp(), makeClient: () => { made++; return fakeClient(); }, fetchFn });
  assert.deepEqual(await call.status(), { ready: false, reason: 'no-key' });
  assert.deepEqual(await call.providers(), { elevenlabs: { ready: false }, grok: { ready: false } });
  for (const provider of ['auto', 'elevenlabs', 'grok']) assert.deepEqual(await call.start({ ...REQ, provider }), { ok: false, reason: 'no-key' });
  assert.equal(made, 0);
  assert.equal(fetchFn.requests.length, 0);
});

test('providers: ready and last four only; a key is asked per provider and a throwing getKey is no key', async () => {
  const asked = [];
  const call = createVoiceCall({ getKey: async (p) => { asked.push(p); return { elevenlabs: KEY, grok: XKEY }[p]; }, file: tmp(), makeClient: () => fakeClient() });
  const providers = await call.providers();
  assert.deepEqual(providers, { elevenlabs: { ready: true, last4: KEY.slice(-4) }, grok: { ready: true, last4: XKEY.slice(-4) } });
  assert.ok(!JSON.stringify(providers).includes(KEY) && !JSON.stringify(providers).includes(XKEY));
  assert.deepEqual([...new Set(asked)].sort(), ['elevenlabs', 'grok']);
  const broken = createVoiceCall({ getKey: () => { throw new Error('keychain locked'); }, file: tmp() });
  assert.deepEqual(await broken.status(), { ready: false, reason: 'no-key' });
});

test('a key is only sent to its own provider (a wiring mistake counts as no key)', async () => {
  const fetchFn = fakeFetch();
  const call = createVoiceCall({ getKey: () => KEY, file: tmp(), makeClient: () => fakeClient(), fetchFn });
  assert.deepEqual(await call.start({ ...REQ, provider: 'grok' }), { ok: false, reason: 'no-key' });
  assert.equal(fetchFn.requests.length, 0, 'an ElevenLabs key never goes to xAI');
  let made = 0;
  const other = createVoiceCall({ getKey: () => XKEY, file: tmp(), makeClient: () => { made++; return fakeClient(); }, fetchFn: fakeFetch() });
  assert.equal((await other.start({ ...REQ, provider: 'elevenlabs' })).reason, 'no-key');
  assert.equal(made, 0);
});

test('auto: ElevenLabs when it has a key, else Grok; an explicit choice is kept', async () => {
  const both = keys({ elevenlabs: KEY, grok: XKEY });
  const fetchFn = fakeFetch();
  const call = createVoiceCall({ getKey: both, file: tmp(), makeClient: () => fakeClient(), fetchFn });
  assert.equal((await call.start(REQ)).provider, 'elevenlabs');
  assert.equal((await call.start({ ...REQ, provider: 'auto' })).provider, 'elevenlabs');
  assert.equal((await call.start({ ...REQ, provider: 'grok' })).provider, 'grok');
  assert.equal((await call.start({ ...REQ, provider: 'nonsense' })).provider, 'elevenlabs', 'an unknown choice is auto');
  const grokOnly = createVoiceCall({ getKey: keys({ grok: XKEY }), file: tmp(), makeClient: () => assert.fail('no ElevenLabs client'), fetchFn });
  assert.equal((await grokOnly.start(REQ)).provider, 'grok');
  assert.deepEqual(PROVIDERS, ['auto', 'elevenlabs', 'grok']);
});

test('ElevenLabs: creates the agent once, keeps its id in the file and reuses it', async () => {
  const file = tmp();
  const client = fakeClient();
  const madeWith = [];
  const call = createVoiceCall({ getKey: ONLY_ELEVEN, file, makeClient: (key) => { madeWith.push(key); return client; } });
  assert.deepEqual(await call.status(), { ready: true });

  const first = await call.start(REQ);
  assert.equal(first.ok, true);
  assert.equal(first.provider, 'elevenlabs');
  assert.match(first.signedUrl, /^wss:\/\//);
  assert.equal(first.voiceId, JUAN, 'Juan by default');
  assert.deepEqual(Object.keys(first.dynamicVariables).sort(), ['builder_name', 'greeting', 'project_context', 'project_memory', 'project_name', 'speech_style', 'tech_level', 'welcome_mode']);
  assert.deepEqual({ ...first.dynamicVariables, project_memory: '', greeting: '' }, { project_name: 'Feria Online', project_context: 'Carpetas: web, api.', builder_name: 'Claude', project_memory: '', greeting: '', tech_level: t.voice.levels.basico, speech_style: t.voice.styles.pana, welcome_mode: t.voice.welcome.off });
  assert.ok(t.voice.greetings.pana.map((g) => g.replace('{{project_name}}', 'Feria Online')).includes(first.dynamicVariables.greeting), 'a pana greeting, with the project in');
  assert.ok(first.dynamicVariables.project_memory.length > 0, 'without a memory: the placeholder');
  assert.equal(madeWith[0], KEY, 'the key only goes to the client');
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual({ ...saved, voices: undefined }, { agentId: 'agent_1', hash: HASH, voiceMode: 'realtime', voices: undefined });
  assert.deepEqual(saved.voices.ids, { [JUAN]: JUAN });
  assert.match(saved.voices.account, /^[0-9a-f]{16}$/);
  assert.ok(!fs.readFileSync(file, 'utf8').includes(KEY), 'the file never holds the key');
  assert.equal(first.voiceMode, 'realtime');
  assert.equal((fs.statSync(file).mode & 0o777).toString(8), '600');

  // a second call, and a new instance on the same file, both reuse the agent and the voice check
  await call.start(REQ);
  await createVoiceCall({ getKey: ONLY_ELEVEN, file, makeClient: () => client }).start(REQ);
  assert.deepEqual(client.ops(), ['voiceGet', 'create', 'mode', 'signedUrl', 'signedUrl', 'signedUrl']);
  assert.deepEqual(client.calls.filter(([op]) => op === 'signedUrl').map(([, id]) => id), ['agent_1', 'agent_1', 'agent_1']);
});

test('updates the saved agent when its configuration changed (new prompt, voice, tools)', async () => {
  const file = tmp();
  fs.writeFileSync(file, JSON.stringify({ agentId: 'agent_old', hash: 'stale' }));
  const client = fakeClient();
  const result = await createVoiceCall({ getKey: ONLY_ELEVEN, file, makeClient: () => client }).start(REQ);
  assert.equal(result.ok, true);
  assert.deepEqual(client.ops(), ['voiceGet', 'update', 'mode', 'signedUrl']);
  assert.equal(client.calls[1][1], 'agent_old');
  assert.deepEqual(client.calls[1][2], agentConfig());
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual([saved.agentId, saved.hash, saved.voiceMode], ['agent_old', HASH, 'realtime']);
});

test('a saved agent that no longer exists (404) is created again', async () => {
  // on update
  const file = tmp();
  fs.writeFileSync(file, JSON.stringify({ agentId: 'agent_gone', hash: 'stale' }));
  const client = fakeClient({ fail: { update: [httpError(404)] } });
  assert.equal((await createVoiceCall({ getKey: ONLY_ELEVEN, file, makeClient: () => client }).start(REQ)).ok, true);
  assert.deepEqual(client.ops(), ['voiceGet', 'update', 'create', 'mode', 'signedUrl']);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).agentId, 'agent_1');

  // on the signed URL of an agent that looked current
  const file2 = tmp();
  fs.writeFileSync(file2, JSON.stringify({ agentId: 'agent_gone', hash: HASH }));
  const client2 = fakeClient({ fail: { signedUrl: [httpError(404)] } });
  const result = await createVoiceCall({ getKey: ONLY_ELEVEN, file: file2, makeClient: () => client2 }).start(REQ);
  assert.equal(result.ok, true);
  assert.deepEqual(client2.ops(), ['voiceGet', 'signedUrl', 'create', 'mode', 'signedUrl']);
  assert.equal(JSON.parse(fs.readFileSync(file2, 'utf8')).agentId, 'agent_1');
});

test('a library voice missing from the account is added once, with its owner and a Qubi name', async () => {
  const file = tmp();
  fs.writeFileSync(file, JSON.stringify({ agentId: 'agent_1', hash: HASH, voiceMode: 'realtime' }));
  const julio = VOICES.elevenlabs.julio;
  const client = fakeClient({ missing: [julio.id] });
  const call = createVoiceCall({ getKey: ONLY_ELEVEN, file, makeClient: () => client });
  const result = await call.start({ ...REQ, voice: 'julio' });
  assert.equal(result.voiceId, julio.id);
  const share = client.calls.find(([op]) => op === 'voiceShare');
  assert.deepEqual(share.slice(1), [julio.owner, julio.id, { newName: t.voice.sharedVoiceName('Julio') }]);
  assert.equal(share[3].newName, 'Qubi · Julio');
  // Juan, the agent's own voice, is checked too (it is in the account here)
  assert.deepEqual(voicesCache(file).ids, { [julio.id]: julio.id, [JUAN]: JUAN });

  // two quick calls with the same voice on a fresh file: one check only
  const file2 = tmp();
  fs.writeFileSync(file2, JSON.stringify({ agentId: 'agent_1', hash: HASH }));
  const client2 = fakeClient({ missing: [julio.id] });
  const call2 = createVoiceCall({ getKey: ONLY_ELEVEN, file: file2, makeClient: () => client2 });
  await Promise.all([call2.start({ ...REQ, voice: 'julio' }), call2.start({ ...REQ, voice: 'julio' })]);
  assert.equal(client2.ops().filter((op) => op === 'voiceShare').length, 1);
  assert.equal(client2.calls.filter(([op, id]) => op === 'voiceGet' && id === julio.id).length, 1);

  // later calls use the cache: no voices request at all
  const before = client.ops().filter((op) => op.startsWith('voice')).length;
  await call.start({ ...REQ, voice: 'julio' });
  assert.equal(client.ops().filter((op) => op.startsWith('voice')).length, before);
});

test('the voices cache belongs to one account: another key checks again', async () => {
  const file = tmp();
  const client = fakeClient();
  await createVoiceCall({ getKey: ONLY_ELEVEN, file, makeClient: () => client }).start(REQ);
  const otherKey = ['sk', 'other', 'account', 'abcdefghijklmnopqrstuvwxyz0123456789'].join('_');
  await createVoiceCall({ getKey: keys({ elevenlabs: otherKey }), file, makeClient: () => client }).start(REQ);
  assert.equal(client.ops().filter((op) => op === 'voiceGet').length, 2);
});

test('the voice is only a key of the list; an unknown one or a Grok one falls back to Juan', async () => {
  const file = tmp();
  const client = fakeClient();
  const call = createVoiceCall({ getKey: ONLY_ELEVEN, file, makeClient: () => client });
  for (const voice of ['GRGd9ooJazPy9jV7czfS', 'rex', '__proto__', 42, undefined]) {
    assert.equal((await call.start({ ...REQ, voice })).voiceId, JUAN, String(voice));
  }
  assert.deepEqual(client.calls.filter(([op]) => op === 'voiceGet').map(([, id]) => id), [JUAN]);
  for (const name of Object.keys(VOICES.elevenlabs)) {
    assert.equal((await call.start({ ...REQ, voice: name })).voiceId, VOICES.elevenlabs[name].id, name);
  }
  assert.equal(DEFAULT_VOICE.elevenlabs, 'juan');
  assert.deepEqual(Object.keys(VOICES.elevenlabs), ['juan', 'julio', 'josemanuel', 'maggie']);
  assert.deepEqual(Object.keys(VOICES.grok), ['rex', 'eve', 'ara']);
});

test('a voice that cannot be added (full slots) does not stop the call: Qubi keeps the agent voice', async () => {
  const file = tmp();
  fs.writeFileSync(file, JSON.stringify({ agentId: 'agent_1', hash: HASH, voiceMode: 'realtime' }));
  const maggie = VOICES.elevenlabs.maggie;
  const client = fakeClient({ missing: [maggie.id], fail: { voiceShare: [httpError(400, { detail: { status: 'voice_limit_reached' } })] } });
  const result = await createVoiceCall({ getKey: ONLY_ELEVEN, file, makeClient: () => client }).start({ ...REQ, voice: 'maggie' });
  assert.equal(result.ok, true);
  assert.equal(result.voiceId, null);
  assert.equal(voicesCache(file).ids[maggie.id], undefined, 'not cached: tried again next time');

  // a network failure while checking the voice is the call's failure
  const offline = fakeClient({ fail: { voiceGet: [Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } })] } });
  assert.deepEqual(await createVoiceCall({ getKey: ONLY_ELEVEN, file: tmp(), makeClient: () => offline }).start(REQ), { ok: false, reason: 'network' });
});

test('a fixed development voice (PLATANUS_VOICE_ID) is used as it is, without voice requests', async () => {
  const client = fakeClient();
  const call = createVoiceCall({ getKey: ONLY_ELEVEN, file: tmp(), makeClient: () => client, voiceId: 'abcdefghij1234567890' });
  const result = await call.start({ ...REQ, voice: 'julio' });
  assert.equal(result.voiceId, 'abcdefghij1234567890');
  assert.ok(!client.ops().some((op) => op.startsWith('voice')));
  assert.equal(client.calls.find(([op]) => op === 'create')[1].conversationConfig.tts.voiceId, 'abcdefghij1234567890');
});

test('errors map to plain reasons and never carry the key', async () => {
  const cases = [
    [httpError(401), 'auth'],
    [httpError(403), 'auth'],
    [httpError(401, { detail: { status: 'quota_exceeded', message: 'quota' } }), 'quota'],
    [httpError(429), 'quota'],
    [httpError(500), 'failed'],
    [Object.assign(new Error('fetch failed'), { cause: Object.assign(new Error('getaddrinfo'), { code: 'ENOTFOUND' }) }), 'network'],
    [Object.assign(new Error('Timeout exceeded'), { name: 'ElevenLabsTimeoutError' }), 'network'],
    [Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }), 'network'],
    [new Error('something else'), 'failed'],
  ];
  for (const [error, reason] of cases) {
    assert.equal(reasonFor(error), reason, error.message);
    const client = fakeClient({ fail: { create: [error] } });
    const result = await createVoiceCall({ getKey: ONLY_ELEVEN, file: tmp(), makeClient: () => client }).start(REQ);
    assert.deepEqual(result, { ok: false, reason });
  }
  const ok = await createVoiceCall({ getKey: ONLY_ELEVEN, file: tmp(), makeClient: () => fakeClient() }).start(REQ);
  assert.ok(!JSON.stringify(ok).includes(KEY));
});

test('texts from the window are cleaned and capped', async () => {
  const call = createVoiceCall({ getKey: ONLY_ELEVEN, file: tmp(), makeClient: () => fakeClient() });
  const { dynamicVariables } = await call.start({ projectName: 'Mi\u0000 app\n', context: `a\u0007b\n${'x'.repeat(3000)}`, builder: '' });
  assert.equal(dynamicVariables.project_name, 'Mi app');
  assert.ok(dynamicVariables.project_context.startsWith('ab\nx'));
  assert.equal(dynamicVariables.project_context.length, 2500);
  assert.ok(dynamicVariables.builder_name.length > 0, 'a default builder name');
});

test('the project memory goes in its own variable, cleaned and capped at 800', async () => {
  const call = createVoiceCall({ getKey: ONLY_ELEVEN, file: tmp(), makeClient: () => fakeClient() });
  const short = await call.start({ ...REQ, memory: 'Llamadas anteriores: una página.\nAprendido: usa Next.js.' });
  assert.equal(short.dynamicVariables.project_memory, 'Llamadas anteriores: una página.\nAprendido: usa Next.js.');
  const long = await call.start({ ...REQ, memory: `a\u0007${'m'.repeat(2000)}` });
  assert.equal(long.dynamicVariables.project_memory.length, LIMITS.memory);
  assert.equal(LIMITS.memory, 800);
  assert.ok(long.dynamicVariables.project_memory.startsWith('am'));
  assert.deepEqual(LIMITS, { projectName: 120, context: 2500, builder: 40, memory: 800 });
});

const TOOL_NAMES = ['ver_proyecto', 'construir', 'preguntar', 'ver_avance', 'mostrar_carpeta', 'repartir', 'ver_equipo', 'ir_a', 'volver', 'ajustar_qubi', 'revisar_archivo', 'abrir_archivo', 'ejecutar_app', 'abrir_en_navegador', 'auditar', 'reparar', 'gesto', 'elegir_experiencia', 'marcar_tecnologia', 'empezar_proyecto', 'seguir_manual'];
const REQUIRED = {
  ver_proyecto: [], construir: ['pedido'], preguntar: ['pregunta'], ver_avance: [], mostrar_carpeta: ['ruta'], repartir: ['tareas'], ver_equipo: [],
  ir_a: ['ruta'], volver: [], ajustar_qubi: [], revisar_archivo: ['ruta', 'pregunta'], abrir_archivo: ['ruta'], ejecutar_app: [], abrir_en_navegador: [], auditar: [], reparar: ['ruta'], gesto: ['gesto'],
  elegir_experiencia: ['nivel'], marcar_tecnologia: ['tecnologia', 'elegir'], empezar_proyecto: [], seguir_manual: [],
};
// the tools that ask the person for permission first wait for the answer (MEJORAS.md §2)
const ASKS_PERMISSION = new Set(['abrir_archivo', 'ejecutar_app', 'abrir_en_navegador']);

test('the agent: Spanish, Venezuelan greeting, private, voice override allowed, client tools and endCall', () => {
  const config = agentConfig();
  const { agent, tts, conversation } = config.conversationConfig;
  assert.equal(config.name, 'Qubi · Qubbot');
  assert.equal(agent.language, 'es');
  assert.equal(config.platformSettings.auth.enableAuth, true);
  assert.deepEqual(config.platformSettings.overrides, { conversationConfigOverride: { tts: { voiceId: true } } });
  assert.equal(agent.prompt.llm, 'gemini-2.5-flash');
  assert.equal(tts.modelId, 'eleven_v4_turbo');
  assert.equal(tts.voiceId, JUAN, 'Juan by default');
  assert.ok(conversation.clientEvents.includes('client_tool_call'));
  // the greeting changes per call: the window sends it filled as a variable
  assert.equal(agent.firstMessage, '{{greeting}}');
  assert.equal(agent.dynamicVariables.dynamic_variable_placeholders.greeting, t.voice.greetings.pana[0].replace('{{project_name}}', t.voice.defaults.projectName));
  assert.ok(agent.prompt.prompt.includes('{{greeting}}'), 'Qubi knows how it picked up');
  assert.equal(agent.prompt.prompt, t.voice.prompt);
  for (const section of ['# Personalidad', '# Entorno', '# Brevedad', '# Tono', '# Objetivo', '# Herramientas', '# Permisos', '# Reglas']) {
    assert.ok(agent.prompt.prompt.includes(section), section);
  }
  for (const variable of ['gesto', 'celebrar', 'auditar', 'reparar', 'la auditoría', '{{project_context}}', '{{builder_name}}', '{{project_memory}}', '[aviso de Qubbot]', 'repartir', 'ver_equipo']) assert.ok(agent.prompt.prompt.includes(variable), variable);
  assert.deepEqual(Object.keys(agent.dynamicVariables.dynamic_variable_placeholders).sort(), ['builder_name', 'greeting', 'project_context', 'project_memory', 'project_name', 'speech_style', 'tech_level', 'welcome_mode']);
  assert.equal(agent.prompt.builtInTools.endCall.params.systemToolType, 'end_call');

  const tools = agent.prompt.tools;
  assert.deepEqual(tools.map((tool) => tool.name), TOOL_NAMES);
  assert.deepEqual(Object.fromEntries(tools.map((tool) => [tool.name, tool.parameters?.required ?? []])), REQUIRED);
  for (const tool of tools) {
    assert.equal(tool.type, 'client');
    assert.equal(tool.expectsResponse, true);
    if (ASKS_PERMISSION.has(tool.name)) assert.equal(tool.responseTimeoutSecs, 60, tool.name);
    else if (tool.name === 'auditar') assert.equal(tool.responseTimeoutSecs, 30, 'a big project takes a moment to read');
    else assert.ok(tool.responseTimeoutSecs >= 10 && tool.responseTimeoutSecs <= 15, tool.name);
    assert.ok(tool.description.length > 20, tool.name);
    for (const name of tool.parameters?.required ?? []) {
      assert.equal(tool.parameters.properties[name].type, tool.name === 'repartir' ? 'array' : 'string');
      assert.ok(tool.parameters.properties[name].description.length > 10, name);
    }
  }

  // repartir: a list of tasks, each one { titulo, pedido, carpeta }, all strings (the SDK's array and
  // object schema shapes; it has no minItems/maxItems, so "2 or 3" is in the description and the app checks it)
  const tareas = tools.find((tool) => tool.name === 'repartir').parameters.properties.tareas;
  assert.equal(tareas.items.type, 'object');
  assert.deepEqual(tareas.items.required, ['titulo', 'pedido', 'carpeta']);
  for (const name of tareas.items.required) {
    assert.equal(tareas.items.properties[name].type, 'string');
    assert.ok(tareas.items.properties[name].description.length > 10, name);
  }
  assert.match(tareas.description, /2 o 3/);
});

test('voice and model can be chosen; the hash follows the configuration', () => {
  const custom = agentConfig({ voiceId: 'abcdefghij1234567890', llm: 'gpt-4o-mini' });
  assert.equal(custom.conversationConfig.tts.voiceId, 'abcdefghij1234567890');
  assert.equal(custom.conversationConfig.agent.prompt.llm, 'gpt-4o-mini');
  assert.equal(configHash(agentConfig()), configHash(agentConfig()));
  assert.notEqual(configHash(agentConfig()), configHash(custom));
});

test('voice to voice: the agent is put on a Realtime model; without access it stays in the classic mode', async () => {
  const client = fakeClient();
  const result = await createVoiceCall({ getKey: ONLY_ELEVEN, file: tmp(), makeClient: () => client }).start(REQ);
  const mode = client.calls.find(([op]) => op === 'mode');
  assert.deepEqual(mode[3], { additionalBodyParameters: { conversation_config: { realtime_model: REALTIME_MODEL } } });
  assert.deepEqual(mode[2], {}, 'only the voice mode changes in that update');
  assert.equal(result.voiceMode, 'realtime');

  // "Realtime models are not available for this workspace." -> the call still works, in the classic mode
  const denied = fakeClient({ fail: { mode: [httpError(422, { detail: 'Realtime models are not available for this workspace.' })] } });
  const file = tmp();
  const fallback = await createVoiceCall({ getKey: ONLY_ELEVEN, file, makeClient: () => denied }).start(REQ);
  assert.equal(fallback.ok, true);
  assert.equal(fallback.voiceMode, 'custom');
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).voiceMode, 'custom');

  // turned off: the agent is set back to its LLM and voice
  const off = fakeClient();
  const plain = await createVoiceCall({ getKey: ONLY_ELEVEN, file: tmp(), makeClient: () => off, realtime: null }).start(REQ);
  assert.deepEqual(off.calls.find(([op]) => op === 'mode')[3].additionalBodyParameters, { conversation_config: { realtime_model: null } });
  assert.equal(plain.voiceMode, 'custom');

  // a network failure is not a "no access": the call reports it
  const offline = fakeClient({ fail: { mode: [Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } })] } });
  assert.deepEqual(await createVoiceCall({ getKey: ONLY_ELEVEN, file: tmp(), makeClient: () => offline }).start(REQ), { ok: false, reason: 'network' });
});

test('Grok: mints a 300 s client secret with the key and answers the session to open', async () => {
  const fetchFn = fakeFetch();
  const call = createVoiceCall({ getKey: keys({ grok: XKEY }), file: tmp(), makeClient: () => assert.fail('no ElevenLabs client'), fetchFn });
  const result = await call.start({ ...REQ, memory: 'Aprendido: usa Next.js.', provider: 'grok', voice: 'eve' });

  assert.equal(fetchFn.requests.length, 1);
  const [{ url, init }] = fetchFn.requests;
  assert.equal(url, 'https://api.x.ai/v1/realtime/client_secrets');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.Authorization, `Bearer ${XKEY}`);
  assert.deepEqual(JSON.parse(init.body), { expires_after: { seconds: 300 } });

  assert.equal(result.ok, true);
  assert.equal(result.provider, 'grok');
  assert.equal(result.token, 'ek_live_secret_123');
  assert.equal(result.expiresAt, 1_900_000_000);
  assert.equal(result.model, GROK_MODEL);
  assert.equal(GROK_MODEL, 'grok-voice-latest');
  assert.ok(!JSON.stringify(result).includes(XKEY), 'the key never leaves main');

  const { session } = result;
  assert.deepEqual(Object.keys(session).sort(), ['firstMessage', 'instructions', 'language', 'tools', 'voice']);
  assert.equal(session.language, 'es-MX');
  assert.equal(session.voice, VOICES.grok.eve.id);
  assert.ok(t.voice.greetings.pana.map((g) => g.replace('{{project_name}}', 'Feria Online')).includes(session.firstMessage));
  assert.ok(session.instructions.includes(session.firstMessage), 'the prompt knows the greeting it used');
  // the same prompt, with its variables already filled
  assert.ok(!/\{\{\w+\}\}/.test(session.instructions));
  for (const value of ['Feria Online', 'Carpetas: web, api.', 'Claude', 'Aprendido: usa Next.js.', '# Permisos']) assert.ok(session.instructions.includes(value), value);
  assert.deepEqual(session.tools, grokTools());
});

test('Grok: the voice defaults to Rex, the tools are the same ones in function format', async () => {
  const call = createVoiceCall({ getKey: keys({ grok: XKEY }), file: tmp(), fetchFn: fakeFetch() });
  for (const voice of ['juan', 'nope', undefined]) assert.equal((await call.start({ ...REQ, voice })).session.voice, VOICES.grok.rex.id, String(voice));
  assert.equal(DEFAULT_VOICE.grok, 'rex');
  const tools = grokTools();
  assert.deepEqual(tools.map((tool) => tool.name), TOOL_NAMES);
  for (const tool of tools) {
    assert.equal(tool.type, 'function');
    assert.ok(tool.description.length > 20, tool.name);
    assert.equal(tool.parameters.type, 'object');
    assert.deepEqual(tool.parameters.required ?? [], REQUIRED[tool.name], tool.name);
  }
  assert.deepEqual(tools.find((tool) => tool.name === 'volver').parameters, { type: 'object', properties: {} });
});

test('Grok: the secret is read defensively from the answers the API has used', async () => {
  const shapes = [
    [{ value: 'tok_a', expires_at: 123 }, 'tok_a', 123],
    [{ client_secret: { value: 'tok_b', expires_at: 456 } }, 'tok_b', 456],
    [{ token: 'tok_c' }, 'tok_c', null],
  ];
  for (const [reply, token, expiresAt] of shapes) {
    const before = Math.floor(Date.now() / 1000);
    const result = await createVoiceCall({ getKey: keys({ grok: XKEY }), file: tmp(), fetchFn: fakeFetch({ reply }) }).start(REQ);
    assert.equal(result.token, token);
    if (expiresAt) assert.equal(result.expiresAt, expiresAt);
    else assert.ok(result.expiresAt >= before + 300 && result.expiresAt <= before + 301, 'about 300 s from now');
  }
  for (const reply of [{}, { value: '' }, { value: 'has space' }, { value: 42 }, null]) {
    assert.deepEqual(await createVoiceCall({ getKey: keys({ grok: XKEY }), file: tmp(), fetchFn: fakeFetch({ reply }) }).start(REQ), { ok: false, reason: 'failed' }, JSON.stringify(reply));
  }
});

test('Grok: errors map like ElevenLabs ones and never carry the key', async () => {
  const cases = [
    [{ status: 401 }, 'auth'],
    [{ status: 403 }, 'auth'],
    [{ status: 429 }, 'quota'],
    [{ status: 402 }, 'quota'],
    [{ status: 400, text: '{"error":"Your team has run out of credits"}' }, 'quota'],
    [{ status: 500 }, 'failed'],
    [{ error: Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }) }, 'network'],
    [{ error: Object.assign(new Error('timeout'), { name: 'TimeoutError' }) }, 'network'],
  ];
  for (const [options, reason] of cases) {
    const result = await createVoiceCall({ getKey: keys({ grok: XKEY }), file: tmp(), fetchFn: fakeFetch(options) }).start(REQ);
    assert.deepEqual(result, { ok: false, reason }, JSON.stringify(options));
  }
  const noFetch = createVoiceCall({ getKey: keys({ grok: XKEY }), file: tmp(), fetchFn: null });
  assert.deepEqual(await noFetch.start(REQ), { ok: false, reason: 'network' });
});

test('the agent falls back to a premade voice when Juan cannot be added (a key without voices_write)', async () => {
  const client = fakeClient({ missing: [JUAN], fail: { voiceShare: [401, 401].map((code) => httpError(code, { detail: { status: 'missing_permissions' } })) } });
  const result = await createVoiceCall({ getKey: ONLY_ELEVEN, file: tmp(), makeClient: () => client }).start(REQ);
  assert.equal(result.ok, true);
  assert.notEqual(client.calls.find(([op]) => op === 'create')[1].conversationConfig.tts.voiceId, JUAN);
});

test('greetings: several per style, Venezuelan by default, each with the project and a question', () => {
  const { greetings } = t.voice;
  assert.deepEqual(Object.keys(greetings).sort(), Object.keys(t.voice.styles).sort());
  assert.ok(greetings.pana.length >= 8, 'many ways to pick up as a pana');
  for (const [style, list] of Object.entries(greetings)) {
    assert.ok(list.length >= 3, style);
    assert.equal(new Set(list).size, list.length, `${style}: no repeats`);
    for (const g of list) {
      assert.ok(g.includes('{{project_name}}') && g.includes('?') && g.length <= 90, `short and direct: ${g}`);
      assert.deepEqual(g.match(/\{\{\w+\}\}/g), ['{{project_name}}'], g);
    }
  }
  const venezuelan = /¡Epa|¡Épale|pana|chamo|chévere|Naguará|fino|molleja|burda|pichón/;
  for (const g of greetings.pana) assert.match(g, venezuelan, g);
  // Qubi just starts talking: no «¡Aló!», «¿quién habla?» or other phone words
  for (const list of Object.values(greetings)) for (const g of list) assert.doesNotMatch(g, /al[óo]\b|llamada|llamaste|quién habla|ring/i, g);
});

test('greetings: picked from the chosen style, never the same twice in a row', async () => {
  const always = (n) => () => n;
  const call = createVoiceCall({ getKey: ONLY_ELEVEN, file: tmp(), makeClient: () => fakeClient(), random: always(0) });
  const fill = (style) => t.voice.greetings[style].map((g) => g.replace('{{project_name}}', 'Feria Online'));
  const seen = [];
  for (let i = 0; i < 6; i++) seen.push((await call.start(REQ)).dynamicVariables.greeting);
  for (const g of seen) assert.ok(fill('pana').includes(g), g);
  for (let i = 1; i < seen.length; i++) assert.notEqual(seen[i], seen[i - 1]);
  const formal = (await call.start({ ...REQ, style: 'formal' })).dynamicVariables.greeting;
  assert.ok(fill('formal').includes(formal), formal);
  // an unknown style falls back to pana; the random number never picks outside the list
  const odd = createVoiceCall({ getKey: ONLY_ELEVEN, file: tmp(), makeClient: () => fakeClient(), random: always(0.999999) });
  assert.ok(fill('pana').includes((await odd.start({ ...REQ, style: 'raro' })).dynamicVariables.greeting));
});

// The welcome of a new project (docs/features/welcome-robot/): Qubi asks the interview by voice
test('welcome: the call starts with the welcome greeting and its instructions; a normal call says it does not apply', async () => {
  const client = fakeClient();
  const call = createVoiceCall({ getKey: ONLY_ELEVEN, file: tmp(), makeClient: () => client });
  const normal = await call.start(REQ);
  assert.equal(normal.dynamicVariables.welcome_mode, t.voice.welcome.off);
  const welcome = await call.start({ ...REQ, welcome: true });
  assert.equal(welcome.dynamicVariables.welcome_mode, t.voice.welcome.instructions);
  assert.equal(welcome.dynamicVariables.greeting, t.voice.welcome.greetings.pana.replace('{{project_name}}', 'Feria Online'));
  const formal = await call.start({ ...REQ, welcome: true, style: 'formal' });
  assert.equal(formal.dynamicVariables.greeting, t.voice.welcome.greetings.formal.replace('{{project_name}}', 'Feria Online'));
  // anything but true is a normal call
  assert.equal((await call.start({ ...REQ, welcome: 'yes' })).dynamicVariables.welcome_mode, t.voice.welcome.off);
});

test('welcome: every style has a greeting that says Qubi listens and the buttons work too; the prompt has its section', () => {
  const { welcome } = t.voice;
  assert.deepEqual(Object.keys(welcome.greetings).sort(), Object.keys(t.voice.styles).sort());
  for (const [style, g] of Object.entries(welcome.greetings)) {
    assert.match(g, /escucho|escuchando/i, style);
    assert.match(g, /botones/i, style);
    assert.match(g, /\?$/, `${style} ends asking`);
  }
  for (const tool of ['elegir_experiencia', 'marcar_tecnologia', 'empezar_proyecto', 'seguir_manual', 'ejecutar_app', 'end_call']) assert.ok(welcome.instructions.includes(tool), tool);
  // the demo lasts 3 minutes: a beginner goes straight to the build, without a "keep them?" round trip
  assert.match(welcome.instructions, /empezar_proyecto de una, sin preguntar/);
  for (const g of Object.values(welcome.greetings)) assert.ok(g.length <= 100, `quick welcome: ${g}`);
  const { agent } = agentConfig().conversationConfig;
  assert.ok(agent.prompt.prompt.includes('# Bienvenida') && agent.prompt.prompt.includes('{{welcome_mode}}'));
  assert.equal(agent.dynamicVariables.dynamic_variable_placeholders.welcome_mode, welcome.off);
});

test('welcome: Grok gets the instructions and the greeting already filled', async () => {
  const fetchFn = async () => ({ ok: true, json: async () => ({ value: 'ek_live_secret_123', expires_at: 1_900_000_000 }) });
  const call = createVoiceCall({ getKey: keys({ grok: XKEY }), file: tmp(), makeClient: () => assert.fail('no ElevenLabs client'), fetchFn });
  const { session } = await call.start({ ...REQ, provider: 'grok', welcome: true });
  assert.equal(session.firstMessage, t.voice.welcome.greetings.pana.replace('{{project_name}}', 'Feria Online'));
  assert.ok(session.instructions.includes(t.voice.welcome.instructions));
  assert.ok(session.tools.some((tool) => tool.name === 'empezar_proyecto'));
});
