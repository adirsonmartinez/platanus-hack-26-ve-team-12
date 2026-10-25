// Tests for detecting a project's external services and whether the person's agent can use them
// (docs/features/servicios/README.md). Temporary folders as the project and as HOME; whoami is a fake.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { detect, status, mcpServers, parseTomlMcp, parseJsonc, isEnvSecret, createServiceStatus, WHOAMI_TIMEOUT_MS } = require('./serviceStatus');

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'platanus-services-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function put(root, rel, content = '') {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}
// fs readers that record every file read
function recorder() {
  const read = [];
  return {
    read,
    readFile: async (file) => { read.push(file); return fs.readFileSync(file, 'utf8'); },
  };
}

test('isEnvSecret: .env files with values are secret; the examples are not', () => {
  for (const name of ['.env', '.env.local', '.env.production', '.env.development.local']) assert.equal(isEnvSecret(name), true, name);
  for (const name of ['.env.example', '.env.sample', 'package.json', 'env.ts']) assert.equal(isEnvSecret(name), false, name);
});

test('detect: dependencies, files, folders and .env.example names, never .env', async (t) => {
  const root = tempDir(t);
  put(root, 'package.json', JSON.stringify({ dependencies: { '@supabase/supabase-js': '2', next: '15' }, devDependencies: { prisma: '6' } }));
  put(root, 'apps/web/package.json', JSON.stringify({ dependencies: { stripe: '17', 'stripe-like-thing': '1' } }));
  put(root, 'packages/ui/package.json', JSON.stringify({ dependencies: { '@clerk/nextjs': '6' } }));
  put(root, 'vercel.json', '{}');
  put(root, '.github/workflows/ci.yml', '');
  put(root, '.env.example', '# keys\nRESEND_API_KEY=\nexport SENTRY_DSN="https://x"\nlower_case=1\n');
  put(root, '.env', 'OPENAI_API_KEY=sk-should-never-be-read\n');
  put(root, '.env.local', 'MONGODB_URI=mongodb://secret\n');
  const { read, readFile } = recorder();
  const found = await detect(root, { readFile });
  const byKey = Object.fromEntries(found.map((f) => [f.key, f.evidence]));
  assert.deepEqual(found.map((f) => f.key), ['supabase', 'vercel', 'github', 'stripe', 'resend', 'sentry', 'clerk', 'prisma']);
  assert.deepEqual(byKey.supabase, ['package.json: @supabase/supabase-js']);
  assert.deepEqual(byKey.stripe, ['apps/web/package.json: stripe']); // an exact name, not a prefix
  assert.deepEqual(byKey.clerk, ['packages/ui/package.json: @clerk/nextjs']);
  assert.deepEqual(byKey.vercel, ['vercel.json']);
  assert.deepEqual(byKey.github, ['.github/']);
  assert.deepEqual(byKey.resend, ['.env.example: RESEND_API_KEY']);
  assert.deepEqual(byKey.sentry, ['.env.example: SENTRY_DSN']);
  assert.equal(byKey.openai, undefined);
  assert.equal(byKey.mongodb, undefined);
  for (const file of read) assert.equal(isEnvSecret(path.basename(file)), false, file);
  assert.ok(!read.some((file) => file.endsWith(`${path.sep}.env`) || file.endsWith('.env.local')));
});

test('detect: a broken package.json or an empty folder finds nothing and does not throw', async (t) => {
  const root = tempDir(t);
  put(root, 'package.json', '{ not json');
  assert.deepEqual(await detect(root), []);
});

test('parseTomlMcp: server names and urls only, subsections and other tables ignored', () => {
  const toml = [
    'model = "x"',
    '[mcp_servers.stripe]',
    'url = "https://mcp.stripe.com"',
    'bearer_token_env_var = "AGENT_API_KEY"',
    '[mcp_servers.stripe.http_headers]',
    'Authorization = "Bearer secret"',
    '[mcp_servers."my supabase"]',
    'url = \'https://mcp.supabase.com/mcp?project_ref=abc\'',
    '[mcp_servers.local]',
    'command = "npx"',
    '[projects."/x"]',
    'url = "https://not-a-server.example"',
  ].join('\n');
  assert.deepEqual(parseTomlMcp(toml), [
    { name: 'stripe', url: 'https://mcp.stripe.com' },
    { name: 'my supabase', url: 'https://mcp.supabase.com/mcp?project_ref=abc' },
    { name: 'local', url: null },
  ]);
});

test('parseJsonc: comments and trailing commas, strings kept', () => {
  assert.deepEqual(parseJsonc('{\n // a comment\n "a": "http://x//y", /* block */ "b": [1, 2,],\n}'), { a: 'http://x//y', b: [1, 2] });
});

test('mcpServers: reads Claude, Codex, OpenCode and Grok configs (names and urls only)', async (t) => {
  const home = tempDir(t);
  const root = tempDir(t);
  put(home, '.claude.json', JSON.stringify({
    mcpServers: { vercel: { type: 'http', url: 'https://mcp.vercel.com', headers: { Authorization: 'Bearer s' } } },
    projects: { [root]: { mcpServers: { 'neon-db': { type: 'http', url: 'https://mcp.neon.tech/mcp' } } }, '/other': { mcpServers: { sentry: {} } } },
  }));
  put(root, '.mcp.json', JSON.stringify({ mcpServers: { payments: { type: 'http', url: 'https://mcp.stripe.com' } } }));
  put(home, '.codex/config.toml', '[mcp_servers.supabase]\nurl = "https://mcp.supabase.com/mcp"\n');
  put(home, '.config/opencode/opencode.jsonc', '{ // mine\n "mcp": { "posthog": { "type": "remote", "url": "https://mcp.posthog.com/mcp" } } }');
  put(home, '.grok/config.toml', '[mcp_servers.clerk]\nurl = "https://mcp.clerk.com/mcp"\n');
  put(root, '.grok/config.toml', '[mcp_servers.firebase]\ncommand = "npx"\n');
  const { servers, failed } = await mcpServers({ home, root, env: {} });
  assert.equal(failed, false);
  const seen = servers.map((s) => `${s.agent}:${s.name}:${s.url ?? ''}`).sort();
  assert.deepEqual(seen, [
    'claude:neon-db:https://mcp.neon.tech/mcp',
    'claude:payments:https://mcp.stripe.com',
    'claude:vercel:https://mcp.vercel.com',
    'codex:supabase:https://mcp.supabase.com/mcp',
    'grok:clerk:https://mcp.clerk.com/mcp',
    'grok:firebase:',
    'opencode:posthog:https://mcp.posthog.com/mcp',
  ]);
  for (const s of servers) assert.deepEqual(Object.keys(s).sort(), ['agent', 'name', 'url']);
});

test('mcpServers: no config files is not a failure; a broken one is', async (t) => {
  const home = tempDir(t);
  const root = tempDir(t);
  assert.deepEqual(await mcpServers({ home, root, env: {} }), { servers: [], failed: false });
  put(home, '.claude.json', '{ broken');
  assert.equal((await mcpServers({ home, root, env: {} })).failed, true);
});

test('status: MCP by name or address, CLI session by whoami (0 → connected, error or timeout → unknown)', async (t) => {
  const home = tempDir(t);
  const root = tempDir(t);
  put(home, '.claude.json', JSON.stringify({ mcpServers: { 'stripe-live': { url: 'https://example.com' }, pay: { url: 'https://mcp.supabase.com/mcp?x=1' } } }));
  put(home, '.codex/config.toml', '[mcp_servers.stripe]\nurl = "https://mcp.stripe.com"\n');
  const calls = [];
  const answers = { gh: { code: 0 }, vercel: { timeout: true }, atlas: { code: 1 } };
  const run = async (bin, args, opts) => { calls.push([bin, args, opts.timeoutMs]); return answers[bin]; };
  const result = await status(['stripe', 'supabase', 'github', 'vercel', 'mongodb', 'openai'], { home, root, run, env: {} });
  assert.deepEqual(result.stripe, { state: 'connected', via: ['mcp:claude', 'mcp:codex'] });
  assert.deepEqual(result.supabase, { state: 'connected', via: ['mcp:claude'] });
  assert.deepEqual(result.github, { state: 'connected', via: ['cli'] });
  assert.deepEqual(result.vercel, { state: 'unknown', via: [] });
  assert.deepEqual(result.mongodb, { state: 'disconnected', via: [] }); // signed out: exit 1
  assert.deepEqual(result.openai, { state: 'disconnected', via: [] });
  assert.deepEqual(calls.sort(), [
    ['atlas', ['auth', 'whoami'], WHOAMI_TIMEOUT_MS],
    ['gh', ['auth', 'status'], WHOAMI_TIMEOUT_MS],
    ['vercel', ['whoami'], WHOAMI_TIMEOUT_MS],
  ]);
  assert.equal(WHOAMI_TIMEOUT_MS, 3000);
});

test('status: a CLI that is not installed is simply not a way in', async (t) => {
  const home = tempDir(t);
  const result = await status(['github'], { home, root: home, run: async () => ({ missing: true }), env: {} });
  assert.deepEqual(result.github, { state: 'disconnected', via: [] });
});

test('createServiceStatus: one list in catalog order, cached 60 s per project, cleared by clear()', async (t) => {
  const home = tempDir(t);
  const root = tempDir(t);
  put(root, 'package.json', JSON.stringify({ dependencies: { stripe: '1', '@supabase/ssr': '1' } }));
  let now = 1000;
  let runs = 0;
  const service = createServiceStatus({ home, env: {}, run: async () => { runs += 1; return { code: 1 }; }, now: () => now });
  const first = await service.check(root);
  assert.deepEqual(first.map((s) => s.key), ['supabase', 'stripe']);
  assert.deepEqual(first[1], { key: 'stripe', name: 'Stripe', state: 'disconnected', via: [], evidence: ['package.json: stripe'] });
  put(home, '.claude.json', JSON.stringify({ mcpServers: { stripe: { url: 'https://mcp.stripe.com' } } }));
  now += 59_000;
  assert.equal((await service.check(root))[1].state, 'disconnected'); // still cached
  now += 2_000;
  assert.equal((await service.check(root))[1].state, 'connected'); // expired
  put(home, '.claude.json', '{}');
  service.clear();
  assert.equal((await service.check(root))[1].state, 'disconnected');
  assert.equal(runs, 0); // neither service has a whoami
});
