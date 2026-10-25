// "Iniciar sesión con ElevenLabs" (docs/features/llamada/VOZ.md): runs ElevenLabs' own CLI, which opens
// the browser so the person signs in (or creates an account) and presses Authorize. The CLI writes an API
// key to an env file in a private temporary folder; it is read once, saved in the keychain (saveKey →
// keyStore.set('elevenlabs', key)) and the file and folder are deleted, also when anything fails.
// The CLI's output is never logged whole: only its key_status and next fields.
// Tested in elevenlabsLogin.test.js with a fake spawn (no network, no CLI).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseEnv } = require('node:util');
const childProcess = require('node:child_process');

const TIMEOUT_MS = 5 * 60 * 1000; // the person may need to create an account first
const KILL_GRACE_MS = 3000; // after a cancel or a timeout, how long the CLI gets to close before cleanup
const MAX_OUTPUT = 64 * 1024; // only to find the CLI's JSON status: anything longer is cut
const DIR_PREFIX = 'elevenlabs-login-';
const ENV_FILE = 'elevenlabs-login.env';

const isWindows = process.platform === 'win32';
// Electron opened from Finder or the Dock gets launchd's short PATH: npx (and the node its first line asks
// for) from Homebrew or ~/.local would not be found, and the login would always answer no-node (agents.js)
const EXTRA_PATH = [path.join(os.homedir(), '.local/bin'), '/opt/homebrew/bin', '/usr/local/bin'];

// Folders a crash or a quit left behind (the process died before its finally); they may hold a key
async function sweepLogins(dir) {
  try {
    for (const name of await fs.promises.readdir(dir)) {
      if (name.startsWith(DIR_PREFIX)) await fs.promises.rm(path.join(dir, name), { recursive: true, force: true });
    }
  } catch { /* nothing to sweep */ }
}

// On POSIX the CLI runs in its own process group (detached), so a signal reaches the node that npx starts
// too, not only npx; elsewhere, or without a pid (tests), only the child
function signalTree(child, signal, killGroup) {
  if (!isWindows && child.pid) {
    try { killGroup(child.pid, signal); return; } catch { /* the group is gone: try the child alone */ }
  }
  try { child.kill(signal); } catch { /* already gone */ }
}
const defaultKillGroup = (pid, signal) => process.kill(-pid, signal);

// The CLI's status fields from its --format json output (the last JSON object that has them), nothing else
function statusOf(output) {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.startsWith('{'));
  for (const line of [...lines.reverse(), output.trim()]) {
    try {
      const data = JSON.parse(line);
      if (data && typeof data === 'object' && ('key_status' in data || 'next' in data)) {
        const pick = (value) => (typeof value === 'string' ? value.slice(0, 80) : undefined);
        return { key_status: pick(data.key_status), next: pick(data.next) };
      }
    } catch { /* not JSON */ }
  }
  return {};
}

// dir: a folder of the app (userData) where the private temporary folder is made.
// spawn: child_process.spawn, injectable for the tests. saveKey(key) -> Promise<{ ok, last4, reason? }>.
// log(info): receives only { key_status, next } and the result's reason, never the output or the key.
// killGroup(pid, signal): process.kill on the CLI's process group, injectable for the tests.
function createElevenLabsLogin({ dir, spawn = childProcess.spawn, saveKey, timeoutMs = TIMEOUT_MS, killGraceMs = KILL_GRACE_MS, log = () => {}, env = process.env, killGroup = defaultKillGroup }) {
  let running = null; // { promise, state }

  const sweep = () => sweepLogins(dir);

  async function run(state) {
    let folder = null;
    try {
      await fs.promises.mkdir(dir, { recursive: true });
      await sweep();
      folder = await fs.promises.mkdtemp(path.join(dir, DIR_PREFIX));
      state.folder = folder;
      await fs.promises.chmod(folder, 0o700);
      const envPath = path.join(folder, ENV_FILE);
      if (state.cancelled) return { ok: false, reason: 'cancelled' };

      // The CLI must log in for real, not reuse a key the environment already has
      const childEnv = { ...env };
      delete childEnv.ELEVENLABS_API_KEY;
      if (!isWindows) childEnv.PATH = [...EXTRA_PATH, env.PATH || ''].join(path.delimiter);
      const args = ['-y', '@elevenlabs/cli@latest', 'onboard', 'connect', '--env-path', isWindows ? `"${envPath}"` : envPath, '--via', 'platanus/1.0', '--format', 'json'];
      // npx is a .cmd on Windows: it needs the shell there (the only argument with spaces is quoted)
      // detached on POSIX: its own process group, so stopping it also stops the node npx starts
      const child = spawn(isWindows ? 'npx.cmd' : 'npx', args, { env: childEnv, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, shell: isWindows, detached: !isWindows });
      state.child = child;

      let output = '';
      const keep = (chunk) => { if (output.length < MAX_OUTPUT) output += String(chunk).slice(0, MAX_OUTPUT - output.length); };
      child.stdout?.on('data', keep);
      child.stderr?.on('data', () => {}); // drained, never kept: it may echo anything

      const ended = await new Promise((resolve) => {
        let done = false;
        let grace = null;
        const finish = (value) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          clearTimeout(grace);
          resolve(value);
        };
        const stop = (why) => {
          if (done || state.stopped) return;
          state.stopped = why;
          signalTree(child, 'SIGTERM', killGroup);
          // a CLI that ignores SIGTERM is killed for real before its folder is deleted: alive, it could still
          // write the key file after the cleanup if the person authorizes in the open tab
          grace = setTimeout(() => {
            signalTree(child, 'SIGKILL', killGroup);
            finish({ stopped: why });
          }, killGraceMs);
        };
        const timer = setTimeout(() => stop('timeout'), timeoutMs);
        state.stop = stop;
        if (state.cancelled) stop('cancelled');
        child.on('error', (error) => finish({ error }));
        child.on('close', (code) => finish({ code }));
      });

      log(statusOf(output));
      if (state.stopped) return { ok: false, reason: state.stopped };
      if (ended.error) return { ok: false, reason: ended.error.code === 'ENOENT' ? 'no-node' : 'failed' };

      // The CLI's exit code is not trusted either way: what counts is a key in the file
      let key = null;
      try { key = parseEnv(await fs.promises.readFile(envPath, 'utf8')).ELEVENLABS_API_KEY ?? null; } catch { key = null; }
      if (typeof key !== 'string' || !key.trim()) return { ok: false, reason: 'failed' };
      const saved = await saveKey(key.trim());
      key = null;
      if (!saved?.ok) return { ok: false, reason: 'failed' };
      return { ok: true, last4: saved.last4, ...(saved.reason ? { reason: saved.reason } : {}) };
    } catch {
      return { ok: false, reason: 'failed' };
    } finally {
      // the file holds a key: it never outlives the login
      if (folder) {
        try { await fs.promises.rm(path.join(folder, ENV_FILE), { force: true }); } catch { /* removed with the folder below */ }
        try { await fs.promises.rm(folder, { recursive: true, force: true }); } catch { /* swept on the next login */ }
      }
    }
  }

  return {
    // -> { ok: true, last4, reason?: 'weak-keychain' } | { ok: false, reason: 'cancelled' | 'timeout' | 'no-node' | 'failed' }
    // A second login while one runs gets the same answer (one browser tab, one CLI).
    login() {
      if (running) return running.promise;
      const state = { cancelled: false, stopped: null, child: null, stop: null };
      const promise = run(state).then((result) => {
        log({ reason: result.ok ? 'ok' : result.reason });
        return result;
      }).finally(() => { running = null; });
      running = { promise, state };
      return promise;
    },
    // Stops the running login (the CLI is killed); its login() answers { ok: false, reason: 'cancelled' }
    cancel() {
      if (!running) return { ok: true };
      const { state } = running;
      state.cancelled = true;
      state.stop?.('cancelled');
      return { ok: true };
    },
    // Qubbot is quitting: no time for a grace period or an async cleanup. The CLI is killed at once and
    // its folder removed synchronously (anything left is swept at the next start)
    quit() {
      if (!running) return;
      const { state } = running;
      state.cancelled = true;
      state.stopped ??= 'cancelled';
      if (state.child) signalTree(state.child, 'SIGKILL', killGroup);
      if (state.folder) {
        try { fs.rmSync(state.folder, { recursive: true, force: true }); } catch { /* swept at the next start */ }
      }
    },
    sweep,
  };
}

module.exports = { createElevenLabsLogin, sweepLogins, statusOf, TIMEOUT_MS };
