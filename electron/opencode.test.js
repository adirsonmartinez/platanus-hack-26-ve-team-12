// OpenCode runs only with the Qubbot tools: its config denies everything else, the environment is
// clean, and a fallback to its default agent stops the run.
const test = require('node:test');
const assert = require('node:assert/strict');
const { opencodeConfig, opencodeEnv, opencodeArgs, FALLBACK_LINE } = require('./opencode');

test('the config denies every tool but the Qubbot ones, at both levels, and turns off its own agents', () => {
  const cfg = opencodeConfig({ mcpUrl: 'http://127.0.0.1:7811/mcp/tok', systemPrompt: 'Eres Qubbot' });
  assert.deepEqual(cfg.mcp.platanus, { type: 'remote', url: 'http://127.0.0.1:7811/mcp/tok', enabled: true, oauth: false, timeout: 30000 });
  assert.deepEqual(Object.entries(cfg.permission), [['*', 'deny'], ['platanus_*', 'allow']], 'deny first, then the one allow (last match wins)');
  assert.deepEqual(Object.entries(cfg.agent.platanus.permission), [['*', 'deny'], ['platanus_*', 'allow']]);
  assert.equal(cfg.agent.platanus.prompt, 'Eres Qubbot');
  assert.equal(cfg.agent.platanus.mode, 'primary');
  for (const name of ['build', 'plan', 'general', 'explore']) assert.equal(cfg.agent[name].disable, true, name);
  assert.equal(cfg.default_agent, 'platanus');
  assert.deepEqual(cfg.plugin, []);
});

test('the environment drops inherited OPENCODE_* settings and isolates the global config', () => {
  const env = opencodeEnv({ PATH: '/bin', OPENCODE_PERMISSION: '{"bash":"allow"}', OPENCODE_CONFIG_DIR: '/x', OPENCODE_EXPERIMENTAL: '1', HOME: '/h' }, { configFile: '/p/cfg.json', configHome: '/p/xdg' });
  assert.equal(env.OPENCODE_PERMISSION, undefined);
  assert.equal(env.OPENCODE_CONFIG_DIR, undefined);
  assert.equal(env.OPENCODE_EXPERIMENTAL, undefined);
  assert.equal(env.OPENCODE_CONFIG, '/p/cfg.json');
  assert.equal(env.XDG_CONFIG_HOME, '/p/xdg');
  for (const flag of ['OPENCODE_DISABLE_PROJECT_CONFIG', 'OPENCODE_DISABLE_CLAUDE_CODE', 'OPENCODE_DISABLE_EXTERNAL_SKILLS', 'OPENCODE_DISABLE_AUTOUPDATE', 'OPENCODE_PURE']) assert.equal(env[flag], '1', flag);
  assert.equal(env.PATH, '/bin');
});

test('the command: run, pure, JSON, the platanus agent; never --auto/--yolo; resume and model when given', () => {
  const args = opencodeArgs({ prompt: 'hola', workdir: '/w', model: 'anthropic/claude-sonnet', resume: 'ses_1' });
  assert.deepEqual(args.slice(0, 7), ['run', '--pure', '--format', 'json', '--agent', 'platanus', '--dir=/w']);
  assert.ok(args.includes('--model=anthropic/claude-sonnet'));
  assert.ok(args.includes('--session=ses_1'));
  assert.equal(args.at(-1), 'hola');
  for (const bad of ['--auto', '--yolo', '--dangerously-skip-permissions', '--attach']) assert.ok(!args.includes(bad), bad);
  assert.ok(FALLBACK_LINE.test('agent "platanus" not found. Falling back to default agent'));
});

test('a message or a model that starts with "-" is never read as an option', () => {
  const args = opencodeArgs({ prompt: '--auto', workdir: '/w', model: '-x', resume: '--yolo' });
  assert.equal(args.at(-2), '--', 'everything after -- is the message');
  assert.equal(args.at(-1), '--auto');
  assert.ok(args.includes('--model=-x') && args.includes('--session=--yolo'), 'values glued to their option');
  assert.ok(!args.slice(0, -1).includes('--auto') && !args.includes('--yolo'));
});
