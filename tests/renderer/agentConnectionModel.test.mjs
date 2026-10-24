import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentConnectionModel } from '../../renderer/models/agentConnectionModel.js';

// Fake bridge: each run emits text and finishes when the test calls finish(runId)
function fakeService() {
  const listeners = new Set();
  const runs = [];
  return {
    runs,
    isDesktop: true,
    detect: async () => ({ ok: true, data: [{ id: 'claude', label: 'Claude', installed: true, loggedIn: true }] }),
    mcpInfo: async () => ({ ok: true, data: { url: 'http://127.0.0.1:7811/mcp', running: true } }),
    onMcpStatus: () => () => {},
    onEvent: (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    run: async (req) => { const runId = String(runs.length + 1); runs.push({ runId, req }); return { ok: true, data: runId }; },
    emit: (e) => listeners.forEach((cb) => cb(e)),
    finish(runId, text) { this.emit({ runId, type: 'text', delta: text }); this.emit({ runId, type: 'done' }); },
  };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

test('runs are serialized: the second starts only after the first is done', async () => {
  const svc = fakeService();
  const m = new AgentConnectionModel(svc);
  await m.refresh();
  m.select('claude');
  const first = m.ask('uno', 'sys');
  const second = m.ask('dos', 'sys', { session: 'repair' });
  await tick();
  assert.equal(svc.runs.length, 1);
  svc.finish('1', 'A');
  assert.equal((await first).text, 'A');
  await tick();
  assert.equal(svc.runs.length, 2);
  svc.finish('2', 'B');
  assert.equal((await second).text, 'B');
});

test('chat continues its conversation; repair jobs never do', async () => {
  const svc = fakeService();
  const m = new AgentConnectionModel(svc);
  await m.refresh();
  m.select('claude');
  for (const [i, session] of [['1', 'chat'], ['2', 'chat'], ['3', 'repair'], ['4', 'repair']]) {
    const p = m.ask('x', 'sys', { session });
    await tick();
    svc.finish(i, 'ok');
    await p;
  }
  assert.deepEqual(svc.runs.map((r) => [r.req.session, r.req.continued]), [['chat', false], ['chat', true], ['repair', false], ['repair', false]]);
});

test('a rejected bridge call resolves with an error instead of hanging', async () => {
  const svc = fakeService();
  svc.run = async () => { throw new Error('ipc down'); };
  const m = new AgentConnectionModel(svc);
  await m.refresh();
  m.select('claude');
  const r = await m.ask('x', 'sys');
  assert.equal(r.error, 'ipc down');
});

test('a queued question keeps the agent, model and effort chosen when it was asked', async () => {
  const svc = fakeService();
  svc.detect = async () => ({ ok: true, data: [
    { id: 'claude', label: 'Claude', installed: true, loggedIn: true },
    { id: 'grok', label: 'Grok', installed: true, loggedIn: true },
  ] });
  const m = new AgentConnectionModel(svc);
  await m.refresh();
  m.select('claude');
  m.setEffort('high');
  const first = m.ask('uno', 'sys');
  const second = m.ask('dos', 'sys');
  m.select('grok'); // switched while the second one waits in line
  await tick();
  svc.finish('1', 'A');
  await first;
  await tick();
  svc.finish('2', 'B');
  await second;
  assert.deepEqual(svc.runs.map((r) => [r.req.agent, r.req.effort]), [['claude', 'high'], ['claude', 'high']]);
});

test('a cancelled question never starts if it was waiting, and stops the CLI if it was running', async () => {
  const svc = fakeService();
  const cancelled = [];
  svc.cancel = async (runId) => { cancelled.push(runId); svc.emit({ runId, type: 'done' }); };
  const m = new AgentConnectionModel(svc);
  await m.refresh();
  m.select('claude');
  const running = new AbortController();
  const waiting = new AbortController();
  let started = null;
  const first = m.ask('uno', 'sys', { signal: running.signal, onStart: (id) => { started = id; } });
  const second = m.ask('dos', 'sys', { signal: waiting.signal });
  await tick();
  assert.equal(started, '1');
  waiting.abort();
  running.abort();
  await first;
  const r2 = await second;
  assert.deepEqual(cancelled, ['1']);
  assert.equal(svc.runs.length, 1, 'the waiting question never ran');
  assert.equal(r2.error, 'cancelled');
});

test('different agents run in parallel (compare); the same agent stays one at a time', async () => {
  const svc = fakeService();
  svc.detect = async () => ({ ok: true, data: [
    { id: 'claude', label: 'Claude', installed: true, loggedIn: true },
    { id: 'grok', label: 'Grok', installed: true, loggedIn: true },
  ] });
  const m = new AgentConnectionModel(svc);
  await m.refresh();
  m.select('claude');
  const a = m.ask('uno', 'sys');
  const b = m.ask('uno', 'sys', { agent: 'grok' });
  const c = m.ask('dos', 'sys');
  await tick();
  assert.deepEqual(svc.runs.map((r) => r.req.agent), ['claude', 'grok'], 'claude and grok at once, the 2nd claude waits');
  svc.finish('1', 'A'); svc.finish('2', 'B');
  await Promise.all([a, b]);
  await tick();
  assert.equal(svc.runs.length, 3);
  svc.finish('3', 'C');
  await c;
});

test('each run updates that agent stats (runs, tokens, last use, last error)', async () => {
  const svc = fakeService();
  localStorage.clear(); // stats persist between sessions: start from zero here
  const m = new AgentConnectionModel(svc);
  await m.refresh();
  m.select('claude');
  const p = m.ask('x', 'sys');
  await tick();
  svc.emit({ runId: '1', type: 'result', durationMs: 10, turns: 1, inputTokens: 100, outputTokens: 20 });
  svc.finish('1', 'ok');
  await p;
  const s = m.store.state.stats.claude;
  assert.equal(s.runs, 1);
  assert.equal(s.tokens, 120);
  assert.equal(new AgentConnectionModel(svc).store.state.stats.claude.runs, 1, 'remembered for next time');
  assert.ok(s.lastUsedAt > 0);
  assert.equal(s.lastError, '');
});

test('compare: only another installed agent that is not logged out', async () => {
  const svc = fakeService();
  svc.detect = async () => ({ ok: true, data: [
    { id: 'claude', label: 'Claude', installed: true, loggedIn: true },
    { id: 'codex', label: 'Codex', installed: true, loggedIn: false },
  ] });
  const m = new AgentConnectionModel(svc);
  await m.refresh();
  m.select('claude');
  m.setCompare('codex');
  assert.equal(m.store.state.compareWith, null);
  m.setCompare('claude');
  assert.equal(m.store.state.compareWith, null);
});

test('MCP activity comes from the audit log, newest first', async () => {
  const svc = fakeService();
  let push;
  svc.auditLog = async () => ({ ok: true, data: [{ at: '2026-10-24T01:00:00Z', action: 'mcp:platanus_read_file', path: 'a.js', ok: true }, { at: '2026-10-24T01:01:00Z', action: 'workspace:open', path: '/p', ok: true }] });
  svc.onAudit = (cb) => { push = cb; return () => {}; };
  const m = new AgentConnectionModel(svc);
  await m.refresh();
  push({ at: '2026-10-24T01:02:00Z', action: 'mcp:platanus_write_file', path: 'b.js', ok: false, detail: 'La persona no aprobó el cambio.' });
  assert.deepEqual(m.store.state.activity.map((a) => [a.tool, a.path, a.ok]), [['write_file', 'b.js', false], ['read_file', 'a.js', true]]);
});

test('the chat voice (mode + recent messages) travels with the run; without it nothing is added', async () => {
  const svc = fakeService();
  const m = new AgentConnectionModel(svc);
  await m.refresh();
  m.select('claude');
  const a = m.ask('hola', '', { voice: { mode: 'dev', recent: ['hola'] } });
  await tick();
  svc.finish('1', 'ok');
  await a;
  const b = m.ask('x', 'sys', { session: 'repair' });
  await tick();
  svc.finish('2', 'ok');
  await b;
  assert.deepEqual(svc.runs[0].req.voice, { mode: 'dev', recent: ['hola'] });
  assert.equal('voice' in svc.runs[1].req, false);
});

test('agentModel forwards onStart so the chat knows when a waiting question really starts', async () => {
  const { AgentModel } = await import('../../renderer/models/agentModel.js');
  const seen = [];
  const connection = { live: true, ask: async (_p, _s, opts) => { opts.onStart?.('7'); return { text: 'ok' }; } };
  const model = new AgentModel({ connection, modeModel: { tech: false } });
  await model.reply('hola', { onStart: (id) => seen.push(id) });
  assert.deepEqual(seen, ['7']);
});

test('an agent that stops halfway is a failure even if it wrote something first', async () => {
  const { AgentModel } = await import('../../renderer/models/agentModel.js');
  const connection = { live: true, ask: async () => ({ text: 'Empiezo a revisar…', error: 'El agente terminó con un error (código 1).' }) };
  const model = new AgentModel({ connection, modeModel: { tech: false } });
  const reply = await model.reply('revisa todo');
  assert.equal(reply.tone, 'alert');
  assert.equal(reply.text, 'Empiezo a revisar…');
  assert.match(reply.html, /se detuvo/);
});

test('the first time, the best connected agent is chosen on its own; a choice made before is respected', async () => {
  localStorage.clear();
  const svc = fakeService();
  svc.detect = async () => ({ ok: true, data: [
    { id: 'grok', label: 'Grok', installed: true, loggedIn: true },
    { id: 'claude', label: 'Claude', installed: true, loggedIn: true },
  ] });
  const fresh = new AgentConnectionModel(svc);
  await fresh.refresh();
  assert.equal(fresh.store.state.selected, 'claude');

  localStorage.setItem('platanus.agent.choice.v1', JSON.stringify({ selected: null, model: '', effort: 'low' })); // the demo, chosen
  const chosen = new AgentConnectionModel(svc);
  await chosen.refresh();
  assert.equal(chosen.store.state.selected, null);
  localStorage.clear();
});

test('saving an API key goes to the main process and re-checks the agents', async () => {
  localStorage.clear();
  const svc = fakeService();
  const saved = [];
  let detects = 0;
  const detect = svc.detect;
  svc.detect = async () => { detects += 1; return detect(); };
  svc.saveKey = async (provider, value) => { saved.push([provider, value]); return { ok: true }; };
  svc.removeKey = async () => ({ ok: true });
  const m = new AgentConnectionModel(svc);
  await m.refresh();
  const before = detects;
  assert.deepEqual(await m.saveKey('claude', 'sk-ant-xyz'), { ok: true });
  assert.deepEqual(saved, [['claude', 'sk-ant-xyz']]);
  assert.equal(detects, before + 1);
  await m.removeKey('claude');
  assert.equal(detects, before + 2);
});

test('a choice made in this session is not undone by the automatic pick on the next check', async () => {
  localStorage.clear();
  const svc = fakeService();
  const m = new AgentConnectionModel(svc);
  await m.refresh();
  assert.equal(m.store.state.selected, 'claude');
  m.select(null); // the demo
  await m.refresh();
  assert.equal(m.store.state.selected, null);
  localStorage.clear();
});

test('a read-only question reaches the main process as readOnly (its agent gets the read-only tools)', async () => {
  localStorage.clear();
  const svc = fakeService();
  const m = new AgentConnectionModel(svc);
  await m.refresh();
  const asking = m.ask('Explícame db/', '', { readOnly: true });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(svc.runs.at(-1).req.readOnly, true);
  svc.finish(svc.runs.at(-1).runId, 'ok');
  await asking;
  const normal = m.ask('Arregla db/', '');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(svc.runs.at(-1).req.readOnly, undefined);
  svc.finish(svc.runs.at(-1).runId, 'ok');
  await normal;
  localStorage.clear();
});
