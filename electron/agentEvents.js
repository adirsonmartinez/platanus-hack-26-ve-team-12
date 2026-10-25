// Turns one output line of an agent CLI into simple events for the chat. Pure (no I/O), so it is tested
// on its own (agentEvents.test.js). Formats: Claude Code and Grok Build "stream JSON" (system /
// assistant / user / result), Codex "exec --json" JSONL items and OpenCode "run --format json" events.
//
// Events:
//   { type: 'session', id }                       conversation id (to continue it later)
//   { type: 'text' | 'thinking', delta, parent }  answer / reasoning; parent = subagent id or null
//   { type: 'tool', id, name, target, level?, parent }  a Qubbot tool starts (name without prefix;
//                                                  level: the traffic light set_file_score sets)
//   { type: 'tool_done', id, error }              that tool (or subagent) finished
//   { type: 'subagent', id, description, kind, parent }  the agent launched a helper agent
//   { type: 'result', durationMs, turns, inputTokens, outputTokens }
//   { type: 'error', message }
//
// Only Qubbot tools and subagents are reported: the CLIs' own tools are disabled anyway.

const PLATANUS = /^(?:mcp__)?platanus(?:__|\.|_|:)(?:platanus_)?(.+)$/;
const SUBAGENT_TOOLS = new Set(['Task', 'Agent', 'spawn_subagent']);

const toolName = (raw) => {
  const m = PLATANUS.exec(String(raw ?? ''));
  return m ? m[1] : null;
};
// What the tool works on (shown next to its name): a path when there is one
// a command shows as itself (run_command)
const targetOf = (input) => String(input?.path ?? input?.arguments?.path ?? input?.command ?? input?.arguments?.command ?? '').slice(0, 160);
const LEVELS = new Set(['green', 'yellow', 'red']);
// A Qubbot tool step; the traffic light it sets goes along so the chat can say "en rojo"
function toolEvent(id, name, input, parent) {
  const event = { type: 'tool', id, name, target: targetOf(input), parent };
  const level = input?.level ?? input?.arguments?.level;
  if (LEVELS.has(level)) event.level = level;
  return event;
}

function fromStream(e) {
  const out = [];
  const parent = e.parent_tool_use_id ?? null;
  if (e.type === 'system' && e.session_id) out.push({ type: 'session', id: e.session_id });
  if (e.type === 'assistant') {
    for (const b of e.message?.content ?? []) {
      if (b.type === 'thinking' && b.thinking) out.push({ type: 'thinking', delta: b.thinking, parent });
      if (b.type === 'text' && b.text) out.push({ type: 'text', delta: b.text, parent });
      if (b.type !== 'tool_use') continue;
      if (SUBAGENT_TOOLS.has(b.name)) {
        out.push({ type: 'subagent', id: b.id, description: String(b.input?.description ?? b.input?.prompt ?? '').slice(0, 160), kind: String(b.input?.subagent_type ?? ''), parent });
        continue;
      }
      // Grok wraps MCP tools in use_tool { tool_name: "platanus__x", arguments }
      const raw = b.name === 'use_tool' ? b.input?.tool_name : b.name;
      const input = b.name === 'use_tool' ? b.input?.arguments ?? b.input : b.input;
      const name = toolName(raw);
      if (name) out.push(toolEvent(b.id, name, input, parent));
    }
  }
  if (e.type === 'user') {
    for (const b of e.message?.content ?? []) {
      if (b.type === 'tool_result') out.push({ type: 'tool_done', id: b.tool_use_id, error: Boolean(b.is_error) });
    }
  }
  if (e.type === 'result') {
    const u = e.usage ?? {};
    if (!e.is_error) {
      out.push({
        type: 'result',
        durationMs: Number(e.duration_ms) || 0,
        turns: Number(e.num_turns) || 0,
        inputTokens: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
        outputTokens: u.output_tokens ?? 0,
      });
    } else {
      out.push({ type: 'error', message: String(e.result || e.error || '') });
    }
  }
  return out;
}

function fromCodex(e) {
  const item = e.item ?? e.msg;
  if (!item) return [];
  if (item.type === 'reasoning' && (item.text || item.summary)) return [{ type: 'thinking', delta: String(item.text || item.summary), parent: null }];
  if ((item.type === 'agent_message' || item.type === 'assistant_message') && (item.text || item.message)) {
    return [{ type: 'text', delta: String(item.text || item.message), parent: null }];
  }
  if (item.type === 'mcp_tool_call') {
    if (e.type === 'item.completed') return [{ type: 'tool_done', id: item.id, error: item.status === 'failed' || Boolean(item.error) }];
    const name = toolName(`platanus__${String(item.tool || item.name || '')}`);
    return name ? [toolEvent(item.id, name, item.arguments, null)] : [];
  }
  if (item.type === 'error') return [{ type: 'error', message: String(item.message || '') }];
  return [];
}

// OpenCode `run --format json` (v1.19): one {type, sessionID, part|error} per line. Text and reasoning
// arrive whole (not token by token) and a tool only once it finished, so each tool is reported as
// started and done at once. MCP tools are named "<server>_<tool>" (platanus_platanus_read_file).
function fromOpencode(e) {
  const part = e.part ?? {};
  switch (e.type) {
    case 'step_start': return e.sessionID ? [{ type: 'session', id: e.sessionID }] : [];
    case 'text': return part.text ? [{ type: 'text', delta: part.text, parent: null }] : [];
    case 'reasoning': return part.text ? [{ type: 'thinking', delta: part.text, parent: null }] : [];
    case 'tool_use': {
      const name = toolName(part.tool);
      if (!name) return [];
      const id = part.callID ?? part.id ?? '';
      return [toolEvent(id, name, part.state?.input, null), { type: 'tool_done', id, error: part.state?.status === 'error' }];
    }
    case 'error': return [{ type: 'error', message: String(e.error?.data?.message ?? e.error?.message ?? e.error?.name ?? '') }];
    default: return [];
  }
}

function parseAgentLine(agent, line) {
  let e;
  try {
    e = JSON.parse(line);
  } catch {
    return [];
  }
  if (!e || typeof e !== 'object') return [];
  if (agent === 'codex') return fromCodex(e);
  if (agent === 'opencode') return fromOpencode(e);
  return fromStream(e);
}

module.exports = { parseAgentLine };
