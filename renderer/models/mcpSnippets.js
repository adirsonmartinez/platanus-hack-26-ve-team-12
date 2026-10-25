// How to connect an editor or another agent CLI to Qubbot' local MCP server (the "Conecta tu agente"
// panel and the agent menu). Agents that cannot be locked to the Qubbot tools inside the chat (Cursor,
// Gemini, Qwen; Kimi until it is installed and checked) connect this way from their own app.
// Install commands and config files: official docs, checked in the agent research (docs/INTERFAZ.md).

export const EXTERNAL_AGENTS = [
  { id: 'cursor', bin: 'agent', file: '.cursor/mcp.json', install: 'curl https://cursor.com/install -fsS | bash' },
  { id: 'kimi', bin: 'kimi', file: '~/.kimi-code/mcp.json', install: 'npm install -g @moonshot-ai/kimi-code' },
  { id: 'gemini', bin: 'gemini', file: '~/.gemini/settings.json', install: 'npm install -g @google/gemini-cli' },
  { id: 'qwen', bin: 'qwen', file: '~/.qwen/settings.json', install: 'npm install -g @qwen-code/qwen-code@latest' },
  { id: 'opencode', bin: 'opencode', file: 'opencode.json', install: 'curl -fsSL https://opencode.ai/install | bash' },
];

const json = (value) => JSON.stringify(value, null, 2);

export function mcpSnippet(id, url) {
  switch (id) {
    case 'claude': return `claude mcp add --transport http platanus ${url}`;
    case 'codex': return `[mcp_servers.platanus]\nurl = "${url}"`;
    case 'cursor':
    case 'kimi': return json({ mcpServers: { platanus: { url } } });
    case 'gemini':
    case 'qwen': return json({ mcpServers: { platanus: { httpUrl: url } } });
    case 'opencode': return json({ mcp: { platanus: { type: 'remote', url, enabled: true } } });
    default: return url;
  }
}

// The address carries a private key: masked on screen, the real one is what gets copied
export const maskUrl = (text, url) => text.split(url).join(url.replace(/\/mcp\/[^/\s"]+$/, '/mcp/••••••••'));
