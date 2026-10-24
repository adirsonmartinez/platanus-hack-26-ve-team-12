// Electron main process: creates the window and is the only part that touches the disk.
// The window (renderer) asks for things over IPC and they are validated here before running.

const { app, BrowserWindow, ipcMain, dialog, Menu, shell, safeStorage, systemPreferences, session: electronSession } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs/promises');
const { existsSync } = require('node:fs');
const { Workspace } = require('./workspace');
const { readGitHistory, planCommit, gitCommit, gitRevert, gitReset, gitCreateBranch, gitCheckout, gitShowShort, gitInit } = require('./git');
const t = require('./strings');
const agents = require('./agents');
const { loadVoice, composePrompt, composeRefinePrompt, composeTourPrompt } = require('./agentVoice');
const { approvalMode, needsApproval } = require('./approval');
const { canOpen } = require('./fileOpen');
const { lineDiff } = require('./lineDiff');
const { createKeyStore } = require('./keyStore');

const AGENT_DIR = path.join(__dirname, '..', 'agent'); // voice.json + skills (packaged with the app)
// Agent conversations: the chat, Remi's repairs, and "Mejorar mi mensaje" (never continued)
const SESSIONS = ['chat', 'repair', 'refine', 'tour'];
const { startMcpServer, MAX_READ_BYTES, isBlockedPath, isBlockedRealPath } = require('./mcpServer');
const servers = require('./servers');

const workspace = new Workspace();
const audit = []; // log of everything done on disk
let win = null;
let mcp = { url: null, running: false }; // local MCP server for the user's agent

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: t.windowTitle,
    backgroundColor: '#0a0b0f',
    // macOS: integrated title bar; the window buttons sit inside the app's 44px title bar
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 15 } } : {}),
    // Windows/Linux: the app draws its own menus in the title bar; the native bar stays hidden
    // (its shortcuts keep working)
    autoHideMenuBar: process.platform !== 'darwin',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, // the page sees neither Node nor Electron, only what preload exposes
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // PLATANUS_DEMO=1 (development only): recording mode for the product video (scripts/demo/)
  const demo = process.env.PLATANUS_DEMO === '1' && !app.isPackaged;
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'), demo ? { query: { demo: '1' } } : {});
  if (process.argv.includes('--dev')) win.webContents.openDevTools({ mode: 'detach' });

  // External links never open new windows inside the app
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.session.setPermissionRequestHandler(allowPermission);
}

// The page only gets the copy button's clipboard and the camera (video only, never the microphone) for the
// hand gestures, and only for the app's own page; everything else is denied. macOS asks the person first.
const RENDERER_URL = `${pathToFileURL(path.join(__dirname, '..', 'renderer')).href}/`;
async function allowPermission(contents, permission, callback, details) {
  const own = contents === win?.webContents && (details.requestingUrl ?? '').startsWith(RENDERER_URL);
  if (own && permission === 'clipboard-sanitized-write') return callback(true);
  const videoOnly = permission === 'media' && details.mediaTypes?.length && details.mediaTypes.every((type) => type === 'video');
  if (!own || !videoOnly) return callback(false);
  if (process.platform === 'darwin' && systemPreferences.getMediaAccessStatus('camera') !== 'granted') {
    return callback(await systemPreferences.askForMediaAccess('camera').catch(() => false));
  }
  callback(true);
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function log(action, target, ok, detail) {
  const entry = { at: new Date().toISOString(), action, path: target, ok, detail };
  audit.push(entry);
  send('audit', entry);
  return entry;
}

// Wraps each operation: logs it and returns { ok, data } or { ok: false, error }
function handle(channel, action, fn) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      const data = await fn(...args);
      log(action, args[0], true);
      return { ok: true, data };
    } catch (err) {
      log(action, args[0], false, err.message);
      return { ok: false, error: err.message };
    }
  });
}

// --- Workspace ---
ipcMain.handle('workspace:choose', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: t.chooseFolder,
    properties: ['openDirectory', 'createDirectory'],
  });
  if (res.canceled || !res.filePaths[0]) return { ok: false, error: t.cancelled };
  return openWorkspace(res.filePaths[0]);
});

// New project: the person picks a name and a place, Platanus creates the empty folder and opens it.
// An existing folder is only reused when it is empty, so nothing of the person's is touched.
ipcMain.handle('workspace:create', async () => {
  const res = await dialog.showSaveDialog(win, {
    title: t.newProject,
    message: t.newProjectMessage,
    buttonLabel: t.create,
    defaultPath: path.join(app.getPath('documents'), t.defaultProjectName),
    properties: ['createDirectory', 'showOverwriteConfirmation'],
  });
  if (res.canceled || !res.filePath) return { ok: false, cancelled: true, error: t.cancelled };
  const dir = res.filePath;
  try {
    const entries = await fs.readdir(dir);
    if (entries.some((name) => name !== '.DS_Store')) return { ok: false, error: t.folderNotEmpty };
  } catch (err) {
    if (err.code !== 'ENOENT') return { ok: false, error: err.message };
    await fs.mkdir(dir, { recursive: true });
  }
  log('workspace:create', dir, true);
  // Its own git repository from the start (no git installed: the project still opens, just without history)
  const init = await gitInit(dir);
  log('git:init', dir, init.ok);
  return openWorkspace(dir);
});

async function openWorkspace(dir) {
  const root = await workspace.open(dir);
  workspace.watch((paths) => send('fs:changed', paths));
  log('workspace:open', root, true);
  await rememberRecent(root);
  refreshMenu();
  return { ok: true, data: { root, name: path.basename(root) } };
}

// --- Recent projects (only folders the user already chose can be reopened from the window) ---
const MAX_RECENT = 8;
const recentFile = () => path.join(app.getPath('userData'), 'recent.json');

async function readRecent() {
  try {
    const list = JSON.parse(await fs.readFile(recentFile(), 'utf8'));
    return Array.isArray(list) ? list.filter((r) => typeof r?.root === 'string') : [];
  } catch {
    return [];
  }
}

async function rememberRecent(root) {
  const list = (await readRecent()).filter((r) => r.root !== root);
  list.unshift({ root, name: path.basename(root), at: new Date().toISOString() });
  await fs.writeFile(recentFile(), JSON.stringify(list.slice(0, MAX_RECENT), null, 2)).catch(() => {});
}

// Recent folders that still exist
async function aliveRecent() {
  const list = await readRecent();
  const alive = await Promise.all(list.map((r) => fs.stat(r.root).then((s) => s.isDirectory(), () => false)));
  return list.filter((_r, i) => alive[i]);
}

ipcMain.handle('workspace:recent', async () => ({ ok: true, data: await aliveRecent() }));

ipcMain.handle('workspace:openRecent', async (_e, root) => {
  if (!(await readRecent()).some((r) => r.root === root)) return { ok: false, error: t.notRecent };
  try {
    return await openWorkspace(root);
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('workspace:close', () => {
  if (workspace.root) log('workspace:close', workspace.root, true);
  workspace.close();
  refreshMenu();
  return { ok: true };
});

ipcMain.handle('workspace:current', () => ({
  ok: true,
  data: workspace.root ? { root: workspace.root, name: path.basename(workspace.root) } : null,
}));

ipcMain.handle('audit:list', () => ({ ok: true, data: audit }));

// --- Servers listening on this computer (the window polls the list, so listing is not audited) ---
const serverError = (err) => t.servers[err?.code] ?? t.servers.failed;
const pausedPids = new Map(); // pid -> { port }: processes Platanus paused (resumed on quit)
const stoppedServers = servers.createStoppedRegistry(); // stopped from Platanus, with how to reactivate them

// Servers Platanus started (reactivated). One that closes on its own goes to "Detenidos" with its exit code
// and output; one that was still starting turns "exited" there. Stops made by the person are not crashes.
const managedServers = servers.createManagedServers({
  onExit(entry, { code, signal, expected, output }) {
    const row = stoppedServers.findByPid(entry.pid);
    if (row) {
      stoppedServers.update(row.id, { state: expected ? 'stopped' : 'exited', exitCode: code, pid: null, output });
    } else if (!expected) {
      stoppedServers.add({ port: entry.port, process: entry.process, restart: entry.restart, state: 'exited', exitCode: code, output });
    }
    if (!expected) log('servers:exited', `${entry.process ?? '?'} :${entry.port}`, false, String(code ?? signal));
  },
});

ipcMain.handle('servers:list', async () => {
  try {
    const data = await servers.listServers({
      paused: pausedPids,
      managed: managedServers.pids(),
      onEntries: (entries) => servers.reconcileStarting(stoppedServers, entries),
    });
    return { ok: true, data };
  } catch (err) {
    return { ok: false, code: err?.code ?? 'failed', error: serverError(err) };
  }
});

// Runs a server action, audits it and answers { ok, data } or { ok: false, code, error } (Spanish text)
function serverAction(channel, fn) {
  ipcMain.handle(channel, async (_e, arg, ...rest) => {
    try {
      const { data, audit: target } = await fn(arg, ...rest);
      log(channel, target, true);
      return { ok: true, data };
    } catch (err) {
      log(channel, String(arg).slice(0, 40), false, err?.code);
      return { ok: false, code: err?.code ?? 'failed', error: serverError(err) };
    }
  });
}

const doneWith = ({ port, processes }) => ({ data: { port, processes }, audit: `${processes.join(', ')} :${port}` });

// Pause / resume need no dialog: both are undone with one click, and everything paused is resumed on quit
serverAction('servers:pause', async (port) => doneWith(await servers.pauseServer(port, { paused: pausedPids })));
serverAction('servers:resume', async (port) => doneWith(await servers.resumeServer(port, { paused: pausedPids })));

// Servers stopped from Platanus: { id, port, process, canRestart, state, exitCode, hasOutput, at }
// (the command, folder and output stay here)
ipcMain.handle('servers:stopped', () => ({ ok: true, data: stoppedServers.list() }));
serverAction('servers:forget', async (id) => {
  if (stoppedServers.get(id)?.state === 'starting') throw Object.assign(new Error('starting'), { code: 'alreadyStarting' });
  return { data: stoppedServers.forget(id), audit: String(id) };
});

const isPortBusy = async (port) => (await servers.readEntries()).some((e) => e.port === port);

// Reactivate inside Platanus: asks first, then the server runs as a child of the app (no Terminal window)
serverAction('servers:restart', async (id) => {
  const result = await servers.restartServer(id, {
    registry: stoppedServers,
    isPortBusy,
    start: (row) => managedServers.start({ port: row.port, process: row.process, restart: row.restart }),
    confirm: (row) => confirm(
      t.servers.confirmRestart(row.process ?? t.servers.unknownProcess, row.port),
      t.servers.confirmRestartDetail(servers.maskSecrets(row.command), row.cwd),
      t.servers.restartButton,
    ),
  });
  return { data: result, audit: `${result.process ?? '?'} :${result.port}` };
});

// Cancel a reactivation that has not started listening yet (no dialog: Platanus started it a moment ago)
serverAction('servers:cancelStart', async (id) => {
  const row = stoppedServers.get(id);
  if (!row || row.state !== 'starting' || !row.pid) throw Object.assign(new Error('notStarting'), { code: 'notStarting' });
  const output = managedServers.output(row.pid);
  managedServers.markExpected(row.pid);
  try { servers.terminate(row.pid, { paused: pausedPids }); } catch { /* it already closed */ }
  stoppedServers.update(id, { state: 'stopped', pid: null, output });
  return { data: null, audit: `${row.process ?? '?'} :${row.port}` };
});

// Output of a server Platanus started: by port (running) or by the id of its row in "Detenidos"
ipcMain.handle('servers:output', (_e, key) => {
  if (Number.isInteger(key) && key >= 1 && key <= 65535) {
    const pid = managedServers.pidOnPort(key);
    return { ok: true, data: pid ? managedServers.output(pid) ?? '' : '' };
  }
  const row = stoppedServers.get(key);
  if (!row) return { ok: false, code: 'unknownStopped', error: t.servers.unknownStopped };
  return { ok: true, data: (row.state === 'starting' && row.pid ? managedServers.output(row.pid) : row.output) ?? '' };
});

const findBrowsers = () => servers.detectBrowsers({ exists: existsSync });

// Installed browsers, without their paths: the page only chooses one by id
ipcMain.handle('servers:browsers', () => ({ ok: true, data: findBrowsers().map(({ id, name }) => ({ id, name })) }));

// "Elegir otra app…": the person picks the browser in the system dialog (the page never sends a path)
async function pickBrowserApp() {
  const mac = process.platform === 'darwin';
  const res = await dialog.showOpenDialog(win, {
    title: t.servers.chooseApp,
    defaultPath: mac ? '/Applications' : process.env.ProgramFiles,
    properties: ['openFile'],
    filters: [{ name: t.servers.apps, extensions: [mac ? 'app' : 'exe'] }],
  });
  const file = res.canceled ? null : res.filePaths[0];
  if (file && !servers.isAppPath(process.platform, file)) throw Object.assign(new Error('notAnApp'), { code: 'notAnApp' });
  return file;
}

ipcMain.handle('servers:open', async (_e, port, browser) => {
  try {
    const url = await servers.openServer(port, {
      browser: browser ?? 'default',
      openExternal: (u) => shell.openExternal(u),
      launch: (app, u) => servers.launchApp(app, u),
      pickApp: pickBrowserApp,
      findBrowsers,
    });
    log('servers:open', `${url} · ${String(browser ?? 'default').slice(0, 20)}`, true);
    return { ok: true, data: url };
  } catch (err) {
    log('servers:open', String(port).slice(0, 40), false, err?.code);
    return { ok: false, code: err?.code ?? 'failed', error: serverError(err) };
  }
});

// Stopping always asks; the pid is found here from the port and checked again after the dialog. Before it
// stops, the command and folder are kept here (never sent to the page) so it can be reactivated: for a
// server Platanus started they are the ones it used, so it can always be reactivated again.
serverAction('servers:stop', async (port) => {
  const result = await servers.stopServer(port, {
    kill: (pid) => {
      managedServers.markExpected(pid);
      servers.terminate(pid, { paused: pausedPids });
    },
    capture: async (pid) => managedServers.restartInfo(pid) ?? servers.captureRestart(pid),
    confirm: (targets, p) => confirm(
      t.servers.confirmStop(targets.map((x) => x.process ?? t.servers.unknownProcess).join(', '), p),
      t.servers.confirmStopDetail,
      t.servers.stopButton,
    ),
  });
  for (const row of result.stopped) stoppedServers.add({ ...row, output: managedServers.output(row.pid) });
  return doneWith(result);
});

// --- Git: read ---
ipcMain.handle('git:history', async () => ({ ok: true, data: await readGitHistory(workspace.root) }));

// --- Git: write (asked for from the chat). git.js validates every value; here each operation is
// logged, anything that changes files or history asks first, and errors come back in Spanish. ---
const MAX_LISTED_COMMIT_FILES = 12;
const CANCELLED = { ok: false, error: 'cancelled' }; // the chat answers "cancelado" for this one

function gitAnswer(op, target, result, extra = {}) {
  log(`git:${op}`, String(target ?? '').slice(0, 60), result.ok, result.detail ?? result.code);
  if (!result.ok) {
    const text = t.git.errors[result.code] ?? t.git.errors.failed;
    return { ok: false, code: result.code, error: typeof text === 'function' ? text(result.detail) : text };
  }
  send('git:changed', { op, ...extra, data: result.data });
  return result;
}

// Commit: shows the files that go in and refuses if one is a secret (.env, keys…) that .gitignore lets through
ipcMain.handle('git:commit', async (_e, message) => {
  const plan = await planCommit(workspace.root, isBlockedPath);
  if (!plan.ok) return gitAnswer('commit', message, plan);
  const { files, secrets } = plan.data;
  if (secrets.length) return gitAnswer('commit', message, { ok: false, code: 'secretFiles', detail: secrets.join(', ') });
  if (!files.length) return gitAnswer('commit', message, { ok: false, code: 'nothingToCommit' });
  const listed = files.slice(0, MAX_LISTED_COMMIT_FILES).join('\n') + (files.length > MAX_LISTED_COMMIT_FILES ? `\n${t.git.andMore(files.length - MAX_LISTED_COMMIT_FILES)}` : '');
  if (!(await confirm(t.git.confirmCommit(String(message ?? '').trim(), files.length), listed, t.git.commitButton))) return CANCELLED;
  return gitAnswer('commit', message, await gitCommit(workspace.root, message, files));
});

ipcMain.handle('git:revert', async (_e, rev) => {
  const preview = await gitShowShort(workspace.root, rev);
  if (!preview.ok) return gitAnswer('revert', rev, preview);
  if (!(await confirm(t.gitConfirmRevert(preview.data), t.gitConfirmRevertDetail))) return CANCELLED;
  return gitAnswer('revert', rev, await gitRevert(workspace.root, rev), { sha: rev });
});

ipcMain.handle('git:reset', async (_e, rev) => {
  const preview = await gitShowShort(workspace.root, rev);
  if (!preview.ok) return gitAnswer('reset', rev, preview);
  if (!(await confirm(t.gitConfirmReset(preview.data), t.gitConfirmResetDetail))) return CANCELLED;
  return gitAnswer('reset', rev, await gitReset(workspace.root, rev), { sha: rev });
});

// A new branch keeps the files as they are: no dialog, only logged
ipcMain.handle('git:createBranch', async (_e, name) =>
  gitAnswer('createBranch', name, await gitCreateBranch(workspace.root, name), { name }));

// Switching changes the files on disk: ask first
ipcMain.handle('git:checkout', async (_e, target) => {
  if (!(await confirm(t.git.confirmCheckout(String(target ?? '').trim()), t.git.confirmCheckoutDetail, t.git.checkoutButton))) return CANCELLED;
  return gitAnswer('checkout', target, await gitCheckout(workspace.root, target), { target });
});

// --- Files (every path is relative to the workspace) ---
handle('fs:tree', 'tree', (rel) => workspace.tree(rel));
handle('fs:read', 'read', (rel) => workspace.readFile(rel));
handle('fs:mkdir', 'mkdir', (rel) => workspace.mkdir(rel));
// From the chat: "Abrir en el navegador" (pages, images, PDFs only: never a script or a program) and
// "Mostrar en la carpeta". Files with secrets are never opened or revealed.
// Whether a path of the project is a file or a folder (the window loads the tree level by level)
ipcMain.handle('fs:kind', async (_e, rel) => {
  try {
    const stat = await fs.stat(await workspace.resolve(rel));
    return { ok: true, data: stat.isDirectory() ? 'dir' : 'file' };
  } catch {
    return { ok: true, data: null };
  }
});
handle('fs:open', 'open', async (rel, how) => {
  if (!workspace.root) throw new Error(t.mcp.noProject);
  const abs = await workspace.resolve(rel);
  if (await isBlockedRealPath(workspace.root, abs)) throw new Error(t.cannotOpenSecret);
  // The real file (a link named page.html could point to a script): it must be a file of a kind that opens
  const real = await fs.realpath(abs).catch(() => null);
  const fromRoot = real && path.relative(await fs.realpath(workspace.root), real);
  const inside = real && !fromRoot.startsWith('..') && !path.isAbsolute(fromRoot);
  if (!inside) throw new Error(t.cannotOpen);
  if (how === 'reveal') { shell.showItemInFolder(real); return true; }
  if (!(await fs.stat(real)).isFile() || !canOpen(real)) throw new Error(t.cannotOpen);
  const problem = await shell.openPath(real);
  if (problem) throw new Error(t.cannotOpen);
  return true;
});

// Creating a new file is free; overwriting an existing one asks for confirmation
handle('fs:write', 'write', async (rel, content) => {
  if (await workspace.exists(rel)) {
    const ok = await confirm(t.confirmOverwrite(rel), t.confirmOverwriteDetail);
    if (!ok) throw new Error(t.overwriteRejected);
  }
  await workspace.writeFile(rel, content);
});

// --- Editor: files the person opens and saves by hand (the agent never comes through here, it only has
// the MCP tools, which still refuse secrets). Secrets open too, flagged; saving one asks first. A save
// carries the mtime the file was read with and is refused if the file changed on disk meanwhile; the
// previous version is backed up like an agent's change. ---
const EDITOR_MAX_BYTES = 2 * 1024 * 1024;
const BINARY_PROBE_BYTES = 8000;
const editorError = (code, message = t.editor.errors[code]) => Object.assign(new Error(message), { code });

async function editorAnswer(action, rel, fn) {
  try {
    const data = await fn();
    log(action, rel, true);
    return { ok: true, data };
  } catch (err) {
    log(action, rel, false, err.message);
    return { ok: false, code: err.code ?? 'failed', error: err.message };
  }
}

ipcMain.handle('editor:open', (_e, rel) => editorAnswer('editor:open', rel, async () => {
  const abs = await workspace.resolve(rel);
  const stat = await fs.stat(abs).catch(() => { throw editorError('notFound'); });
  if (!stat.isFile()) throw editorError('notFile');
  if (stat.size > EDITOR_MAX_BYTES) throw editorError('tooLarge');
  const bytes = await fs.readFile(abs);
  if (bytes.subarray(0, BINARY_PROBE_BYTES).includes(0)) throw editorError('binary');
  const secret = isBlockedPath(rel) || (await isBlockedRealPath(workspace.root, abs));
  return { content: bytes.toString('utf8'), mtime: stat.mtimeMs, secret };
}));

ipcMain.handle('editor:save', (_e, rel, content, mtime) => editorAnswer('editor:save', rel, async () => {
  if (typeof content !== 'string') throw editorError('failed');
  if (Buffer.byteLength(content) > EDITOR_MAX_BYTES) throw editorError('tooLarge');
  const abs = await workspace.resolve(rel);
  const stat = await fs.stat(abs).catch(() => null);
  if (!stat?.isFile()) throw editorError('notFound');
  if (stat.mtimeMs !== mtime) throw editorError('changedOnDisk');
  if (isBlockedPath(rel) || (await isBlockedRealPath(workspace.root, abs))) {
    if (!(await confirm(t.editor.confirmSecret(rel), t.editor.confirmSecretDetail, t.editor.saveButton))) throw editorError('cancelled');
  }
  await backupFile(rel, abs, true);
  await workspace.writeFile(rel, content);
  return { mtime: (await fs.stat(abs)).mtimeMs };
}));

// Deleting always asks for confirmation
handle('fs:delete', 'delete', async (rel) => {
  const ok = await confirm(t.confirmDelete(rel), t.confirmDeleteDetail);
  if (!ok) throw new Error(t.deleteRejected);
  await workspace.remove(rel);
});


// --- Local MCP server: the user's agent (Claude Code, Cursor, Codex, Gemini or the chat CLIs) ---
// Tools that need what the window knows (traffic lights, the map) are answered by the renderer.
const pending = new Map();
let requestSeq = 0;

function askRenderer(tool, args) {
  if (!win || win.isDestroyed()) return Promise.reject(new Error(t.mcp.windowClosed));
  const id = ++requestSeq;
  send('mcp:request', { id, tool, args });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(t.mcp.timeout)); }, 5000);
    pending.set(id, { resolve, reject, timer });
  });
}

ipcMain.handle('mcp:reply', (_e, { id, ok, data, error }) => {
  const entry = pending.get(id);
  if (!entry) return;
  clearTimeout(entry.timer);
  pending.delete(id);
  if (ok) entry.resolve(data);
  else entry.reject(new Error(error));
});

// Paths only, up to 4 levels: enough for the agent to orient itself without dumping the whole disk
function flatten(nodes, depth = 0, out = []) {
  for (const n of nodes) {
    out.push(n.type === 'dir' ? `${n.path}/` : n.path);
    if (n.children && depth < 3) flatten(n.children, depth + 1, out);
  }
  return out;
}

const mcpHandlers = {
  platanus_get_project: async () => {
    if (!workspace.root) throw new Error(t.mcp.noProject);
    return { name: path.basename(workspace.root), paths: flatten(await workspace.tree('.', 4)).slice(0, 400) };
  },
  platanus_list_risks: () => askRenderer('list_risks', {}),
  platanus_read_file: async ({ path: rel }) => {
    if (!workspace.root) throw new Error(t.mcp.noProject);
    const abs = await workspace.resolve(rel);
    await refuseSecretTarget(abs);
    const { size } = await fs.stat(abs);
    if (size > MAX_READ_BYTES) throw new Error(t.mcp.tooLarge(Math.round(MAX_READ_BYTES / 1024)));
    return workspace.readFile(rel);
  },
  // Writes are approved per the agent permission mode (approval.js); the previous version is always
  // backed up and can be undone
  platanus_write_file: async ({ path: rel, content, reason }) => {
    const requestedAt = new Date().toISOString(); // before the dialog: tells which agent run asked
    if (!workspace.root) throw new Error(t.mcp.noProject);
    if (Buffer.byteLength(content) > MAX_READ_BYTES) throw new Error(t.mcp.tooLarge(Math.round(MAX_READ_BYTES / 1024)));
    const abs = await workspace.resolve(rel);
    const exists = await workspace.exists(rel);
    await refuseSecretTarget(abs); // new files too: a symlinked parent may lead into .git/ or a secret
    const why = String(reason).slice(0, 300);
    const oldBytes = exists ? (await fs.stat(abs)).size : 0;
    // What changes, line by line (lineDiff.js): the chat shows it while asking and once saved
    const before = exists && oldBytes <= MAX_READ_BYTES ? await fs.readFile(abs, 'utf8').catch(() => null) : null;
    const diff = exists && before == null ? null : lineDiff(exists ? before : null, content);
    const ask = needsApproval(approvalModeNow, { path: rel, exists, oldBytes, newBytes: Buffer.byteLength(content) });
    if (ask) {
      send('agent:awaiting', { path: rel, waiting: true, diff, reason: why }); // "Esperando tu aprobación…" + the proposed change
      const ok = await confirm(t.mcp.confirmWrite(rel), t.mcp.confirmWriteDetail(why, exists)).finally(() => send('agent:awaiting', { path: rel, waiting: false }));
      if (!ok) throw new Error(t.mcp.writeRejected);
    }
    const backup = await backupFile(rel, abs, exists);
    await workspace.writeFile(rel, content);
    // approvedBy: 'you' (the dialog) or the mode that saved it on its own
    const change = { path: rel, reason: why, created: !exists, backup, requestedAt, at: new Date().toISOString(), approvedBy: ask ? 'you' : approvalModeNow, diff };
    send('agent:changed', change);
    return t.mcp.written(rel);
  },
  platanus_set_file_score: ({ path: rel, level, reason }) => {
    send('agent:score', { path: rel, level, reason: String(reason).slice(0, 240) });
    return `${rel}: ${level}`;
  },
  platanus_show_folder: ({ path: rel }) => askRenderer('show_folder', { path: rel }),
};

// A symlink inside the project may point to a secret: check where the path really lands. For a file
// that does not exist yet, resolve its nearest existing parent folder and add the rest of the path.
async function refuseSecretTarget(abs) {
  if (await isBlockedRealPath(workspace.root, abs)) throw new Error(t.mcp.secret);
}

// Agents' changes: ~/.platanus/backups/<id>/meta.json ({ root, rel, created }) + the previous version.
// Main is the only source of truth for undo: the window only says which id to restore.
const BACKUPS = path.join(app.getPath('home'), '.platanus', 'backups');
async function backupFile(rel, abs, exists) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const dir = path.join(BACKUPS, id);
  await fs.mkdir(dir, { recursive: true });
  if (exists) await fs.copyFile(abs, path.join(dir, 'previous'));
  await fs.writeFile(path.join(dir, 'meta.json'), JSON.stringify({ root: workspace.root, rel, created: !exists }));
  return { id };
}

// Undo an agent's change: put the previous version back, or delete a file the agent created (asks first)
ipcMain.handle('agent:undo', async (_e, { path: rel, backup } = {}) => {
  try {
    if (!backup?.id || !/^[\w-]+$/.test(backup.id)) throw new Error(t.mcp.cannotUndo);
    const dir = path.join(BACKUPS, backup.id);
    const meta = JSON.parse(await fs.readFile(path.join(dir, 'meta.json'), 'utf8'));
    if (meta.root !== workspace.root || meta.rel !== rel) throw new Error(t.mcp.cannotUndo);
    const abs = await workspace.resolve(rel);
    await refuseSecretTarget(abs);
    if (!(await confirm(t.mcp.confirmUndo(rel), meta.created ? t.mcp.confirmUndoCreated : t.mcp.confirmUndoDetail))) throw new Error(t.mcp.writeRejected);
    if (meta.created) await workspace.remove(rel);
    else await workspace.writeFile(rel, await fs.readFile(path.join(dir, 'previous'), 'utf8'));
    log('agent:undo', rel, true);
    return { ok: true };
  } catch (err) {
    log('agent:undo', rel, false, err.message);
    return { ok: false, error: err.message };
  }
});

// Private key of the local MCP server: created once, readable only by this user (0600)
async function mcpToken() {
  const file = path.join(app.getPath('userData'), 'mcp-token');
  try {
    const saved = (await fs.readFile(file, 'utf8')).trim();
    if (/^[a-f0-9]{48}$/.test(saved)) return saved;
  } catch { /* first run */ }
  const token = require('node:crypto').randomBytes(24).toString('hex');
  await fs.writeFile(file, token, { mode: 0o600 });
  return token;
}

async function startMcp() {
  const token = await mcpToken();
  const server = await startMcpServer({
    port: Number(process.env.PLATANUS_MCP_PORT) || 7811,
    token,
    handlers: mcpHandlers,
    onCall: ({ tool, args, ok, error }) => log(`mcp:${tool}`, args?.path ?? '', ok, error),
  });
  const url = `http://127.0.0.1:${server.address().port}/mcp/${token}`;
  mcp = { url, readOnlyUrl: `${url}/ro`, running: true };
  send('mcp:status', mcp);
}

ipcMain.handle('mcp:info', () => ({ ok: true, data: mcp }));

// --- Agents with the user's own subscription ---
// Agent permissions (approval.js). Starts in manual on every launch; the window restores "auto" itself,
// and "bypass" needs the person's confirmation each time it is turned on.
let approvalModeNow = 'manual';
ipcMain.handle('agent:approval', async (_e, requested) => {
  const mode = approvalMode(requested);
  if (mode === 'bypass' && approvalModeNow !== 'bypass' && !(await confirm(t.mcp.confirmBypass, t.mcp.confirmBypassDetail, t.mcp.bypassButton))) {
    return { ok: false, error: 'cancelled', data: approvalModeNow };
  }
  approvalModeNow = mode;
  log('agent:approval', mode, true);
  return { ok: true, data: mode };
});
// API keys instead of a subscription login (keyStore.js): encrypted with the OS keychain, never sent
// back to the window (only which agents have one and their last four characters)
let keyStore = null;
const keys = () => (keyStore ??= createKeyStore({ file: path.join(app.getPath('home'), '.platanus', 'keys.json'), safeStorage }));
ipcMain.handle('keys:list', () => ({ ok: true, data: keys().list() }));
ipcMain.handle('keys:set', (_e, provider, value) => {
  const result = keys().set(String(provider), value);
  log('keys:set', String(provider), result.ok, result.error); // the provider, never the key
  return result;
});
ipcMain.handle('keys:remove', (_e, provider) => {
  log('keys:remove', String(provider), true);
  return keys().remove(String(provider));
});
// The keys one run gets: its own, or for OpenCode every saved one (it picks the provider)
const agentKeyEnv = (id) => (id === 'opencode'
  ? Object.assign({}, ...['claude', 'codex', 'grok'].map((p) => keys().envFor(p)))
  : keys().envFor(id));
// An agent with a saved key counts as connected (auth: 'key'), even without a subscription login
ipcMain.handle('agents:detect', async () => {
  const saved = keys().list();
  const list = (await agents.detect()).map((a) => {
    if (saved[a.id] && a.installed) return { ...a, loggedIn: true, auth: 'key', keyLast4: saved[a.id].last4 };
    // OpenCode can also use any key saved here (it reads the same provider variables)
    if (a.id === 'opencode' && a.installed && !a.loggedIn && Object.keys(saved).length) return { ...a, loggedIn: true, auth: 'key', keyLast4: Object.values(saved)[0].last4 };
    return { ...a, auth: a.loggedIn ? 'login' : null };
  });
  return { ok: true, data: list };
});
ipcMain.handle('agents:login', (_e, id) => ({ ok: agents.login(String(id)) }));
ipcMain.handle('agents:run', async (_e, req) => {
  if (!mcp.running) return { ok: false, error: t.mcp.windowClosed };
  // The system proxy, asked on every run: VPN apps like Psiphon change their port each time they start
  const proxyEnv = agents.proxyEnvFor(await electronSession.defaultSession.resolveProxy('https://api.anthropic.com').catch(() => ''));
  const runId = `${Date.now()}-${++requestSeq}`;
  const model = /^(?!-)[a-zA-Z0-9.\-_]{0,40}$/.test(String(req?.model ?? '')) ? String(req.model ?? '') : '';
  const effort = ['low', 'medium', 'high', 'xhigh', 'max'].includes(req?.effort) ? req.effort : 'low';
  const session = SESSIONS.includes(req?.session) ? req.session : 'chat';
  // The chat sends its voice (Vibe/Dev + recent messages): the prompt comes from agent/voice.json and the
  // mode's skill, read on every run so the team can tune them without restarting
  let systemPrompt = String(req?.systemPrompt ?? '');
  if (req?.voice) {
    try {
      const voice = loadVoice(AGENT_DIR);
      systemPrompt = req.voice.purpose === 'refine'
        ? composeRefinePrompt(voice, { mode: req.voice.mode }) // "Mejorar mi mensaje"
        : req.voice.purpose === 'tour'
          ? composeTourPrompt(voice, { mode: req.voice.mode }) // "Recorrido"
          : composePrompt(voice, { mode: req.voice.mode, recent: req.voice.recent, task: systemPrompt });
    } catch (error) {
      console.error('agent/voice.json:', error.message); // keep the plain prompt
    }
  }
  const child = agents.run(
    String(req?.agent),
    // a tour or a question to understand only explains: its agent gets the read-only address of the MCP server
    { prompt: String(req?.prompt ?? ''), systemPrompt, mcpUrl: session === 'tour' || req?.readOnly === true ? mcp.readOnlyUrl : mcp.url, continued: Boolean(req?.continued) && session !== 'tour', model, effort, session, env: agentKeyEnv(String(req?.agent)), proxyEnv },
    (event) => {
      if (event.type === 'done') agentRuns.delete(runId);
      send('agents:event', { runId, ...event });
    },
  );
  if (child) agentRuns.set(runId, child);
  return { ok: true, data: runId };
});

// Stop a run (Remi's job was closed or timed out): its later writes never happen
const agentRuns = new Map(); // runId -> child process
ipcMain.handle('agents:cancel', (_e, runId) => {
  agentRuns.get(String(runId))?.kill('SIGTERM');
  return { ok: true };
});

// With the simulator (PLATANUS_SIM=1, development) a question nobody answers cancels itself after 5 s,
// so automated scenario runs never hang on a dialog
async function confirm(message, detail, okLabel = t.allow) {
  const signal = process.env.PLATANUS_SIM === '1' ? AbortSignal.timeout(5000) : undefined;
  const { response } = await dialog.showMessageBox(win, {
    ...(signal ? { signal } : {}),
    type: 'warning',
    buttons: [t.cancel, okLabel],
    defaultId: 0,
    cancelId: 0,
    message,
    detail,
  });
  return response === 1;
}

// `npx electron . --open=/path/to/project` opens that folder at start (the window restores it)
const openArg = process.argv.find((a) => a.startsWith('--open='))?.slice('--open='.length);

// The app's own menus (Archivo, Ver, Agente…) live inside the window. The native bar keeps only what the
// system needs: the app menu, Edición (so Cmd+C / Cmd+V / Cmd+Z work in the chat) and Ventana.
// Keep the data folder where it always was (choices, stats, repair history, recent projects, MCP key):
// renaming the app would otherwise move it and the app would start as new.
app.setPath('userData', path.join(app.getPath('appData'), 'platanus-ide'));
app.setName('Platanus');
// macOS: the Project menu lives in the system menu bar (the window hides its own). Each item asks
// the window to run the same action as its in-app button. Rebuilt when a project opens or closes,
// so "Close project" and the recent list stay current.
const menuAction = (action, extra = {}) => () => send('menu:action', { action, ...extra });

async function projectMenu() {
  const m = t.menu;
  const recent = await aliveRecent();
  return {
    label: m.project,
    submenu: [
      { label: m.newProject, accelerator: 'CmdOrCtrl+N', click: menuAction('newProject') },
      { label: m.openProject, accelerator: 'CmdOrCtrl+O', click: menuAction('openProject') },
      {
        label: m.openRecent,
        submenu: recent.length
          ? recent.map((r) => ({ label: r.name, sublabel: r.root, click: menuAction('openRecent', { root: r.root }) }))
          : [{ label: m.noRecent, enabled: false }],
      },
      { type: 'separator' },
      { label: m.closeProject, accelerator: 'CmdOrCtrl+W', enabled: Boolean(workspace.root), click: menuAction('closeProject') },
    ],
  };
}

function refreshMenu() {
  nativeMenu().catch((err) => log('menu', null, false, err.message));
}

async function nativeMenu() {
  const m = t.menu;
  const isMac = process.platform === 'darwin';
  const editItems = [
    { role: 'undo', label: m.undo },
    { role: 'redo', label: m.redo },
    { role: 'cut', label: m.cut },
    { role: 'copy', label: m.copy },
    { role: 'paste', label: m.paste },
    { role: 'selectAll', label: m.selectAll },
  ];
  const template = [
    ...(process.platform === 'darwin' ? [{
      label: 'Platanus',
      submenu: [
        { role: 'about', label: m.about },
        { type: 'separator' },
        { role: 'hide', label: m.hide },
        { role: 'hideOthers', label: m.hideOthers },
        { role: 'unhide', label: m.unhide },
        { type: 'separator' },
        { role: 'quit', label: m.quit },
        ...editItems.map((item) => ({ ...item, visible: false, acceleratorWorksWhenHidden: true })),
      ],
    }] : []),
    ...(isMac ? [await projectMenu()] : []),
    // macOS fills any Edit menu with Writing Tools, AutoFill, Dictation and Emoji, so on the Mac
    // there is no Edit menu: its shortcuts live as hidden items of the app menu and keep working
    ...(isMac ? [] : [{ label: m.edit, submenu: editItems }]),
    {
      label: m.window,
      submenu: [
        { role: 'minimize', label: m.minimize },
        { role: 'zoom', label: m.zoom },
        { role: 'togglefullscreen', label: m.fullscreen },
        ...(process.argv.includes('--dev') || LIVE_RELOAD ? [
          { role: 'reload', label: m.reload },
          { role: 'toggleDevTools', label: m.devTools },
        ] : []),
        { type: 'separator' },
        // ⌘W closes the project (Project menu); the window closes with ⇧⌘W
        { role: 'close', label: m.close, accelerator: isMac ? 'Shift+CmdOrCtrl+W' : 'CmdOrCtrl+W' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// `npm run watch`: live reload while developing. Changes in renderer/ reload the window (the open
// project is restored by the window itself); changes in electron/ restart the whole app.
const LIVE_RELOAD = process.argv.includes('--watch');
const RELOAD_DEBOUNCE_MS = 150;

function watchSources() {
  const watchFs = require('node:fs');
  const watch = (dir, onChange) => {
    let timer = null;
    watchFs.watch(path.join(__dirname, '..', dir), { recursive: true }, (_event, file) => {
      if (!file || file.endsWith('.test.js') || file.includes('.DS_Store')) return;
      clearTimeout(timer);
      timer = setTimeout(onChange, RELOAD_DEBOUNCE_MS);
    });
  };
  watch('renderer', () => win && !win.isDestroyed() && win.webContents.reloadIgnoringCache());
  watch('electron', () => { app.relaunch(); app.exit(0); });
}

app.whenReady().then(async () => {
  await nativeMenu();
  if (LIVE_RELOAD) watchSources();
  if (openArg) await openWorkspace(openArg).catch((err) => log('workspace:open', openArg, false, err.message));
  createWindow();
  startMcp();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

// Closing from the system (kill, logout, a dev restart) quits normally, so the window's saved data
// (chosen agent, stats, repair history, Vibe/Dev) is written to disk instead of being lost
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, () => app.quit());

// Nothing stays frozen or hidden after Platanus closes: every server it paused continues, and every
// server it started (which has no terminal) is stopped
app.on('will-quit', () => {
  servers.resumeAll(pausedPids);
  managedServers.stopAll();
});

app.on('window-all-closed', () => {
  workspace.unwatch();
  if (process.platform !== 'darwin') app.quit();
});
