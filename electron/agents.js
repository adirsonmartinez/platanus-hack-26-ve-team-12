// The user's own AI subscription (OAuth of each official CLI, no API keys in the app).
// Platanus runs the CLI non-interactively and gives it its tools through the local MCP server.
const { spawn, spawnSync, execFile } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Electron opened from Finder does not inherit the terminal PATH.
const EXTRA_PATH = [path.join(os.homedir(), ".local/bin"), "/opt/homebrew/bin", "/usr/local/bin"];
const ENV = { ...process.env, PATH: [...EXTRA_PATH, process.env.PATH || ""].join(path.delimiter) };

const WORKDIR = path.join(os.homedir(), ".platanus", "agent-workdir"); // empty folder: the agent only acts through MCP
fs.mkdirSync(WORKDIR, { recursive: true });

const t = require("./strings");
const { parseAgentLine } = require("./agentEvents");
const { opencodeConfig, opencodeEnv, opencodeArgs, FALLBACK_LINE } = require("./opencode");

const AGENTS = {
  claude: { label: t.agents.claude, bin: "claude", login: "claude auth login" },
  grok: { label: t.agents.grok, bin: "grok", login: "grok login --oauth" },
  codex: { label: t.agents.codex, bin: "codex", login: "codex login" },
  // Locked to the Platanus tools by its config (opencode.js); it uses the providers OpenCode is signed in to
  opencode: { label: t.agents.opencode, bin: "opencode", login: "opencode auth login", format: "opencode" },
};
// OpenCode's own config and global config folder, apart from the person's (opencode.js)
const OPENCODE_HOME = path.join(os.homedir(), ".platanus", "opencode");
// Development only (PLATANUS_SIM=1): "Simulador", a fake Claude Code CLI that plays scripted scenarios
// through the real pipeline and the real Platanus tools (scripts/sim/fakeAgent.js). Never in a release.
const SIM = process.env.PLATANUS_SIM === "1";
if (SIM) {
  AGENTS.sim = { label: t.agents.sim, bin: process.execPath, script: path.join(__dirname, "..", "scripts", "sim", "fakeAgent.js"), format: "claude", login: "" };
}

// The CLIs only read proxy environment variables, not the system proxy that VPN apps (Psiphon, corporate
// clients) set, so without this they connect directly and fail with ECONNREFUSED. `resolved` is Electron's
// session.resolveProxy() answer ("PROXY host:port; DIRECT"); a proxy already in the environment wins.
// The local MCP server never goes through the proxy.
const PROXY_VARS = ["HTTPS_PROXY", "HTTP_PROXY", "ALL_PROXY"];
function proxyEnvFor(resolved, env = process.env) {
  if (PROXY_VARS.some((name) => env[name] || env[name.toLowerCase()])) return {};
  const entry = String(resolved ?? "").split(";").map((s) => s.trim()).find((s) => /^(PROXY|HTTPS) /i.test(s));
  const hostPort = entry?.split(/\s+/)[1] ?? "";
  const m = /^([a-zA-Z0-9.-]+):(\d{1,5})$/.exec(hostPort);
  if (!m || Number(m[2]) > 65535 || entry.split(/\s+/).length !== 2) return {};
  const url = `http://${m[1]}:${m[2]}`;
  return { HTTPS_PROXY: url, HTTP_PROXY: url, NO_PROXY: "127.0.0.1,localhost,::1" };
}

// Runs a quick CLI command without blocking the app (the old spawnSync froze the window for seconds)
function quick(bin, args, timeout = 6000) {
  return new Promise((resolve) => {
    execFile(bin, args, { env: ENV, timeout, encoding: "utf8" }, (err, stdout, stderr) =>
      resolve({ ok: !err, code: err?.code ?? 0, out: `${stdout ?? ""}${stderr ?? ""}`, stdout: stdout ?? "" }));
  });
}

// Looks the CLI up in PATH without a shell (there is no /bin/sh on Windows). On Windows only a real .exe
// counts: Node cannot start a .cmd shim without a shell, and the official installers ship an .exe.
const BIN_EXTENSIONS = process.platform === "win32" ? [".exe"] : [""];
async function which(bin) {
  for (const dir of ENV.PATH.split(path.delimiter).filter(Boolean)) {
    for (const ext of BIN_EXTENSIONS) {
      const candidate = path.join(dir, bin + ext);
      try {
        await fs.promises.access(candidate, fs.constants.X_OK);
        if ((await fs.promises.stat(candidate)).isFile()) return candidate;
      } catch { /* not here */ }
    }
  }
  return null;
}

async function loginStatus(id, bin) {
  if (id === "claude") {
    const r = await quick(bin, ["auth", "status"], 8000);
    try { return JSON.parse(r.stdout).loggedIn === true; } catch { return false; }
  }
  if (id === "codex") {
    const r = await quick(bin, ["login", "status"], 8000);
    return r.ok && !/not logged in/i.test(r.out);
  }
  if (id === "opencode") {
    // "N credentials" in `opencode providers list` (ANSI colors stripped)
    const r = await quick(bin, ["providers", "list"], 8000);
    const n = /(\d+)\s+credentials?/i.exec(r.out.replace(/\x1b\[[0-9;]*m/g, ""))?.[1];
    return n === undefined ? null : Number(n) > 0;
  }
  return null; // Grok exposes no login status: known on first use
}

async function version(bin) {
  const r = await quick(bin, ["--version"], 5000);
  return (/\d+\.\d+(\.\d+)?/.exec(r.out) ?? [""])[0];
}

// Absolute path of each CLI found by detect(), used to start it
const binPaths = {};

// [{ id, label, installed, loggedIn, version, path }], checked in parallel
function detect() {
  return Promise.all(Object.entries(AGENTS).map(async ([id, a]) => {
    if (a.script) return { id, label: a.label, installed: true, loggedIn: true, version: "sim", path: a.script };
    const path_ = await which(a.bin);
    if (!path_) return { id, label: a.label, installed: false, loggedIn: false, version: "", path: "" };
    binPaths[id] = path_;
    const [loggedIn, v] = await Promise.all([loginStatus(id, path_), version(path_)]);
    return { id, label: a.label, installed: true, loggedIn, version: v, path: path_ };
  }));
}

// Opens Terminal with the CLI's OAuth login (finished in the browser).
function login(id) {
  const a = AGENTS[id];
  if (!a) return false;
  if (process.platform === "darwin") {
    execFile("osascript", ["-e", `tell application "Terminal" to do script "${a.login}"`, "-e", 'tell application "Terminal" to activate']);
    return true;
  }
  spawn(a.login, { shell: true, env: ENV, detached: true, stdio: "ignore" }).unref();
  return true;
}

const resumeIds = {}; // conversation continuity per agent and session ("chat" | "repair" | "refine" | "tour")

// Grok's built-in tools (terminal, file edits, subagents, media…) are removed: it only acts through
// Platanus' MCP tools (use_tool). Verified: with these flags `touch` from a prompt is not possible.
// Codex features that give it tools of its own (verified names, codex-cli 0.164.0 `codex features list`)
const CODEX_DISABLED = [
  "shell_tool", "unified_exec", "unified_exec_tty", "shell_snapshot", "apps",
  "browser_use", "browser_use_external", "browser_use_full_cdp_access", "browser_annotation_api", "in_app_browser",
  "computer_use", "image_generation", "view_image", "plugins", "remote_plugin", "plugin_sharing",
  "multi_agent", "hooks", "skill_search", "skill_mcp_dependency_install", "tool_suggest", "sleep_tool",
];

const GROK_DISALLOWED = [
  "run_terminal_command", "read_file", "search_replace", "write", "list_dir", "grep",
  "kill_command_or_subagent", "get_command_or_subagent_output", "spawn_subagent",
  "scheduler_create", "scheduler_delete", "scheduler_list", "monitor", "workflow",
  "image_gen", "image_edit", "image_to_video", "reference_to_video",
].join(",");

// Minimal context: the CLI's own system prompt, tools, skills and settings are replaced/disabled;
// only Platanus' tools remain, through MCP. (Claude Code: ~24k -> ~2k input tokens per message.)
function argsFor(id, { prompt, systemPrompt, mcpUrl, continued, model, effort, session }) {
  const resume = continued ? resumeIds[`${id}:${session}`] : null;
  if (id === "claude") {
    // The address carries a private key: write it to a 0600 file instead of the command line,
    // which any user of this computer could read with `ps`
    const mcp = path.join(WORKDIR, "mcp.json");
    fs.writeFileSync(mcp, JSON.stringify({ mcpServers: { platanus: { type: "http", url: mcpUrl } } }), { mode: 0o600 });
    return [
      "-p", prompt,
      "--output-format", "stream-json", "--verbose",
      "--system-prompt", systemPrompt,
      "--tools", "",
      "--mcp-config", mcp,
      "--strict-mcp-config",
      "--allowedTools", "mcp__platanus",
      "--setting-sources", "",
      "--disable-slash-commands",
      "--effort", effort,
      ...(model ? ["--model", model] : []),
      ...(resume ? ["--resume", resume] : []),
    ];
  }
  if (id === "grok") {
    // Grok stores MCP servers in its own config: register/update "platanus" before each run.
    spawnSync("grok", ["mcp", "add", "platanus", mcpUrl, "-t", "http"], { env: ENV, cwd: WORKDIR, timeout: 10000 });
    return [
      "-p", prompt,
      "--output-format", "streaming-messages-json",
      "--system-prompt-override", systemPrompt,
      "--reasoning-effort", effort === "max" ? "xhigh" : effort, // Grok accepts low..xhigh
      ...(model ? ["-m", model] : []),
      "--permission-mode", "dontAsk",
      "--allow", "use_tool",
      "--disallowed-tools", GROK_DISALLOWED,
      "--disable-web-search",
      "--cwd", WORKDIR,
      ...(resume ? ["--resume", resume] : []),
    ];
  }
  // codex: same rule as the others, it only acts through Platanus' MCP tools. Its terminal, browser,
  // computer use, plugins and subagents are switched off and the user's config is not loaded, so it
  // cannot read files (or secrets) on its own. Verified against codex-cli 0.164.0 (unknown flags fail).
  return [
    "exec", "--json", "--skip-git-repo-check", "-C", WORKDIR,
    "--ignore-user-config", "--ignore-rules", "--ephemeral",
    "-s", "read-only",
    "-c", 'approval_policy="never"',
    "-c", 'web_search="disabled"',
    ...CODEX_DISABLED.flatMap((feature) => ["--disable", feature]),
    "-c", `mcp_servers.platanus.url=${JSON.stringify(mcpUrl)}`,
    "-c", `model_reasoning_effort=${JSON.stringify(effort)}`, // Codex accepts low..max
    ...(model ? ["-m", model] : []),
    `${systemPrompt}\n\n${prompt}`,
  ];
}

// OpenCode: its config (0600, rewritten each run with this run's MCP address and system prompt) and
// a clean environment; the command never carries --auto/--yolo (opencode.js)
function spawnOpencode({ prompt, systemPrompt, mcpUrl, continued, model }, session, env) {
  const configHome = path.join(OPENCODE_HOME, "xdg");
  const configFile = path.join(OPENCODE_HOME, "config.json");
  fs.mkdirSync(configHome, { recursive: true });
  fs.writeFileSync(configFile, JSON.stringify(opencodeConfig({ mcpUrl, systemPrompt })), { mode: 0o600 });
  fs.chmodSync(configFile, 0o600);
  const resume = continued ? resumeIds[`opencode:${session}`] : null;
  return spawn(binPaths.opencode ?? "opencode", opencodeArgs({ prompt, workdir: WORKDIR, model, resume }), {
    env: opencodeEnv(env, { configFile, configHome }), cwd: WORKDIR, stdio: ["ignore", "pipe", "pipe"],
  });
}

// Each CLI line -> chat events (agentEvents.js); the session id is kept to continue the conversation
function parseLine(format, session, line, emit, id = format) {
  for (const e of parseAgentLine(format, line)) {
    if (e.type === "session") resumeIds[`${id}:${session}`] = e.id;
    // OpenCode without a provider of its own (its free tier only works inside its app)
    else if (e.type === "error" && format === "opencode" && /free tier|ProviderAuth|no provider/i.test(e.message)) emit({ type: "error", message: t.agents.opencodeNoProvider });
    else if (e.type === "error") emit({ type: "error", message: e.message || t.agents.failed });
    else emit(e);
  }
}

const running = new Map();

// One run per agent and session at a time (the window serializes its requests; this is a safety net).
function run(id, opts, emit) {
  if (!AGENTS[id]) return emit({ type: "error", message: t.agents.unknown }), emit({ type: "done" }), null;
  const session = ["repair", "refine", "tour"].includes(opts.session) ? opts.session : "chat";
  const key = `${id}:${session}`;
  running.get(key)?.kill("SIGTERM");
  const agent = AGENTS[id];
  const format = agent.format ?? id; // the simulator speaks Claude Code's stream JSON
  // opts.proxyEnv: the system proxy (VPNs); opts.env: the API key of this agent, when the person saved one
  // (keyStore.js); both only for this run
  const env = { ...ENV, ...(opts.proxyEnv ?? {}), ...(opts.env ?? {}) };
  const child = id === "opencode" ? spawnOpencode(opts, session, env) : agent.script
    ? spawn(agent.bin, [agent.script, ...argsFor(format, { ...opts, session })], { env: { ...env, ELECTRON_RUN_AS_NODE: "1" }, cwd: WORKDIR, stdio: ["ignore", "pipe", "pipe"] })
    : spawn(binPaths[id] ?? agent.bin, argsFor(id, { ...opts, session }), { env, cwd: WORKDIR, stdio: ["ignore", "pipe", "pipe"] });
  running.set(key, child);
  let buffer = "";
  let stderr = "";
  let blocked = false; // stopped by the OpenCode guard: that error is the only one shown
  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    if (!blocked) lines.forEach((l) => l.trim() && parseLine(format, session, l.trim(), emit, id));
  });
  child.stderr.on("data", (c) => {
    stderr = (stderr + c.toString("utf8")).slice(-2000);
    // OpenCode without its locked agent would run with its own tools: stop it right away
    if (id === "opencode" && !blocked && FALLBACK_LINE.test(stderr)) { blocked = true; emit({ type: "error", message: t.agents.opencodeUnsafe }); child.kill("SIGTERM"); }
  });
  child.on("error", (err) => emit({ type: "error", message: t.agents.cannotStart(AGENTS[id].bin, err.message) }));
  child.on("close", (code, signal) => {
    if (buffer.trim() && !blocked) parseLine(format, session, buffer.trim(), emit, id);
    if (blocked) { /* already said why */ } else if (signal) emit({ type: "error", message: t.agents.interrupted });
    else if (code !== 0 && code !== null) {
      const hint = /login|auth|sign in|unauthori/i.test(stderr) ? t.agents.loginHint : "";
      emit({ type: "error", message: t.agents.exitCode(code) + hint });
    }
    if (running.get(key) === child) running.delete(key); // a newer run may already own the key
    emit({ type: "done" });
  });
  return child;
}

module.exports = { detect, login, run, SIM, proxyEnvFor };
