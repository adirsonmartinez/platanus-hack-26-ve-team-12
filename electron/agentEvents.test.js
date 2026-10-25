// Tests for the agent CLI event parser (Claude Code / Grok stream JSON, Codex JSONL).
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAgentLine } = require('./agentEvents');

const line = (o) => JSON.stringify(o);

test('claude: session, reasoning, text and a Qubbot tool with its path', () => {
  assert.deepEqual(parseAgentLine('claude', line({ type: 'system', subtype: 'init', session_id: 's1' })), [{ type: 'session', id: 's1' }]);
  const events = parseAgentLine('claude', line({
    type: 'assistant',
    message: { content: [
      { type: 'thinking', thinking: 'Veo el mapa' },
      { type: 'text', text: 'Reviso' },
      { type: 'tool_use', id: 't1', name: 'mcp__platanus__platanus_read_file', input: { path: 'src/app.js' } },
    ] },
  }));
  assert.deepEqual(events, [
    { type: 'thinking', delta: 'Veo el mapa', parent: null },
    { type: 'text', delta: 'Reviso', parent: null },
    { type: 'tool', id: 't1', name: 'read_file', target: 'src/app.js', parent: null },
  ]);
});

test('the traffic light a tool sets travels with the step (only a valid color)', () => {
  const use = (input) => parseAgentLine('claude', line({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'k', name: 'mcp__platanus__platanus_set_file_score', input }] } }))[0];
  assert.deepEqual(use({ path: 'db.js', level: 'red', reason: 'x' }), { type: 'tool', id: 'k', name: 'set_file_score', target: 'db.js', level: 'red', parent: null });
  assert.equal('level' in use({ path: 'db.js', level: 'morado' }), false);
});

test('claude: tool results close the step, with errors', () => {
  const events = parseAgentLine('claude', line({
    type: 'user',
    message: { content: [{ type: 'tool_result', tool_use_id: 't1', is_error: true, content: 'Refused' }] },
  }));
  assert.deepEqual(events, [{ type: 'tool_done', id: 't1', error: true }]);
});

test('claude: a subagent (Task/Agent tool) and the messages it sends', () => {
  const start = parseAgentLine('claude', line({
    type: 'assistant',
    message: { content: [{ type: 'tool_use', id: 'sub1', name: 'Task', input: { description: 'Revisar la base de datos', subagent_type: 'Explore' } }] },
  }));
  assert.deepEqual(start, [{ type: 'subagent', id: 'sub1', description: 'Revisar la base de datos', kind: 'Explore', parent: null }]);
  const inner = parseAgentLine('claude', line({
    type: 'assistant', parent_tool_use_id: 'sub1',
    message: { content: [{ type: 'tool_use', id: 't9', name: 'mcp__platanus__platanus_list_risks', input: {} }] },
  }));
  assert.deepEqual(inner, [{ type: 'tool', id: 't9', name: 'list_risks', target: '', parent: 'sub1' }]);
});

test('claude: the final result reports time, turns and tokens; errors surface', () => {
  assert.deepEqual(parseAgentLine('claude', line({ type: 'result', subtype: 'success', is_error: false, duration_ms: 4200, num_turns: 3, usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 5 } })),
    [{ type: 'result', durationMs: 4200, turns: 3, inputTokens: 15, outputTokens: 20 }]);
  const failed = parseAgentLine('claude', line({ type: 'result', is_error: true, result: 'Not logged in' }));
  assert.equal(failed.at(-1).type, 'error');
});

test('grok: MCP tools come wrapped in use_tool; spawn_subagent is a subagent', () => {
  const [tool] = parseAgentLine('grok', line({
    type: 'assistant',
    message: { content: [{ type: 'tool_use', id: 'g1', name: 'use_tool', input: { tool_name: 'platanus__platanus_read_file', arguments: { path: 'a.sql' } } }] },
  }));
  assert.deepEqual(tool, { type: 'tool', id: 'g1', name: 'read_file', target: 'a.sql', parent: null });
  const [sub] = parseAgentLine('grok', line({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'g2', name: 'spawn_subagent', input: { description: 'Auditar RLS' } }] } }));
  assert.equal(sub.type, 'subagent');
});

test('codex: reasoning, message and MCP calls with start and end', () => {
  assert.deepEqual(parseAgentLine('codex', line({ type: 'item.completed', item: { id: 'r', type: 'reasoning', text: 'Pienso' } })), [{ type: 'thinking', delta: 'Pienso', parent: null }]);
  assert.deepEqual(parseAgentLine('codex', line({ type: 'item.completed', item: { id: 'm', type: 'agent_message', text: 'Hola' } })), [{ type: 'text', delta: 'Hola', parent: null }]);
  assert.deepEqual(parseAgentLine('codex', line({ type: 'item.started', item: { id: 'c1', type: 'mcp_tool_call', server: 'platanus', tool: 'platanus_list_risks', arguments: {} } })),
    [{ type: 'tool', id: 'c1', name: 'list_risks', target: '', parent: null }]);
  assert.deepEqual(parseAgentLine('codex', line({ type: 'item.completed', item: { id: 'c1', type: 'mcp_tool_call', status: 'failed' } })), [{ type: 'tool_done', id: 'c1', error: true }]);
});

test('garbage and unknown events are ignored', () => {
  assert.deepEqual(parseAgentLine('claude', 'not json'), []);
  assert.deepEqual(parseAgentLine('claude', line({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'x', name: 'Bash', input: {} }] } })), []);
});

test('opencode: session from the first line, text, reasoning, finished tools (with path and color), errors', () => {
  const ev = (o) => parseAgentLine('opencode', line(o));
  assert.deepEqual(ev({ type: 'step_start', timestamp: 1, sessionID: 'ses_1', part: { type: 'step-start' } }), [{ type: 'session', id: 'ses_1' }]);
  assert.deepEqual(ev({ type: 'text', sessionID: 'ses_1', part: { type: 'text', text: 'Reviso', time: { start: 1, end: 2 } } }), [{ type: 'text', delta: 'Reviso', parent: null }]);
  assert.deepEqual(ev({ type: 'reasoning', sessionID: 'ses_1', part: { type: 'reasoning', text: 'Pienso' } }), [{ type: 'thinking', delta: 'Pienso', parent: null }]);
  const done = ev({ type: 'tool_use', sessionID: 'ses_1', part: { type: 'tool', callID: 'c1', tool: 'platanus_platanus_set_file_score', state: { status: 'completed', input: { path: 'db.js', level: 'red' }, output: 'ok' } } });
  assert.deepEqual(done, [{ type: 'tool', id: 'c1', name: 'set_file_score', target: 'db.js', level: 'red', parent: null }, { type: 'tool_done', id: 'c1', error: false }]);
  const failed = ev({ type: 'tool_use', sessionID: 'ses_1', part: { type: 'tool', callID: 'c2', tool: 'platanus_platanus_read_file', state: { status: 'error', input: { path: '.env' }, error: 'Refused' } } });
  assert.deepEqual(failed.at(-1), { type: 'tool_done', id: 'c2', error: true });
  assert.deepEqual(ev({ type: 'tool_use', part: { type: 'tool', callID: 'c3', tool: 'bash', state: { status: 'completed', input: {} } } }), [], 'only Qubbot tools are reported');
  assert.deepEqual(ev({ type: 'error', sessionID: 'ses_1', error: { name: 'ProviderAuthError', data: { message: 'Sin credenciales' } } }), [{ type: 'error', message: 'Sin credenciales' }]);
  assert.deepEqual(ev({ type: 'step_finish', part: { type: 'step-finish' } }), []);
});
