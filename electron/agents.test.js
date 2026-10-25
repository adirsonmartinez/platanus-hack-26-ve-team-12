const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');

// agents.js writes its config files under ~/.platanus and starts CLIs: point HOME at a temporary folder
// and fake the child processes BEFORE loading it (it reads both when it loads). No real CLI ever runs.
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'platanus-agents-'));
process.env.HOME = HOME;
process.env.USERPROFILE = HOME;
const cp = require('node:child_process');
const spawned = [];
const grokAdds = [];
cp.spawn = (bin, args, opts) => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.killed = false;
  child.kill = (signal) => {
    if (child.killed) return true;
    child.killed = true;
    process.nextTick(() => child.emit('close', null, signal ?? 'SIGTERM'));
    return true;
  };
  child.finish = () => child.emit('close', 0, null);
  spawned.push({ bin, args, opts, child });
  return child;
};
cp.spawnSync = (bin, args) => {
  if (bin === 'grok' && args[0] === 'mcp') grokAdds.push(args[3]);
  return { status: 0, stdout: '', stderr: '' };
};

const { proxyEnvFor, run } = require('./agents');

const WORKDIR = path.join(HOME, '.platanus', 'agent-workdir');
const url = (n) => `http://127.0.0.1:7811/mcp/tok/w/w${n}-abcd`;
const opts = (session, mcpUrl) => ({ prompt: 'haz algo', systemPrompt: 'sistema', mcpUrl, effort: 'low', session });
const recorder = () => {
  const events = [];
  const emit = (e) => events.push(e);
  emit.events = events;
  return emit;
};
const flush = () => new Promise((resolve) => setImmediate(resolve));
// The value after a flag in a recorded command line
const flag = (args, name) => args[args.indexOf(name) + 1];
// Ends every run a test left open, so the next test starts clean
async function closeAll() {
  for (const s of spawned) if (!s.child.killed && !s.closed) { s.closed = true; s.child.finish(); }
  await flush();
}
test.after(() => fs.rmSync(HOME, { recursive: true, force: true }));
test.afterEach(closeAll);

const LOCAL = '127.0.0.1,localhost,::1';

test('the system proxy (e.g. a VPN like Psiphon) is handed to the CLI, never for the local MCP server', () => {
  assert.deepEqual(proxyEnvFor('PROXY 127.0.0.1:59510', {}), {
    HTTPS_PROXY: 'http://127.0.0.1:59510', HTTP_PROXY: 'http://127.0.0.1:59510', NO_PROXY: LOCAL,
  });
});

test('the first HTTP proxy of a list is used; SOCKS-only or DIRECT means no proxy', () => {
  assert.equal(proxyEnvFor('SOCKS5 127.0.0.1:1080; PROXY proxy.corp:8080; DIRECT', {}).HTTPS_PROXY, 'http://proxy.corp:8080');
  assert.deepEqual(proxyEnvFor('SOCKS5 127.0.0.1:1080', {}), {});
  assert.deepEqual(proxyEnvFor('DIRECT', {}), {});
  assert.deepEqual(proxyEnvFor('', {}), {});
});

test('a proxy the person set in the environment wins over the system one', () => {
  assert.deepEqual(proxyEnvFor('PROXY 127.0.0.1:59510', { HTTPS_PROXY: 'http://mine:3128' }), {});
  assert.deepEqual(proxyEnvFor('PROXY 127.0.0.1:59510', { https_proxy: 'http://mine:3128' }), {});
});

test('anything that is not a plain host:port is ignored', () => {
  assert.deepEqual(proxyEnvFor('PROXY evil host:1;rm', {}), {});
  assert.deepEqual(proxyEnvFor('PROXY host:99999999', {}), {});
});

test('two Claude workers run at the same time, each with its own MCP config file (0600)', () => {
  spawned.length = 0;
  const a = run('claude', opts('worker-1', url(1)), recorder());
  const b = run('claude', opts('worker-2', url(2)), recorder());
  assert.equal(spawned.length, 2);
  assert.equal(a.killed, false);
  assert.equal(b.killed, false);
  const [fileA, fileB] = spawned.map((s) => flag(s.args, '--mcp-config'));
  assert.equal(fileA, path.join(WORKDIR, 'mcp-worker-1.json'));
  assert.equal(fileB, path.join(WORKDIR, 'mcp-worker-2.json'));
  assert.equal(JSON.parse(fs.readFileSync(fileA, 'utf8')).mcpServers.platanus.url, url(1));
  assert.equal(JSON.parse(fs.readFileSync(fileB, 'utf8')).mcpServers.platanus.url, url(2));
  if (process.platform !== 'win32') assert.equal(fs.statSync(fileA).mode & 0o777, 0o600);
  // the security flags stay the same for workers
  for (const s of spawned) {
    assert.equal(flag(s.args, '--tools'), '');
    assert.ok(s.args.includes('--strict-mcp-config'));
    assert.equal(flag(s.args, '--allowedTools'), 'mcp__platanus');
  }
});

test('sessions: review and worker-1..3 are kept; anything else is the chat', () => {
  spawned.length = 0;
  run('claude', opts('review', 'http://x/ro'), recorder());
  run('claude', opts('worker-4', 'http://x/full'), recorder());
  run('claude', opts('../../etc', 'http://x/full'), recorder());
  assert.deepEqual(spawned.map((s) => path.basename(flag(s.args, '--mcp-config'))), ['mcp-review.json', 'mcp-chat.json', 'mcp-chat.json']);
  // the two "chat" runs share a key: the newer one replaces the older, as before
  assert.equal(spawned[1].child.killed, true);
  assert.equal(spawned[2].child.killed, false);
});

test('a new run of the same agent and worker still replaces the old one', () => {
  spawned.length = 0;
  run('claude', opts('worker-1', url(1)), recorder());
  run('claude', opts('worker-1', url(1)), recorder());
  assert.equal(spawned.length, 2);
  assert.equal(spawned[0].child.killed, true);
});

test('OpenCode: each session has its own config folder, so simultaneous runs keep their MCP address', () => {
  spawned.length = 0;
  run('opencode', opts('worker-1', url(1)), recorder());
  run('opencode', opts('worker-2', url(2)), recorder());
  assert.equal(spawned.length, 2);
  const [envA, envB] = spawned.map((s) => s.opts.env);
  assert.notEqual(envA.OPENCODE_CONFIG, envB.OPENCODE_CONFIG);
  assert.notEqual(envA.XDG_CONFIG_HOME, envB.XDG_CONFIG_HOME);
  assert.equal(JSON.parse(fs.readFileSync(envA.OPENCODE_CONFIG, 'utf8')).mcp.platanus.url, url(1));
  assert.equal(JSON.parse(fs.readFileSync(envB.OPENCODE_CONFIG, 'utf8')).mcp.platanus.url, url(2));
  if (process.platform !== 'win32') assert.equal(fs.statSync(envA.OPENCODE_CONFIG).mode & 0o777, 0o600);
});

test('Grok: its MCP config is global, so its workers wait in line (first in, first out)', async () => {
  spawned.length = 0;
  grokAdds.length = 0;
  const e1 = recorder();
  const e2 = recorder();
  const e3 = recorder();
  run('grok', opts('worker-1', url(1)), e1);
  const h2 = run('grok', opts('worker-2', url(2)), e2);
  const h3 = run('grok', opts('worker-3', url(3)), e3);
  assert.equal(spawned.length, 1);
  assert.deepEqual(grokAdds, [url(1)]); // the global config is not touched while worker 1 runs
  assert.equal(typeof h2.kill, 'function');
  assert.equal(typeof h3.kill, 'function');

  spawned[0].closed = true;
  spawned[0].child.finish();
  assert.deepEqual(e1.events.at(-1), { type: 'done' });
  assert.equal(spawned.length, 2);
  assert.deepEqual(grokAdds, [url(1), url(2)]);

  spawned[1].closed = true;
  spawned[1].child.finish();
  assert.equal(spawned.length, 3);
  assert.deepEqual(grokAdds, [url(1), url(2), url(3)]);
  // once started, the handle stops the real process
  h3.kill('SIGTERM');
  await flush();
  assert.equal(spawned[2].child.killed, true);
  assert.deepEqual(e3.events.at(-1), { type: 'done' });
});

test('Grok: cancelling a waiting worker removes it from the line without starting it', async () => {
  spawned.length = 0;
  grokAdds.length = 0;
  const e2 = recorder();
  run('grok', opts('worker-1', url(1)), recorder());
  const h2 = run('grok', opts('worker-2', url(2)), e2);
  run('grok', opts('worker-3', url(3)), recorder());
  h2.kill('SIGTERM');
  assert.equal(e2.events.at(-1).type, 'done');
  assert.ok(e2.events.some((e) => e.type === 'error'));
  h2.kill('SIGTERM'); // a second cancel does nothing
  assert.equal(e2.events.filter((e) => e.type === 'done').length, 1);
  spawned[0].closed = true;
  spawned[0].child.finish();
  assert.equal(spawned.length, 2);
  assert.deepEqual(grokAdds, [url(1), url(3)]); // worker 2 never ran
});

test('Grok: a chat run waits while a worker runs (it would rewrite the worker address)', async () => {
  spawned.length = 0;
  grokAdds.length = 0;
  run('grok', opts('worker-1', url(1)), recorder());
  run('grok', opts('chat', 'http://x/full'), recorder());
  assert.equal(spawned.length, 1);
  spawned[0].closed = true;
  spawned[0].child.finish();
  assert.equal(spawned.length, 2);
  assert.deepEqual(grokAdds, [url(1), 'http://x/full']);
});

test('Grok: a read-only review or tour waits for a running chat, and the reverse, so neither gets the other address', async () => {
  for (const [first, second] of [['chat', 'review'], ['review', 'chat'], ['tour', 'repair'], ['chat', 'repair']]) {
    spawned.length = 0;
    grokAdds.length = 0;
    const urlOf = (s) => (s === 'review' || s === 'tour' ? 'http://x/ro' : 'http://x/full');
    run('grok', opts(first, urlOf(first)), recorder());
    run('grok', opts(second, urlOf(second)), recorder());
    assert.equal(spawned.length, 1, `${second} waits for ${first}`);
    assert.deepEqual(grokAdds, [urlOf(first)]); // the global config keeps the first run's address
    spawned[0].closed = true;
    spawned[0].child.finish();
    assert.equal(spawned.length, 2);
    assert.deepEqual(grokAdds, [urlOf(first), urlOf(second)]);
    await closeAll();
  }
});

test('Grok: a new chat still replaces the old one, starting once the old process closed', async () => {
  spawned.length = 0;
  run('grok', opts('chat', 'http://x/full'), recorder());
  run('grok', opts('chat', 'http://x/full'), recorder());
  assert.equal(spawned[0].child.killed, true);
  await flush();
  assert.equal(spawned.length, 2);
  assert.equal(spawned[1].child.killed, false);
});

test('Claude workers never wait in line', () => {
  spawned.length = 0;
  run('claude', opts('worker-1', url(1)), recorder());
  run('claude', opts('worker-2', url(2)), recorder());
  run('claude', opts('worker-3', url(3)), recorder());
  run('claude', opts('chat', 'http://x/full'), recorder());
  assert.equal(spawned.length, 4);
});
