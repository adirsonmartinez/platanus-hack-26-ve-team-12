// The voice call with Qubi (docs/features/llamada/README.md). Qubi talks (ElevenLabs Agents) but never
// programs: what the person asks to build goes to the agent picked in the chat, through the chat as
// always, so every change passes through Qubbot' MCP tools. The voice only gets summaries the app
// writes (no file contents, no secrets) and hears how the work goes.
// The call shows in the chat as one card that updates in place (chatViewModel.upsertCallCard).
// Fase 2 and 3 (docs/features/llamada/FASE2.md): Qubi can split a request among a team of workers
// (teamViewModel) and remembers each project between calls (projectMemoryModel).
// Mejoras (docs/features/llamada/MEJORAS.md, VOZ.md): the call rings first; it talks over ElevenLabs or Grok
// Voice (settings persisted per person); with no voice service connected it ends in error 'offline' (the
// window opens the voice-connect modal) instead of silently simulating; Qubi asks the person before it
// opens or runs anything (store.permission) and walks where it is sent (store.guide).
import { Observable } from '../core/observable.js';
import { EVENTS } from '../core/eventBus.js';
import { strings } from '../i18n/es.js';
import { allFiles, countFiles, findNode } from '../models/fileTree.js';
import { isSecretFile } from '../models/fileOpen.js';
import { demoScore } from '../models/securityModel.js';
import { openSession as openRealSession, openSimulatedSession as openSimSession } from '../models/callSession.js';
import { openGrokSession as openGrok } from '../models/grokSession.js';
import { memoryText, learnFacts } from '../models/projectMemoryModel.js';
import { placesFor } from './tourPlaces.js';
import { gestureName } from '../models/gestures.js';

const C = strings.call;
const P = C.permission;
const G = C.guide;
// Voice settings, a preference of the person (not a secret): which service and which of Qubi's voices.
// Voice keys are the VOICES keys of electron/voiceCall.js (main turns a key into the voice id)
export const SETTINGS_KEY = 'platanus.call.v1';
export const PROVIDERS = ['auto', 'elevenlabs', 'grok'];
export const VOICE_GROUPS = { elevenlabs: ['juan', 'julio', 'josemanuel', 'maggie'], grok: ['rex', 'eve', 'ara'] };
// level: how technical Qubi talks (electron/voiceCall.js LEVELS); básico is for people who do not program
export const LEVELS = ['basico', 'intermedio', 'tecnico'];
// style: how Qubi talks (electron/voiceCall.js STYLES); pana is the Venezuelan Qubi
export const STYLES = ['pana', 'neutral', 'formal', 'divertido'];
export const DEFAULT_SETTINGS = { provider: 'auto', voice: 'juan', level: 'basico', style: 'pana' };
// No answer from the person for this long while Qubi listens: Qubi hangs up (paused while work runs)
export const SILENCE_MS = 20_000;
// What the person may say to ajustar_qubi, in plain words -> the settings' keys
const plainWord = (w) => String(w ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
// the app's modes too: Dev is the technical level, Vibe the basic one (they follow each other: syncMode)
const LEVEL_WORDS = { basico: 'basico', basica: 'basico', sencillo: 'basico', simple: 'basico', bajo: 'basico', vibe: 'basico', 'modo vibe': 'basico', intermedio: 'intermedio', medio: 'intermedio', normal: 'intermedio', tecnico: 'tecnico', tecnica: 'tecnico', alto: 'tecnico', avanzado: 'tecnico', experto: 'tecnico', dev: 'tecnico', 'modo dev': 'tecnico', desarrollador: 'tecnico', programador: 'tecnico' };
const STYLE_WORDS = { pana: 'pana', venezolano: 'pana', venezolana: 'pana', criollo: 'pana', neutral: 'neutral', neutro: 'neutral', formal: 'formal', serio: 'formal', profesional: 'formal', divertido: 'divertido', alegre: 'divertido', chevere: 'divertido' };
// The welcome's answers by voice: elegir_experiencia's level -> the bubble's button; marcar_tecnologia's names
const WELCOME_LEVEL = { empezando: 'exp:beginner', principiante: 'exp:beginner', aprendiendo: 'exp:beginner', programo: 'exp:dev', programador: 'exp:dev', dev: 'exp:dev' };
const WELCOME_TECH = { nextjs: 'nextjs', next: 'nextjs', vercel: 'vercel', supabase: 'supabase' };
const VOICE_WORDS = { juan: 'juan', julio: 'julio', josemanuel: 'josemanuel', 'jose manuel': 'josemanuel', maggie: 'maggie', rex: 'rex', eve: 'eve', ara: 'ara' };
const providerOfVoice = (voice) => Object.keys(VOICE_GROUPS).find((p) => VOICE_GROUPS[p].includes(voice)) ?? null;
export const MANUAL_MS = 8000;         // seguir_manual: the call ends by then even if Qubi says no goodbye
export const RING_MS = 0;              // no phone ring: Qubi talks as soon as the session is ready
// The voice platform gives these tools 60 s (electron/voiceCall.js PERMISSION_WAIT). The person's yes must
// come well before that, so the action itself still fits; a tool past 60 s is reported as failed to Qubi
export const PERMISSION_MS = 45_000;   // a permission with no answer is a no
export const TOOL_ANSWER_MS = 55_000;  // ejecutar_app answers by then at the latest ('arrancando' if not ready)
const HOME = { x: 1.1, z: 1.1 };       // Qubi's spot by the plaza (as buildViewModel and robotView)
const MEMORY_MAX = 800;                // electron/voiceCall.js LIMITS.memory
const CTX = C.tools.context;
const PROGRESS = C.tools.progress;
const T = strings.team;
// What ver_equipo answers, in the voice tools' Spanish keys (like ver_avance's estado)
const TEAM_PHASE = { idle: 'sin-equipo', working: 'trabajando', auditing: 'revisando', done: 'terminado' };
const WORKER_STATUS = { queued: 'en-fila', working: 'trabajando', waiting: 'esperando-permiso', done: 'terminado', failed: 'falló', cancelled: 'cancelado' };
const AUDIT_STATUS = { checking: 'revisando', approved: 'aprobado', flagged: 'revisar' };
export const CONTEXT_MAX = 2500;
export const MAX_LINES = 40;
const MAX_FOLDERS = 12;
const MAX_RISKY = 5;
const MAX_LISTED = 6;      // paths told to the voice per list (created, changed)
const MAX_ASK = 2000;      // characters of a request Qubi hands to the agent
const CONTEXT_MS = 4000; // a new summary for the voice this long after the project last changed
const CONFIRM_MS = 30_000; // construir needs the person to have spoken this recently (and after any notice)
const NAME_MAX = 120;      // electron/voiceCall.js LIMITS: main refuses longer fields
const BUILDER_MAX = 40;
const TITLE_MAX = 80;      // a worker's title, as the voice named it
const MEMORY_PEDIDOS = 10; // what one call leaves in the project's memory
const MEMORY_BUILT = 40;
const NOTES_MAX = 300;
const nameOf = (path) => String(path).split('/').filter(Boolean).at(-1) ?? path;
const unique = (list) => [...new Set(list)];
// A path as the voice says it: "./src/lib/" -> "src/lib"
const cleanPath = (ruta) => String(ruta ?? '').trim().replace(/\\/g, '/').replace(/^\.?\/+/, '').replace(/\/+$/, '');

// What the voice may hear of the agent's answer (revisar_archivo): no code, no keys, short. Code blocks
// and inline code go, anything shaped like a key or a long token is hidden, and it is cut to a few sentences
const SPOKEN_MAX = 600;
const KEYISH = /(sk[-_][A-Za-z0-9_-]{12,}|xai-[A-Za-z0-9]{12,}|AKIA[0-9A-Z]{12,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|-----BEGIN[^-]*-----|[A-Za-z0-9+/=_-]{40,})/g;
export function speakable(text) {
  const plain = String(text ?? '')
    .replace(/```[\s\S]*?(```|$)/g, ' ')
    .replace(/`[^`]{0,200}`/g, (m) => (m.length <= 42 ? m.slice(1, -1) : ' '))
    .replace(KEYISH, '[oculto]')
    .replace(/[#*_>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= SPOKEN_MAX) return plain;
  const cut = plain.slice(0, SPOKEN_MAX);
  const end = cut.lastIndexOf('. ');
  return (end > 200 ? cut.slice(0, end + 1) : `${cut}…`).trim();
}

// Any stored value in, valid settings out (an unknown provider or voice falls back to the default)
export function settingsOf(value) {
  const v = value && typeof value === 'object' ? value : {};
  return {
    provider: PROVIDERS.includes(v.provider) ? v.provider : DEFAULT_SETTINGS.provider,
    voice: providerOfVoice(v.voice) ? v.voice : DEFAULT_SETTINGS.voice,
    level: LEVELS.includes(v.level) ? v.level : DEFAULT_SETTINGS.level,
    style: STYLES.includes(v.style) ? v.style : DEFAULT_SETTINGS.style,
  };
}

// The person's words as an answer to a permission: 'yes', 'no' or null (anything else).
// Only how the phrase starts counts: "sí, ábrelo" is yes, "no, espera" is no, "¿qué es eso?" is neither
export function voiceAnswer(text) {
  const plain = String(text ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^[^a-z0-9]+/, '');
  const starts = (word) => plain === word || (plain.startsWith(word) && !/[a-z0-9]/.test(plain[word.length]));
  if (P.no.some(starts)) return 'no';
  if (P.yes.some(starts)) return 'yes';
  return null;
}

// ejecutar_app: main's answer to run:start -> the tool's answer (the words of electron/strings.js voice.tools)
const LATE = Symbol('late');
function runAnswer(res) {
  if (res?.ok) return { ok: true, ...(res.port ? { puerto: res.port } : {}) };
  const reason = String(res?.reason ?? '');
  if (/reject|cancel/i.test(reason)) return { ok: false, motivo: 'sin-permiso' }; // main's own dialog said no
  if (/script/i.test(reason)) return { ok: false, motivo: 'sin-script' };
  if (/busy/i.test(reason)) return { ok: false, motivo: 'ocupado' };
  return { ok: false, motivo: 'falló' };
}

// ejecutar_app with several scripts (a monorepo): the web app, else the project root, else the first
export function pickScript(scripts) {
  const list = (scripts ?? []).filter((s) => s && s.id != null);
  const cwd = (s) => cleanPath(s.cwd ?? '').replace(/^\.$/, '');
  return list.find((s) => cwd(s) === 'apps/web') ?? list.find((s) => cwd(s) === '') ?? list[0] ?? null;
}

// Settings are read and written through a tiny storage (localStorage in the window); it may be missing
// or throw (private mode, tests): the defaults are used then
const defaultStorage = () => {
  try { return globalThis.localStorage ?? null; } catch { return null; }
};

// What the voice agent knows about the open project: names and counts only, never contents, and no
// secret file is named. Pure; at most CONTEXT_MAX characters.
// project: projectModel state ({ name, tree }) · map: mapViewModel state ({ path }) · security: { scoreOf }
export function contextFor({ project, map = null, security = null, builder = '' } = {}) {
  const tree = project?.tree ?? [];
  const scoreOf = (path) => (security?.scoreOf ? security.scoreOf(path) : demoScore(path));
  const lines = [];
  if (project?.name) lines.push(CTX.project(project.name));
  if (builder) lines.push(CTX.builder(builder));
  const files = allFiles(tree);
  if (!files.length && !tree.some((n) => n.type === 'dir')) lines.push(CTX.empty);
  else {
    const folders = tree.filter((n) => n.type === 'dir' && !isSecretFile(n.path)).slice(0, MAX_FOLDERS);
    if (folders.length) lines.push(CTX.folders(folders.map((d) => CTX.folder(nameOf(d.path).slice(0, 60), countFiles(d.children ?? []))).join(', ')));
    const loose = tree.filter((n) => n.type === 'file').length;
    if (loose) lines.push(CTX.loose(loose));
    const counts = { red: 0, yellow: 0, green: 0 };
    const risky = [];
    for (const f of files) {
      const score = scoreOf(f.path);
      const level = score?.level;
      if (level in counts) counts[level]++;
      if ((level === 'red' || level === 'yellow') && !isSecretFile(f.path)) risky.push({ path: f.path, red: level === 'red', finding: score.findings?.[0] ?? null });
    }
    lines.push(CTX.light(counts.red, counts.yellow, counts.green));
    // the audit's score, and for each risky file what it found and on which line (the same as the map)
    const audit = security?.store?.state;
    if (audit?.audited && Number.isFinite(audit.score)) lines.push(CTX.score(audit.score));
    risky.sort((a, b) => Number(b.red) - Number(a.red));
    const named = (r) => (r.finding ? CTX.finding(r.path.slice(0, 120), r.finding.line, strings.security.short[r.finding.rule] ?? r.finding.rule) : r.path.slice(0, 120));
    if (risky.length) lines.push(CTX.risky(risky.slice(0, MAX_RISKY).map(named).join(', ')));
  }
  if (map?.path && !isSecretFile(map.path)) lines.push(CTX.looking(`${map.path}/`));
  return lines.join('\n').slice(0, CONTEXT_MAX);
}

// The delegated work as the chat shows it: its run card (or, with no agent connected, the scripted reply)
function workOf(run) {
  const writes = (run?.steps ?? []).filter((s) => s.name === 'write_file' && s.target && (s.status === 'done' || s.diff) && !isSecretFile(s.target));
  const created = unique(writes.filter((s) => s.diff?.created === true).map((s) => s.target));
  const changed = unique(writes.filter((s) => s.diff?.created !== true).map((s) => s.target)).filter((p) => !created.includes(p));
  return { created, changed, awaiting: run?.awaiting ?? null };
}

export class CallViewModel {
  #voice;
  #openReal;
  #openSim;
  #chat;
  #project;
  #map;
  #security;
  #connection;
  #actions;
  #bus;
  #timing;
  #simulate;
  #practice = false;   // this one call is a practice (simulated) call, chosen in the voice-connect modal
  #session = null;
  #gen = 0;            // each start() is a new call: callbacks of an older one are ignored
  #started = false;    // callStarted was emitted for this call
  #startedAt = null;
  #endedAt = null;
  #lineId = 0;
  #lastCard = '';      // the card last sent to the chat (nothing is sent when it did not change)
  #work = null;        // { before, messageId, sawTyping, waited: Set, finished } the delegated work being watched
  #turn = 0;           // orders the person's lines and what the app told the voice
  #heard = { turn: -1, at: 0 }; // the person's last line
  #toldTurn = 0;       // the app's last sendContext or notify
  #team;               // teamViewModel (fase 2), optional
  #memory;             // createProjectMemory() (fase 3), optional
  #teamRun = null;     // { ids: Set, failed: Set, done, told } the team this call started
  #root = null;        // the project of this call: its memory is saved there even if another one opens
  #callSession = null; // projectModel session of this call
  #startTree = [];
  #pedidos = [];       // what the person asked during this call (construir, preguntar, repartir)
  #built = new Set();  // files created during this call (the delegated work and the team)
  #audits = new Map(); // folder -> 'approved' | 'flagged' | 'failed' | 'cancelled'
  #openGrok;
  #run;                // createRunService() for ejecutar_app, optional
  #storage;
  #settings;
  #ask = null;         // { id, resolve, timer, label } the permission waiting for the person
  #askId = 0;
  #alwaysOpen = false; // "Siempre en esta llamada" for abrir_archivo
  #guideId = 0;
  #welcome;            // the welcome bubble (robotDialogViewModel: voiceState, press), optional
  #welcomeCall = false; // this call is the welcome of a new project (Qubi asks its questions by voice)
  #manualBye = null;   // seguir_manual: { spoke } until Qubi's goodbye is over, then the call hangs up
  #manualTimer = null;

  // status: 'idle' | 'ringing' | 'connecting' | 'live' | 'ending' | 'error' · mode: 'listening' | 'speaking'
  // error: null | 'offline' | 'weak-keychain' | 'mic' | 'auth' | 'quota' | 'network' | 'failed' | 'noProject' (keys of strings.call.errors)
  // lines: the last MAX_LINES [{ id, who: 'qubi' | 'person' | 'system', text }] ('system': permissions, where Qubi goes)
  // task: null | { messageId, kind: 'build' | 'ask', pedido, status: 'running' | 'waiting' | 'done' | 'error', created, changed }
  // cardId: the call's card in the chat
  // voiceMode: 'realtime' (voice to voice: ElevenLabs Realtime, Grok) | 'custom' (its LLM reads answers aloud) | null (simulated)
  // provider: 'elevenlabs' | 'grok' | null (simulated, or not connected yet)
  // permission: null | { id, action: 'abrir_archivo' | 'ejecutar_app' | 'abrir_en_navegador', target, label, canAlways }
  // guide: null | { from, to, center, stepId, pose, text } where Qubi walks (ir_a, volver), for robotView's call job
  // gesture: null | { name, id } the last gesture Qubi made (models/gestures.js); robotView plays each new id
  // settings: { provider: 'auto' | 'elevenlabs' | 'grok', voice } (also the `settings` getter)
  // link: null | { port, url } the project running (ejecutar_app), for the person to open
  store = new Observable({ status: 'idle', mode: 'listening', muted: false, simulated: false, voiceMode: null, provider: null, error: null, lines: [], task: null, cardId: null, permission: null, guide: null, gesture: null, link: null, settings: { ...DEFAULT_SETTINGS } });

  // securityModel is optional (the semáforo falls back to the demo rules); actions.showFolder or
  // actions.locate moves the map for mostrar_carpeta and ir_a (else mapViewModel.show)
  // teamViewModel (repartir, ver_equipo) and memory (createProjectMemory) are optional: without them the
  // call works as in fase 1
  // runService (ejecutar_app) and actions.openFile(path) (abrir_archivo), actions.projectServers() ->
  // [{ port }] and actions.openPreview(port) (abrir_en_navegador) are optional: without them the tool says no
  // timing: { now, ringMs, permissionMs, manualMs } (tests make them short); storage: { getItem, setItem }
  // welcome: the welcome bubble (robotDialogViewModel) for the welcome call's tools; actions.showLink(url)
  // tells the chat where the running project is
  constructor({ voiceService, openSession = openRealSession, openSimulatedSession = openSimSession, openGrokSession = openGrok, chatViewModel, projectModel, mapViewModel = null, securityModel = null, connection = null, actions = {}, bus = null, simulate = false, timing = {}, teamViewModel = null, memory = null, runService = null, storage = defaultStorage(), welcome = null }) {
    this.#voice = voiceService;
    this.#welcome = welcome;
    this.#openReal = openSession;
    this.#openSim = openSimulatedSession;
    this.#openGrok = openGrokSession;
    this.#run = runService;
    this.#storage = storage;
    this.#settings = this.#loadSettings();
    this.store.set({ settings: this.#settings });
    this.#chat = chatViewModel;
    this.#project = projectModel;
    this.#map = mapViewModel;
    this.#security = securityModel;
    this.#connection = connection;
    this.#actions = actions;
    this.#bus = bus;
    this.#timing = timing;
    this.#simulate = Boolean(simulate);
    this.#team = teamViewModel;
    this.#memory = memory;
    chatViewModel.store.subscribe((state) => this.#watch(state));
    teamViewModel?.store?.subscribe((state) => this.#watchTeam(state));
    // a repair Qubi asked for (reparar) ended: Qubi hears how the audit judged it
    bus?.on?.(EVENTS.repairFinished, ({ entry } = {}) => this.#repaired(entry));
    // the project changes during the call (an audit, files on disk): Qubi gets the fresh summary
    securityModel?.store?.subscribe?.(() => this.#refreshContext());
    projectModel.store.subscribe(() => this.#refreshContext());
    // the project closes (or another one opens) during the call: Qubi would talk about the wrong one
    projectModel.store.subscribe((state, prev) => {
      if (this.store.state.status !== 'idle' && (!state.open || (prev && state.session !== prev.session))) this.hangUp();
    });
  }

  // Simulated only when the person chose it (setSimulate) or in the web version (no voice bridge). With no
  // voice service connected the call is not simulated behind their back: it ends in error 'offline'
  get simulate() {
    return this.#simulate || !this.#voice?.available;
  }

  // A real call is possible at all (the desktop app); in the web version it is always simulated
  get canUseVoice() {
    return Boolean(this.#voice?.available);
  }

  // The call going on is the welcome of a new project
  get welcomeCall() {
    return this.#welcomeCall && this.store.state.status !== 'idle';
  }

  setSimulate(on) {
    this.#simulate = Boolean(on);
  }

  get settings() {
    return this.#settings;
  }

  // Changes the voice settings (provider, voice) and keeps them for next time; they apply to the next call
  setSettings(partial = {}) {
    this.#settings = settingsOf({ ...this.#settings, ...(partial ?? {}) });
    try { this.#storage?.setItem?.(SETTINGS_KEY, JSON.stringify(this.#settings)); } catch { /* not kept: still used now */ }
    this.store.set({ settings: this.#settings });
    return this.#settings;
  }

  // The app switched between Vibe and Dev: Qubi's technical level follows (Dev = technical, Vibe = basic;
  // an intermediate level stays in Vibe). During a call Qubi is told at once.
  syncMode(tech) {
    const level = tech ? 'tecnico' : 'basico';
    const now = this.#settings.level;
    if (now === level || (!tech && now === 'intermedio')) return;
    this.setSettings({ level });
    if (this.store.state.status === 'live') {
      const A = C.adjust;
      this.#session?.sendContext?.(A.context({ level: A.levels[level] }));
      this.#system(A.done(C.settings.levels[level]));
    }
  }

  #loadSettings() {
    try {
      const raw = this.#storage?.getItem?.(SETTINGS_KEY);
      return settingsOf(raw ? JSON.parse(raw) : null);
    } catch {
      return settingsOf(null);
    }
  }

  // The person answers Qubi's permission request (the panel's buttons). always: "Siempre en esta llamada",
  // only for abrir_archivo
  allow(id, { always = false } = {}) {
    if (!this.#ask || this.#ask.id !== id) return false;
    if (always && this.store.state.permission?.canAlways) this.#alwaysOpen = true;
    this.#answer('yes');
    return true;
  }

  deny(id) {
    if (!this.#ask || this.#ask.id !== id) return false;
    this.#answer('no');
    return true;
  }

  // Who builds: the agent picked in the chat, by its name ("Claude (tu suscripción)" → "Claude", as the chat header)
  get #builder() {
    return (this.#connection?.agentLabel?.split(' (')[0] || C.tools.someone).slice(0, BUILDER_MAX);
  }

  #now() {
    return this.#timing.now?.() ?? Date.now();
  }

  // ringing (at least RING_MS, 0 by default: no phone ring) -> connecting -> live (the session opened).
  // Meanwhile main prepares the call (memory, which service, the one-time credential).
  // practice: simulated for this call only («Probar sin voz»); the next call is real again
  // welcome: the welcome of a new project (Qubi asks the bubble's questions; a failure stays quiet)
  async start({ practice = false, welcome = false } = {}) {
    const { status } = this.store.state;
    if (status !== 'idle' && status !== 'error') return;
    const gen = ++this.#gen;
    this.#welcomeCall = welcome === true && Boolean(this.#welcome);
    this.#manualBye = null;
    clearTimeout(this.#manualTimer);
    this.#repairs.clear(); // a repair asked in an earlier call is not this call's news
    this.#lastContext = null;
    this.#practice = practice === true;
    this.#session = null;
    this.#started = false;
    this.#work = null;
    this.#lastCard = '';
    this.#heard = { turn: -1, at: 0 };
    this.#startedAt = Date.now();
    this.#endedAt = null;
    this.#teamRun = null;
    this.#pedidos = [];
    this.#built = new Set();
    this.#audits = new Map();
    this.#alwaysOpen = false;
    this.store.set({ status: 'ringing', mode: 'listening', muted: false, simulated: false, voiceMode: null, provider: null, error: null, lines: [], task: null, cardId: null, permission: null, guide: null, link: null });
    const project = this.#project.store.state;
    if (!project.open) return this.#fail('noProject');
    this.#root = String(project.root ?? project.name ?? '') || null;
    this.#callSession = project.session;
    this.#startTree = project.tree ?? [];

    const ringMs = this.#timing.ringMs ?? RING_MS;
    const ring = new Promise((resolve) => setTimeout(resolve, ringMs)).then(() => {
      if (gen !== this.#gen || this.store.state.status !== 'ringing') return;
      this.store.set({ status: 'connecting' });
      this.#syncCard();
    });
    const ready = await this.#prepare(gen);
    if (!ready || gen !== this.#gen) return;
    await ring;
    if (gen !== this.#gen) return;

    const { simulated, res, projectName, builder, context, remembered } = ready;
    const on = this.#handlers(gen);
    const clientTools = this.#clientTools(gen);
    const memoryVars = remembered != null ? { project_memory: remembered } : {};
    let session;
    try {
      if (simulated) {
        this.store.set({ simulated: true });
        session = await this.#openSim({ dynamicVariables: { project_name: projectName, project_context: context, builder_name: builder, ...memoryVars }, clientTools, on, timing: this.#timing });
      } else if (res.provider === 'grok') {
        this.store.set({ provider: 'grok', voiceMode: 'realtime' }); // Grok Voice hears and answers in audio
        session = await this.#openGrok({ token: res.token, expiresAt: res.expiresAt, model: res.model, session: res.session, clientTools, on });
      } else {
        this.store.set({ provider: 'elevenlabs', voiceMode: res.voiceMode === 'realtime' ? 'realtime' : 'custom' });
        // the voice picked in the settings, as main resolved it (main checks it is one of Qubi's voices)
        const overrides = res.voiceId ? { tts: { voiceId: res.voiceId } } : null;
        session = await this.#openReal({ signedUrl: res.signedUrl, dynamicVariables: { ...memoryVars, ...res.dynamicVariables }, clientTools, on, ...(overrides ? { overrides } : {}) });
      }
    } catch (error) {
      if (gen === this.#gen) this.#fail(error?.reason ?? 'failed');
      return;
    }
    // hung up (or failed) while it was connecting
    if (gen !== this.#gen || !['ringing', 'connecting', 'live'].includes(this.store.state.status)) {
      session?.end();
      return;
    }
    this.#session = session;
    this.#started = true;
    this.#syncCard();
    this.#bus?.emit(EVENTS.callStarted, { simulated });
  }

  // What the call needs before Qubi picks up: the memory, and (not simulated) a connected voice service and
  // main's answer. Null when it failed or the call was hung up meanwhile
  async #prepare(gen) {
    // What Qubi remembers of this project, as {{project_memory}} (main fills it from `memory`)
    let remembered = null;
    if (this.#memory && this.#root) {
      try { remembered = memoryText(await this.#memory.read(this.#root)); } catch { remembered = memoryText(null); }
      if (gen !== this.#gen) return null;
    }
    const context = this.#context();
    this.#lastContext = context; // what the voice starts with: only something new is sent later
    const projectName = String(this.#project.store.state.name ?? '').slice(0, NAME_MAX); // a long folder name must not refuse the call
    const builder = this.#builder;
    if (this.simulate || this.#practice) {
      this.#syncCard();
      return { simulated: true, projectName, builder, context, remembered };
    }
    const choice = await this.#provider();
    if (gen !== this.#gen) return null;
    if (!choice) { this.#fail('offline', { card: false }); return null; } // the window opens the voice-connect modal
    this.#syncCard();
    const req = { projectName, context, builder, provider: choice.provider };
    if (choice.voice) req.voice = choice.voice;
    req.level = this.#settings.level;
    req.style = this.#settings.style;
    if (this.#welcomeCall) req.welcome = true;
    if (remembered && remembered !== strings.memory.empty) req.memory = remembered.slice(0, MEMORY_MAX);
    const res = await this.#voice.start(req);
    if (gen !== this.#gen) return null;
    if (!res?.ok) {
      this.#fail(res?.reason === 'no-key' ? 'offline' : res?.reason ?? 'failed', { card: res?.reason !== 'no-key' });
      return null;
    }
    return { simulated: false, res, projectName, builder, context, remembered };
  }

  // Which voice service this call uses, from the settings and what is connected: null when none is.
  // 'auto' prefers the service of the voice the person picked, then ElevenLabs, then Grok. The voice only
  // goes to main when it belongs to that service
  async #provider() {
    const { provider, voice } = this.#settings;
    if (typeof this.#voice.providers !== 'function') return { provider, voice }; // main decides (older bridge)
    let ready;
    try { ready = await this.#voice.providers(); } catch { ready = null; }
    const isReady = (p) => Boolean(ready?.[p]?.ready);
    const order = provider === 'auto' ? unique([providerOfVoice(voice), 'elevenlabs', 'grok'].filter(Boolean)) : [provider];
    const chosen = order.find(isReady);
    if (!chosen) return null;
    return { provider: chosen, voice: providerOfVoice(voice) === chosen ? voice : null };
  }

  hangUp() {
    const { status } = this.store.state;
    if (status === 'idle') return;
    this.#gen++;
    clearTimeout(this.#silenceTimer);
    clearTimeout(this.#manualTimer);
    this.#manualBye = null;
    const session = this.#session;
    this.#session = null;
    if (status === 'error') { this.store.set({ status: 'idle', error: null }); return; } // the card keeps the error
    this.store.set({ status: 'ending' });
    this.#gesture('saludar'); // goodbye
    this.#settleAsk(); // before the session ends: its tool answers "no"
    session?.end();
    this.#finish('hang-up');
  }

  toggleMute() {
    if (!this.#session) return;
    const muted = !this.store.state.muted;
    this.#session.setMuted(muted);
    this.store.set({ muted });
  }

  // The person writes to Qubi instead of speaking (from the chat)
  type(text) {
    const said = String(text ?? '').trim();
    if (!said || !this.#session || this.store.state.status !== 'live') return false;
    this.#session.type(said);
    return true;
  }

  levels() {
    try { return this.#session?.levels() ?? { input: 0, output: 0 }; } catch { return { input: 0, output: 0 }; }
  }

  // A fresh summary for the voice while the call is live (contextual: Qubi does not read it aloud), a few
  // seconds after the last change and only when it says something new
  #lastContext = null;
  #contextTimer = null;
  #refreshContext() {
    if (this.store.state.status !== 'live') return;
    clearTimeout(this.#contextTimer);
    const gen = this.#gen;
    this.#contextTimer = setTimeout(() => {
      if (gen !== this.#gen || this.store.state.status !== 'live') return;
      const now = this.#context();
      if (now === this.#lastContext) return;
      this.#lastContext = now;
      this.#session?.sendContext?.(C.contextNow(now));
    }, this.#timing.contextMs ?? CONTEXT_MS);
    this.#contextTimer?.unref?.();
  }

  #context() {
    return contextFor({ project: this.#project.store.state, map: this.#map?.store?.state ?? null, security: this.#security, builder: this.#builder });
  }

  #handlers(gen) {
    const mine = (fn) => (...args) => { if (gen === this.#gen) fn(...args); };
    return {
      status: mine((s) => {
        if (s === 'connected' && this.store.state.status === 'connecting') { this.store.set({ status: 'live' }); this.#syncCard(); this.#armSilence(); this.#gesture('saludar'); }
      }),
      mode: mine((mode) => {
        if (mode !== 'speaking' && mode !== 'listening') return;
        // seguir_manual: once Qubi's goodbye is over, the call ends and the buttons carry on
        if (this.#manualBye) {
          if (mode === 'speaking') this.#manualBye.spoke = true;
          else if (this.#manualBye.spoke) return this.hangUp();
        }
        this.store.set({ mode });
        if (mode === 'speaking') clearTimeout(this.#silenceTimer); else this.#armSilence();
      }),
      line: mine(({ who, text, final = true }) => {
        const said = String(text ?? '').trim();
        if (!said || final === false || (who !== 'qubi' && who !== 'person')) return;
        if (who === 'person') { this.#heard = { turn: ++this.#turn, at: this.#now() }; this.#armSilence(); }
        this.store.set({ lines: [...this.store.state.lines, { id: ++this.#lineId, who, text: said }].slice(-MAX_LINES) });
        this.#syncCard();
        // the person's next phrase answers a pending permission ("sí, dale" / "no, espera"); Qubi's never does
        const answer = who === 'person' && this.#ask ? voiceAnswer(said) : null;
        if (answer) this.#answer(answer);
      }),
      error: mine((reason) => this.#fail(reason)),
      // the other side ended it: Qubi said goodbye (agent), or the connection broke (error)
      ended: mine((reason) => {
        if (this.store.state.status === 'idle' || this.store.state.status === 'error') return;
        if (reason === 'error') return this.#fail('network');
        this.#gen++;
        this.#session = null;
        this.#finish('remote');
      }),
    };
  }

  // card: false leaves the chat alone when the call never got a card ('offline' opens the connect modal)
  #fail(reason, { card = true } = {}) {
    // the welcome call is an extra: if it cannot connect, the welcome simply goes on with its buttons
    if (this.#welcomeCall && !this.#started) {
      this.#gen++;
      const session = this.#session;
      this.#session = null;
      session?.end();
      this.#welcomeCall = false;
      this.store.set({ status: 'idle', error: null, mode: 'listening', permission: null, guide: null });
      return;
    }
    if (this.#started) this.#remember();
    this.#gen++;
    this.#settleAsk();
    const session = this.#session;
    this.#session = null;
    session?.end();
    this.#endedAt = Date.now();
    this.store.set({ status: 'error', error: C.errors[reason] ? reason : 'failed', mode: 'listening', permission: null, guide: null });
    if (card || this.store.state.cardId != null) this.#syncCard();
    this.#work = null;
    if (this.#started) this.#bus?.emit(EVENTS.callEnded, { reason: 'error' });
    this.#started = false;
  }

  #finish(reason) {
    this.#welcomeCall = false;
    if (this.#started) this.#remember();
    this.#settleAsk();
    this.#endedAt = Date.now();
    this.store.set({ status: 'idle', mode: 'listening', muted: false, permission: null, guide: null });
    this.#syncCard('ended');
    this.#work = null;
    if (this.#started) this.#bus?.emit(EVENTS.callEnded, { reason });
    this.#started = false;
  }

  // The call's card in the chat; nothing is sent when it did not change
  #syncCard(ended = null) {
    const s = this.store.state;
    const status = ended ?? { ringing: 'connecting', connecting: 'connecting', live: 'live', ending: 'ended', error: 'error' }[s.status];
    if (!status || !this.#chat.upsertCallCard) return;
    if (this.#welcomeCall && !this.#started && s.status !== 'live') return; // the welcome call shows up only once connected
    const task = s.task ? { kind: s.task.kind, pedido: s.task.pedido, status: s.task.status, created: s.task.created, changed: s.task.changed } : null;
    const card = {
      status, simulated: s.simulated, startedAt: this.#startedAt,
      ...(status === 'ended' || status === 'error' ? { endedAt: this.#endedAt } : {}),
      ...(status === 'error' ? { error: s.error } : {}),
      lines: s.lines, task,
    };
    const key = JSON.stringify(card);
    if (key === this.#lastCard) return;
    this.#lastCard = key;
    const id = this.#chat.upsertCallCard(card);
    if (id !== s.cardId) this.store.set({ cardId: id });
  }

  // --- What the voice agent can do in the app (strings.call.tools; never file contents nor keys) ---
  #clientTools(gen) {
    // a tool of a call that already ended does nothing
    const mine = (fn) => (params) => (gen === this.#gen ? fn(params ?? {}) : { ok: false, motivo: 'sin-llamada' });
    return {
      ver_proyecto: mine(() => ({ resumen: this.#context() })),
      // Moving Qubi (MEJORAS.md §3): only what is seen changes, no permission
      ir_a: mine(({ ruta }) => this.#goTo(ruta)),
      volver: mine(() => this.#goHome()),
      // Acting on the project (MEJORAS.md §2): only with the person's permission
      // reading a file in the background: the agent reads it (read-only, nothing opens on screen) and
      // Qubi gets a short spoken summary when it is done
      revisar_archivo: mine(({ ruta, pregunta }) => this.#reviewFile(ruta, pregunta)),
      // the person reshapes Qubi by talking: level and style apply now, the voice from the next call
      ajustar_qubi: mine((params) => this.#adjust(params)),
      abrir_archivo: mine(({ ruta }) => this.#openFile(ruta, gen)),
      ejecutar_app: mine(() => this.#runApp(gen)),
      abrir_en_navegador: mine(() => this.#openBrowser(gen)),
      // the voice model reads text it does not control (notices, names): a change needs the person's own say-so
      construir: mine(({ pedido }) => (this.#confirmed() ? this.#delegate('build', pedido, 'change') : { ok: false, motivo: 'sin-confirmar' })),
      preguntar: mine(({ pregunta }) => this.#delegate('ask', pregunta, 'explain')),
      ver_avance: mine(() => this.#progress()),
      // the same walk as ir_a: the camera and Qubi go there
      mostrar_carpeta: mine(({ ruta }) => this.#goTo(ruta)),
      // a team writes in several folders at once: the same say-so as construir
      repartir: mine(({ tareas }) => (this.#confirmed() ? this.#split(tareas) : { ok: false, motivo: 'sin-confirmar' })),
      ver_equipo: mine(() => this.#teamState()),
      // the security audit (docs/features/seguridad/README.md): read the whole project again, or repair
      // one file (after the person's yes: it changes files); Qubi hears how the audit judged the repair
      auditar: mine(() => this.#auditNow()),
      reparar: mine(({ ruta }) => (this.#confirmed() ? this.#repair(ruta) : { ok: false, motivo: 'sin-confirmar' })),
      // only what is seen: Qubi moves with what it says (saludar, celebrar, pensar, bailar…)
      gesto: mine(({ gesto }) => (this.#gesture(gestureName(gesto)) ? { ok: true } : { ok: false, motivo: 'no-existe' })),
      // The welcome of a new project: the same answers as the bubble's buttons
      elegir_experiencia: mine(({ nivel }) => this.#chooseLevel(nivel)),
      marcar_tecnologia: mine(({ tecnologia, elegir }) => this.#markTech(tecnologia, elegir)),
      empezar_proyecto: mine(() => this.#startProject()),
      seguir_manual: mine(() => this.#goManual()),
    };
  }

  // --- The welcome call: Qubi answers the bubble for the person (robotDialogViewModel.press, by voice) ---

  // The bubble's step and chosen technologies, or null when this is not the welcome call
  #welcomeState() {
    if (!this.#welcomeCall || !this.#welcome) return null;
    return this.#welcome.voiceState();
  }

  #chooseLevel(nivel) {
    const now = this.#welcomeState();
    if (!now) return { ok: false, motivo: 'sin-bienvenida' };
    const id = WELCOME_LEVEL[plainWord(nivel)];
    if (!id) return { ok: false, motivo: 'no-entendido' };
    if (now.paso !== 'experiencia') return { ok: false, motivo: 'otro-paso', ...now };
    this.#welcome.press(id, { by: 'voice' });
    return { ok: true, ...this.#welcome.voiceState() };
  }

  #markTech(tecnologia, elegir) {
    const now = this.#welcomeState();
    if (!now) return { ok: false, motivo: 'sin-bienvenida' };
    const key = WELCOME_TECH[plainWord(tecnologia).replace(/[\s.]/g, '')];
    if (!key) return { ok: false, motivo: 'no-existe' };
    if (now.paso !== 'tecnologias') return { ok: false, motivo: 'otro-paso', ...now };
    const want = !/^no\b/.test(plainWord(elegir));
    if (now.tecnologias.includes(key) !== want) this.#welcome.press(`pick:${key}`, { by: 'voice' });
    return { ok: true, ...this.#welcome.voiceState() };
  }

  // "¡Empecemos!" by voice: the bubble records the integrations and asks for the base project, which comes
  // back here (buildForWelcome) so the call follows the work like any construir
  #startProject() {
    const now = this.#welcomeState();
    if (!now) return { ok: false, motivo: 'sin-bienvenida' };
    if (now.paso !== 'tecnologias') return { ok: false, motivo: 'otro-paso', ...now };
    if (!this.#confirmed()) return { ok: false, motivo: 'sin-confirmar' };
    if (!this.store.state.simulated && this.#connection && !this.#connection.live) return { ok: false, motivo: 'sin-agente' };
    this.#welcome.press('start', { by: 'voice' });
    return this.store.state.task?.status === 'running' ? { ok: true, estado: 'empezó' } : { ok: false, motivo: 'sin-agente' };
  }

  // The welcome's base project, handed to the agent: during the live welcome call it goes through the
  // call (the work is told to the voice as it goes). False when this is not that call or it was refused
  buildForWelcome(prompt) {
    if (!this.#welcomeCall || this.store.state.status !== 'live') return false;
    return this.#delegate('build', prompt, 'change').ok === true;
  }

  // seguir_manual: Qubi says goodbye and the call ends once it stops talking (or after a short while)
  #goManual() {
    if (!this.#welcomeState()) return { ok: false, motivo: 'sin-bienvenida' };
    this.#manualBye = { spoke: this.store.state.mode === 'speaking' };
    clearTimeout(this.#manualTimer);
    const gen = this.#gen;
    this.#manualTimer = setTimeout(() => { if (gen === this.#gen) this.hangUp(); }, this.#timing.manualMs ?? MANUAL_MS);
    this.#manualTimer?.unref?.();
    return { ok: true };
  }

  // The person tapped an answer on the bubble: they went manual, so the welcome call ends
  manual() {
    if (this.welcomeCall) this.hangUp();
  }

  // The project is running: its address stays on screen (the call panel, and the chat via actions.showLink)
  #showLink(port) {
    const url = `http://localhost:${port}`;
    this.store.set({ link: { port, url } });
    try { this.#actions.showLink?.(url); } catch { /* the panel still shows it */ }
  }

  async #auditNow() {
    if (!this.#actions.audit) return { ok: false, motivo: 'sin-auditoria' };
    this.#gesture('pensar');
    let res;
    try { res = await this.#actions.audit(); } catch { res = null; }
    const sec = this.#security?.store?.state;
    if (!res || !sec?.audited) return { ok: false, motivo: 'falló' };
    this.#gesture(res.fixed?.length ? 'celebrar' : res.worse?.length ? 'sorpresa' : 'asentir');
    return {
      ok: true, puntaje: sec.score, antes: res.before ?? null, en_riesgo: sec.counts?.red ?? 0, por_revisar: sec.counts?.yellow ?? 0,
      arreglados: (res.fixed ?? []).filter((p) => !isSecretFile(p)).slice(0, 5).map(nameOf),
      nuevos: (res.worse ?? []).filter((p) => !isSecretFile(p)).slice(0, 5).map(nameOf),
    };
  }

  #repairs = new Set(); // the files Qubi asked to repair in this call

  #repaired(entry) {
    if (!entry?.path || !this.#repairs.has(entry.path) || this.store.state.status !== 'live') return;
    if (['working', 'queued'].includes(entry.status)) return;
    this.#repairs.delete(entry.path);
    this.#gesture(entry.status === 'verified' ? 'celebrar' : 'encoger');
    this.#notify(C.notices.repaired({ name: nameOf(entry.path), status: entry.status, score: entry.audit?.score, still: entry.stillRisky ?? '' }));
  }

  // reparar: Qubi and the person's agent repair the file (repairViewModel); the audit judges it after
  #repair(ruta) {
    const path = cleanPath(ruta);
    if (!path) return { ok: false, motivo: 'no-existe' };
    if (isSecretFile(path)) return { ok: false, motivo: 'secreto' };
    const node = findNode(this.#project.store.state.tree ?? [], path);
    if (!node) return { ok: false, motivo: 'no-existe' };
    // a folder ("arregla la carpeta db"): its worst marked file, red before yellow
    const rank = (p) => ({ red: 2, yellow: 1 })[this.#security?.scoreOf?.(p)?.level] ?? 0;
    const target = node.type === 'dir'
      ? allFiles(node.children ?? []).map((f) => f.path).filter((p) => !isSecretFile(p) && rank(p)).sort((a, b) => rank(b) - rank(a))[0]
      : (rank(path) ? path : null);
    if (!target) return { ok: false, motivo: 'sin-riesgo' };
    if (!this.#actions.repair) return { ok: false, motivo: 'falló' };
    this.#repairs.add(target);
    this.#actions.repair(target);
    return { ok: true, estado: 'empezó', ...(target !== path ? { archivo: nameOf(target) } : {}) };
  }

  // Qubi makes a gesture on the map (robotView plays each new id); false for an unknown one
  #gestureId = 0;
  #gesture(name) {
    if (!name) return false;
    this.store.set({ gesture: { name, id: ++this.#gestureId } });
    return true;
  }

  // A line of the app in the call (permissions, where Qubi goes): shown in the panel and the card, never
  // sent to the voice and never counted as the person speaking
  #system(text) {
    this.store.set({ lines: [...this.store.state.lines, { id: ++this.#lineId, who: 'system', text: String(text) }].slice(-MAX_LINES) });
    this.#syncCard();
  }

  // --- Permissions (MEJORAS.md §2): Qubi asks, the person answers with a button or their next words ---

  // null when the person allowed it, else the tool's refusal: another one is pending (ocupado), or no,
  // no answer in time, the call ended (sin-permiso)
  // The person's own order a moment ago ("ábrelo", "arranca la app") is the permission: no second question.
  // An action the voice took on its own (after a notice, or long after the person spoke) still asks.
  async #permit(gen, action, target, label) {
    if (this.#ask) return { ok: false, motivo: 'ocupado' };
    if (this.#confirmed()) {
      this.#system(P.direct(label));
      return null;
    }
    return (await this.#request(gen, action, target, label)) ? null : { ok: false, motivo: 'sin-permiso' };
  }

  // Resolves true (allowed) or false
  #request(gen, action, target, label) {
    if (gen !== this.#gen || this.#ask || this.store.state.status !== 'live') return Promise.resolve(false);
    const id = `permiso-${++this.#askId}`;
    return new Promise((resolve) => {
      const timer = setTimeout(() => this.#answer('timeout'), this.#timing.permissionMs ?? PERMISSION_MS);
      this.#ask = { id, resolve, timer, label };
      this.store.set({ permission: { id, action, target, label, canAlways: action === 'abrir_archivo' } });
      this.#system(P.ask(label));
    });
  }

  // 'yes' | 'no' | 'timeout': the line it leaves in the call, and the waiting tool gets its answer
  #answer(how) {
    const ask = this.#ask;
    if (!ask) return;
    this.#ask = null;
    clearTimeout(ask.timer);
    this.store.set({ permission: null });
    this.#toldTurn = Math.max(this.#toldTurn, this.#heard.turn); // that answer is used up: it allows nothing else
    this.#system(how === 'yes' ? P.granted(ask.label) : how === 'timeout' ? P.expired(ask.label) : P.denied(ask.label));
    this.#gesture(how === 'yes' ? 'asentir' : 'encoger');
    ask.resolve(how === 'yes');
  }

  // The call ended with a permission still pending: it is a no, with no line (the call is over)
  #settleAsk() {
    const ask = this.#ask;
    if (!ask) return;
    this.#ask = null;
    clearTimeout(ask.timer);
    ask.resolve(false);
  }

  // abrir_archivo: a file of the project in the floating editor. Secrets never open, not even with permission
  async #openFile(ruta, gen) {
    const path = cleanPath(ruta);
    if (!path) return { ok: false, motivo: 'no-existe' };
    if (isSecretFile(path)) return { ok: false, motivo: 'secreto' };
    const node = findNode(this.#project.store.state.tree ?? [], path);
    if (!node || node.type === 'dir') return { ok: false, motivo: 'no-existe' };
    if (!this.#actions.openFile) return { ok: false, motivo: 'falló' };
    this.#walk(path, false, G.opening); // Qubi goes for it while the person answers
    const refused = this.#alwaysOpen ? null : await this.#permit(gen, 'abrir_archivo', path, P.labels.abrir_archivo(nameOf(path)));
    if (refused) return refused;
    if (gen !== this.#gen) return { ok: false, motivo: 'sin-llamada' };
    try {
      const res = await this.#actions.openFile(path);
      return res === false || res?.ok === false ? { ok: false, motivo: 'falló' } : { ok: true };
    } catch {
      return { ok: false, motivo: 'falló' };
    }
  }

  // ejecutar_app: the project's own dev/start script (main lists them, runs one by its id and shows its own
  // native confirm too). With several, the web app or the root one; the label says which
  async #runApp(gen) {
    const calledAt = Date.now();
    if (!this.#run) return { ok: false, motivo: 'sin-script' };
    const { ok, data } = await this.#run.scripts();
    if (gen !== this.#gen) return { ok: false, motivo: 'sin-llamada' };
    const script = ok ? pickScript(data) : null;
    if (!script) return { ok: false, motivo: 'sin-script' };
    const folder = cleanPath(script.cwd ?? '').replace(/^\.$/, '');
    const command = String(script.command ?? `npm run ${script.script ?? 'dev'}`);
    const target = folder ? `${command} (${folder}/)` : command;
    const refused = await this.#permit(gen, 'ejecutar_app', target, P.labels.ejecutar_app(target));
    if (refused) return refused;
    if (gen !== this.#gen) return { ok: false, motivo: 'sin-llamada' };
    // main's own dialog and a first `next dev` can take longer than the tool's 60 s: past the deadline the
    // tool answers 'arrancando' and Qubi hears the outcome later as a notice (the preview opens anyway)
    const started = Promise.resolve(this.#run.start(script.id)).catch(() => ({ ok: false, reason: 'failed' }));
    const budget = Math.max(0, (this.#timing.toolAnswerMs ?? TOOL_ANSWER_MS) - (Date.now() - calledAt));
    let timer;
    const late = new Promise((resolve) => { timer = setTimeout(() => resolve(LATE), budget); });
    const res = await Promise.race([started, late]);
    clearTimeout(timer);
    if (res !== LATE) {
      const answer = runAnswer(res);
      if (answer.puerto && gen === this.#gen) this.#showLink(answer.puerto);
      return answer;
    }
    started.then((final) => {
      if (gen !== this.#gen) return;
      const answer = runAnswer(final);
      if (answer.puerto) this.#showLink(answer.puerto);
      this.#notify(answer.ok ? (answer.puerto ? C.notices.runReady : C.notices.runNoPort) : C.notices.runFailed);
    });
    return { ok: true, estado: 'arrancando' };
  }

  // abrir_en_navegador: a server of the project that is already running
  async #openBrowser(gen) {
    let servers = [];
    try { servers = (await this.#actions.projectServers?.()) ?? []; } catch { servers = []; }
    if (gen !== this.#gen) return { ok: false, motivo: 'sin-llamada' };
    const port = servers.map((s) => Number(s?.port)).find((p) => Number.isInteger(p) && p > 0);
    if (!port || !this.#actions.openPreview) return { ok: false, motivo: 'sin-servidor' };
    const refused = await this.#permit(gen, 'abrir_en_navegador', String(port), P.labels.abrir_en_navegador(port));
    if (refused) return refused;
    if (gen !== this.#gen) return { ok: false, motivo: 'sin-llamada' };
    try {
      const res = await this.#actions.openPreview(port);
      return res === false || res?.ok === false ? { ok: false, motivo: 'falló' } : { ok: true, puerto: port };
    } catch {
      return { ok: false, motivo: 'falló' };
    }
  }

  // --- Directing Qubi (MEJORAS.md §3) ---

  // ir_a / mostrar_carpeta: the camera flies there (actions.showFolder) and Qubi walks to the folder or
  // file and points. say: the pool of lines for the way (strings.call.guide), one after another
  #goTo(ruta, say = G.going) {
    const path = cleanPath(ruta);
    if (isSecretFile(path)) return { ok: false, motivo: 'secreto' };
    const node = path ? findNode(this.#project.store.state.tree ?? [], path) : { type: 'dir' };
    if (!node) return { ok: false, motivo: 'no-existe' };
    this.#walk(path, node.type === 'dir', say);
    return { ok: true };
  }

  // Qubi walks to a place of the project (already checked: it exists and is not a secret)
  #walk(path, isDir, say) {
    // a file: its folder opens (the map shows it), not the file itself
    const shown = isDir ? path : path.split('/').slice(0, -1).join('/');
    const show = this.#actions.showFolder ?? this.#actions.locate;
    try {
      if (show) show(shown);
      else this.#map?.show?.(shown);
    } catch { /* the map stays where it was; Qubi still walks */ }
    // where it is on the map now (after the map opened it), like buildViewModel
    const step = { id: 'ir_a', kind: !path ? 'place' : isDir ? 'folder' : 'file', target: path };
    const place = this.#map?.store?.state ? placesFor([step], this.#map.store.state).get('ir_a') : null;
    const name = path ? nameOf(path) : G.root;
    const text = say[this.#guideId % say.length](name);
    const from = this.store.state.guide?.to ?? HOME;
    this.store.set({ guide: { from, to: place?.stand ?? HOME, center: { x: place?.x ?? 0, z: place?.z ?? 0 }, stepId: `ir_a-${++this.#guideId}`, pose: 'point', text } });
    this.#system(text);
  }

  // volver: Qubi walks back to its spot
  #goHome() {
    const from = this.store.state.guide?.to ?? HOME;
    this.store.set({ guide: { from, to: HOME, center: { x: 0, z: 0 }, stepId: `volver-${++this.#guideId}`, pose: 'idle', text: G.back } });
    this.#system(G.back);
    return { ok: true };
  }

  // The person spoke after the app last told the voice something, and a moment ago
  #confirmed() {
    const { turn, at } = this.#heard;
    return turn > this.#toldTurn && this.#now() - at <= CONFIRM_MS;
  }

  // What the app tells the voice (both are text the voice model reads, never the person's words)
  #tell(text) {
    this.#toldTurn = ++this.#turn;
    this.#session?.sendContext(text);
  }

  #notify(text) {
    this.#toldTurn = ++this.#turn;
    this.#session?.notify(text);
  }

  // ajustar_qubi: only what the person asked for. Kept in the settings (next calls) and told to the
  // voice now as context, so the rest of this call already sounds that way
  #adjust({ nivel, estilo, voz } = {}) {
    const level = LEVEL_WORDS[plainWord(nivel)];
    const style = STYLE_WORDS[plainWord(estilo)];
    const voice = VOICE_WORDS[plainWord(voz)];
    if (!level && !style && !voice) return { ok: false, motivo: 'no-entendido' };
    this.setSettings({ ...(level ? { level } : {}), ...(style ? { style } : {}), ...(voice ? { voice } : {}) });
    // the app's mode follows: technical is Dev, basic is Vibe (intermediate keeps the mode)
    if (level === 'tecnico' || level === 'basico') this.#actions.setMode?.(level === 'tecnico' ? 'tech' : 'vibe');
    const A = C.adjust;
    if (level || style) this.#session?.sendContext?.(A.context({ level: level && A.levels[level], style: style && A.styles[style] }));
    this.#system(A.done([level && C.settings.levels[level], style && C.settings.styles[style], voice && C.settings.voices[voice]].filter(Boolean).join(' · ')));
    return { ok: true, aplicado: { ...(level ? { nivel: level } : {}), ...(style ? { estilo: style } : {}), ...(voice ? { voz: voice, desde: 'la-proxima-llamada' } : {}) } };
  }

  // --- 20 s without an answer: Qubi hangs up (not while the agent, the team or a permission is pending) ---
  #silenceTimer = null;
  #armSilence() {
    clearTimeout(this.#silenceTimer);
    const s = this.store.state;
    if (s.status !== 'live' || s.mode !== 'listening') return;
    const gen = this.#gen;
    this.#silenceTimer = setTimeout(() => {
      if (gen !== this.#gen || this.store.state.status !== 'live' || this.store.state.mode !== 'listening') return;
      const busy = ['running', 'waiting'].includes(this.store.state.task?.status) || this.#teamBusy() || this.store.state.permission;
      if (busy) return this.#armSilence(); // waiting on work is not silence
      this.#system(C.silenceEnded);
      this.hangUp();
    }, this.#timing.silenceMs ?? SILENCE_MS);
    this.#silenceTimer?.unref?.(); // in Node (tests) a call left open must not keep the process alive
  }

  // revisar_archivo: the agent reads the file in the background (intent explain = read-only) and answers
  // in a few plain sentences at the person's level; no editor opens. Secrets are never read
  #reviewFile(ruta, pregunta) {
    const path = cleanPath(ruta);
    if (!path) return { ok: false, motivo: 'no-existe' };
    if (isSecretFile(path)) return { ok: false, motivo: 'secreto' };
    const node = findNode(this.#project.store.state.tree ?? [], path);
    if (!node || node.type === 'dir') return { ok: false, motivo: 'no-existe' };
    // what the audit found there: the agent checks exactly that, and Qubi hears it with the answer
    const findings = this.#security?.findingsOf?.(path) ?? [];
    const asked = C.review({ path, pregunta: String(pregunta ?? '').trim().slice(0, 400), level: this.#settings.level, findings });
    const audit = findings.length ? this.#security.scoreOf(path).reason : '';
    const res = this.#delegate('ask', asked, 'explain', { spoken: true, audit });
    if (res.ok) this.#walk(path, false, G.reviewing); // Qubi goes to the file while the agent reads it
    return res;
  }

  // Hands the request to the chat (the agent the person picked) and answers at once: the work is
  // followed by #watch and told to the voice as it goes
  // spoken: the agent's answer comes back to the voice as a short, cleaned summary (speakable)
  #delegate(kind, text, intent, { spoken = false, audit = '' } = {}) {
    const asked = String(text ?? '').trim().slice(0, MAX_ASK);
    if (!asked) return { ok: false, motivo: 'sin-pedido' };
    if (!this.#project.store.state.open) return { ok: false, motivo: 'sin-proyecto' };
    const busy = this.store.state.task?.status === 'running' || this.store.state.task?.status === 'waiting';
    if (this.#chat.store.state.typing || busy || (kind === 'build' && this.#teamBusy())) return { ok: false, motivo: 'ocupado' };
    // a real call with no agent would get the chat's scripted demo answer: the person picks one first
    if (!this.store.state.simulated && this.#connection && !this.#connection.live) return { ok: false, motivo: 'sin-agente' };
    const agente = this.#builder;
    this.#work = { before: this.#chat.store.state.messages.length, messageId: null, sawTyping: false, waited: new Set(), finished: false, kind, agente, spoken, audit, answer: '' };
    this.store.set({ task: { messageId: null, kind, pedido: asked, status: 'running', created: [], changed: [] } });
    this.#syncCard();
    try {
      Promise.resolve(this.#chat.send(asked, { intent })).catch(() => this.#settle('error'));
    } catch {
      this.#settle('error');
    }
    this.#pedidos.push(asked);
    this.#gesture('pensar');
    this.#watch(this.#chat.store.state);
    return { ok: true, estado: 'empezó', agente };
  }

  #progress() {
    const task = this.store.state.task;
    if (!task) return { estado: 'sin-trabajo', archivos: { creados: [], cambiados: [] }, esperando: null, resumen: PROGRESS.none };
    const estado = { running: 'trabajando', waiting: 'esperando-permiso', done: 'terminado', error: 'falló' }[task.status];
    const awaiting = this.#awaiting();
    return { estado, archivos: { creados: task.created, cambiados: task.changed }, esperando: awaiting, resumen: this.#summary() };
  }

  #awaiting() {
    const m = this.#work?.messageId != null && this.#chat.store.state.messages.find((x) => x.id === this.#work.messageId);
    return m?.run?.awaiting ?? null;
  }

  // A short sentence about the work for the voice (sendContext and ver_avance). Only what the app writes:
  // the agent's answer stays in the chat (it can quote code or a key written in a file)
  #summary() {
    const task = this.store.state.task;
    if (!task) return PROGRESS.none;
    const agent = this.#work?.agente ?? this.#builder;
    const list = (paths) => paths.slice(0, MAX_LISTED).map(nameOf).join(', ');
    const parts = [
      task.status === 'running' && (task.kind === 'ask' ? PROGRESS.asking(agent) : PROGRESS.running(agent)),
      task.status === 'waiting' && this.#awaiting() && PROGRESS.waiting(nameOf(this.#awaiting())),
      task.created.length && PROGRESS.created(list(task.created)),
      task.changed.length && PROGRESS.changed(list(task.changed)),
      task.status === 'done' && PROGRESS.done,
      task.status === 'error' && PROGRESS.failed,
    ];
    return parts.filter(Boolean).join(' ');
  }

  // Follows the delegated work in the chat: the first run card after the request is its card
  #watch(state) {
    const work = this.#work;
    if (!work || work.finished || !this.store.state.task) return;
    if (state.typing) work.sawTyping = true;
    let m = work.messageId != null ? state.messages.find((x) => x.id === work.messageId) : null;
    if (!m) {
      m = state.messages.slice(work.before).find((x) => x.run && x.run.kind !== 'repair') ?? null;
      if (m) work.messageId = m.id;
    }
    const task = this.store.state.task;
    let next;
    if (m) {
      const { created, changed, awaiting } = workOf(m.run);
      const status = m.run.status === 'done' ? 'done' : m.run.status === 'error' ? 'error' : awaiting ? 'waiting' : 'running';
      if (work.spoken) work.answer = String(m.text ?? '');
      next = { ...task, messageId: m.id, status, created, changed };
      if (awaiting && !work.waited.has(awaiting)) {
        work.waited.add(awaiting);
        this.#notify(C.notices.waiting(nameOf(awaiting)));
      }
    } else if (work.sawTyping && !state.typing) {
      // no agent connected: the chat's scripted reply answered, with no run card. The chat pauses
      // ("typing…") between working it out and showing it: done only once the reply is there
      const reply = state.messages.slice(work.before).some((x) => x.role === 'bot' && x.card?.kind !== 'call' && (x.text || x.html || x.card));
      if (!reply) return;
      next = { ...task, status: 'done' };
    } else return;
    const changed = next.status !== task.status || next.messageId !== task.messageId || next.created.join() !== task.created.join() || next.changed.join() !== task.changed.join();
    if (!changed) return;
    next.created.forEach((p) => this.#built.add(p));
    this.store.set({ task: next });
    this.#syncCard();
    this.#tell(this.#summary());
    if (next.status === 'done' || next.status === 'error') this.#settle(next.status);
  }

  // The work ended: Qubi is asked to say it, once
  #settle(status) {
    const work = this.#work;
    if (!work || work.finished) return;
    work.finished = true;
    const task = this.store.state.task;
    if (task && task.status !== status) {
      this.store.set({ task: { ...task, status } });
      this.#syncCard();
    }
    const notice = status === 'error' ? C.notices.failed(work.agente)
      : work.kind === 'ask' ? (work.spoken && speakable(work.answer)
        ? (work.audit ? C.notices.reviewedAudit(speakable(work.answer), work.audit) : C.notices.reviewed(speakable(work.answer)))
        : C.notices.answered)
      : C.notices.built(task?.created.length ?? 0, task?.changed.length ?? 0);
    this.#gesture(status === 'error' ? 'encoger' : work.kind === 'build' ? 'celebrar' : 'asentir');
    this.#notify(notice);
  }

  // --- Fase 2: Qubi's team ---

  #teamBusy() {
    const phase = this.#team?.store?.state?.phase;
    return phase === 'working' || phase === 'auditing';
  }

  // repartir: titulo/pedido/carpeta from the voice -> teamViewModel.start([{ title, pedido, folder }]).
  // The team checks the folders and the agent; the answer never carries more than ids, titles and folders
  async #split(tareas) {
    if (!this.#team) return { ok: false, motivo: 'sin-equipo' };
    let list = tareas;
    if (typeof list === 'string') { try { list = JSON.parse(list); } catch { list = null; } }
    if (!Array.isArray(list) || !list.length) return { ok: false, motivo: 'sin-pedido' };
    const tasks = list.map((t) => {
      const pedido = String(t?.pedido ?? '').trim().slice(0, MAX_ASK);
      return { title: (String(t?.titulo ?? '').trim() || pedido).slice(0, TITLE_MAX), pedido, folder: String(t?.carpeta ?? '').trim() };
    });
    if (tasks.some((t) => !t.pedido)) return { ok: false, motivo: 'sin-pedido' };
    if (!this.#project.store.state.open) return { ok: false, motivo: 'sin-proyecto' };
    // one job at a time: a delegated change and a team never write at once
    const task = this.store.state.task;
    if (this.#chat.store.state.typing || task?.status === 'running' || task?.status === 'waiting') return { ok: false, motivo: 'ocupado' };
    let res;
    try { res = await this.#team.start(tasks); } catch { return { ok: false, motivo: 'falló' }; }
    if (!res?.ok) return { ok: false, motivo: res?.motivo ?? 'falló' };
    this.#teamRun = { ids: new Set(res.workers.map((w) => w.id)), failed: new Set(), done: false, told: '' };
    this.#pedidos.push(...tasks.map((t) => t.pedido));
    this.#watchTeam(this.#team.store.state);
    return { ok: true, trabajadores: res.workers.map((w) => ({ id: w.id, titulo: w.title, carpeta: w.folder })) };
  }

  // ver_equipo: the app's own summary plus states and file names; never what a worker or the review
  // said (it can quote code or a key), never a secret file
  #teamState() {
    const { phase = 'idle', workers = [] } = this.#team?.store?.state ?? {};
    const files = (paths) => (paths ?? []).filter((p) => !isSecretFile(p)).slice(0, MAX_LISTED);
    return {
      fase: TEAM_PHASE[phase] ?? 'trabajando',
      resumen: this.#team ? this.#teamSummary() : T.summary('idle', []),
      trabajadores: workers.map((w) => ({
        titulo: w.title, carpeta: w.folder, estado: WORKER_STATUS[w.status] ?? 'trabajando',
        archivos: { creados: files(w.created), cambiados: files(w.changed) },
        auditoria: AUDIT_STATUS[w.audit?.status] ?? null,
      })),
    };
  }

  #teamSummary() {
    try { return String(this.#team?.summary() ?? ''); } catch { return ''; }
  }

  // The team this call started: its summary goes to the voice when it changes; a worker that fails and
  // the end of the audit are told once
  #watchTeam(state) {
    const run = this.#teamRun;
    if (!run || run.done || !this.#session || this.store.state.status !== 'live') return;
    const workers = (state?.workers ?? []).filter((w) => run.ids.has(w.id));
    if (!workers.length) return;
    this.#collect(workers);
    const said = this.#teamSummary();
    if (said && said !== run.told) {
      run.told = said;
      this.#tell(said);
    }
    for (const w of workers) {
      if (w.status !== 'failed' || run.failed.has(w.id)) continue;
      run.failed.add(w.id);
      this.#notify(C.notices.failed(T.worker(w.n ?? run.failed.size)));
    }
    if (state.phase === 'done') {
      run.done = true;
      const count = (status) => workers.filter((w) => w.audit?.status === status).length;
      this.#notify(T.notices.allDone(count('approved'), count('flagged')));
    }
  }

  // What the team made, for the project's memory
  #collect(workers) {
    for (const w of workers) {
      (w.created ?? []).filter((p) => !isSecretFile(p)).forEach((p) => this.#built.add(p));
      const verdict = w.audit?.status === 'approved' || w.audit?.status === 'flagged' ? w.audit.status
        : w.status === 'failed' || w.status === 'cancelled' ? w.status : null;
      if (verdict && w.folder) this.#audits.set(w.folder, verdict);
    }
  }

  // --- Fase 3: the project's memory ---

  // The call ended: a fixed summary of what happened (no model's words) and the facts of the project.
  // A call where nothing was asked leaves no entry. Saved in the background: hanging up never waits
  #remember() {
    const memory = this.#memory;
    const root = this.#root;
    if (!memory || !root) return;
    const run = this.#teamRun;
    if (run) this.#collect((this.#team?.store?.state?.workers ?? []).filter((w) => run.ids.has(w.id)));
    const pedidos = unique(this.#pedidos).slice(0, MEMORY_PEDIDOS);
    const built = [...this.#built].slice(0, MEMORY_BUILT);
    const audits = [...this.#audits].map(([folder, status]) => ({ folder, status }));
    const notes = [this.store.state.task && this.#summary(), run?.told].filter(Boolean).join(' ').slice(0, NOTES_MAX);
    const entry = pedidos.length || built.length || audits.length ? { at: new Date(this.#now()).toISOString(), pedidos, built, audits, notes } : null;
    // the tree of this call's project (another one may be open by now)
    const project = this.#project.store.state;
    const facts = learnFacts(project.open && project.session === this.#callSession ? project.tree : this.#startTree);
    Promise.resolve()
      .then(async () => {
        if (entry) await memory.append(root, entry);
        if (facts.length) await memory.learn(root, facts);
      })
      .catch(() => {});
  }
}
