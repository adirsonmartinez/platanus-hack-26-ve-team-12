// The call with Qubi over Grok Voice: a fake WebSocket, AudioContext and microphone (no network, no audio).
// What the window sends (session.update, the tool loop, notices), what it shows, and that end() closes all.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openGrokSession, GROK_URL, toBase64, fromBase64, pcm16ToFloat } from '../../renderer/models/grokSession.js';
import { NOTICE_PREFIX } from '../../renderer/models/callSession.js';

const tick = () => new Promise((r) => setImmediate(r));

function fakes({ failOpen = false } = {}) {
  const made = { sockets: [], contexts: [], nodes: [], tracks: [] };
  class FakeSocket {
    constructor(url, protocols) {
      this.url = url;
      this.protocols = protocols;
      this.sent = [];
      this.readyState = 0;
      this.closed = null;
      made.sockets.push(this);
      setImmediate(() => {
        if (failOpen) { this.onerror?.({}); return; }
        this.readyState = 1;
        this.onopen?.({});
      });
    }
    send(data) { this.sent.push(JSON.parse(data)); }
    close(code) { this.readyState = 3; this.closed = code ?? 1000; }
    receive(msg) { this.onmessage?.({ data: JSON.stringify(msg) }); }
    types() { return this.sent.map((m) => m.type); }
  }
  const node = (extra = {}) => ({ connected: [], disconnected: 0, connect(n) { this.connected.push(n); }, disconnect() { this.disconnected++; }, ...extra });
  class FakeContext {
    constructor() {
      this.sampleRate = 48000;
      this.currentTime = 0;
      this.destination = node();
      this.modules = [];
      this.closed = false;
      this.started = [];
      this.audioWorklet = { addModule: async (url) => { this.modules.push(url); } };
      made.contexts.push(this);
    }
    createMediaStreamSource() { return node(); }
    createAnalyser() { return node({ fftSize: 2048, value: 0.1, getFloatTimeDomainData(a) { a.fill(this.value); } }); }
    createBuffer(channels, length, rate) {
      const data = new Float32Array(length);
      return { duration: length / rate, length, copyToChannel: (s) => data.set(s), data };
    }
    createBufferSource() {
      const ctx = this;
      return node({ stopped: false, start(at) { ctx.started.push(at); }, stop() { this.stopped = true; } });
    }
    close() { this.closed = true; return Promise.resolve(); }
  }
  class FakeWorkletNode {
    constructor(ctx, name, options) { Object.assign(this, node(), { ctx, name, options, port: { onmessage: null } }); made.nodes.push(this); }
  }
  const getUserMedia = async (constraints) => {
    made.constraints = constraints;
    const track = { enabled: true, stopped: false, stop() { this.stopped = true; } };
    made.tracks.push(track);
    return { getTracks: () => [track], getAudioTracks: () => [track] };
  };
  const env = { WebSocket: FakeSocket, AudioContext: FakeContext, AudioWorkletNode: FakeWorkletNode, getUserMedia, workletUrl: './audio/pcmCapture.worklet.js', timing: { greetMs: 30 } };
  return { env, made };
}

function recorder() {
  const events = [];
  const on = {
    status: (s) => events.push(['status', s]),
    mode: (m) => events.push(['mode', m]),
    line: (l) => events.push(['line', l.who, l.text]),
    error: (r) => events.push(['error', r]),
    ended: (r) => events.push(['ended', r]),
  };
  return { on, events, lines: () => events.filter((e) => e[0] === 'line').map((e) => [e[1], e[2]]) };
}

const SESSION = { instructions: 'Eres Qubi, un pana venezolano.', voice: 'rex', tools: [{ type: 'function', name: 'ir_a', description: 'Camina', parameters: { type: 'object', properties: { ruta: { type: 'string' } } } }], language: 'es-MX', firstMessage: '¡Aló! ¿Quién habla?' };

async function open(extra = {}) {
  const { env, made } = fakes(extra);
  const rec = recorder();
  const session = await openGrokSession({ token: 'secreto-temporal', model: 'grok-voice-latest', session: SESSION, clientTools: extra.clientTools ?? {}, on: rec.on, env });
  return { session, made, ws: made.sockets[0], ctx: made.contexts[0], ...rec };
}

test('connects with the client secret as subprotocol and sends session.update with prompt, voice, tools and PCM at the context rate', async () => {
  const { ws, made, events } = await open();
  assert.equal(ws.url, `${GROK_URL}?model=grok-voice-latest`);
  assert.deepEqual(ws.protocols, ['xai-client-secret.secreto-temporal']);
  assert.equal(made.constraints.audio.echoCancellation, true);
  assert.deepEqual(made.contexts[0].modules, ['./audio/pcmCapture.worklet.js']);
  assert.equal(made.nodes[0].name, 'pcm-capture');
  const update = ws.sent[0];
  assert.equal(update.type, 'session.update');
  assert.equal(update.session.instructions, SESSION.instructions);
  assert.equal(update.session.voice, 'rex');
  assert.deepEqual(update.session.tools, SESSION.tools);
  assert.deepEqual(update.session.turn_detection, { type: 'server_vad' });
  assert.deepEqual(update.session.audio.input.format, { type: 'audio/pcm', rate: 48000 });
  assert.deepEqual(update.session.audio.output.format, { type: 'audio/pcm', rate: 48000 });
  assert.equal(update.session.transcription.language_hint, 'es-MX');
  assert.deepEqual(ws.sent[1], { type: 'force_message', text: SESSION.firstMessage }, 'the first message, as is');
  assert.deepEqual(events.filter((e) => e[0] === 'status').map((e) => e[1]), ['connecting', 'connected']);
});

test('the first message falls back to an item plus response.create if force_message is refused', async () => {
  const { ws } = await open();
  ws.receive({ type: 'error', error: { type: 'invalid_request_error', message: 'Unknown event type force_message' } });
  assert.deepEqual(ws.types().slice(-2), ['conversation.item.create', 'response.create']);
  assert.equal(ws.sent.at(-2).item.content[0].text, SESSION.firstMessage);
  ws.receive({ type: 'error', error: { message: 'otra cosa' } });
  assert.equal(ws.types().filter((t) => t === 'response.create').length, 1, 'only once');

  // no answer at all within greetMs: the same fallback; an answer in time: none
  const quiet = await open();
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(quiet.ws.types().filter((t) => t === 'response.create').length, 1);
  const fine = await open();
  fine.ws.receive({ type: 'response.created' });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(fine.ws.types().includes('response.create'), false);
});

test('the microphone blocks go as input_audio_buffer.append in base64, not while muted', async () => {
  const { ws, made, session } = await open();
  const pcm = new Int16Array([0, 1000, -1000, 32767]).buffer;
  made.nodes[0].port.onmessage({ data: { pcm, rms: 0.01 } });
  const append = ws.sent.at(-1);
  assert.equal(append.type, 'input_audio_buffer.append');
  assert.deepEqual(new Int16Array(fromBase64(append.audio)), new Int16Array([0, 1000, -1000, 32767]));
  session.setMuted(true);
  const count = ws.sent.length;
  made.nodes[0].port.onmessage({ data: { pcm, rms: 0.01 } });
  assert.equal(ws.sent.length, count);
  assert.equal(made.tracks[0].enabled, false);
  assert.equal(session.levels().input, 0);
});

test('tool loop: runs the client tool, sends function_call_output, then one response.create after all answered', async () => {
  let release;
  const clientTools = {
    ir_a: async ({ ruta }) => ({ ok: true, ruta }),
    abrir_archivo: () => new Promise((r) => { release = r; }),
  };
  const { ws } = await open({ clientTools });
  ws.receive({ type: 'response.created' });
  ws.receive({ type: 'response.function_call_arguments.done', call_id: 'c1', name: 'ir_a', arguments: '{"ruta":"apps"}' });
  ws.receive({ type: 'response.function_call_arguments.done', call_id: 'c2', name: 'abrir_archivo', arguments: '{"ruta":"a.js"}' });
  await tick();
  const outputs = () => ws.sent.filter((m) => m.type === 'conversation.item.create' && m.item.type === 'function_call_output');
  assert.deepEqual(outputs().map((m) => [m.item.call_id, JSON.parse(m.item.output)]), [['c1', { ok: true, ruta: 'apps' }]]);
  ws.receive({ type: 'response.done' });
  assert.equal(ws.types().includes('response.create'), false, 'the permission tool is still waiting');
  release({ ok: false, motivo: 'sin-permiso' });
  await tick();
  assert.deepEqual(JSON.parse(outputs()[1].item.output), { ok: false, motivo: 'sin-permiso' });
  assert.equal(ws.types().filter((t) => t === 'response.create').length, 1);

  // an unknown tool or one that throws still answers
  const broken = await open({ clientTools: { ir_a: () => { throw new Error('x'); } } });
  broken.ws.receive({ type: 'response.function_call_arguments.done', call_id: 'k', name: 'ir_a', arguments: 'no es json' });
  broken.ws.receive({ type: 'response.function_call_arguments.done', call_id: 'j', name: 'toString', arguments: '{}' });
  await tick();
  const answers = broken.ws.sent.filter((m) => m.item?.type === 'function_call_output').map((m) => JSON.parse(m.item.output));
  assert.deepEqual(answers, [{ ok: false, motivo: 'falló' }, { ok: false, motivo: 'desconocida' }]);
});

test("transcripts become lines; notify asks Qubi to tell it and is never shown as the person's words", async () => {
  const { ws, session, lines } = await open();
  ws.receive({ type: 'response.output_audio_transcript.done', transcript: '[laughs] ¡Epa, pana!' });
  ws.receive({ type: 'conversation.item.input_audio_transcription.completed', transcript: 'Ve a apps' });
  session.notify('Listo: 2 archivos nuevos.');
  const notice = ws.sent.at(-2);
  assert.equal(notice.type, 'conversation.item.create');
  assert.equal(notice.item.role, 'user');
  assert.equal(notice.item.content[0].text, `${NOTICE_PREFIX} Listo: 2 archivos nuevos.`);
  assert.equal(ws.sent.at(-1).type, 'response.create');
  ws.receive({ type: 'conversation.item.input_audio_transcription.completed', transcript: `${NOTICE_PREFIX} Listo` });
  session.sendContext('Va bien');
  assert.equal(ws.sent.at(-1).item.role, 'system');
  assert.equal(ws.types().filter((t) => t === 'response.create').length, 1, 'context asks for no answer');
  session.type('agrega un botón');
  assert.deepEqual(lines(), [['qubi', '¡Epa, pana!'], ['person', 'Ve a apps'], ['person', 'agrega un botón']]);
  assert.equal(ws.types().filter((t) => t === 'response.create').length, 1, 'one answer at a time: the next waits for response.done');
  ws.receive({ type: 'response.created' });
  ws.receive({ type: 'response.done' });
  assert.equal(ws.types().filter((t) => t === 'response.create').length, 2);
});

test("Qubi's voice is queued and played; the person speaking cuts it", async () => {
  const { ws, ctx, events, session } = await open();
  const delta = toBase64(new Int16Array(4800).fill(1000).buffer); // 100 ms at 48 kHz
  ws.receive({ type: 'response.created' });
  ws.receive({ type: 'response.output_audio.delta', delta });
  ws.receive({ type: 'response.output_audio.delta', delta });
  assert.deepEqual(ctx.started.map((t) => Math.round(t * 1000)), [0, 100], 'one after the other');
  assert.equal(events.filter((e) => e[0] === 'mode').at(-1)[1], 'speaking');
  assert.ok(session.levels().output > 0);
  ws.receive({ type: 'input_audio_buffer.speech_started' });
  assert.equal(events.filter((e) => e[0] === 'mode').at(-1)[1], 'listening');
  ws.receive({ type: 'response.output_audio.delta', delta });
  assert.equal(ctx.started.length, 2, 'the rest of the interrupted answer is not played');
  assert.equal(session.levels().output, 0);
  assert.ok(Math.abs(pcm16ToFloat(new Int16Array([16384]).buffer)[0] - 0.5) < 1e-6);
});

test('an auth error ends the call as auth; a refused microphone fails with mic; no connection fails with network', async () => {
  const { ws, events } = await open();
  ws.receive({ type: 'error', error: { code: 'invalid_api_key', message: 'Invalid client secret' } });
  assert.deepEqual(events.at(-1), ['error', 'auth']);

  const { env } = fakes();
  env.getUserMedia = async () => { throw Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' }); };
  await assert.rejects(openGrokSession({ token: 't', session: SESSION, on: recorder().on, env }), (e) => e.reason === 'mic');

  const down = fakes({ failOpen: true });
  await assert.rejects(openGrokSession({ token: 't', session: SESSION, on: recorder().on, env: down.env }), (e) => e.reason === 'network');
  assert.equal(down.made.contexts[0].closed, true, 'nothing left open');
  assert.equal(down.made.tracks[0].stopped, true);
});

test('end() closes the socket, the microphone and the audio, once; a server close is the other side ending', async () => {
  const { ws, ctx, made, session, events } = await open();
  session.end();
  session.end();
  assert.equal(ws.closed, 1000);
  assert.equal(made.tracks[0].stopped, true);
  assert.equal(ctx.closed, true);
  assert.deepEqual(events.slice(-2), [['status', 'disconnected'], ['ended', 'user']]);
  assert.equal(events.filter((e) => e[0] === 'ended').length, 1);
  const count = ws.sent.length;
  session.notify('tarde');
  ws.receive({ type: 'response.output_audio_transcript.done', transcript: 'tarde' });
  assert.equal(ws.sent.length, count);
  assert.deepEqual(session.levels(), { input: 0, output: 0 });

  const other = await open();
  other.ws.onclose({ code: 1006 });
  assert.deepEqual(other.events.at(-1), ['ended', 'error']);
  assert.equal(other.made.tracks[0].stopped, true);
});
