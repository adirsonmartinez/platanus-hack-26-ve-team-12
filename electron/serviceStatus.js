// Which external services a project uses and whether the person's agent can work with them
// (docs/features/servicios/README.md). Read-only:
// - detect() reads package.json files, .env.example / .env.sample (variable NAMES only) and whether some
//   files and folders exist. It never opens .env or .env.local: isEnvSecret refuses them before any read.
// - status() looks for the service in the agents' MCP configs (server names and addresses only, never
//   tokens or headers) and asks the service's CLI whether there is a session (whoami: execFile, no shell,
//   3 s at most; only its exit code is used, its output is never kept).
// Tested in serviceStatus.test.js.
const fsp = require('node:fs/promises');
const { existsSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { SERVICES, ORDER } = require('./serviceCatalog');

const WHOAMI_TIMEOUT_MS = 3000;
const CACHE_MS = 60_000;
const WORKSPACE_DIRS = ['apps', 'packages']; // monorepos: their packages, one level down
const MAX_WORKSPACES = 40;
const ENV_EXAMPLES = ['.env.example', '.env.sample'];
const ENV_NAME = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/; // the name only; the value is never captured

// .env, .env.local, .env.production… hold real values. Only the example files may be read.
const isEnvSecret = (name) => /^\.env(\.|$)/.test(name) && !ENV_EXAMPLES.includes(name);

// Electron opened from Finder does not inherit the terminal PATH (same folders as agents.js)
const EXTRA_PATH = [path.join(os.homedir(), '.local/bin'), '/opt/homebrew/bin', '/usr/local/bin'];
const RUN_ENV = { ...process.env, PATH: [...EXTRA_PATH, process.env.PATH || ''].join(path.delimiter) };

// -> { code } | { missing: true } | { timeout: true } | { error: true }. stdin is closed at once, so a CLI
// that would ask something fails instead of waiting.
function defaultRun(file, args, { timeoutMs = WHOAMI_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = execFile(file, args, { timeout: timeoutMs, shell: false, windowsHide: true, env: RUN_ENV, maxBuffer: 256 * 1024 }, (err) => {
        if (!err) return resolve({ code: 0 });
        if (err.code === 'ENOENT') return resolve({ missing: true });
        if (err.killed || err.signal) return resolve({ timeout: true });
        if (typeof err.code === 'number') return resolve({ code: err.code });
        resolve({ error: true });
      });
    } catch {
      return resolve({ error: true });
    }
    child.stdin?.end();
  });
}

const defaultReadFile = (file) => fsp.readFile(file, 'utf8');
async function defaultReaddir(dir) {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name); // a link is not followed
}

const posix = (rel) => rel.split(path.sep).join('/');

// "@supabase/" is a scope prefix; any other entry is an exact package name
const depMatches = (rule, dep) => (rule.endsWith('/') ? dep.startsWith(rule) : dep === rule);
const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

// -> [{ key, evidence: ['package.json: @supabase/supabase-js', '.env.example: STRIPE_SECRET_KEY', 'supabase/'] }]
async function detect(root, { readFile = defaultReadFile, exists = existsSync, readdir = defaultReaddir, services = SERVICES } = {}) {
  const read = async (rel) => {
    if (isEnvSecret(path.basename(rel))) return null; // never, whatever asks
    try { return await readFile(path.join(root, rel)); } catch { return null; }
  };
  // package.json at the root and in apps/* and packages/*
  const folders = [''];
  for (const dir of WORKSPACE_DIRS) {
    const names = await readdir(path.join(root, dir)).catch(() => []);
    for (const name of names.slice(0, MAX_WORKSPACES)) folders.push(`${dir}/${name}`);
  }
  const deps = []; // [{ file, name }]
  const envNames = []; // [{ file, name }]
  for (const folder of folders) {
    const file = folder ? `${folder}/package.json` : 'package.json';
    const text = await read(file);
    if (text != null) {
      try {
        const pkg = JSON.parse(text);
        for (const field of DEP_FIELDS) for (const name of Object.keys(pkg?.[field] ?? {})) deps.push({ file, name });
      } catch { /* not valid JSON: nothing from it */ }
    }
    for (const example of ENV_EXAMPLES) {
      const rel = folder ? `${folder}/${example}` : example;
      const content = await read(rel);
      if (content == null) continue;
      for (const line of content.split(/\r?\n/)) {
        const name = ENV_NAME.exec(line)?.[1];
        if (name) envNames.push({ file: rel, name });
      }
    }
  }

  const found = [];
  for (const key of Object.keys(services)) {
    const rules = services[key].detect;
    const evidence = [];
    for (const d of deps) if (rules.deps.some((rule) => depMatches(rule, d.name))) evidence.push(`${d.file}: ${d.name}`);
    for (const rel of rules.files) if (exists(path.join(root, rel))) evidence.push(rel);
    for (const rel of rules.dirs) if (exists(path.join(root, rel))) evidence.push(`${rel}/`);
    for (const e of envNames) if (rules.envNames.includes(e.name)) evidence.push(`${e.file}: ${e.name}`);
    if (evidence.length) found.push({ key, evidence: [...new Set(evidence)] });
  }
  return found;
}

// [mcp_servers.<name>] tables of a Codex or Grok config.toml -> [{ name, url }]. Only the table name and
// its `url` line are read; subtables (env, http_headers) and every other key are skipped.
function parseTomlMcp(text) {
  const servers = [];
  let current = null;
  for (const line of String(text).split(/\r?\n/)) {
    if (/^\s*\[/.test(line)) {
      const m = /^\s*\[\s*mcp_servers\.(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_-]+))\s*\]\s*(#.*)?$/.exec(line);
      current = m ? { name: m[1] ?? m[2] ?? m[3], url: null } : null;
      if (current) servers.push(current);
      continue;
    }
    const url = current && /^\s*url\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(line);
    if (url) current.url = url[1] ?? url[2];
  }
  return servers;
}

// JSON with // and /* */ comments and trailing commas (OpenCode's opencode.jsonc)
function parseJsonc(text) {
  const src = String(text);
  let out = '';
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (c === '"') {
      let j = i + 1;
      while (j < src.length && src[j] !== '"') j += src[j] === '\\' ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j;
    } else if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i += 1;
      out += '\n';
    } else if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end < 0 ? src.length : end + 1;
    } else if (c === ',' && /^\s*[}\]]/.test(src.slice(i + 1))) {
      // a trailing comma: dropped
    } else {
      out += c;
    }
  }
  return JSON.parse(out);
}

// { name: { url?, … } } -> [{ name, url }] (nothing else of each entry is kept)
const fromObject = (servers) => Object.entries(servers && typeof servers === 'object' ? servers : {})
  .map(([name, entry]) => ({ name, url: typeof entry?.url === 'string' ? entry.url : null }));

// Every MCP server the person's agents have configured -> { servers: [{ agent, name, url }], failed }.
// A missing file is normal; one that cannot be read or parsed sets `failed` (the state becomes unknown).
async function mcpServers({ home = os.homedir(), root, readFile = defaultReadFile, env = process.env } = {}) {
  let failed = false;
  const load = async (file, parse) => {
    try {
      return parse(await readFile(file));
    } catch (err) {
      if (err?.code !== 'ENOENT' && err?.code !== 'ENOTDIR') failed = true;
      return null;
    }
  };
  const servers = [];
  const add = (agent, list) => { for (const s of list ?? []) servers.push({ agent, name: s.name, url: s.url }); };

  // Claude Code: user servers and this project's local ones in ~/.claude.json, shared ones in .mcp.json
  const claude = await load(path.join(home, '.claude.json'), JSON.parse);
  add('claude', fromObject(claude?.mcpServers));
  if (root) add('claude', fromObject(claude?.projects?.[root]?.mcpServers));
  if (root) add('claude', fromObject((await load(path.join(root, '.mcp.json'), JSON.parse))?.mcpServers));
  // Codex
  add('codex', await load(path.join(env.CODEX_HOME || path.join(home, '.codex'), 'config.toml'), parseTomlMcp));
  // OpenCode: global config (XDG), and the project's own
  const xdg = env.XDG_CONFIG_HOME || path.join(home, '.config');
  const opencodeFiles = ['opencode.json', 'opencode.jsonc', 'config.json'].map((name) => path.join(xdg, 'opencode', name));
  if (root) opencodeFiles.push(path.join(root, 'opencode.json'), path.join(root, 'opencode.jsonc'));
  for (const file of opencodeFiles) add('opencode', fromObject((await load(file, parseJsonc))?.mcp));
  // Grok: ~/.grok/config.toml and the project's .grok/config.toml (same [mcp_servers.<name>] tables)
  add('grok', await load(path.join(home, '.grok', 'config.toml'), parseTomlMcp));
  if (root) add('grok', await load(path.join(root, '.grok', 'config.toml'), parseTomlMcp));
  return { servers, failed };
}

const hostOf = (url) => {
  try { return new URL(url).hostname.toLowerCase(); } catch { return null; }
};

// A configured server is the service's when its name has the service's MCP name as a word
// ("stripe", "stripe-live") or it points at the service's MCP host
function isServiceServer(server, mcp) {
  if (!mcp) return false;
  const words = String(server.name).toLowerCase().split(/[^a-z0-9]+/);
  if (words.includes(mcp.name)) return true;
  const host = mcp.url && hostOf(mcp.url);
  return Boolean(host && server.url && hostOf(server.url) === host);
}

// keys -> { [key]: { state: 'connected' | 'disconnected' | 'unknown', via: ['mcp:claude', 'cli'] } }
async function status(keys, { home = os.homedir(), root, run = defaultRun, readFile = defaultReadFile, env = process.env, services = SERVICES } = {}) {
  const { servers, failed } = await mcpServers({ home, root, readFile, env });
  const entries = await Promise.all(keys.filter((key) => services[key]).map(async (key) => {
    const service = services[key];
    const via = [...new Set(servers.filter((s) => isServiceServer(s, service.mcp)).map((s) => `mcp:${s.agent}`))];
    let unsure = failed;
    const whoami = service.cli?.whoami;
    if (whoami) {
      const answer = await run(whoami[0], whoami.slice(1), { timeoutMs: WHOAMI_TIMEOUT_MS }).catch(() => ({ error: true }));
      if (answer?.code === 0) via.push('cli');
      else if (answer?.timeout || answer?.error) unsure = true;
    }
    const state = via.length ? 'connected' : unsure ? 'unknown' : 'disconnected';
    return [key, { state, via }];
  }));
  return Object.fromEntries(entries);
}

// For main: detection + state of one project, cached 60 s per project (clear() empties it, for
// "Ya lo conecté"). -> [{ key, name, state, via, evidence }] in catalog order.
function createServiceStatus({ home = os.homedir(), run = defaultRun, readFile = defaultReadFile, exists = existsSync, readdir = defaultReaddir, env = process.env, now = Date.now, ttlMs = CACHE_MS } = {}) {
  const cache = new Map(); // root -> { at, promise }
  async function compute(root) {
    const found = await detect(root, { readFile, exists, readdir });
    const states = await status(found.map((f) => f.key), { home, root, run, readFile, env });
    const evidence = Object.fromEntries(found.map((f) => [f.key, f.evidence]));
    return ORDER.filter((key) => evidence[key]).map((key) => ({
      key, name: SERVICES[key].name, state: states[key].state, via: states[key].via, evidence: evidence[key],
    }));
  }
  return {
    check(root) {
      const saved = cache.get(root);
      if (saved && now() - saved.at < ttlMs) return saved.promise;
      const promise = compute(root);
      cache.set(root, { at: now(), promise });
      promise.catch(() => { if (cache.get(root)?.promise === promise) cache.delete(root); });
      return promise;
    },
    clear() {
      cache.clear();
    },
  };
}

module.exports = { detect, status, mcpServers, parseTomlMcp, parseJsonc, isEnvSecret, isServiceServer, createServiceStatus, WHOAMI_TIMEOUT_MS, CACHE_MS };
