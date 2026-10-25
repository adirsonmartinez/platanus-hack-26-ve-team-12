import test from 'node:test';
import assert from 'node:assert/strict';
import { mcpSnippet, EXTERNAL_AGENTS, maskUrl } from '../../renderer/models/mcpSnippets.js';

const url = 'http://127.0.0.1:7811/mcp/abcdef0123';

test('each editor or CLI gets its own config shape with the Qubbot address', () => {
  assert.equal(mcpSnippet('claude', url), `claude mcp add --transport http platanus ${url}`);
  assert.deepEqual(JSON.parse(mcpSnippet('cursor', url)), { mcpServers: { platanus: { url } } });
  assert.deepEqual(JSON.parse(mcpSnippet('kimi', url)), { mcpServers: { platanus: { url } } });
  assert.deepEqual(JSON.parse(mcpSnippet('gemini', url)), { mcpServers: { platanus: { httpUrl: url } } });
  assert.deepEqual(JSON.parse(mcpSnippet('qwen', url)), { mcpServers: { platanus: { httpUrl: url } } });
  assert.deepEqual(JSON.parse(mcpSnippet('opencode', url)), { mcp: { platanus: { type: 'remote', url, enabled: true } } });
  assert.match(mcpSnippet('codex', url), /\[mcp_servers\.platanus\]\nurl = "http/);
});

test('the agents connected from their own app: where the config goes and how to install them', () => {
  assert.deepEqual(EXTERNAL_AGENTS.map((a) => a.id), ['cursor', 'kimi', 'gemini', 'qwen', 'opencode']);
  for (const a of EXTERNAL_AGENTS) {
    assert.ok(a.file && a.install && a.bin, a.id);
    assert.ok(mcpSnippet(a.id, url).includes(url), a.id);
  }
});

test('on screen the private key in the address is masked', () => {
  assert.equal(maskUrl(`x ${url} y`, url), 'x http://127.0.0.1:7811/mcp/•••••••• y');
});
