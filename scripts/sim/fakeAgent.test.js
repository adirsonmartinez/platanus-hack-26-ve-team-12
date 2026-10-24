// The simulated agent speaks Claude Code's stream JSON and really calls the Platanus tools.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { startMcpServer } = require('../../electron/mcpServer');
const { parseAgentLine } = require('../../electron/agentEvents');

async function runScenario(prompt, handlers) {
  const calls = [];
  const wrapped = Object.fromEntries(Object.entries(handlers).map(([k, fn]) => [k, async (args) => { calls.push([k, args]); return fn(args); }]));
  const server = await startMcpServer({ port: 0, handlers: wrapped, token: 'secreto-de-prueba' });
  const url = `http://127.0.0.1:${server.address().port}/mcp/secreto-de-prueba`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sim-'));
  const config = path.join(dir, 'mcp.json');
  fs.writeFileSync(config, JSON.stringify({ mcpServers: { platanus: { type: 'http', url } } }));
  const child = spawn(process.execPath, [path.join(__dirname, 'fakeAgent.js'), '-p', prompt, '--mcp-config', config], { env: { ...process.env, PLATANUS_SIM_SPEED: '0' } });
  let out = '';
  child.stdout.on('data', (c) => (out += c));
  const code = await new Promise((r) => child.on('close', r));
  await new Promise((r) => server.close(r));
  const events = out.split('\n').filter(Boolean).flatMap((l) => parseAgentLine('claude', l));
  return { code, events, calls };
}

const handlers = {
  platanus_get_project: () => ({ name: 'demo', files: 3 }),
  platanus_read_file: ({ path: p }) => { if (p === 'no-existe.js') throw new Error('No encuentro ese archivo'); return 'contenido'; },
  platanus_set_file_score: ({ path: p, level }) => `${p}: ${level}`,
  platanus_list_risks: () => [],
  platanus_show_folder: () => 'ok',
  platanus_write_file: () => { throw new Error('La persona no aprobó el cambio.'); },
};

test('a review: session, thinking, real tool calls (read, traffic light), the answer and a result', async () => {
  const { code, events, calls } = await runScenario('[sim:revision] revisa vercel.json', handlers);
  assert.equal(code, 0);
  const types = events.map((e) => e.type);
  assert.equal(types[0], 'session');
  assert.ok(types.includes('thinking') && types.includes('text') && types.at(-1) === 'result');
  assert.deepEqual(calls.map((c) => c[0]), ['platanus_get_project', 'platanus_read_file', 'platanus_set_file_score']);
  const tools = events.filter((e) => e.type === 'tool');
  assert.deepEqual(tools.map((t) => t.name), ['get_project', 'read_file', 'set_file_score']);
  assert.equal(tools[2].level, 'green');
  assert.ok(events.filter((e) => e.type === 'tool_done').every((d) => d.error === false));
  assert.match(events.filter((e) => e.type === 'text').map((e) => e.delta).join(''), /```sugerencias/);
});

test('helpers: a subagent whose own steps are nested under it', async () => {
  const { events } = await runScenario('[sim:ayudantes] audita todo', handlers);
  const sub = events.find((e) => e.type === 'subagent');
  assert.ok(sub);
  const nested = events.filter((e) => e.type === 'tool' && e.parent === sub.id);
  assert.ok(nested.length >= 2);
});

test('a tool that fails and a secret that is refused come back as errors (real server answers)', async () => {
  const failing = await runScenario('[sim:error]', handlers);
  assert.ok(failing.events.some((e) => e.type === 'tool_done' && e.error === true));
  const secret = await runScenario('[sim:secreto]', handlers);
  assert.ok(secret.events.some((e) => e.type === 'tool_done' && e.error === true));
  assert.equal(secret.calls.length, 0, 'the server refused .env before any handler ran');
});

test('a crash mid-run exits with an error code after some steps', async () => {
  const { code, events } = await runScenario('[sim:caida]', handlers);
  assert.notEqual(code, 0);
  assert.ok(events.some((e) => e.type === 'tool'));
  assert.ok(!events.some((e) => e.type === 'result'));
});

test('an unknown tag falls back to the review; a repair prompt gets the repair scenario for its file', async () => {
  const plain = await runScenario('hola', handlers);
  assert.ok(plain.events.some((e) => e.type === 'tool' && e.name === 'read_file'));
  const repair = await runScenario('Repara el archivo `tests/a.js` del proyecto', handlers);
  assert.ok(repair.calls.some(([k, a]) => k === 'platanus_read_file' && a.path === 'tests/a.js'));
});

test('the tour of the sample project: its narration matches what the analyzer finds there', async () => {
  const { pickScenario, TOUR_FERIA } = require('./scenarios');
  assert.equal(pickScenario('{}', 'Eres el guía de Platanus. …').name, 'tour');
  const { analyzeProject, pickFilesToRead, planSteps } = await import('../../renderer/models/projectAnalyzer.js');
  const { parseTour } = await import('../../renderer/models/tourSpec.js');
  const root = path.join(__dirname, '..', 'demo', 'sample-project');
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).map((e) => {
    const full = path.join(dir, e.name);
    const rel = path.relative(root, full).split(path.sep).join('/');
    return e.isDirectory() ? { type: 'dir', path: rel, children: walk(full) } : { type: 'file', path: rel, size: fs.statSync(full).size };
  });
  const tree = walk(root);
  const facts = analyzeProject(tree, new Map(pickFilesToRead(tree).map((p) => [p, fs.readFileSync(path.join(root, p), 'utf8')])));
  const slots = planSteps(facts);
  const tour = parseTour(JSON.stringify(TOUR_FERIA), facts, slots);
  assert.ok(tour, 'accepted');
  assert.deepEqual(Object.keys(tour.steps).sort(), slots.filter((s) => !['usecase', 'start'].includes(s.kind)).map((s) => s.id).sort(), 'one text per stop');
  assert.equal(tour.usecases[0].flow.length, 4, 'every file of the purchase is real');
  assert.equal(tour.start.open, 'README.md');
  assert.equal(tour.start.folder, 'apps/api');
});

test('a default scenario can be chosen for messages with no tag (the video)', () => {
  const { pickScenario } = require('./scenarios');
  assert.equal(pickScenario('¿Es seguro cómo se guardan los pedidos?', '', 'feria').name, 'feria');
  assert.equal(pickScenario('¿Es seguro?', '', '').name, 'revision');
  assert.equal(pickScenario('[sim:error] x', '', 'feria').name, 'error', 'a tag still wins');
});
