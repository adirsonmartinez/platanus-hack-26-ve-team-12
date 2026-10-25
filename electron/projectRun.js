// Starting the open project from a call with Qubi (ejecutar_app, docs/features/llamada/MEJORAS.md §2).
// Only the project's own `dev` or `start` script of a package.json (root, apps/*, packages/*), chosen by its
// id from the list made here: the window never sends a command. Main shows its own native dialog first,
// then the script runs as a server managed by Qubbot (servers.js createManagedServers: no Terminal
// window, stopped when Qubbot quits), and the new listening port is found in the list of servers.
// A project whose dependencies were never installed (a new one the agent just made) gets `npm install`
// (or the tool of its lockfile) first, announced in the same dialog.
// Tested in projectRun.test.js.
const fsp = require('node:fs/promises');
const path = require('node:path');
const childProcess = require('node:child_process');

const SCRIPTS = ['dev', 'start']; // the first one present is the one offered
const WORKSPACE_DIRS = ['apps', 'packages'];
const MAX_WORKSPACES = 40;
const WAIT_MS = 20_000; // a first `next dev` can take a while to listen
const POLL_MS = 500;

async function defaultReaddir(dir) {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort(); // links are not followed
}
const defaultReadFile = (file) => fsp.readFile(file, 'utf8');

const BODY_MAX = 300; // enough to judge it in the dialog, never a wall of text

// -> [{ id, cwd, script, command, body }]; cwd is relative to the project ('.' for its root).
// body is what the script really runs: main shows it in the native dialog (an agent can rewrite
// package.json, so `npm run dev` alone says nothing), and it never goes to the window.
async function scriptsFor(root, { readFile = defaultReadFile, readdir = defaultReaddir } = {}) {
  const folders = ['.'];
  for (const dir of WORKSPACE_DIRS) {
    const names = await readdir(path.join(root, dir)).catch(() => []);
    for (const name of names.slice(0, MAX_WORKSPACES)) folders.push(`${dir}/${name}`);
  }
  const list = [];
  for (const cwd of folders) {
    let pkg;
    try {
      pkg = JSON.parse(await readFile(path.join(root, cwd, 'package.json')));
    } catch {
      continue;
    }
    const script = SCRIPTS.find((name) => typeof pkg?.scripts?.[name] === 'string' && pkg.scripts[name].trim());
    if (script) {
      const body = pkg.scripts[script].trim().slice(0, BODY_MAX);
      list.push({ id: `${cwd}:${script}`, cwd, script, command: `npm run ${script}`, body });
    }
  }
  return list;
}

const exists = (file) => fsp.access(file).then(() => true, () => false);
const LOCKFILES = [['pnpm-lock.yaml', 'pnpm'], ['yarn.lock', 'yarn'], ['bun.lockb', 'bun'], ['bun.lock', 'bun']];
const INSTALL_MS = 5 * 60_000; // a first install can take a few minutes

// -> { cwd, command } of the install a script in `cwd` needs, or null when its dependencies are there.
// A folder of a workspace installs from the root (when the root has a package.json); the root's
// node_modules counts for it. The lockfile picks the package manager (npm when there is none).
async function installFor(root, cwd, { has = exists } = {}) {
  const at = cwd !== '.' && (await has(path.join(root, 'package.json'))) ? '.' : cwd;
  if (await has(path.join(root, at, 'node_modules'))) return null;
  if (await has(path.join(root, cwd, 'node_modules'))) return null;
  let tool = 'npm';
  for (const [file, name] of LOCKFILES) if (await has(path.join(root, at, file))) { tool = name; break; }
  return { cwd: at, command: `${tool} install` };
}

// The install itself: the same login shell as the managed servers (the person's PATH, nvm…), the words as
// arguments (no shell code), without the app's secrets in its environment. -> true when it finished well
function defaultInstall({ root, cwd, command }) {
  const { managedLaunch } = require('./servers');
  const { cleanEnv } = require('./commandRun');
  return new Promise((resolve) => {
    const [file, args, opts] = managedLaunch(command, path.join(root, cwd));
    let child;
    try {
      child = childProcess.spawn(file, args, { ...opts, env: cleanEnv() });
    } catch {
      resolve(false);
      return;
    }
    child.stdout?.resume();
    child.stderr?.resume();
    const timer = setTimeout(() => child.kill('SIGTERM'), INSTALL_MS);
    child.on('error', () => {});
    child.on('close', (code) => { clearTimeout(timer); resolve(code === 0); });
  });
}

const fail = (reason) => ({ ok: false, reason });

// managed: createManagedServers() of main; readEntries: servers.readEntries (listening sockets with pids);
// confirm(choice) -> Promise<boolean>, the native dialog (choice carries body, the script's real command).
function createProjectRun({
  managed, readEntries, confirm, install = defaultInstall,
  platform = process.platform, sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  waitMs = WAIT_MS, pollMs = POLL_MS, readFile, readdir,
}) {
  let busy = false;
  const running = new Map(); // `${root}\n${id}` -> { pid, port }
  const ports = new Map(); // pid -> port found

  const listening = async () => new Set((await readEntries().catch(() => [])).map((e) => e.port));

  // The lowest port that was not listening before; null if none in time; 'exited' if the process closed
  async function newPort(pid, before) {
    for (let i = 0; i < Math.ceil(waitMs / pollMs); i += 1) {
      await sleep(pollMs);
      const fresh = [...(await listening())].filter((port) => !before.has(port)).sort((a, b) => a - b);
      if (fresh.length) return fresh[0];
      if (!managed.has(pid)) return 'exited';
    }
    return null;
  }

  return {
    // for the window (run:scripts): without body, which only main's dialog needs
    scripts: async (root) => (root ? (await scriptsFor(root, { readFile, readdir })).map(({ body, ...rest }) => rest) : []),
    portOf: (pid) => ports.get(pid) ?? null,
    // -> { ok: true, port: number | null }
    //  | { ok: false, reason: 'noProject' | 'noScript' | 'invalid' | 'busy' | 'rejected' | 'installFailed' | 'failed' }
    async start(root, id) {
      if (!root) return fail('noProject');
      if (busy) return fail('busy');
      busy = true;
      try {
        const list = await scriptsFor(root, { readFile, readdir });
        if (!list.length) return fail('noScript');
        const choice = typeof id === 'string' ? list.find((s) => s.id === id) : null;
        if (!choice) return fail('invalid');
        const key = `${root}\n${choice.id}`;
        const already = running.get(key);
        if (already && managed.has(already.pid)) return { ok: true, port: already.port };
        // managed servers start through the login shell (macOS); Windows is not supported yet
        if (platform !== 'darwin') return fail('failed');
        const needs = await installFor(root, choice.cwd);
        if (!(await confirm({ ...choice, install: needs }))) return fail('rejected');
        if (needs && !(await install({ root, ...needs }))) return fail('installFailed');
        const before = await listening();
        let pid;
        try {
          pid = managed.start({ port: null, process: 'npm', restart: { command: choice.command, cwd: path.join(root, choice.cwd) } });
        } catch {
          return fail('failed');
        }
        running.set(key, { pid, port: null });
        const port = await newPort(pid, before);
        if (port === 'exited') {
          running.delete(key);
          return fail('failed');
        }
        running.set(key, { pid, port });
        if (port) ports.set(pid, port);
        return { ok: true, port };
      } finally {
        busy = false;
      }
    },
  };
}

module.exports = { scriptsFor, installFor, createProjectRun, SCRIPTS };
