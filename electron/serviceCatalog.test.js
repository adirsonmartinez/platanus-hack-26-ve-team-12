// Tests for the catalog of external services (docs/features/servicios/README.md). Pure data: no network.
const test = require('node:test');
const assert = require('node:assert/strict');
const { SERVICES, ORDER, LINKS, VOICE_LINKS, publicCatalog, mcpCommands, catalogUrls } = require('./serviceCatalog');

const EXPECTED = [
  'supabase', 'vercel', 'github', 'stripe', 'firebase', 'render', 'netlify', 'openai', 'anthropic',
  'elevenlabs', 'resend', 'sentry', 'clerk', 'posthog', 'neon', 'prisma', 'mongodb',
];

test('the catalog has every service of the design, in its order', () => {
  assert.deepEqual(ORDER, EXPECTED);
  for (const key of ORDER) {
    const s = SERVICES[key];
    assert.equal(typeof s.name, 'string', key);
    assert.ok(Array.isArray(s.detect.deps) && Array.isArray(s.detect.files) && Array.isArray(s.detect.dirs) && Array.isArray(s.detect.envNames), key);
    assert.match(s.dashboard, /^https:\/\//, key);
  }
});

test('every URL is https and carries no query or token-like part', () => {
  const urls = catalogUrls();
  assert.ok(urls.length > 30);
  for (const url of urls) {
    const parsed = new URL(url);
    assert.equal(parsed.protocol, 'https:', url);
    assert.equal(parsed.search, '', url);
    assert.equal(parsed.username + parsed.password, '', url);
    assert.doesNotMatch(url, /token|secret|api[_-]?key=|bearer/i, url);
  }
});

test('commands never carry a key or a placeholder for one', () => {
  for (const key of ORDER) {
    const s = SERVICES[key];
    const commands = [s.cli?.install, s.cli?.login, ...Object.values(mcpCommands(s.mcp))].filter(Boolean);
    for (const command of commands) {
      assert.doesNotMatch(command, /bearer|authorization|YOUR_|xxx|<|>|[|;&`$]/i, `${key}: ${command}`);
    }
    if (s.cli?.whoami) {
      assert.ok(Array.isArray(s.cli.whoami) && s.cli.whoami.every((w) => typeof w === 'string'), key);
      assert.equal(s.cli.whoami[0], s.cli.bin, key);
    }
  }
});

test('remote MCP commands follow the verified syntax of each agent', () => {
  assert.deepEqual(mcpCommands(SERVICES.supabase.mcp), {
    claude: 'claude mcp add --transport http supabase https://mcp.supabase.com/mcp',
    codex: 'codex mcp add supabase --url https://mcp.supabase.com/mcp',
    grok: 'grok mcp add supabase https://mcp.supabase.com/mcp -t http',
    opencode: null,
  });
  // a local (stdio) server: Claude and Codex take the command after --
  assert.equal(mcpCommands(SERVICES.firebase.mcp).claude, 'claude mcp add firebase -- npx -y firebase-tools@latest mcp');
  assert.equal(mcpCommands(SERVICES.firebase.mcp).codex, 'codex mcp add firebase -- npx -y firebase-tools@latest mcp');
  assert.equal(mcpCommands(SERVICES.firebase.mcp).grok, null);
  // a server that needs a personal token: no command to copy, only its page
  assert.deepEqual(mcpCommands(SERVICES.github.mcp), { claude: null, codex: null, grok: null, opencode: null });
  assert.deepEqual(mcpCommands(null), { claude: null, codex: null, grok: null, opencode: null });
});

test('LINKS has the catalog pages and the voice pages, and nothing else', () => {
  assert.ok(VOICE_LINKS.includes('https://elevenlabs.io/app/settings/api-keys'));
  assert.ok(VOICE_LINKS.includes('https://console.x.ai'));
  for (const url of [...catalogUrls(), ...VOICE_LINKS]) assert.ok(LINKS.has(url), url);
  assert.equal(LINKS.has('https://evil.example.com'), false);
  assert.equal(LINKS.has('https://supabase.com/dashboard?x=1'), false);
  // MCP server addresses are for agents, not pages to open
  assert.equal(LINKS.has('https://mcp.supabase.com/mcp'), false);
});

test('the public catalog leaves detection out and adds the commands', () => {
  const data = publicCatalog();
  assert.deepEqual(Object.keys(data), EXPECTED);
  for (const [key, entry] of Object.entries(data)) {
    assert.deepEqual(Object.keys(entry).sort(), ['cli', 'dashboard', 'mcp', 'name'], key);
    assert.equal('detect' in entry, false);
    if (entry.cli) assert.equal('whoami' in entry.cli, false, key);
  }
  assert.equal(data.stripe.mcp.commands.claude, 'claude mcp add --transport http stripe https://mcp.stripe.com');
  assert.equal(data.openai.mcp, null);
  // a copy: changing it does not change the catalog
  data.stripe.name = 'x';
  assert.equal(publicCatalog().stripe.name, 'Stripe');
});
