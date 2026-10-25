// Call with Qubi (docs/features/llamada/README.md, VOZ.md, MEJORAS.md): hands the window what it needs to
// talk to Qubi with one of two voice providers, never the key itself.
// - ElevenLabs: makes sure the voice agent "Qubi" exists in the person's account (created or updated when
//   its configuration changes) and that the chosen Venezuelan library voice is in the account, then
//   answers a signed URL.
// - Grok Voice (xAI): mints a short-lived client secret and answers it with the session to open
//   (instructions, voice and the same client tools).
// Qubi only talks: the building is done by the person's own agent through the chat and Qubbot' MCP
// tools. Tested in voiceCall.test.js with a fake client and a fake fetch (no network).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const t = require('./strings');

const DEFAULT_LLM = 'gemini-2.5-flash'; // fast: a voice turn cannot wait for a slow model
const TTS_MODEL = 'eleven_v4_turbo';
// Voice to voice: a Realtime model hears and answers in audio (like Grok's voice mode), no transcribe →
// think → read aloud. ElevenLabs manages its LLM, TTS and ASR; the ones above are its fallback ("Custom"
// mode), used too when the account has no Realtime access yet.
const REALTIME_MODEL = 'eleven_realtime_v1_mini';
const REALTIME_MODELS = new Set(['eleven_realtime_v1_mini', 'eleven_realtime_v1_max']);
// memory: what Qubbot remembers of this project from earlier calls (projectMemory.js, phase 3); optional
const LIMITS = { projectName: 120, context: 2500, builder: 40, memory: 800 };
// How technical Qubi talks: the person's choice in the call settings (electron/strings.js voice.levels)
const LEVELS = ['basico', 'intermedio', 'tecnico'];
// How Qubi talks: pana (Venezuelan, the default), neutral, formal or divertido (electron/strings.js voice.styles)
const STYLES = ['pana', 'neutral', 'formal', 'divertido'];
// What the window needs from the conversation (the SDK speaks only the events listed here)
const CLIENT_EVENTS = [
  'conversation_initiation_metadata', 'ping', 'audio', 'interruption', 'user_transcript', 'agent_response',
  'agent_response_correction', 'client_tool_call', 'agent_tool_response', 'vad_score',
];

// What the window may ask for: 'auto' takes ElevenLabs when it has a key, else Grok.
const PROVIDERS = Object.freeze(['auto', 'elevenlabs', 'grok']);
// The voices Qubi can have. The window sends a key of this list, never a free id.
// ElevenLabs: Venezuelan voices of the public library; `owner` is their public owner id, needed to add
// them to the person's account (each one takes 1 of the plan's voice slots, only once).
// Grok: the voice names of xAI's Voice Agent API.
const VOICES = Object.freeze({
  elevenlabs: Object.freeze({
    juan: Object.freeze({ id: 'GRGd9ooJazPy9jV7czfS', owner: 'ef2f1a10114f060c2070a37c6a1882c5fe07bff3f111d07a8d99d2c55c7f4031', name: 'Juan' }),
    julio: Object.freeze({ id: 'iR9Trc8OO7UjgvidHn45', owner: '753480044ba0091e7152fe99d65465d86bf4c2c0f6c2985dfa8b33d0470ba4dd', name: 'Julio' }),
    josemanuel: Object.freeze({ id: 'nYm4p0R8BhHFRBH8wGHm', owner: 'd8201db5fe65f15b7d662eac6a313000e802458a3c4634e1400b5a3374484d08', name: 'José Manuel' }),
    maggie: Object.freeze({ id: 'bfzeMrk4OVi07v1gHaGo', owner: 'aae4bf45809c8ef5c5045c3494adecca5c6673e3ac245ff85a33993244c06c25', name: 'Maggie' }),
  }),
  grok: Object.freeze({
    rex: Object.freeze({ id: 'Rex', name: 'Rex' }),
    eve: Object.freeze({ id: 'Eve', name: 'Eve' }),
    ara: Object.freeze({ id: 'Ara', name: 'Ara' }),
  }),
});
const DEFAULT_VOICE = Object.freeze({ elevenlabs: 'juan', grok: 'rex' });
const DEFAULT_VOICE_ID = VOICES.elevenlabs.juan.id;
// A premade voice every account has: the agent falls back to it when Juan cannot be added (a key without
// the voices_write permission, full voice slots), so a call never fails over the voice
const FALLBACK_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb';

const GROK_MODEL = 'grok-voice-latest';
const GROK_SECRETS_URL = 'https://api.x.ai/v1/realtime/client_secrets';
const GROK_SECRET_SECONDS = 300; // only to open the socket: the call itself can last longer
const GROK_TIMEOUT_MS = 15_000;
// A key is only ever sent to its own provider: a key of the other one (a wiring mistake) counts as none
const KEY_FAMILY = { elevenlabs: /^sk_/, grok: /^xai-/ };

// How long a tool may wait for the window. The ones that ask the person for permission first wait for
// the answer (MEJORAS.md §2): 60 s. The window keeps under it (callViewModel PERMISSION_MS 45 s, and
// ejecutar_app answers 'arrancando' by TOOL_ANSWER_MS 55 s), so a slow start is never reported as failed.
const PERMISSION_WAIT = 60;

const text = (description) => ({ type: 'string', description });
// An object schema whose fields are all required strings: { name: description }
const strings = (fields, description) => ({
  type: 'object',
  ...(description ? { description } : {}),
  required: Object.keys(fields),
  properties: Object.fromEntries(Object.entries(fields).map(([name, about]) => [name, text(about)])),
});

// repartir: 2 or 3 tasks, each one in its own folder. The SDK's array schema has no minItems/maxItems
// (unknown keys are stripped), so the count is in the description and the app checks it (teamViewModel).
const tasksParameters = (v) => ({
  type: 'object',
  required: ['tareas'],
  properties: {
    tareas: {
      type: 'array',
      description: v.tools.repartirTareas,
      items: strings({ titulo: v.tools.repartirTitulo, pedido: v.tools.repartirPedido, carpeta: v.tools.repartirCarpeta }, v.tools.repartirTarea),
    },
  },
});

// The window's client tools, shared by both providers: [name, timeout in s, parameters?]
const toolSpecs = (v = t.voice) => [
  ['ver_proyecto', 10],
  ['construir', 15, strings({ pedido: v.tools.construirPedido })],
  ['preguntar', 15, strings({ pregunta: v.tools.preguntarPregunta })],
  ['ver_avance', 10],
  ['mostrar_carpeta', 10, strings({ ruta: v.tools.mostrarCarpetaRuta })],
  // phase 2: the team of workers, each one in its own folder (docs/features/llamada/FASE2.md)
  ['repartir', 15, tasksParameters(v)],
  ['ver_equipo', 10],
  // MEJORAS.md §2-3: guiding Qubi on the map (no permission: it only moves the view) ...
  ['ir_a', 15, strings({ ruta: v.tools.irARuta })],
  ['volver', 10],
  // ... and acting in the project, always after the person says yes
  // reading a file in the background (read-only, no editor): the summary comes later as a notice
  // the person reshapes Qubi by talking: level, style, voice (all optional: only what was asked)
  ['ajustar_qubi', 10, { type: 'object', required: [], properties: { nivel: text(v.tools.ajustarNivel), estilo: text(v.tools.ajustarEstilo), voz: text(v.tools.ajustarVoz) } }],
  ['revisar_archivo', 15, strings({ ruta: v.tools.revisarArchivoRuta, pregunta: v.tools.revisarArchivoPregunta })],
  ['abrir_archivo', PERMISSION_WAIT, strings({ ruta: v.tools.abrirArchivoRuta })],
  ['ejecutar_app', PERMISSION_WAIT],
  ['abrir_en_navegador', PERMISSION_WAIT],
  // the security audit: read the project again (only reads), or repair a file (changes files: after a yes)
  ['auditar', 30],
  ['reparar', 15, strings({ ruta: v.tools.repararRuta })],
  // Qubi's body language on the map while it talks (only what is seen)
  ['gesto', 10, strings({ gesto: v.tools.gestoGesto })],
];

// One client tool of the window for ElevenLabs: answers in the same turn (expectsResponse), never with
// file contents or keys. `parameters` is an object schema in the SDK's shapes (ObjectJsonSchemaPropertyInput).
const clientTool = ([name, timeout, parameters], v) => ({
  type: 'client',
  name,
  description: v.tools[name],
  expectsResponse: true,
  responseTimeoutSecs: timeout,
  ...(parameters ? { parameters } : {}),
});
// The same tools in the Realtime API's function format (Grok Voice)
function grokTools(v = t.voice) {
  return toolSpecs(v).map(([name, , parameters]) => ({
    type: 'function',
    name,
    description: v.tools[name],
    parameters: parameters ?? { type: 'object', properties: {} },
  }));
}

// The agent's body for agents.create / agents.update, in the camelCase of @elevenlabs/elevenlabs-js
function agentConfig({ voiceId = DEFAULT_VOICE_ID, llm = DEFAULT_LLM } = {}) {
  const v = t.voice;
  return {
    name: v.agentName,
    conversationConfig: {
      agent: {
        firstMessage: v.firstMessage,
        language: 'es',
        // Typed `unknown` in the SDK, so it goes out as written: the API's own snake_case
        dynamicVariables: {
          dynamic_variable_placeholders: {
            project_name: v.defaults.projectName,
            project_context: v.defaults.context,
            builder_name: v.defaults.builder,
            project_memory: v.defaults.memory,
            tech_level: v.levels[v.defaults.level],
            speech_style: v.styles[v.defaults.style],
            greeting: fill(v.greetings[v.defaults.style][0], { project_name: v.defaults.projectName }),
          },
        },
        prompt: {
          prompt: v.prompt,
          llm,
          tools: toolSpecs(v).map((spec) => clientTool(spec, v)),
          builtInTools: { endCall: { name: 'end_call', description: v.tools.endCall, params: { systemToolType: 'end_call' } } },
        },
      },
      tts: { modelId: TTS_MODEL, voiceId },
      conversation: { clientEvents: CLIENT_EVENTS },
    },
    platformSettings: {
      // Private agent: it can only be reached with a signed URL made with the key
      auth: { enableAuth: true },
      // The window may pick Qubi's voice per call (overrides.tts.voiceId); nothing else can be overridden
      overrides: { conversationConfigOverride: { tts: { voiceId: true } } },
    },
  };
}

// Stable JSON (sorted keys) -> short sha256: the saved agent is updated only when this changes
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
const configHash = (config) => crypto.createHash('sha256').update(stable(config)).digest('hex').slice(0, 16);
// Which account the voices cache belongs to: a short one-way fingerprint, never the key
const accountOf = (key) => crypto.createHash('sha256').update(`platanus-voice:${key}`).digest('hex').slice(0, 16);

// SDK or HTTP error -> a reason the window explains in plain Spanish. ElevenLabs answers an exhausted
// quota with a 401 too, so the body is checked first.
const NETWORK_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENETUNREACH', 'EHOSTUNREACH', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET']);
function reasonFor(error) {
  const status = error?.statusCode;
  if (/quota_exceeded|quota|credits/i.test(JSON.stringify(error?.body ?? ''))) return 'quota';
  if (status === 401 || status === 403) return 'auth';
  if (status === 429 || status === 402) return 'quota';
  if (status) return 'failed';
  if (['ElevenLabsTimeoutError', 'TimeoutError', 'AbortError'].includes(error?.name)) return 'network';
  const codes = [error?.code, error?.cause?.code, error?.cause?.cause?.code];
  if (codes.some((code) => NETWORK_CODES.has(code)) || /fetch failed|network/i.test(error?.message ?? '')) return 'network';
  return 'failed';
}

// Texts from the window: strings without control characters (the context keeps its line breaks), capped
function clean(value, max, { lines = false } = {}) {
  const raw = typeof value === 'string' ? value : '';
  const stripped = lines ? raw.replace(/[^\P{Cc}\n]/gu, '') : raw.replace(/\p{Cc}/gu, '');
  return stripped.trim().slice(0, max);
}
// {{name}} -> its value (Grok has no dynamic variables: the prompt goes out already filled). One pass, so
// a value that contains "{{…}}" is not expanded again.
const fill = (template, values) => template.replace(/\{\{(\w+)\}\}/g, (whole, name) => (Object.hasOwn(values, name) ? values[name] : whole));

const notFound = (error) => error?.statusCode === 404;
// ElevenLabs answers an unknown voice with a 400 whose code is voice_not_found, not a 404
const voiceMissing = (error) => notFound(error) || /voice_not_found/.test(JSON.stringify(error?.body ?? ''));
const httpError = (status, body) => Object.assign(new Error(`Status code: ${status}`), { statusCode: status, body });

function createVoiceCall({ getKey, file, makeClient = defaultClient, fetchFn = globalThis.fetch, voiceId, llm, realtime = REALTIME_MODEL, random = Math.random }) {
  // voiceId: an optional fixed voice for the agent (PLATANUS_VOICE_ID in development); it must already be
  // in the account. Without it the agent speaks with Juan and the window may pick another listed voice.
  const customVoice = typeof voiceId === 'string' && voiceId ? voiceId : null;
  const model = REALTIME_MODELS.has(realtime) ? realtime : null;
  // the agent's own voice is only known once Juan is (or is not) in the account: see ensureAgent
  let config = agentConfig({ voiceId: customVoice ?? DEFAULT_VOICE_ID, llm });
  let hash = configHash({ config, realtime: model });
  const useVoice = (voiceId) => {
    config = agentConfig({ voiceId, llm });
    hash = configHash({ config, realtime: model });
  };
  // How Qubi picks up: one of the style's greetings, never the same as the call before
  let lastGreeting = null;
  const greeting = (style, projectName) => {
    const list = t.voice.greetings[style];
    const fresh = list.length > 1 ? list.filter((g) => g !== lastGreeting) : list;
    lastGreeting = fresh[Math.min(fresh.length - 1, Math.floor(random() * fresh.length))];
    return fill(lastGreeting, { project_name: projectName });
  };
  let ensuring = null; // one creation at a time: two quick calls must not make two agents
  const sharing = new Map(); // library voice id -> its pending check, so a voice is added only once

  // The saved file: { agentId, hash, voiceMode, voices: { account, ids: { libraryId: accountId } } }
  const load = () => {
    try {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
    } catch { return {}; }
  };
  const read = () => {
    const saved = load();
    return typeof saved.agentId === 'string' && /^[\w-]{1,100}$/.test(saved.agentId) ? saved : null;
  };
  const store = (patch) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ ...load(), ...patch }), { mode: 0o600 });
    fs.chmodSync(file, 0o600);
  };
  const write = (agentId, voiceMode) => {
    store({ agentId, hash, voiceMode });
    return agentId;
  };

  // A key of that provider, or null (never thrown, never logged)
  async function keyOf(provider) {
    try {
      const key = await getKey(provider);
      return typeof key === 'string' && KEY_FAMILY[provider].test(key.trim()) ? key.trim() : null;
    } catch { return null; }
  }

  // --- ElevenLabs ---

  // Makes sure one listed library voice is in the account: voices.get, and voices.share when it is missing. Cached
  // per account in the file, so it is checked once. -> the id to use, or null when it could not be added
  // (full voice slots, a key without that permission…): the agent then speaks with its own voice. A
  // network failure is thrown: the call would fail anyway.
  function ensureVoice(client, key, name) {
    const spec = VOICES.elevenlabs[name];
    const account = accountOf(key);
    const cached = load().voices;
    if (cached?.account === account && typeof cached.ids?.[spec.id] === 'string') return Promise.resolve(cached.ids[spec.id]);
    if (!sharing.has(spec.id)) {
      const check = (async () => {
        let id = spec.id;
        try {
          await client.voices.get(spec.id);
        } catch (error) {
          if (!error?.statusCode) throw error;
          if (!voiceMissing(error)) return null;
          try {
            const added = await client.voices.share(spec.owner, spec.id, { newName: t.voice.sharedVoiceName(spec.name) });
            if (typeof added?.voiceId === 'string' && /^[\w-]{1,100}$/.test(added.voiceId)) id = added.voiceId;
          } catch (shareError) {
            if (!shareError?.statusCode) throw shareError;
            return null;
          }
        }
        const voices = load().voices;
        const ids = voices?.account === account && voices.ids && typeof voices.ids === 'object' ? voices.ids : {};
        store({ voices: { account, ids: { ...ids, [spec.id]: id } } });
        return id;
      })().finally(() => sharing.delete(spec.id));
      sharing.set(spec.id, check);
    }
    return sharing.get(spec.id);
  }

  // The SDK (2.74) has no realtime_model field yet and strips unknown keys, so it goes as an extra body
  // field of its own PATCH. 'realtime' when the account accepted it; 'custom' when Realtime is not
  // available for this workspace (the agent keeps talking with its LLM and TTS)
  async function setVoiceMode(client, agentId) {
    try {
      await client.conversationalAi.agents.update(agentId, {}, { additionalBodyParameters: { conversation_config: { realtime_model: model } } });
      return model ? 'realtime' : 'custom';
    } catch (error) {
      if (notFound(error) || !error?.statusCode || error.statusCode === 401 || error.statusCode === 429) throw error;
      return 'custom';
    }
  }
  const save = async (client, agentId) => write(agentId, await setVoiceMode(client, agentId));
  const create = async (client) => save(client, (await client.conversationalAi.agents.create(config)).agentId);

  // The id of an agent with this configuration: the saved one, updated if its configuration changed,
  // or a new one when there is none or it was deleted from the account (404). Before writing the agent,
  // its default voice is made sure to be in the account (best effort).
  async function ensureAgent(client, key, { fresh = false } = {}) {
    if (!customVoice) useVoice((await ensureVoice(client, key, DEFAULT_VOICE.elevenlabs)) ?? FALLBACK_VOICE_ID);
    const saved = fresh ? null : read();
    if (saved?.hash === hash) return saved.agentId;
    if (!saved) return create(client);
    try {
      await client.conversationalAi.agents.update(saved.agentId, config);
      return await save(client, saved.agentId);
    } catch (error) {
      if (notFound(error)) return create(client);
      throw error;
    }
  }
  const agentId = (client, key, opts) => {
    ensuring ??= ensureAgent(client, key, opts).finally(() => { ensuring = null; });
    return ensuring;
  };
  const signedUrl = async (client, id) => (await client.conversationalAi.conversations.getSignedUrl({ agentId: id })).signedUrl;

  async function startElevenLabs(key, voice, dynamicVariables) {
    const client = makeClient(key);
    // the chosen listed voice; a fixed development voice wins and is used as it is
    const chosen = Object.hasOwn(VOICES.elevenlabs, voice) ? voice : DEFAULT_VOICE.elevenlabs;
    const voiceIdForCall = customVoice ?? await ensureVoice(client, key, chosen);
    let url;
    try {
      url = await signedUrl(client, await agentId(client, key));
    } catch (error) {
      if (!notFound(error)) throw error;
      url = await signedUrl(client, await agentId(client, key, { fresh: true })); // the saved agent was deleted
    }
    return { ok: true, provider: 'elevenlabs', signedUrl: url, dynamicVariables, voiceMode: read()?.voiceMode ?? 'custom', voiceId: voiceIdForCall };
  }

  // --- Grok Voice (xAI) ---

  // A short-lived secret for the window's WebSocket. The answer is read defensively: the API has used
  // { value }, { client_secret: { value } } and { token }.
  async function mintGrok(key) {
    if (typeof fetchFn !== 'function') throw new Error('network: no fetch');
    const response = await fetchFn(GROK_SECRETS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expires_after: { seconds: GROK_SECRET_SECONDS } }),
      signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(GROK_TIMEOUT_MS) : undefined,
    });
    if (!response?.ok) {
      let body = '';
      try { body = String(await response.text()).slice(0, 2000); } catch { /* the status is enough */ }
      throw httpError(response?.status ?? 500, body);
    }
    const data = await response.json();
    const token = [data?.value, data?.client_secret?.value, data?.token].find((v) => typeof v === 'string' && v);
    // it travels as a WebSocket subprotocol: printable ASCII without spaces only
    if (!token || token.length > 8192 || !/^[\x21-\x7e]+$/.test(token)) throw new Error('grok: no token in the answer');
    const expires = [data?.expires_at, data?.client_secret?.expires_at].find((v) => Number.isFinite(v));
    return { token, expiresAt: expires ?? Math.floor(Date.now() / 1000) + GROK_SECRET_SECONDS };
  }

  async function startGrok(key, voice, dynamicVariables) {
    const { token, expiresAt } = await mintGrok(key);
    const chosen = Object.hasOwn(VOICES.grok, voice) ? voice : DEFAULT_VOICE.grok;
    return {
      ok: true,
      provider: 'grok',
      token,
      expiresAt,
      model: GROK_MODEL,
      session: {
        instructions: fill(t.voice.prompt, dynamicVariables),
        voice: VOICES.grok[chosen].id,
        tools: grokTools(),
        language: 'es-MX',
        firstMessage: fill(t.voice.firstMessage, dynamicVariables),
      },
    };
  }

  // Which provider answers this request: the asked one if it has a key; 'auto' prefers ElevenLabs
  async function pick(provider) {
    const order = provider === 'elevenlabs' || provider === 'grok' ? [provider] : ['elevenlabs', 'grok'];
    for (const name of order) {
      const key = await keyOf(name);
      if (key) return { name, key };
    }
    return null;
  }

  return {
    // -> { ready: true } or { ready: false, reason: 'no-key' }
    async status() {
      return (await pick('auto')) ? { ready: true } : { ready: false, reason: 'no-key' };
    },
    // -> { elevenlabs: { ready, last4? }, grok: { ready, last4? } } (never the key)
    async providers() {
      const entries = await Promise.all(['elevenlabs', 'grok'].map(async (name) => {
        const key = await keyOf(name);
        return [name, key ? { ready: true, last4: key.slice(-4) } : { ready: false }];
      }));
      return Object.fromEntries(entries);
    },
    // -> ElevenLabs { ok, provider, signedUrl, dynamicVariables, voiceMode, voiceId }
    //  | Grok { ok, provider, token, expiresAt, model, session }
    //  | { ok: false, reason: 'no-key' | 'auth' | 'quota' | 'network' | 'failed' }   (never the key)
    async start({ projectName, context, builder, memory, provider = 'auto', voice, level, style } = {}) {
      const chosen = await pick(PROVIDERS.includes(provider) ? provider : 'auto');
      if (!chosen) return { ok: false, reason: 'no-key' };
      const d = t.voice.defaults;
      const speech = STYLES.includes(style) ? style : d.style;
      const name = clean(projectName, LIMITS.projectName) || d.projectName;
      const dynamicVariables = {
        project_name: name,
        project_context: clean(context, LIMITS.context, { lines: true }) || d.context,
        builder_name: clean(builder, LIMITS.builder) || d.builder,
        project_memory: clean(memory, LIMITS.memory, { lines: true }) || d.memory,
        // the instructions of the level the person picked (a key of LEVELS, never free text)
        tech_level: t.voice.levels[LEVELS.includes(level) ? level : d.level],
        speech_style: t.voice.styles[speech],
        greeting: greeting(speech, name),
      };
      const voiceName = typeof voice === 'string' ? voice : '';
      try {
        return chosen.name === 'grok'
          ? await startGrok(chosen.key, voiceName, dynamicVariables)
          : await startElevenLabs(chosen.key, voiceName, dynamicVariables);
      } catch (error) {
        return { ok: false, reason: reasonFor(error) };
      }
    },
  };
}

// The real client, loaded only when a call starts with a key
function defaultClient(key) {
  const { ElevenLabsClient } = require('@elevenlabs/elevenlabs-js');
  return new ElevenLabsClient({ apiKey: key });
}

module.exports = {
  createVoiceCall, agentConfig, configHash, reasonFor, grokTools, LIMITS, LEVELS, STYLES, REALTIME_MODEL, VOICES, PROVIDERS,
  DEFAULT_VOICE, GROK_MODEL, PERMISSION_WAIT,
};
