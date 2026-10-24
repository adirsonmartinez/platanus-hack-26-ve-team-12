// Local MCP server (Streamable HTTP, JSON responses, stateless) so the user's own agent
// (Claude Code, Cursor, Codex, Gemini CLI, or the CLIs launched from the chat) can work with Platanus.
// Only listens on 127.0.0.1 and rejects browser requests (Origin header), so a web page cannot use it.

const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const PROTOCOL_VERSION = '2025-06-18';
const MAX_BODY = 256 * 1024;

// Files and folders an agent must never read or write: secrets, private keys, credentials and git
// internals. Checked on every segment of the NORMALIZED path (so ".env/", "x/../.env" or "./.env/."
// are caught), and main.js checks the real path too (symlinks).
const BLOCKED_SEGMENT = /^(\.env(\..*)?|\.git|\.ssh|\.aws|\.gnupg|\.npmrc|\.netrc|\.pypirc|\.docker|\.htpasswd|credentials(\.json)?|secrets?\.(json|ya?ml|toml)|service[-_]?account[^/]*\.json|id_(rsa|ed25519|ecdsa|dsa)[^/]*|[^/]+\.(pem|key|p12|pfx|keystore|jks))$/i;
const ALLOWED_ENV_TEMPLATE = /^\.env\.(example|sample|template)$/i;
const MAX_READ_BYTES = 200 * 1024;

function isBlockedPath(rel) {
  const normalized = path.posix.normalize(String(rel).replace(/\\/g, '/'));
  return normalized.split('/').some((seg) => BLOCKED_SEGMENT.test(seg) && !ALLOWED_ENV_TEMPLATE.test(seg));
}

// Where an absolute path really lands inside `root` (symlinks resolved, also for a file that does not
// exist yet: its nearest existing parent is resolved), checked against the same blocklist.
async function isBlockedRealPath(root, abs) {
  let probe = abs;
  const rest = [];
  while (!fs.existsSync(probe) && path.dirname(probe) !== probe) {
    rest.unshift(path.basename(probe));
    probe = path.dirname(probe);
  }
  const real = path.join(await fs.promises.realpath(probe).catch(() => probe), ...rest);
  return isBlockedPath(path.relative(root, real).split(path.sep).join('/'));
}

const TOOLS = [
  {
    name: 'platanus_get_project',
    description: 'Returns the open project: its name and folder tree (paths only, up to 4 levels).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'platanus_list_risks',
    description: 'Lists files whose security traffic light is red (risk) or yellow (review), with the reason.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'platanus_read_file',
    description: 'Reads a text file of the project. Secrets (.env, private keys) and files over 200 KB are refused.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Path relative to the project root' } },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    name: 'platanus_write_file',
    description: 'Writes a text file of the project (the whole new content). The user must approve every write in a dialog, and the previous version is backed up so it can be undone. Explain the change in `reason` in plain Spanish.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relative to the project root' },
        content: { type: 'string', description: 'Full new content of the file' },
        reason: { type: 'string', maxLength: 300, description: 'What you changed and why, in one or two plain sentences' },
      },
      required: ['path', 'content', 'reason'],
      additionalProperties: false,
    },
  },
  {
    name: 'platanus_set_file_score',
    description: "Sets a file's security traffic light on the map: green (safe), yellow (review) or red (risk), with a short reason in plain Spanish.",
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        level: { type: 'string', enum: ['green', 'yellow', 'red'] },
        reason: { type: 'string', maxLength: 240 },
      },
      required: ['path', 'level', 'reason'],
      additionalProperties: false,
    },
  },
  {
    name: 'platanus_show_folder',
    description: "Opens a folder's building on the map so the user sees what you are talking about. Use an empty path for the whole map.",
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
      additionalProperties: false,
    },
  },
];

const text = (value, isError = false) => ({
  content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
  isError,
});

// Tools a read-only run may use (the tour of a project: it explains, it never changes anything)
const READ_ONLY_TOOLS = ['platanus_get_project', 'platanus_list_risks', 'platanus_read_file'];

// `handlers` implement the tools (they live in main.js, next to the workspace and the window).
// Every call is reported through `onCall({ tool, args, ok, error })` for the audit log.
// readOnly: only READ_ONLY_TOOLS are listed, and any other call is refused.
function createMcpHandler({ handlers, onCall = () => {}, readOnly = false }) {
  const tools = readOnly ? TOOLS.filter((t) => READ_ONLY_TOOLS.includes(t.name)) : TOOLS;
  async function callTool(name, args) {
    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) throw { code: -32602, message: `Unknown tool: ${name}` };
    if (!tools.includes(tool)) {
      onCall({ tool: name, args, ok: false, error: 'read-only' });
      return text('Refused: this run is read-only (project tour). Explain, do not change anything.', true);
    }
    for (const key of tool.inputSchema.required ?? []) {
      if (typeof args?.[key] !== 'string') return text(`Missing "${key}".`, true);
    }
    if ((name === 'platanus_read_file' || name === 'platanus_write_file') && isBlockedPath(args.path)) {
      onCall({ tool: name, args, ok: false, error: 'blocked' });
      return text('Refused: this file can contain secrets and is never shared with agents.', true);
    }
    if (name === 'platanus_set_file_score' && !['green', 'yellow', 'red'].includes(args.level)) {
      return text('level must be green, yellow or red.', true);
    }
    try {
      const result = await handlers[name](args ?? {});
      onCall({ tool: name, args, ok: true });
      return text(result);
    } catch (err) {
      onCall({ tool: name, args, ok: false, error: err.message });
      return text(err.message, true);
    }
  }

  async function handle(msg) {
    switch (msg.method) {
      case 'initialize':
        return {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'platanus', version: '0.1.0' },
          instructions:
            'Platanus shows a project as an isometric map with a security traffic light per file. Explain risks in plain Spanish for non-developers.',
        };
      case 'ping':
        return {};
      case 'tools/list':
        return { tools };
      case 'tools/call':
        return callTool(String(msg.params?.name ?? ''), msg.params?.arguments ?? {});
      default:
        throw { code: -32601, message: `Method not found: ${msg.method}` };
    }
  }

  // JSON-RPC message or batch -> reply (null for notifications only)
  return async function respond(body) {
    const batch = Array.isArray(body) ? body : [body];
    const replies = [];
    for (const m of batch) {
      if (m?.id === undefined || m?.id === null) continue; // notifications
      try {
        replies.push({ jsonrpc: '2.0', id: m.id, result: await handle(m) });
      } catch (e) {
        replies.push({ jsonrpc: '2.0', id: m.id, error: { code: e.code ?? -32603, message: e.message ?? 'Internal error' } });
      }
    }
    if (!replies.length) return null;
    return Array.isArray(body) ? replies : replies[0];
  };
}

// Only local, non-browser clients: the Host must be 127.0.0.1/localhost (DNS rebinding) and there
// must be no Origin header (browsers always send one on cross-origin requests).
function isAllowedRequest(req, port) {
  const host = String(req.headers.host ?? '');
  const okHost = host === `127.0.0.1:${port}` || host === `localhost:${port}`;
  return okHost && !req.headers.origin;
}

// `token`: private key in the address (/mcp/<token>), so other programs or users on this computer
// cannot use the server. Compared in constant time. /mcp/<token>/ro is the same server, read-only.
function startMcpServer({ port = 7811, handlers, onCall, token }) {
  const full = createMcpHandler({ handlers, onCall });
  const readOnly = createMcpHandler({ handlers, onCall, readOnly: true });
  const same = (url, path) => {
    const got = Buffer.from(String(url));
    const expected = Buffer.from(path);
    return Boolean(token) && got.length === expected.length && crypto.timingSafeEqual(got, expected);
  };
  // the handler for this address, or null when it is not ours
  const handlerFor = (url) => (same(url, `/mcp/${token ?? ''}`) ? full : same(url, `/mcp/${token ?? ''}/ro`) ? readOnly : null);
  const server = http.createServer((req, res) => {
    const actualPort = server.address()?.port;
    if (!isAllowedRequest(req, actualPort)) {
      res.writeHead(403).end();
      return;
    }
    const respond = handlerFor(req.url);
    if (!respond) return void res.writeHead(404).end();
    if (req.method === 'GET') return void res.writeHead(405, { Allow: 'POST' }).end(); // no server stream
    if (req.method !== 'POST') return void res.writeHead(405).end();

    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) req.destroy();
      else chunks.push(c);
    });
    req.on('end', async () => {
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return void res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }));
      }
      const reply = await respond(body);
      if (!reply) return void res.writeHead(202).end();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(reply));
    });
  });

  return new Promise((resolve) => {
    // If the port is taken (another Platanus window, another app), let the OS pick a free one
    server.once('error', () => server.listen(0, '127.0.0.1', () => resolve(server)));
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

module.exports = { TOOLS, createMcpHandler, startMcpServer, isBlockedPath, isBlockedRealPath, isAllowedRequest, MAX_READ_BYTES };
