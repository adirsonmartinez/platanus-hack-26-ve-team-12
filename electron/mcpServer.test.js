// Tests for the local MCP server: protocol, tool validation, secret filter and the network guard.
// Run with `npm test` (node:test, no dependencies).
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMcpHandler, startMcpServer, isBlockedPath, isBlockedRealPath, TOOLS } = require('./mcpServer');

const calls = [];
const handlers = {
  platanus_get_project: async () => ({ name: 'demo', tree: ['src/', 'src/app.ts'] }),
  platanus_list_risks: async () => [{ path: '.env', level: 'red' }],
  platanus_read_file: async ({ path }) => `contents of ${path}`,
  platanus_write_file: async ({ path }) => `wrote ${path}`,
  platanus_set_file_score: async ({ path, level }) => `${path} -> ${level}`,
  platanus_show_folder: async ({ path }) => `showing ${path || 'map'}`,
};
const respond = createMcpHandler({ handlers, onCall: (c) => calls.push(c) });

test('initialize and tools/list', async () => {
  const init = await respond({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
  assert.equal(init.result.protocolVersion, '2025-06-18');
  const list = await respond({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.deepEqual(list.result.tools.map((t) => t.name), TOOLS.map((t) => t.name));
});

test('notifications get no reply; unknown methods are JSON-RPC errors', async () => {
  assert.equal(await respond({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  const r = await respond({ jsonrpc: '2.0', id: 3, method: 'nope' });
  assert.equal(r.error.code, -32601);
});

test('every tool call is reported for the audit log', async () => {
  calls.length = 0;
  await respond({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'platanus_show_folder', arguments: { path: 'src' } } });
  assert.deepEqual(calls.map((c) => [c.tool, c.ok]), [['platanus_show_folder', true]]);
});

test('secrets are never read, even if the agent asks', async () => {
  for (const p of ['.env', 'config/.env.local', 'certs/server.pem', 'keys/id_rsa', 'a/b.key',
    '.env/', './.env/.', 'x/../.env/', '.git/config', 'a/.ssh/id_ed25519', '.npmrc', 'sub/.aws/credentials',
    'config/credentials.json', 'secrets.yml', '.htpasswd', 'gcp/service-account-prod.json']) {
    assert.equal(isBlockedPath(p), true, p);
    const r = await respond({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'platanus_read_file', arguments: { path: p } } });
    assert.equal(r.result.isError, true, p);
  }
  for (const p of ['.env.example', 'src/env.ts', 'README.md']) assert.equal(isBlockedPath(p), false, p);
});

test('invalid traffic light level and missing arguments are refused', async () => {
  const bad = await respond({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'platanus_set_file_score', arguments: { path: 'a', level: 'purple', reason: 'x' } } });
  assert.equal(bad.result.isError, true);
  const missing = await respond({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'platanus_read_file', arguments: {} } });
  assert.equal(missing.result.isError, true);
});

test('HTTP: answers local clients, refuses browsers (Origin) and foreign hosts', async () => {
  const token = 'a'.repeat(48);
  const server = await startMcpServer({ port: 0, handlers, token });
  const { port } = server.address();
  const post = (headers, path = `/mcp/${token}`) =>
    fetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
    });
  try {
    assert.equal((await post({})).status, 200);
    // Without the private key in the address, another program on this computer gets nothing
    assert.equal((await post({}, '/mcp')).status, 404);
    assert.equal((await post({}, `/mcp/${'b'.repeat(48)}`)).status, 404);
    assert.equal((await post({ Origin: 'https://evil.example' })).status, 403);
    // fetch() silently ignores a custom Host header, so use http.request for the DNS-rebinding case
    const status = await new Promise((resolve, reject) => {
      const req = require('node:http').request(
        { host: '127.0.0.1', port, path: `/mcp/${token}`, method: 'POST', headers: { Host: `evil.example:${port}`, 'Content-Type': 'application/json' } },
        (res) => resolve(res.statusCode),
      );
      req.on('error', reject);
      req.end(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }));
    });
    assert.equal(status, 403);
  } finally {
    server.close();
  }
});

test('templates are readable; writes to secrets are refused too', async () => {
  assert.equal(isBlockedPath('.env.example'), false);
  assert.equal(isBlockedPath('src/app.js'), false);
  const r = await respond({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'platanus_write_file', arguments: { path: '.env', content: 'x', reason: 'r' } } });
  assert.equal(r.result.isError, true);
});

test('symlinks: a harmless-looking path that lands in .git/ or a secret is refused, even for new files', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'platanus-')));
  fs.mkdirSync(path.join(root, '.git', 'hooks'), { recursive: true });
  fs.writeFileSync(path.join(root, '.env'), 'SECRET=1');
  fs.symlinkSync(path.join(root, '.git'), path.join(root, 'cfg'));
  fs.symlinkSync(path.join(root, '.env'), path.join(root, 'notes.txt'));
  fs.mkdirSync(path.join(root, 'src'));
  assert.equal(await isBlockedRealPath(root, path.join(root, 'cfg/hooks/pre-commit')), true); // new file
  assert.equal(await isBlockedRealPath(root, path.join(root, 'notes.txt')), true);
  assert.equal(await isBlockedRealPath(root, path.join(root, 'src/new/app.js')), false);
  fs.rmSync(root, { recursive: true, force: true });
});

test('read-only (the tour): only the reading tools are listed and nothing can be changed', async () => {
  const seen = [];
  const ro = createMcpHandler({ handlers, readOnly: true, onCall: (c) => seen.push(c) });
  const list = await ro({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  assert.deepEqual(list.result.tools.map((t) => t.name), ['platanus_get_project', 'platanus_list_risks', 'platanus_read_file']);
  for (const name of ['platanus_write_file', 'platanus_set_file_score', 'platanus_show_folder']) {
    const r = await ro({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: { path: 'a.js', content: 'x', reason: 'r', level: 'red' } } });
    assert.equal(r.result.isError, true, name);
    assert.match(r.result.content[0].text, /read-only/);
  }
  assert.ok(seen.every((c) => c.ok === false && c.error === 'read-only'));
  const read = await ro({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'platanus_read_file', arguments: { path: 'src/app.ts' } } });
  assert.equal(read.result.isError, false);
});

test('HTTP: the read-only address needs the same private key', async () => {
  const token = 'c'.repeat(48);
  const server = await startMcpServer({ port: 0, handlers, token });
  const { port } = server.address();
  const list = (path) => fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) });
  try {
    const ro = await (await list(`/mcp/${token}/ro`)).json();
    assert.equal(ro.result.tools.length, 3);
    const full = await (await list(`/mcp/${token}`)).json();
    assert.equal(full.result.tools.length, TOOLS.length);
    assert.equal((await list(`/mcp/${'d'.repeat(48)}/ro`)).status, 404);
    assert.equal((await list(`/mcp/${token}/rw`)).status, 404);
  } finally {
    server.close();
  }
});
