#!/usr/bin/env node
// A simulated agent CLI for development: it speaks Claude Code's stream JSON (`-p … --output-format
// stream-json --verbose`) and really calls the Platanus tools through the MCP server given in
// --mcp-config, so the whole chat runs as with a real agent (events, the map, approvals) without a
// subscription. Scenarios: scripts/sim/scenarios.js. Started by electron/agents.js only when
// PLATANUS_SIM=1 ("Simulador" in the agent picker). PLATANUS_SIM_SPEED: pause multiplier (0 = none).
// PLATANUS_SIM_DEFAULT: the scenario for messages with no [sim:…] tag (the video uses "feria").
const fs = require('node:fs');
const { pickScenario } = require('./scenarios');

const arg = (name) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : ''; };
const prompt = arg('-p');
const systemPrompt = arg('--system-prompt');
const speed = Number(process.env.PLATANUS_SIM_SPEED ?? 1);
const wait = (ms) => (speed > 0 ? new Promise((r) => setTimeout(r, ms * speed)) : Promise.resolve());
const out = (event) => process.stdout.write(`${JSON.stringify(event)}\n`);

let mcpUrl = '';
try { mcpUrl = JSON.parse(fs.readFileSync(arg('--mcp-config'), 'utf8')).mcpServers.platanus.url; } catch { /* no tools */ }

let seq = 0;
const nextId = (p) => `${p}_${Date.now().toString(36)}_${++seq}`;

// One Platanus tool through the real MCP server -> { text, isError }
async function callTool(name, input) {
  if (!mcpUrl) return { text: 'Sin servidor de herramientas', isError: true };
  const res = await fetch(mcpUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++seq, method: 'tools/call', params: { name: `platanus_${name}`, arguments: input } }),
  });
  const reply = await res.json();
  if (reply.error) return { text: reply.error.message, isError: true };
  return { text: reply.result?.content?.[0]?.text ?? '', isError: Boolean(reply.result?.isError) };
}

const assistant = (block, parent) => out({ type: 'assistant', message: { content: [block] }, parent_tool_use_id: parent });
const toolResult = (id, isError, text, parent) => out({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: isError, content: text }] }, parent_tool_use_id: parent });

let turns = 1;
async function play(steps, parent = null) {
  for (const step of steps) {
    if (step.crash) {
      process.stderr.write('simulated crash\n');
      process.exit(step.crash);
    }
    if (step.think) { await wait(700); assistant({ type: 'thinking', thinking: step.think }, parent); }
    if (step.say) {
      // the answer streams in a few pieces, like a real model
      const pieces = step.say.match(/[\s\S]{1,90}(?:\s|$)|[\s\S]+$/g) ?? [step.say];
      for (const piece of pieces) { await wait(140); assistant({ type: 'text', text: piece }, parent); }
    }
    if (step.tool) {
      const id = nextId('toolu');
      await wait(500);
      assistant({ type: 'tool_use', id, name: `mcp__platanus__platanus_${step.tool}`, input: step.input }, parent);
      turns += 1;
      const result = await callTool(step.tool, step.input);
      await wait(600);
      toolResult(id, result.isError, result.text, parent);
    }
    if (step.task) {
      const id = nextId('task');
      await wait(400);
      assistant({ type: 'tool_use', id, name: 'Task', input: { description: step.task.description, subagent_type: step.task.type ?? 'general-purpose' } }, parent);
      await play(step.steps ?? [], id);
      await wait(300);
      toolResult(id, false, 'listo', parent);
    }
  }
}

(async () => {
  const started = Date.now();
  const scenario = pickScenario(prompt, systemPrompt);
  out({ type: 'system', subtype: 'init', session_id: `sim-${scenario.name}-${started}` });
  await play(scenario.steps);
  out({ type: 'result', subtype: 'success', is_error: false, duration_ms: Date.now() - started, num_turns: turns, usage: { input_tokens: 1200 + turns * 300, output_tokens: 180 + turns * 40 } });
})().catch((err) => { process.stderr.write(String(err?.stack ?? err)); process.exit(2); });
