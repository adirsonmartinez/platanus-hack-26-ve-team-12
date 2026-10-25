// The call with Qubi over Grok Voice (xAI's realtime voice API), docs/features/llamada/VOZ.md. Same Session
// shape as callSession.js: { end, setMuted, sendContext, notify, type, levels, simulated: false }.
// Main hands a short-lived client secret (the xAI key never leaves main) and the session settings: Qubi's
// prompt with its variables already filled, the voice, the client tools and the first message.
// The window does the audio itself: the microphone through its own worklet (16-bit PCM in ~100 ms blocks)
// and Qubi's voice as a queue of AudioBuffers. Browser objects come from `env`, so tests use fakes.
import { NOTICE_PREFIX, spokenText, reasonOf } from './callSession.js';

export const GROK_URL = 'wss://api.x.ai/v1/realtime';
export const GROK_MODEL = 'grok-voice-latest';
export const CAPTURE_NAME = 'pcm-capture'; // registerProcessor name in renderer/audio/pcmCapture.worklet.js
// greetMs: if the first message got no answer by then (force_message not taken), it is asked again as an
// item; bargeChunks: loud microphone blocks in a row that cut Qubi when the server says nothing
export const GROK_TIMING = { greetMs: 2500, bargeChunks: 2 };
const BARGE_RMS = 0.08;
const LEVEL_GAIN = 4; // a voice's RMS is small: scaled so a normal voice fills the wave
const clamp01 = (n) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

// The worklet is a file next to the page, so the CSP needs no blob: (resolved like callSession's worklets)
const workletUrl = () => {
  const relative = './audio/pcmCapture.worklet.js';
  return typeof document !== 'undefined' && document.baseURI ? new URL(relative, document.baseURI).href : relative;
};

export function toBase64(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

export function fromBase64(text) {
  const raw = atob(String(text ?? ''));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

// 16-bit little-endian PCM -> samples in -1..1
export function pcm16ToFloat(buffer) {
  const pcm = new Int16Array(buffer, 0, Math.floor(buffer.byteLength / 2));
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] / 0x8000;
  return out;
}

// An error event of the API -> the call's reason (only these two end the call)
function fatalOf(error) {
  const text = `${error?.type ?? ''} ${error?.code ?? ''} ${error?.message ?? ''}`;
  if (/auth|unauthori[sz]ed|forbidden|invalid[_ ]api[_ ]key|client[_ ]secret|expired/i.test(text)) return 'auth';
  if (/quota|billing|credit|insufficient|rate[_ ]?limit/i.test(text)) return 'quota';
  return null;
}

// session: { instructions, voice, tools, language, firstMessage } as main built it
// env (tests): { WebSocket, AudioContext, AudioWorkletNode, getUserMedia, workletUrl, timing }
export async function openGrokSession({ token, model = GROK_MODEL, session = {}, clientTools = {}, on, env = {} }) {
  const WS = env.WebSocket ?? globalThis.WebSocket;
  const Ctx = env.AudioContext ?? globalThis.AudioContext;
  const WorkletNode = env.AudioWorkletNode ?? globalThis.AudioWorkletNode;
  const getUserMedia = env.getUserMedia ?? ((constraints) => globalThis.navigator.mediaDevices.getUserMedia(constraints));
  const t = { ...GROK_TIMING, ...(env.timing ?? {}) };

  let stream = null;
  let ctx = null;
  let ws = null;
  let source = null;
  let capture = null;
  let inAnalyser = null;
  let outAnalyser = null;
  let ended = false;
  let muted = false;
  let mode = 'listening';
  const sources = new Set(); // Qubi's queued audio
  let nextTime = 0;
  let dropping = false;      // the person interrupted: the rest of that answer is not played
  let serverVad = false;     // the server says when the person starts talking (else: loudness)
  let loud = 0;
  let responseActive = false;
  let requested = 0;         // responses the window asked for (a server one means the person spoke)
  let wantResponse = false;  // an answer is due once nothing else is running
  const calls = new Set();   // client tools still running
  let greeted = false;
  let greetTimer = null;
  let buffers = null;        // reused by levels()

  const send = (event) => {
    if (ended || !ws || ws.readyState !== 1) return;
    try { ws.send(JSON.stringify(event)); } catch { /* the close event says it */ }
  };
  const setMode = (next) => {
    if (next === mode) return;
    mode = next;
    on.mode(next);
  };
  const cut = () => {
    for (const s of sources) { s.onended = null; try { s.stop(); } catch { /* already stopped */ } }
    sources.clear();
    nextTime = 0;
    setMode('listening');
  };
  const release = () => {
    clearTimeout(greetTimer);
    cut();
    try { capture?.port && (capture.port.onmessage = null); capture?.disconnect(); } catch { /* gone */ }
    try { source?.disconnect(); } catch { /* gone */ }
    stream?.getTracks?.().forEach((track) => { try { track.stop(); } catch { /* gone */ } });
    try { ctx?.close?.()?.catch?.(() => {}); } catch { /* closed */ }
  };
  // A new answer is asked only when no tool is still running and none is being said
  const flush = () => {
    if (!wantResponse || calls.size || responseActive || ended) return;
    wantResponse = false;
    responseActive = true;
    requested++;
    send({ type: 'response.create' });
  };
  const item = (role, text) => send({ type: 'conversation.item.create', item: { type: 'message', role, content: [{ type: 'input_text', text: String(text) }] } });

  const play = (delta) => {
    if (dropping || !ctx) return;
    const samples = pcm16ToFloat(fromBase64(delta));
    if (!samples.length) return;
    const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
    if (buffer.copyToChannel) buffer.copyToChannel(samples, 0);
    else buffer.getChannelData(0).set(samples);
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.connect(outAnalyser);
    const at = Math.max(ctx.currentTime, nextTime);
    node.start(at);
    nextTime = at + buffer.duration;
    sources.add(node);
    node.onended = () => {
      sources.delete(node);
      if (!sources.size) setMode('listening');
    };
    setMode('speaking');
  };

  // A client tool the model called: its answer goes back as a function_call_output; one response.create
  // follows once every tool of that turn answered
  const runTool = async ({ call_id: callId, name, arguments: args }) => {
    calls.add(callId);
    let params = {};
    try { params = args ? JSON.parse(args) : {}; } catch { params = {}; }
    let result;
    try {
      const fn = Object.hasOwn(clientTools, name) ? clientTools[name] : null;
      result = fn ? await fn(params ?? {}) : { ok: false, motivo: 'desconocida' };
    } catch {
      result = { ok: false, motivo: 'falló' };
    }
    calls.delete(callId);
    if (ended) return;
    send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output: JSON.stringify(result ?? {}) } });
    wantResponse = true;
    flush();
  };

  // The first message: said as is with force_message; if the API does not take it, as an item to answer
  const greet = () => {
    const text = String(session.firstMessage ?? '').trim();
    if (!text) return;
    send({ type: 'force_message', text });
    greetTimer = setTimeout(greetAgain, t.greetMs);
  };
  const greetAgain = () => {
    if (greeted || ended) return;
    greeted = true;
    clearTimeout(greetTimer);
    item('system', String(session.firstMessage ?? '').trim());
    wantResponse = true;
    flush();
  };

  const handle = (msg) => {
    switch (msg?.type) {
      case 'response.created':
        greeted = true;
        clearTimeout(greetTimer);
        responseActive = true;
        dropping = false;
        if (requested > 0) requested--;
        else cut(); // the server answers the person's new words: what was still sounding is old
        break;
      case 'response.done':
        responseActive = false;
        flush();
        break;
      case 'response.output_audio.delta':
      case 'response.audio.delta':
        greeted = true;
        play(msg.delta);
        break;
      case 'response.output_audio_transcript.done':
      case 'response.audio_transcript.done': {
        const text = spokenText(msg.transcript);
        if (text) on.line({ who: 'qubi', text, final: true });
        break;
      }
      case 'conversation.item.input_audio_transcription.completed': {
        const text = String(msg.transcript ?? '').trim();
        if (text && !text.startsWith(NOTICE_PREFIX)) on.line({ who: 'person', text, final: true });
        break;
      }
      case 'input_audio_buffer.speech_started':
        serverVad = true;
        if (sources.size) { dropping = true; cut(); }
        break;
      case 'response.function_call_arguments.done':
        runTool(msg);
        break;
      case 'error': {
        const fatal = fatalOf(msg.error ?? msg);
        if (fatal) on.error(fatal);
        else if (!greeted) greetAgain(); // most likely the force_message it does not know
        break;
      }
      default:
    }
  };

  // The microphone's blocks: sent while not muted; their loudness cuts Qubi if the server does not
  const onBlock = ({ data }) => {
    if (ended || !data?.pcm) return;
    if (!serverVad && sources.size && data.rms > BARGE_RMS) {
      if (++loud >= t.bargeChunks) { loud = 0; dropping = true; cut(); }
    } else loud = 0;
    if (muted) return;
    send({ type: 'input_audio_buffer.append', audio: toBase64(data.pcm) });
  };

  try {
    on.status('connecting');
    stream = await getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    ctx = new Ctx();
    await ctx.audioWorklet.addModule(env.workletUrl ?? workletUrl());
    source = ctx.createMediaStreamSource(stream);
    inAnalyser = ctx.createAnalyser();
    outAnalyser = ctx.createAnalyser();
    inAnalyser.fftSize = 512;
    outAnalyser.fftSize = 512;
    outAnalyser.connect(ctx.destination);
    capture = new WorkletNode(ctx, CAPTURE_NAME, { processorOptions: { chunkMs: 100 } });
    capture.port.onmessage = onBlock;
    source.connect(inAnalyser);
    source.connect(capture);
    ws = new WS(`${GROK_URL}?model=${encodeURIComponent(model)}`, [`xai-client-secret.${token}`]);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = () => reject(new Error('WebSocket error'));
      ws.onclose = () => reject(new Error('WebSocket closed'));
    });
  } catch (error) {
    ended = true;
    try { ws?.close(); } catch { /* not open */ }
    release();
    throw Object.assign(new Error(String(error?.message ?? error)), { reason: error?.reason ?? reasonOf(error) });
  }

  ws.onmessage = (event) => {
    let msg;
    try { msg = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data)); } catch { return; }
    if (!ended) handle(msg);
  };
  ws.onerror = () => {};
  ws.onclose = (event) => {
    if (ended) return;
    ended = true;
    release();
    on.ended(event?.code === 1000 ? 'agent' : 'error');
  };

  const rate = ctx.sampleRate;
  send({
    type: 'session.update',
    session: {
      instructions: session.instructions ?? '',
      voice: session.voice,
      tools: Array.isArray(session.tools) ? session.tools : [],
      turn_detection: { type: 'server_vad' },
      audio: {
        input: { format: { type: 'audio/pcm', rate } },
        output: { format: { type: 'audio/pcm', rate } },
      },
      transcription: { language_hint: session.language ?? 'es-MX' },
    },
  });
  on.status('connected');
  greet();

  const level = (analyser) => {
    if (!analyser?.getFloatTimeDomainData) return 0;
    buffers ??= new Map();
    let data = buffers.get(analyser);
    if (!data) buffers.set(analyser, (data = new Float32Array(analyser.fftSize)));
    analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    return clamp01(Math.sqrt(sum / (data.length || 1)) * LEVEL_GAIN);
  };

  return {
    simulated: false,
    end() {
      if (ended) return;
      ended = true;
      try { ws.close(1000); } catch { /* closed */ }
      release();
      on.status('disconnected');
      on.ended('user');
    },
    setMuted(value) {
      muted = Boolean(value);
      stream?.getAudioTracks?.().forEach((track) => { track.enabled = !muted; });
    },
    // What the app knows (progress of the work): read by the model, no answer asked
    sendContext(text) {
      item('system', text);
    },
    // A notice Qubi must tell (work finished, waiting for permission): never shown as the person's words
    notify(text) {
      item('user', `${NOTICE_PREFIX} ${text}`);
      wantResponse = true;
      flush();
    },
    // The person writes instead of speaking
    type(text) {
      const said = String(text ?? '').trim();
      if (!said || ended) return;
      on.line({ who: 'person', text: said, final: true });
      item('user', said);
      wantResponse = true;
      flush();
    },
    levels: () => (ended ? { input: 0, output: 0 } : { input: muted ? 0 : level(inAnalyser), output: sources.size ? level(outAnalyser) : 0 }),
  };
}
