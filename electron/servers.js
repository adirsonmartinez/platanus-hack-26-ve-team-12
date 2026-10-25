// Read-only list of the servers listening on a TCP port of this computer (spec/001-running-servers.md).
// Runs fixed system commands with execFile (no shell, absolute paths, timeout), so nothing coming from
// the page ends up in a command line. Never asks for admin rights: it lists what the user's account can see.
// Only the port, the process name and the address leave this file (no pid, command line or environment).

const { execFile, spawn } = require('node:child_process');
const path = require('node:path');

const TIMEOUT_MS = 5000;
const MAX_BUFFER = 4 * 1024 * 1024;
const MAX_SERVERS = 200;
const MAX_NAME = 64;

const LSOF = '/usr/sbin/lsof';
// +c 0: full command name; -nP: numeric hosts and ports (no DNS); -F: machine-readable fields
const LSOF_ARGS = ['+c', '0', '-nP', '-iTCP', '-sTCP:LISTEN', '-Fpcn'];

const listError = (code) => Object.assign(new Error(code), { code });

// Runs a system command. lsof exits with 1 when nothing matches: that is an empty list, not an error.
function runFile(file, args) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER, windowsHide: true, encoding: 'utf8' }, (err, stdout) => {
      if (!err) return resolve(stdout);
      if (err.code === 'ENOENT') return reject(listError('unavailable'));
      if (err.killed || err.signal) return reject(listError('timeout'));
      if (typeof err.code === 'number' && (stdout || err.code === 1)) return resolve(stdout ?? '');
      reject(listError('failed'));
    });
  });
}

// "127.0.0.1:5173", "*:8000", "[::1]:5432" -> { address, port }
function splitAddress(raw) {
  const at = raw.lastIndexOf(':');
  if (at < 0) return null;
  const port = Number(raw.slice(at + 1));
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { address: raw.slice(0, at).replace(/^\[(.*)\]$/, '$1'), port };
}

// lsof -F output: "p<pid>" starts a process, "c<command>" names it, "n<address:port>" is one socket
function parseLsof(stdout) {
  const entries = [];
  let pid = null;
  let name = null;
  for (const line of String(stdout).split('\n')) {
    const field = line[0];
    const value = line.slice(1).trim();
    if (field === 'p') { pid = Number(value); name = null; }
    else if (field === 'c') name = value || null;
    else if (field === 'n' && pid) {
      const at = splitAddress(value);
      if (at) entries.push({ pid, process: name, ...at });
    }
  }
  return entries;
}

// netstat -ano: the state column is translated ("LISTENING", "ESCUCHANDO"…), so a listening socket is
// recognized by its remote address with port 0 ("0.0.0.0:0", "[::]:0").
function parseNetstat(stdout) {
  const entries = [];
  for (const line of String(stdout).split(/\r?\n/)) {
    const m = /^\s*TCP\s+(\S+)\s+(\S+)\s+(?:\S+\s+)?(\d+)\s*$/i.exec(line);
    if (!m || !/:0$/.test(m[2])) continue;
    const at = splitAddress(m[1]);
    if (at) entries.push({ pid: Number(m[3]), process: null, ...at });
  }
  return entries;
}

// tasklist /FO CSV /NH: "image name","pid",… -> Map(pid -> name)
function parseTasklist(stdout) {
  const names = new Map();
  for (const line of String(stdout).split(/\r?\n/)) {
    const m = /^"([^"]*)","(\d+)"/.exec(line);
    if (m && m[1]) names.set(Number(m[2]), m[1]);
  }
  return names;
}

// Only loopback is private to this computer; "*", 0.0.0.0, :: and network IPs can be reached by others
function isLocalAddress(address) {
  const a = String(address).toLowerCase();
  return a === 'localhost' || a === '::1' || /^(::ffff:)?127(\.\d{1,3}){3}$/.test(a);
}

// One row per process and port (IPv4 + IPv6 together, with the widest exposure); exposed first, then by port.
// `paused`: pids that Qubbot paused; `managed`: pids that Qubbot started (Sets or Maps keyed by pid).
function toServers(entries, paused = new Set(), managed = new Set()) {
  const byKey = new Map();
  for (const e of entries) {
    const exposed = !isLocalAddress(e.address);
    const key = `${e.pid}:${e.port}`;
    const seen = byKey.get(key);
    if (seen && (seen.exposed || !exposed)) continue;
    byKey.set(key, {
      port: e.port,
      process: e.process ? String(e.process).slice(0, MAX_NAME) : null,
      address: String(e.address).slice(0, MAX_NAME),
      exposed,
      paused: paused.has(e.pid),
      managed: managed.has(e.pid),
    });
  }
  return [...byKey.values()]
    .sort((a, b) => Number(b.exposed) - Number(a.exposed) || a.port - b.port)
    .slice(0, MAX_SERVERS);
}

// Every listening socket with its pid (the pid stays in the main process). `run` and `systemRoot`: for tests.
async function readEntries({ platform = process.platform, run = runFile, systemRoot = process.env.SystemRoot || 'C:\\Windows' } = {}) {
  if (platform === 'darwin') return parseLsof(await run(LSOF, LSOF_ARGS));
  if (platform === 'win32') {
    const system32 = path.win32.join(systemRoot, 'System32');
    const [net, tasks] = await Promise.all([
      run(path.win32.join(system32, 'netstat.exe'), ['-ano']),
      run(path.win32.join(system32, 'tasklist.exe'), ['/FO', 'CSV', '/NH']).catch(() => ''), // names are optional
    ]);
    const names = parseTasklist(tasks);
    return parseNetstat(net).map((e) => ({ ...e, process: names.get(e.pid) ?? null }));
  }
  throw listError('unsupported');
}

// `paused`: the Map of pids Qubbot paused (pids that are gone are dropped from it); `managed`: pids it started.
// `onEntries(entries)`: the raw sockets with their pids, for the main process only.
async function listServers({ paused = new Map(), managed = new Set(), onEntries = () => {}, ...options } = {}) {
  const entries = await readEntries(options);
  const alive = new Set(entries.map((e) => e.pid));
  for (const pid of paused.keys()) if (!alive.has(pid)) paused.delete(pid);
  onEntries(entries);
  return toServers(entries, paused, managed);
}

const isPort = (port) => typeof port === 'number' && Number.isInteger(port) && port >= 1 && port <= 65535;

// --- Browsers: the default one, an installed one (by id) or an app the person picks in the system dialog ---

const MAC_BROWSERS = [
  ['safari', 'Safari', 'Safari.app'],
  ['chrome', 'Google Chrome', 'Google Chrome.app'],
  ['firefox', 'Firefox', 'Firefox.app'],
  ['edge', 'Microsoft Edge', 'Microsoft Edge.app'],
  ['brave', 'Brave', 'Brave Browser.app'],
  ['arc', 'Arc', 'Arc.app'],
  ['opera', 'Opera', 'Opera.app'],
  ['vivaldi', 'Vivaldi', 'Vivaldi.app'],
  ['chromium', 'Chromium', 'Chromium.app'],
];

// [id, name, [env folder, path inside it]…]
const WIN_BROWSERS = [
  ['chrome', 'Google Chrome', [['ProgramFiles', 'Google\\Chrome\\Application\\chrome.exe'], ['ProgramFiles(x86)', 'Google\\Chrome\\Application\\chrome.exe'], ['LOCALAPPDATA', 'Google\\Chrome\\Application\\chrome.exe']]],
  ['edge', 'Microsoft Edge', [['ProgramFiles(x86)', 'Microsoft\\Edge\\Application\\msedge.exe'], ['ProgramFiles', 'Microsoft\\Edge\\Application\\msedge.exe']]],
  ['firefox', 'Firefox', [['ProgramFiles', 'Mozilla Firefox\\firefox.exe'], ['ProgramFiles(x86)', 'Mozilla Firefox\\firefox.exe']]],
  ['brave', 'Brave', [['ProgramFiles', 'BraveSoftware\\Brave-Browser\\Application\\brave.exe'], ['LOCALAPPDATA', 'BraveSoftware\\Brave-Browser\\Application\\brave.exe']]],
  ['opera', 'Opera', [['LOCALAPPDATA', 'Programs\\Opera\\opera.exe']]],
  ['vivaldi', 'Vivaldi', [['LOCALAPPDATA', 'Vivaldi\\Application\\vivaldi.exe']]],
];

// Installed browsers: [{ id, name, path }]. Only { id, name } is sent to the page.
function detectBrowsers({ platform = process.platform, exists, home = require('node:os').homedir(), env = process.env } = {}) {
  const found = [];
  if (platform === 'darwin') {
    for (const [id, name, app] of MAC_BROWSERS) {
      const where = [path.posix.join('/Applications', app), path.posix.join(home, 'Applications', app)].find(exists);
      if (where) found.push({ id, name, path: where });
    }
  } else if (platform === 'win32') {
    for (const [id, name, places] of WIN_BROWSERS) {
      const where = places.filter(([base]) => env[base]).map(([base, rel]) => path.win32.join(env[base], rel)).find(exists);
      if (where) found.push({ id, name, path: where });
    }
  }
  return found;
}

function isAppPath(platform, file) {
  if (typeof file !== 'string') return false;
  if (platform === 'darwin') return path.posix.isAbsolute(file) && /\.app\/?$/i.test(file);
  if (platform === 'win32') return path.win32.isAbsolute(file) && /\.exe$/i.test(file);
  return false;
}

// Fixed program and the URL as its own argument (no shell)
function launchCommand(platform, app, url) {
  return platform === 'darwin' ? ['/usr/bin/open', ['-a', app, url]] : [app, [url]];
}

// Starts the browser and lets it run on its own. macOS: `open -a` returns at once and fails if the app is
// missing. Windows: the browser is started detached, so closing Qubbot does not close it.
function launchApp(app, url, platform = process.platform) {
  const [file, args] = launchCommand(platform, app, url);
  return new Promise((resolve, reject) => {
    if (platform === 'darwin') {
      execFile(file, args, { timeout: 10_000 }, (err) => (err ? reject(listError('launchFailed')) : resolve()));
      return;
    }
    const child = spawn(file, args, { detached: true, stdio: 'ignore' });
    child.once('error', () => reject(listError('launchFailed')));
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}

// Opens a local server. The URL is built here: fixed scheme and host, and a port that must be an integer
// between 1 and 65535. The page sends only the port and a browser id ('default', 'other' or an installed one).
async function openServer(port, { browser = 'default', openExternal, launch, pickApp, findBrowsers }) {
  if (!isPort(port)) throw listError('invalidPort');
  const url = `http://localhost:${port}`;
  if (browser === 'default') {
    await openExternal(url);
  } else if (browser === 'other') {
    const app = await pickApp();
    if (!app) throw listError('cancelled');
    await launch(app, url);
  } else {
    const found = typeof browser === 'string' && findBrowsers().find((b) => b.id === browser);
    if (!found) throw listError('unknownBrowser');
    await launch(found.path, url);
  }
  return url;
}

// --- Stopping a server ---

const SYSTEM_PIDS = new Set([0, 1, 4]); // idle, launchd / init, Windows System

const targetsOn = (entries, port) => [...new Map(entries.filter((e) => e.port === port).map((e) => [e.pid, { pid: e.pid, process: e.process }])).values()];

const signalError = (err, fallback) => listError(err?.code === 'EPERM' ? 'notAllowed' : err?.code === 'ESRCH' ? 'notRunning' : fallback);

// The processes on a port that Qubbot may touch: never itself nor a system process
async function touchableTargets(port, read, ownPid) {
  if (!isPort(port)) throw listError('invalidPort');
  const targets = targetsOn(await read(), port);
  if (!targets.length) throw listError('notRunning');
  if (targets.some((x) => x.pid === ownPid || SYSTEM_PIDS.has(x.pid))) throw listError('protected');
  return targets;
}

// SIGTERM lets the program close cleanly. A paused process only receives it once it continues, so it is
// continued right after (Windows: process.kill terminates it, paused or not).
function terminate(pid, { platform = process.platform, paused = new Map(), kill = process.kill.bind(process) } = {}) {
  kill(pid, 'SIGTERM');
  if (paused.has(pid)) {
    if (platform !== 'win32') kill(pid, 'SIGCONT');
    paused.delete(pid);
  }
}

// The pid is found here from the port (the page never sends one). Asks the person, then reads the list
// again and only stops the processes that still listen on that port, so a reused pid is never hit.
// `capture(pid)`: reads how to reopen it (command and folder) before it is gone.
async function stopServer(port, { read = readEntries, confirm, kill = (pid) => terminate(pid), capture = async () => null, ownPid = process.pid }) {
  const targets = await touchableTargets(port, read, ownPid);
  if (!(await confirm(targets, port))) throw listError('stopRejected');

  const asked = new Set(targets.map((x) => x.pid));
  const still = targetsOn(await read(), port).filter((x) => asked.has(x.pid));
  if (!still.length) throw listError('notRunning');
  const stopped = [];
  for (const { pid, process: name } of still) {
    const restart = await capture(pid).catch(() => null);
    try {
      kill(pid);
    } catch (err) {
      throw signalError(err, 'stopFailed');
    }
    stopped.push({ pid, port, process: name, restart });
  }
  return { port, processes: still.map((x) => x.process).filter(Boolean), stopped };
}

// --- Pause and resume: the same process is frozen (SIGSTOP / NtSuspendProcess) and continues as it was ---

const PS_SIGNAL = (fn, pid) => [
  "$ErrorActionPreference='Stop'",
  "Add-Type -Namespace Qubbot -Name Proc -MemberDefinition '[DllImport(\"ntdll.dll\")] public static extern int NtSuspendProcess(IntPtr h); [DllImport(\"ntdll.dll\")] public static extern int NtResumeProcess(IntPtr h);'",
  `$p = Get-Process -Id ${pid}`,
  `if ([Qubbot.Proc]::${fn}($p.Handle) -ne 0) { exit 3 }`,
].join('; ');

// action: 'pause' | 'resume'. The pid is an integer checked here; the PowerShell script is fixed.
function signalProcess(pid, action, { platform = process.platform, systemRoot = process.env.SystemRoot || 'C:\\Windows' } = {}) {
  if (!Number.isInteger(pid) || pid <= 0) return Promise.reject(listError('invalidPid'));
  if (platform !== 'win32') {
    try {
      process.kill(pid, action === 'pause' ? 'SIGSTOP' : 'SIGCONT');
      return Promise.resolve();
    } catch (err) {
      return Promise.reject(err);
    }
  }
  const [ps, args] = powershellSignal(pid, action, systemRoot);
  return new Promise((resolve, reject) => {
    execFile(ps, args, { timeout: TIMEOUT_MS, windowsHide: true }, (err) => (err ? reject(listError('pauseFailed')) : resolve()));
  });
}

function powershellSignal(pid, action, systemRoot) {
  const ps = path.win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  return [ps, ['-NoProfile', '-NonInteractive', '-Command', PS_SIGNAL(action === 'pause' ? 'NtSuspendProcess' : 'NtResumeProcess', pid)]];
}

// No dialog: pausing is undone with "Reanudar", and Qubbot resumes everything it paused when it quits
async function pauseServer(port, { read = readEntries, signal = signalProcess, paused, ownPid = process.pid }) {
  const targets = await touchableTargets(port, read, ownPid);
  for (const { pid } of targets) {
    try {
      await signal(pid, 'pause');
    } catch (err) {
      throw signalError(err, 'pauseFailed');
    }
    paused.set(pid, { port });
  }
  return { port, processes: targets.map((x) => x.process).filter(Boolean) };
}

// Only processes that Qubbot itself paused on that port
async function resumeServer(port, { read = readEntries, signal = signalProcess, paused }) {
  if (!isPort(port)) throw listError('invalidPort');
  const targets = targetsOn(await read(), port).filter((x) => paused.has(x.pid));
  if (!targets.length) throw listError('notPaused');
  for (const { pid } of targets) {
    try {
      await signal(pid, 'resume');
    } catch (err) {
      throw signalError(err, 'pauseFailed');
    }
    paused.delete(pid);
  }
  return { port, processes: targets.map((x) => x.process).filter(Boolean) };
}

// Called when Qubbot quits: nothing stays frozen. On Windows the resume runs detached, so it finishes
// even though Qubbot is closing.
function resumeAll(paused, { platform = process.platform, systemRoot = process.env.SystemRoot || 'C:\\Windows' } = {}) {
  for (const pid of paused.keys()) {
    if (platform === 'win32') {
      const [ps, args] = powershellSignal(pid, 'resume', systemRoot);
      try { spawn(ps, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref(); } catch { /* best effort */ }
    } else {
      try { process.kill(pid, 'SIGCONT'); } catch { /* already gone */ }
    }
  }
  paused.clear();
}

// --- Stop, then reactivate inside Qubbot (macOS) ---
// A reactivated server is a child of Qubbot: no Terminal window, its output is kept here and shown in
// the app, and it stops when Qubbot quits (a hidden server left listening would be a risk).

const MAX_COMMAND = 2000;

// How to start it again: its command line (ps) and its working folder (lsof). Windows does not expose the
// folder of another process, so it cannot be reactivated there yet.
async function captureRestart(pid, { platform = process.platform, run = runFile } = {}) {
  if (platform !== 'darwin' || !Number.isInteger(pid) || pid <= 0) return null;
  const command = (await run('/bin/ps', ['-ww', '-o', 'command=', '-p', String(pid)])).trim();
  const cwdOut = await run(LSOF, ['-a', '-p', String(pid), '-d', 'cwd', '-Fn']);
  const cwd = (cwdOut.split('\n').find((l) => l.startsWith('n')) ?? '').slice(1).trim();
  if (!command || !cwd || command.length > MAX_COMMAND) return null;
  return { command, cwd };
}

// The user's login shell (zsh or bash, so PATH, nvm, pyenv… are the ones of their terminal) runs a fixed
// script, `exec "$@"`, and the command words go as separate arguments: nothing in them ($, ;, |, backticks)
// is read as shell code, and exec makes the server itself the child of Qubbot.
function managedLaunch(command, cwd, { shell = process.env.SHELL } = {}) {
  const file = /^\/bin\/bash$/.test(String(shell)) ? '/bin/bash' : '/bin/zsh';
  const words = String(command).trim().split(/\s+/);
  return [file, ['-l', '-c', 'exec "$@"', 'platanus', ...words], { cwd, stdio: ['ignore', 'pipe', 'pipe'], detached: false }];
}

const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07/g;
const OUTPUT_LINES = 300;

// Last lines of a server's output, without terminal colors
function createOutputBuffer(maxLines = OUTPUT_LINES) {
  const lines = [];
  let partial = '';
  return {
    push(chunk) {
      const parts = (partial + String(chunk).replace(ANSI, '').replace(/\r\n?/g, '\n')).split('\n');
      partial = parts.pop();
      lines.push(...parts.map((l) => l.slice(0, 1000)));
      if (lines.length > maxLines) lines.splice(0, lines.length - maxLines);
    },
    text() {
      return [...lines, ...(partial ? [partial] : [])].slice(-maxLines).join('\n');
    },
  };
}

// The servers Qubbot started. onExit(entry, { code, signal, expected, output }) runs once per process;
// `expected` is true when Qubbot itself stopped it.
function createManagedServers({ spawn: spawnFn = spawn, shell = process.env.SHELL, onExit }) {
  const running = new Map(); // pid -> { pid, port, process, restart, output, expected }
  return {
    start({ port, process: name, restart }) {
      const [file, args, opts] = managedLaunch(restart.command, restart.cwd, { shell });
      const child = spawnFn(file, args, opts);
      if (!child?.pid) throw listError('startFailed');
      const entry = { pid: child.pid, port, process: name, restart, output: createOutputBuffer(), expected: false };
      running.set(child.pid, entry);
      child.stdout?.on('data', (c) => entry.output.push(c));
      child.stderr?.on('data', (c) => entry.output.push(c));
      let done = false;
      const finish = (code, signal) => {
        if (done) return;
        done = true;
        running.delete(entry.pid);
        onExit(entry, { code: code ?? null, signal: signal ?? null, expected: entry.expected, output: entry.output.text() });
      };
      child.on('error', (err) => { entry.output.push(`\n${err?.message ?? err}\n`); finish(null, null); });
      child.on('exit', finish);
      return child.pid;
    },
    has: (pid) => running.has(pid),
    pids: () => new Set(running.keys()),
    restartInfo: (pid) => running.get(pid)?.restart ?? null,
    output: (pid) => running.get(pid)?.output.text() ?? null,
    pidOnPort: (port) => [...running.values()].find((e) => e.port === port)?.pid ?? null,
    markExpected(pid) {
      const entry = running.get(pid);
      if (entry) entry.expected = true;
    },
    stopAll(kill = process.kill.bind(process)) {
      for (const entry of running.values()) {
        entry.expected = true;
        try { kill(entry.pid, 'SIGTERM'); } catch { /* already gone */ }
      }
    },
  };
}

const SECRET_NAME = /(pass(word|wd)?|token|secret|api[-_]?key|auth|credential|private[-_]?key)/i;

// For the dialog: values of secret-looking flags and VARIABLE=value pairs are hidden
function maskSecrets(command) {
  const words = String(command).split(' ');
  return words.map((w, i) => {
    const eq = w.indexOf('=');
    if (eq > 0 && SECRET_NAME.test(w.slice(0, eq))) return `${w.slice(0, eq)}=••••`;
    const prev = words[i - 1] ?? '';
    if (/^--?[\w-]+$/.test(prev) && SECRET_NAME.test(prev) && !w.startsWith('-')) return '••••';
    return w;
  }).join(' ');
}

const STOPPED_MAX = 20;
const STOPPED_ID = /^[a-f0-9]{16}$/;
const STATES = new Set(['stopped', 'starting', 'exited']);

// Servers stopped from Qubbot (or started by it and closed) in this session. The command, folder and
// output stay here; the page gets { id, port, process, canRestart, state, exitCode, hasOutput, at } and
// sends back only the id. state: 'stopped' | 'starting' (reactivated, not listening yet) | 'exited' (closed on its own).
function createStoppedRegistry({ newId = () => require('node:crypto').randomBytes(8).toString('hex'), now = Date.now } = {}) {
  const rows = new Map();
  const sameServer = (a, b) => a.port === b.port && (a.restart?.command ?? a.process) === (b.restart?.command ?? b.process);
  const valid = (id) => typeof id === 'string' && STOPPED_ID.test(id);
  return {
    add({ port, process: name, restart = null, state = 'stopped', exitCode = null, output = null }) {
      const entry = { port, process: name ?? null, restart, state: STATES.has(state) ? state : 'stopped', exitCode, output, pid: null };
      for (const [id, row] of rows) if (row.state !== 'starting' && sameServer(row, entry)) rows.delete(id);
      const id = newId();
      rows.set(id, { ...entry, id, at: now() });
      while (rows.size > STOPPED_MAX) rows.delete(rows.keys().next().value);
      return id;
    },
    update(id, patch) {
      const row = valid(id) ? rows.get(id) : null;
      if (row) rows.set(id, { ...row, ...patch, at: patch.at ?? row.at });
    },
    list() {
      return [...rows.values()].reverse().map((r) => ({
        id: r.id, port: r.port, process: r.process, canRestart: Boolean(r.restart), state: r.state,
        exitCode: Number.isInteger(r.exitCode) ? r.exitCode : null, hasOutput: Boolean(r.output), at: r.at,
      }));
    },
    get: (id) => (valid(id) ? rows.get(id) ?? null : null),
    findByPid: (pid) => [...rows.values()].find((r) => r.pid === pid) ?? null,
    starting: () => [...rows.values()].filter((r) => r.state === 'starting'),
    forget: (id) => valid(id) && rows.delete(id),
  };
}

// A reactivated server leaves "Detenidos" as soon as something listens on its port: the port was free when
// it started, and some servers listen from a process they spawn (so the pid may differ). If it was not
// ours after all, our process closes with "address in use" and comes back as "exited" with that output.
function reconcileStarting(registry, entries) {
  for (const row of registry.starting()) {
    if (entries.some((e) => e.port === row.port)) registry.forget(row.id);
  }
}

// Asks first (the dialog shows the folder and the command, secrets hidden), then starts it inside Qubbot.
// The row stays as "starting" until the server listens (reconcileStarting) or closes (it turns "exited").
async function restartServer(id, { registry, confirm, start, isPortBusy, platform = process.platform }) {
  const row = registry.get(id);
  if (!row) throw listError('unknownStopped');
  if (!row.restart || platform !== 'darwin') throw listError('cannotRestart');
  if (row.state === 'starting') throw listError('alreadyStarting');
  if (await isPortBusy(row.port)) throw listError('portInUse');
  if (!(await confirm({ port: row.port, process: row.process, command: row.restart.command, cwd: row.restart.cwd }))) throw listError('restartRejected');
  const pid = start(row);
  registry.update(id, { state: 'starting', pid, exitCode: null, output: null });
  return { port: row.port, process: row.process };
}

module.exports = {
  listServers, readEntries, openServer, stopServer, detectBrowsers, launchCommand, launchApp, isAppPath, runFile,
  pauseServer, resumeServer, resumeAll, terminate, signalProcess,
  captureRestart, maskSecrets, createStoppedRegistry, restartServer, reconcileStarting,
  managedLaunch, createOutputBuffer, createManagedServers,
  parseLsof, parseNetstat, parseTasklist, isLocalAddress, toServers, MAX_SERVERS,
};
