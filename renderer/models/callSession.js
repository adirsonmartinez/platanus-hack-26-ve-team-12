// One shape for the call with Qubi, real or simulated (docs/features/llamada/README.md):
// Session = { end, setMuted, sendContext, notify, type, levels, simulated }
// on = { status(s), mode('speaking'|'listening'), line({ who: 'qubi'|'person', text, final }), error(reason), ended(reason) }
// The real one wraps the ElevenLabs Agents client (vendored, renderer/vendor/elevenlabs.js); the simulated one
// follows a fixed script with no audio, for the web version, a missing key, demos and tests.
import { strings } from '../i18n/es.js';

const SIM = strings.call.sim;
// The app's own messages to the voice agent (work finished, waiting for permission): never the person's words
export const NOTICE_PREFIX = '[aviso de Qubbot]';
const isNotice = (text) => String(text ?? '').trimStart().startsWith(NOTICE_PREFIX);
// The expressive voice reads tags like [confused] or [laughs] as tone, not words: they are not shown
export const spokenText = (text) => String(text ?? '').replace(/\[[a-záéíóúñ][a-záéíóúñ _-]{0,30}\]\s*/gi, '').trim();
const clamp01 = (n) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

// Microphone refused or missing -> 'mic'; the connection -> 'network'; anything else -> 'failed'
export function reasonOf(error) {
  const text = `${error?.name ?? ''} ${error?.message ?? error ?? ''}`;
  if (/NotAllowed|NotFound|NotReadable|Permission denied|permission|microphone|getUserMedia/i.test(text)) return 'mic';
  if (/SessionConnection|network|websocket|socket|Failed to fetch|offline|timed? ?out/i.test(text)) return 'network';
  return 'failed';
}

// The worklets are files next to the SDK, so the window's CSP needs no blob: (resolved against the page)
const workletPath = (file) => {
  const relative = `./vendor/elevenlabs/${file}`;
  return typeof document !== 'undefined' && document.baseURI ? new URL(relative, document.baseURI).href : relative;
};

// Loads the voice SDK ahead of the first call (its first import is part of the wait before Qubi talks).
// Nothing is opened: no socket, no microphone
export function warmSession(load = () => import('../vendor/elevenlabs.js')) {
  return Promise.resolve().then(load).then(() => true, () => false);
}

// overrides: what this call changes of the agent, such as the voice picked in the call's settings
// ({ tts: { voiceId } }); the agent in the account allows exactly those overrides
export async function openSession({ signedUrl, dynamicVariables = {}, clientTools = {}, on, sdk = null, overrides = null }) {
  const { Conversation } = sdk ?? (await import('../vendor/elevenlabs.js'));
  let typed = null; // what the person typed: the transcript that may echo it is not shown twice
  let conversation;
  try {
    conversation = await Conversation.startSession({
      signedUrl,
      connectionType: 'websocket',
      dynamicVariables,
      clientTools,
      ...(overrides ? { overrides } : {}),
      workletPaths: { rawAudioProcessor: workletPath('rawAudioProcessor.js'), audioConcatProcessor: workletPath('audioConcatProcessor.js') },
      onConnect: () => on.status('connected'),
      onStatusChange: ({ status }) => on.status(status),
      onModeChange: ({ mode }) => on.mode(mode),
      onMessage: ({ message, source, role }) => {
        const qubi = source === 'ai' || role === 'agent';
        if (!qubi && (isNotice(message) || message === typed)) { typed = null; return; }
        const text = qubi ? spokenText(message) : String(message ?? '').trim();
        if (text) on.line({ who: qubi ? 'qubi' : 'person', text, final: true });
      },
      // a client tool that failed is answered to the agent by the SDK: the call goes on
      onError: (message, context) => { if (!context?.clientToolName) on.error(reasonOf(message)); },
      onDisconnect: (details) => on.ended(details?.reason ?? 'user'),
    });
  } catch (error) {
    throw Object.assign(new Error(String(error?.message ?? error)), { reason: reasonOf(error) });
  }
  const safe = (fn) => { try { return fn(); } catch { return undefined; } };
  return {
    simulated: false,
    end: () => safe(() => conversation.endSession()?.catch?.(() => {})),
    setMuted: (muted) => safe(() => conversation.setMicMuted(Boolean(muted))),
    sendContext: (text) => safe(() => conversation.sendContextualUpdate(String(text))),
    notify: (text) => safe(() => conversation.sendUserMessage(`${NOTICE_PREFIX} ${text}`)),
    type: (text) => {
      typed = text;
      on.line({ who: 'person', text, final: true });
      safe(() => conversation.sendUserMessage(text));
    },
    levels: () => ({ input: clamp01(safe(() => conversation.getInputVolume())), output: clamp01(safe(() => conversation.getOutputVolume())) }),
  };
}

export const SIM_TIMING = { connectMs: 700, thinkMs: 600, wordMs: 260, minSpeakMs: 1200 };
// A request to build or change something (crea, haz, agrega, cambia, arregla…), checked before questions
const BUILD = new RegExp(`(?:^|[^\\p{L}])(?:${[
  'crea', 'crear', 'créame', 'haz', 'hazme', 'hacer', 'hagamos', 'agrega', 'agrégale', 'agregar', 'añade', 'añadir',
  'pon', 'ponle', 'poner', 'cambia', 'cámbiale', 'cambiar', 'arregla', 'arréglame', 'arreglar', 'construye', 'construir',
  'quita', 'quitar', 'borra', 'borrar', 'elimina', 'eliminar', 'mejora', 'mejorar', 'escribe', 'escribir', 'genera',
  'generar', 'prepara', 'preparar', 'diseña', 'diseñar', 'modifica', 'modificar', 'actualiza', 'actualizar',
].join('|')})(?=$|[^\\p{L}])`, 'iu');
const ASKS_PROJECT = /qu[eé]\s+(hay|tiene|tengo)|c[oó]mo\s+(est[aá]|va)|qu[eé]\s+ves/i;
// Sending Qubi somewhere ("ve a apps", "muéstrame src/lib"), back home ("vente", "vuelve"), or asking it to
// open a file ("abre app/page.tsx") or start the project ("arranca la app"): the same tools as the real voice
const GO = /(?:^|[^\p{L}])(?:ve|vete|anda|camina|vamos)\s+(?:a|al|hasta|hacia)\s+(.+)|(?:^|[^\p{L}])mu[eé]strame\s+(.+)/iu;
const BACK = /(?:^|[^\p{L}])(?:vente|vu[eé]lvete|vuelve|regresa|ven\s+ac[aá])(?=$|[^\p{L}])/iu;
const OPEN = /(?:^|[^\p{L}])(?:abre|[aá]breme|abrir)\s+(.+)/iu;
const RUN = /(?:^|[^\p{L}])(?:arranca|ejecuta|corre|prende|inicia)(?:me)?\s+(?:la\s+app|el\s+proyecto|la\s+aplicaci[oó]n|el\s+servidor)/iu;
// "la carpeta src/lib." -> "src/lib"
const pathIn = (text) => String(text ?? '')
  .trim()
  .replace(/^(?:(?:la|el)\s+(?:carpeta|archivo)|la|el|los|las)\s+/i, '')
  .replace(/[\s.,;:!?¡¿»«"']+$/u, '')
  .trim();

// The simulated call: greets, "listens", and answers what the person types with fixed lines.
// A request to build calls clientTools.construir like the real voice agent would; notify() is read aloud.
export async function openSimulatedSession({ dynamicVariables = {}, clientTools = {}, on, timing = {} }) {
  const t = { ...SIM_TIMING, ...timing };
  const now = timing.now ?? (() => Date.now());
  const timers = new Set();
  let ended = false;
  let asking = false; // a tool waits for the person's permission: their next words answer it, not Qubi
  let speakingUntil = 0;
  const later = (ms, fn) => {
    const id = setTimeout(() => { timers.delete(id); if (!ended) fn(); }, ms);
    timers.add(id);
  };
  // Qubi "speaks" for a while that depends on the length of the line, then listens again
  const say = (text) => {
    on.mode('speaking');
    on.line({ who: 'qubi', text, final: true });
    const ms = Math.max(t.minSpeakMs, String(text).split(/\s+/).length * t.wordMs);
    speakingUntil = now() + ms;
    later(ms, () => { if (now() >= speakingUntil) on.mode('listening'); });
  };
  const call = async (name, params) => {
    try { return await clientTools[name]?.(params); } catch { return null; }
  };
  // A tool that asks the person first (abrir_archivo, ejecutar_app): Qubi says so, then waits
  const askFirst = async (name, params) => {
    say(SIM.askPermission);
    asking = true;
    const r = await call(name, params);
    asking = false;
    if (ended) return;
    say(r?.ok ? SIM.done : r?.motivo === 'sin-permiso' ? SIM.denied : SIM.failed);
  };
  const answer = async (text) => {
    if (BACK.test(text)) {
      await call('volver', {});
      if (!ended) say(SIM.back);
      return;
    }
    const go = text.match(GO);
    if (go) {
      const r = await call('ir_a', { ruta: pathIn(go[1] ?? go[2]) });
      if (!ended) say(r?.ok ? SIM.going : SIM.failed);
      return;
    }
    if (RUN.test(text)) return askFirst('ejecutar_app', {});
    const open = text.match(OPEN);
    if (open) return askFirst('abrir_archivo', { ruta: pathIn(open[1]) });
    if (BUILD.test(text)) {
      const r = await call('construir', { pedido: text });
      if (ended) return;
      if (r?.ok) return say(SIM.building(r.agente));
      return say({ ocupado: SIM.busy, 'sin-proyecto': SIM.noProject, 'sin-agente': SIM.noAgent }[r?.motivo] ?? SIM.failed);
    }
    if (ASKS_PROJECT.test(text)) {
      const r = await call('ver_proyecto', {});
      if (ended) return;
      // the first lines are enough to say aloud; the rest is in the map
      const summary = String(r?.resumen ?? '').split('\n').filter(Boolean).slice(0, 3).join(' ');
      return say(summary ? SIM.project(summary) : SIM.fallback);
    }
    say(SIM.fallback);
  };

  on.status('connecting');
  later(t.connectMs, () => {
    on.status('connected');
    say(SIM.greeting(dynamicVariables.project_name || SIM.anyProject));
  });

  return {
    simulated: true,
    end() {
      if (ended) return;
      ended = true;
      timers.forEach(clearTimeout);
      timers.clear();
      on.status('disconnected');
      on.ended('user');
    },
    setMuted() {},
    sendContext() {},
    notify(text) {
      if (ended) return;
      later(t.thinkMs, () => say(String(text)));
    },
    type(text) {
      const said = String(text ?? '').trim();
      if (ended || !said) return;
      on.line({ who: 'person', text: said, final: true });
      if (asking) return; // the answer to a permission: the app reads it from the line
      later(t.thinkMs, () => { answer(said); });
    },
    // No audio: a gentle wave while Qubi "speaks", silence otherwise
    levels() {
      const speaking = !ended && now() < speakingUntil;
      return { input: 0, output: speaking ? clamp01(0.45 + 0.35 * Math.sin(now() / 90)) : 0 };
    },
  };
}
