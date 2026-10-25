// Tests for the list of servers listening on this computer (spec/001-running-servers.md).
// Run with `npm test` (node:test, no dependencies). The OS commands are replaced by fixtures.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseLsof, parseNetstat, parseTasklist, isLocalAddress, toServers, listServers, openServer, runFile, MAX_SERVERS,
  stopServer, detectBrowsers, launchCommand, isAppPath,
  pauseServer, resumeServer, terminate, captureRestart, maskSecrets, createStoppedRegistry, restartServer,
  managedLaunch, createOutputBuffer, createManagedServers, reconcileStarting,
} = require('./servers');

// `lsof +c 0 -nP -iTCP -sTCP:LISTEN -Fpcn` on macOS: p = pid, c = command, f = fd, n = address:port
const LSOF = [
  'p501', 'cnode', 'f23', 'n127.0.0.1:5173',
  'p502', 'cPython', 'f3', 'n*:8000',
  'p503', 'cElectron', 'f56', 'n127.0.0.1:7811',
  'p504', 'crapportd', 'f9', 'n*:49152', 'f10', 'n[::]:49152', // same process and port on IPv4 and IPv6
  'p505', 'cpostgres', 'f7', 'n[::1]:5432', 'f8', 'n127.0.0.1:5432',
  'p506', 'f4', 'n192.168.1.20:9000', // no command field: name unknown
  '',
].join('\n');

// `netstat -ano` on Windows (Spanish locale: the state column is translated, so it is not used)
const NETSTAT = `
Conexiones activas

  Proto  Dirección local          Dirección remota        Estado           PID
  TCP    0.0.0.0:3000           0.0.0.0:0              ESCUCHANDO       4120
  TCP    127.0.0.1:7811         0.0.0.0:0              ESCUCHANDO       2200
  TCP    192.168.1.20:50312     20.10.4.1:443          ESTABLECIDO      3300
  TCP    [::]:3000              [::]:0                 ESCUCHANDO       4120
  TCP    [::1]:5173             [::]:0                 ESCUCHANDO       5150
  UDP    0.0.0.0:5353           *:*                                    6000
`;

// `tasklist /FO CSV /NH`
const TASKLIST = [
  '"System Idle Process","0","Services","0","8 K"',
  '"node.exe","4120","Console","1","80.120 K"',
  '"Qubbot.exe","2200","Console","1","120.000 K"',
  '"node.exe","5150","Console","1","60.000 K"',
].join('\r\n');

test('B1: lsof output becomes one entry per process and address', () => {
  const entries = parseLsof(LSOF);
  assert.deepEqual(entries.slice(0, 3), [
    { pid: 501, process: 'node', address: '127.0.0.1', port: 5173 },
    { pid: 502, process: 'Python', address: '*', port: 8000 },
    { pid: 503, process: 'Electron', address: '127.0.0.1', port: 7811 },
  ]);
  assert.deepEqual(entries.find((e) => e.address === '::'), { pid: 504, process: 'rapportd', address: '::', port: 49152 });
});

test('B1: netstat keeps only listening TCP sockets, whatever the language', () => {
  assert.deepEqual(parseNetstat(NETSTAT), [
    { pid: 4120, process: null, address: '0.0.0.0', port: 3000 },
    { pid: 2200, process: null, address: '127.0.0.1', port: 7811 },
    { pid: 4120, process: null, address: '::', port: 3000 },
    { pid: 5150, process: null, address: '::1', port: 5173 },
  ]);
});

test('B1: tasklist gives the process name of each pid', () => {
  const names = parseTasklist(TASKLIST);
  assert.equal(names.get(4120), 'node.exe');
  assert.equal(names.get(2200), 'Qubbot.exe');
  assert.equal(names.get(9999), undefined);
});

test('B2: a server whose process name is hidden is still listed, without a name', () => {
  const servers = toServers(parseLsof(LSOF));
  const hidden = servers.find((s) => s.port === 9000);
  assert.ok(hidden);
  assert.equal(hidden.process, null);
});

test('B3/B4: localhost is local; everything else can be reached from the network', () => {
  for (const a of ['127.0.0.1', '127.0.1.1', '::1', 'localhost', '::ffff:127.0.0.1']) assert.equal(isLocalAddress(a), true, a);
  for (const a of ['*', '0.0.0.0', '::', '192.168.1.20', '10.0.0.5', 'fe80::1%5', '']) assert.equal(isLocalAddress(a), false, a);
});

test('B1/B3/B4: servers carry only port, name, address and exposure; exposed first, then by port', () => {
  const servers = toServers(parseLsof(LSOF));
  assert.deepEqual(servers.map((s) => [s.port, s.exposed]), [
    [8000, true], [9000, true], [49152, true],
    [5173, false], [5432, false], [7811, false],
  ]);
  for (const s of servers) assert.deepEqual(Object.keys(s).sort(), ['address', 'exposed', 'managed', 'paused', 'port', 'process']);
});

test('B16: a paused process is marked as paused in the list', () => {
  const servers = toServers(parseLsof(LSOF), new Set([502]));
  assert.equal(servers.find((s) => s.port === 8000).paused, true);
  assert.equal(servers.find((s) => s.port === 5173).paused, false);
});

test('B19: a server started by Qubbot is marked as managed', () => {
  const servers = toServers(parseLsof(LSOF), new Set(), new Set([501]));
  assert.equal(servers.find((s) => s.port === 5173).managed, true);
  assert.equal(servers.find((s) => s.port === 8000).managed, false);
});

test('D4: the same process on the same port (IPv4 + IPv6) is shown once, with its widest exposure', () => {
  const servers = toServers([
    { pid: 1, process: 'node', address: '127.0.0.1', port: 3000 },
    { pid: 1, process: 'node', address: '::', port: 3000 },
    { pid: 2, process: 'other', address: '127.0.0.1', port: 3000 }, // another process: its own row
  ]);
  assert.equal(servers.length, 2);
  assert.deepEqual(servers[0], { port: 3000, process: 'node', address: '::', exposed: true, paused: false, managed: false });
});

test('long names are cut and the list has a maximum size', () => {
  const many = Array.from({ length: MAX_SERVERS + 50 }, (_, i) => ({ pid: i + 1, process: 'x'.repeat(200), address: '127.0.0.1', port: 1000 + i }));
  const servers = toServers(many);
  assert.equal(servers.length, MAX_SERVERS);
  assert.ok(servers[0].process.length <= 64);
});

test('B1: on macOS it runs lsof with fixed arguments and no shell', async () => {
  const calls = [];
  const run = async (file, args) => { calls.push([file, args]); return LSOF; };
  const servers = await listServers({ platform: 'darwin', run });
  assert.deepEqual(calls, [['/usr/sbin/lsof', ['+c', '0', '-nP', '-iTCP', '-sTCP:LISTEN', '-Fpcn']]]);
  assert.ok(servers.some((s) => s.port === 7811 && !s.exposed));
});

test('B1: on Windows it joins netstat with the process names from tasklist', async () => {
  const run = async (file) => (/netstat\.exe$/i.test(file) ? NETSTAT : TASKLIST);
  const servers = await listServers({ platform: 'win32', run, systemRoot: 'C:\\Windows' });
  assert.deepEqual(servers, [
    { port: 3000, process: 'node.exe', address: '0.0.0.0', exposed: true, paused: false, managed: false },
    { port: 5173, process: 'node.exe', address: '::1', exposed: false, paused: false, managed: false },
    { port: 7811, process: 'Qubbot.exe', address: '127.0.0.1', exposed: false, paused: false, managed: false },
  ]);
});

test('B2: on Windows, if tasklist fails the servers are listed without names', async () => {
  const run = async (file) => {
    if (/tasklist\.exe$/i.test(file)) throw Object.assign(new Error('x'), { code: 'failed' });
    return NETSTAT;
  };
  const servers = await listServers({ platform: 'win32', run, systemRoot: 'C:\\Windows' });
  assert.equal(servers.length, 3);
  assert.ok(servers.every((s) => s.process === null));
});

test('B8: nothing listening is an empty list', async () => {
  assert.deepEqual(await listServers({ platform: 'darwin', run: async () => '' }), []);
});

test('B9: an unsupported system or a failing command is an error with a code', async () => {
  await assert.rejects(listServers({ platform: 'linux', run: async () => LSOF }), { code: 'unsupported' });
  const timeout = async () => { throw Object.assign(new Error('slow'), { code: 'timeout' }); };
  await assert.rejects(listServers({ platform: 'darwin', run: timeout }), { code: 'timeout' });
});

test('B8/B9: exit code 1 with no output is "nothing found"; a missing command or another failure is an error', async () => {
  const node = process.execPath;
  assert.equal(await runFile(node, ['-e', 'process.exit(1)']), '');
  assert.equal(await runFile(node, ['-e', 'process.stdout.write("p1\\n"); process.exit(1)']), 'p1\n'); // partial output is kept
  await assert.rejects(runFile('/no/such/command', []), { code: 'unavailable' });
  await assert.rejects(runFile(node, ['-e', 'process.exit(2)']), { code: 'failed' });
});

// --- Opening: default browser, one of the installed browsers, or an app the person picks ---

const BROWSERS = [
  { id: 'chrome', name: 'Google Chrome', path: '/Applications/Google Chrome.app' },
  { id: 'firefox', name: 'Firefox', path: '/Applications/Firefox.app' },
];

function openDeps({ picked = null } = {}) {
  const calls = { external: [], launch: [], picks: 0 };
  return {
    calls,
    openExternal: async (u) => calls.external.push(u),
    launch: async (app, u) => calls.launch.push([app, u]),
    pickApp: async () => { calls.picks += 1; return picked; },
    findBrowsers: () => BROWSERS,
  };
}

test('B6: opening a server opens http://localhost:<port> in the default browser and nothing else', async () => {
  const deps = openDeps();
  const url = await openServer(5173, deps);
  assert.equal(url, 'http://localhost:5173');
  assert.deepEqual(deps.calls.external, ['http://localhost:5173']);
  assert.deepEqual(deps.calls.launch, []);
});

test('B11: an installed browser is chosen by id; the path comes from this side, never from the page', async () => {
  const deps = openDeps();
  await openServer(3000, { ...deps, browser: 'firefox' });
  assert.deepEqual(deps.calls.launch, [['/Applications/Firefox.app', 'http://localhost:3000']]);
  for (const bad of ['safari', '/Applications/Evil.app', '../chrome', '', 42, null]) {
    await assert.rejects(openServer(3000, { ...deps, browser: bad }), { code: 'unknownBrowser' }, String(bad));
  }
  assert.equal(deps.calls.launch.length, 1);
  assert.deepEqual(deps.calls.external, []);
});

test('B12: "another app" asks the person with the system dialog; cancelling opens nothing', async () => {
  const picked = openDeps({ picked: '/Applications/Arc.app' });
  await openServer(8000, { ...picked, browser: 'other' });
  assert.deepEqual(picked.calls.launch, [['/Applications/Arc.app', 'http://localhost:8000']]);
  const cancelled = openDeps({ picked: null });
  await assert.rejects(openServer(8000, { ...cancelled, browser: 'other' }), { code: 'cancelled' });
  assert.deepEqual(cancelled.calls.launch, []);
});

test('B7: anything that is not a port between 1 and 65535 is refused without opening', async () => {
  const deps = openDeps();
  for (const bad of ['8000; rm -rf ~', '8000', -1, 0, 70000, 8000.5, 'javascript:alert(1)', null, undefined, NaN, { port: 80 }]) {
    await assert.rejects(openServer(bad, deps), { code: 'invalidPort' }, String(bad));
    await assert.rejects(openServer(bad, { ...deps, browser: 'chrome' }), { code: 'invalidPort' }, String(bad));
  }
  assert.deepEqual(deps.calls, { external: [], launch: [], picks: 0 });
});

test('B11: only installed browsers are offered (macOS apps and Windows programs)', () => {
  const mac = detectBrowsers({ platform: 'darwin', home: '/Users/ana', exists: (p) => ['/Applications/Google Chrome.app', '/Users/ana/Applications/Firefox.app', '/Applications/Safari.app'].includes(p) });
  assert.deepEqual(mac.map((b) => [b.id, b.path]), [
    ['safari', '/Applications/Safari.app'],
    ['chrome', '/Applications/Google Chrome.app'],
    ['firefox', '/Users/ana/Applications/Firefox.app'],
  ]);
  const env = { ProgramFiles: 'C:\\Program Files', 'ProgramFiles(x86)': 'C:\\Program Files (x86)', LOCALAPPDATA: 'C:\\Users\\ana\\AppData\\Local' };
  const win = detectBrowsers({ platform: 'win32', env, exists: (p) => p === 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' });
  assert.deepEqual(win.map((b) => [b.id, b.path]), [['edge', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe']]);
  assert.deepEqual(detectBrowsers({ platform: 'linux', exists: () => true }), []);
});

test('B11/B12: launching uses fixed commands with the URL as a separate argument', () => {
  assert.deepEqual(launchCommand('darwin', '/Applications/Firefox.app', 'http://localhost:3000'), ['/usr/bin/open', ['-a', '/Applications/Firefox.app', 'http://localhost:3000']]);
  assert.deepEqual(launchCommand('win32', 'C:\\Program Files\\Mozilla Firefox\\firefox.exe', 'http://localhost:3000'), ['C:\\Program Files\\Mozilla Firefox\\firefox.exe', ['http://localhost:3000']]);
});

test('B12: the app picked must be an app (.app on macOS, .exe on Windows)', () => {
  assert.equal(isAppPath('darwin', '/Applications/Arc.app'), true);
  assert.equal(isAppPath('darwin', '/Users/ana/script.sh'), false);
  assert.equal(isAppPath('win32', 'C:\\Apps\\browser.exe'), true);
  assert.equal(isAppPath('win32', 'C:\\Apps\\run.bat'), false);
  assert.equal(isAppPath('linux', '/usr/bin/firefox'), false);
});

// --- Stopping: the main process finds the pid by port, asks, checks again and only then stops ---

function stopDeps({ entries, answer = true, after = entries, killError = null, ownPid = 9999 } = {}) {
  const calls = { confirm: [], kill: [], reads: 0 };
  return {
    calls,
    ownPid,
    read: async () => { calls.reads += 1; return calls.reads === 1 ? entries : after; },
    confirm: async (targets, port) => { calls.confirm.push([targets, port]); return answer; },
    kill: (pid) => {
      if (killError) throw Object.assign(new Error('x'), { code: killError });
      calls.kill.push(pid);
    },
  };
}

const PY_8000 = { pid: 502, process: 'Python', address: '*', port: 8000 };

test('B13: stopping asks first, naming the process and port, then stops that process', async () => {
  const deps = stopDeps({ entries: [PY_8000, { ...PY_8000, address: '::' }, { pid: 501, process: 'node', address: '127.0.0.1', port: 5173 }] });
  const result = await stopServer(8000, deps);
  assert.deepEqual(deps.calls.confirm, [[[{ pid: 502, process: 'Python' }], 8000]]);
  assert.deepEqual(deps.calls.kill, [502]);
  assert.deepEqual(result, { port: 8000, processes: ['Python'], stopped: [{ pid: 502, port: 8000, process: 'Python', restart: null }] });
});

test('B13: if the person says no, nothing is stopped', async () => {
  const deps = stopDeps({ entries: [PY_8000], answer: false });
  await assert.rejects(stopServer(8000, deps), { code: 'stopRejected' });
  assert.deepEqual(deps.calls.kill, []);
});

test('B14: Qubbot itself and system processes are never stopped', async () => {
  for (const pid of [9999, 0, 1, 4]) {
    const deps = stopDeps({ entries: [{ pid, process: 'x', address: '127.0.0.1', port: 7811 }] });
    await assert.rejects(stopServer(7811, deps), { code: 'protected' }, String(pid));
    assert.deepEqual(deps.calls.confirm, []);
    assert.deepEqual(deps.calls.kill, []);
  }
});

test('B15: a port nobody listens on, or a server that stopped while the dialog was open, is "not running"', async () => {
  const none = stopDeps({ entries: [] });
  await assert.rejects(stopServer(8000, none), { code: 'notRunning' });
  assert.deepEqual(none.calls.confirm, []);
  const gone = stopDeps({ entries: [PY_8000], after: [] });
  await assert.rejects(stopServer(8000, gone), { code: 'notRunning' });
  assert.deepEqual(gone.calls.kill, []);
});

test('B15: after the dialog only the processes that still listen on that port are stopped (no reused pids)', async () => {
  const deps = stopDeps({ entries: [PY_8000, { pid: 600, process: 'node', address: '*', port: 8000 }], after: [{ pid: 600, process: 'node', address: '*', port: 8000 }, { pid: 502, process: 'Python', address: '*', port: 9000 }] });
  await stopServer(8000, deps);
  assert.deepEqual(deps.calls.kill, [600]);
});

test('B15: a process of another user or of the system cannot be stopped without permission', async () => {
  const deps = stopDeps({ entries: [PY_8000], killError: 'EPERM' });
  await assert.rejects(stopServer(8000, deps), { code: 'notAllowed' });
  const gone = stopDeps({ entries: [PY_8000], killError: 'ESRCH' });
  await assert.rejects(stopServer(8000, gone), { code: 'notRunning' });
});

test('B7: stopping also refuses anything that is not a port', async () => {
  const deps = stopDeps({ entries: [PY_8000] });
  for (const bad of ['8000', -1, 0, 70000, 8000.5, null]) await assert.rejects(stopServer(bad, deps), { code: 'invalidPort' });
  assert.equal(deps.calls.reads, 0);
});

// --- Pause and resume: the same process is frozen and continues exactly where it was ---

function pauseDeps({ entries, paused = new Map(), signalError = null, ownPid = 9999 } = {}) {
  const calls = { signal: [] };
  return {
    calls,
    paused,
    ownPid,
    read: async () => entries,
    signal: async (pid, action) => {
      if (signalError) throw Object.assign(new Error('x'), { code: signalError });
      calls.signal.push([pid, action]);
    },
  };
}

test('B16: pausing freezes every process on that port and remembers it; no dialog needed', async () => {
  const deps = pauseDeps({ entries: [PY_8000, { ...PY_8000, address: '::' }, { pid: 501, process: 'node', address: '127.0.0.1', port: 5173 }] });
  const result = await pauseServer(8000, deps);
  assert.deepEqual(deps.calls.signal, [[502, 'pause']]);
  assert.deepEqual([...deps.paused.keys()], [502]);
  assert.deepEqual(result, { port: 8000, processes: ['Python'] });
});

test('B16: Qubbot, system processes, unknown ports and refused signals are not paused', async () => {
  for (const pid of [9999, 0, 1, 4]) {
    const deps = pauseDeps({ entries: [{ pid, process: 'x', address: '127.0.0.1', port: 7811 }] });
    await assert.rejects(pauseServer(7811, deps), { code: 'protected' });
    assert.deepEqual(deps.calls.signal, []);
  }
  await assert.rejects(pauseServer(8000, pauseDeps({ entries: [] })), { code: 'notRunning' });
  await assert.rejects(pauseServer('8000', pauseDeps({ entries: [PY_8000] })), { code: 'invalidPort' });
  const refused = pauseDeps({ entries: [PY_8000], signalError: 'EPERM' });
  await assert.rejects(pauseServer(8000, refused), { code: 'notAllowed' });
  assert.equal(refused.paused.size, 0);
});

test('B17: resuming continues only the processes Qubbot paused on that port', async () => {
  const paused = new Map([[502, { port: 8000 }]]);
  const deps = pauseDeps({ entries: [PY_8000, { pid: 600, process: 'node', address: '*', port: 8000 }], paused });
  await resumeServer(8000, deps);
  assert.deepEqual(deps.calls.signal, [[502, 'resume']]); // 600 was never paused by Qubbot
  assert.equal(paused.size, 0);
  await assert.rejects(resumeServer(8000, deps), { code: 'notPaused' });
});

test('B13/B16: stopping a paused process also lets it continue, so the stop signal arrives', () => {
  const sent = [];
  const paused = new Map([[502, { port: 8000 }]]);
  terminate(502, { platform: 'darwin', paused, kill: (pid, sig) => sent.push([pid, sig]) });
  assert.deepEqual(sent, [[502, 'SIGTERM'], [502, 'SIGCONT']]);
  assert.equal(paused.size, 0);
  const plain = [];
  terminate(600, { platform: 'darwin', paused, kill: (pid, sig) => plain.push([pid, sig]) });
  assert.deepEqual(plain, [[600, 'SIGTERM']]);
});

// --- Stop and reactivate inside Qubbot (macOS): no Terminal window, the server runs as a child of the app ---

test('B18: before stopping, the command and folder are read so the server can be reactivated', async () => {
  const order = [];
  const deps = stopDeps({ entries: [PY_8000] });
  deps.capture = async (pid) => { order.push(['capture', pid]); return { command: 'python3 -m http.server 8000', cwd: '/Users/ana/site' }; };
  const kill = deps.kill;
  deps.kill = (pid) => { order.push(['kill', pid]); kill(pid); };
  const result = await stopServer(8000, deps);
  assert.deepEqual(order, [['capture', 502], ['kill', 502]]);
  assert.deepEqual(result.stopped, [{ pid: 502, port: 8000, process: 'Python', restart: { command: 'python3 -m http.server 8000', cwd: '/Users/ana/site' } }]);
});

test('B18: on macOS the command comes from ps and the folder from lsof; Windows cannot reactivate yet', async () => {
  const calls = [];
  const run = async (file, args) => {
    calls.push([file, args]);
    return file === '/bin/ps' ? 'python3 -m http.server 8000\n' : 'p502\nfcwd\nn/Users/ana/my site\n';
  };
  assert.deepEqual(await captureRestart(502, { platform: 'darwin', run }), { command: 'python3 -m http.server 8000', cwd: '/Users/ana/my site' });
  assert.deepEqual(calls, [['/bin/ps', ['-ww', '-o', 'command=', '-p', '502']], ['/usr/sbin/lsof', ['-a', '-p', '502', '-d', 'cwd', '-Fn']]]);
  assert.equal(await captureRestart(502, { platform: 'win32', run }), null);
  assert.equal(await captureRestart(502, { platform: 'darwin', run: async () => '' }), null);
});

test('B18: secrets in a command are hidden in the dialog', () => {
  assert.equal(
    maskSecrets('node app.js --password=hunter2 --token abc123 API_KEY=xyz --port 3000'),
    'node app.js --password=•••• --token •••• API_KEY=•••• --port 3000',
  );
});

test('B19: it starts through a login shell with the words as arguments, so nothing is run as shell code', () => {
  const [file, args, opts] = managedLaunch("node server.js --name it's; rm -rf ~ $(whoami)", '/Users/ana/my site', { shell: '/bin/zsh' });
  assert.equal(file, '/bin/zsh');
  assert.deepEqual(args, ['-l', '-c', 'exec "$@"', 'platanus', 'node', 'server.js', '--name', "it's;", 'rm', '-rf', '~', '$(whoami)']);
  assert.equal(opts.cwd, '/Users/ana/my site');
  assert.deepEqual(opts.stdio, ['ignore', 'pipe', 'pipe']);
  assert.equal(opts.detached, false);
  assert.equal(managedLaunch('a', '/x', { shell: '/bin/bash' })[0], '/bin/bash');
  assert.equal(managedLaunch('a', '/x', { shell: '/opt/homebrew/bin/fish' })[0], '/bin/zsh'); // only zsh or bash
  assert.equal(managedLaunch('a', '/x', { shell: 'zsh; rm -rf ~' })[0], '/bin/zsh');
});

test('B19: the output keeps the last lines, without terminal colors', () => {
  const out = createOutputBuffer(3);
  out.push('\x1b[32mready\x1b[0m in 120 ms\nline 2\n');
  out.push('line 3\nline');
  out.push(' 4\n');
  assert.equal(out.text(), 'line 2\nline 3\nline 4');
  const partial = createOutputBuffer(5);
  partial.push('Serving on 8000');
  assert.equal(partial.text(), 'Serving on 8000');
});

function fakeSpawn() {
  const { EventEmitter } = require('node:events');
  const children = [];
  const spawn = (file, args, opts) => {
    const child = new EventEmitter();
    Object.assign(child, { pid: 700 + children.length, stdout: new EventEmitter(), stderr: new EventEmitter(), file, args, opts });
    children.push(child);
    return child;
  };
  return { spawn, children };
}

test('B19: a managed server keeps its command, folder and output; a stop by the person is not a crash', () => {
  const { spawn, children } = fakeSpawn();
  const exits = [];
  const managed = createManagedServers({ spawn, shell: '/bin/zsh', onExit: (entry, info) => exits.push([entry.port, info]) });
  const pid = managed.start({ port: 8000, process: 'Python', restart: { command: 'python3 -m http.server 8000', cwd: '/site' } });
  assert.equal(pid, 700);
  assert.equal(children[0].file, '/bin/zsh');
  assert.equal(managed.has(700), true);
  assert.deepEqual(managed.restartInfo(700), { command: 'python3 -m http.server 8000', cwd: '/site' });
  children[0].stderr.emit('data', Buffer.from('Serving HTTP on :: port 8000\n'));
  assert.equal(managed.output(700), 'Serving HTTP on :: port 8000');
  managed.markExpected(700);
  children[0].emit('exit', null, 'SIGTERM');
  assert.deepEqual(exits, [[8000, { code: null, signal: 'SIGTERM', expected: true, output: 'Serving HTTP on :: port 8000' }]]);
  assert.equal(managed.has(700), false);
});

test('B19: a managed server that dies on its own is reported with its code; a failed start too', () => {
  const { spawn, children } = fakeSpawn();
  const exits = [];
  const managed = createManagedServers({ spawn, onExit: (_entry, info) => exits.push(info) });
  managed.start({ port: 3000, process: 'node', restart: { command: 'node app.js', cwd: '/app' } });
  children[0].stderr.emit('data', 'Error: Cannot find module\n');
  children[0].emit('exit', 1, null);
  assert.deepEqual(exits[0], { code: 1, signal: null, expected: false, output: 'Error: Cannot find module' });
  managed.start({ port: 3001, process: 'node', restart: { command: 'node app.js', cwd: '/app' } });
  children[1].emit('error', Object.assign(new Error('spawn /bin/zsh ENOENT'), { code: 'ENOENT' }));
  children[1].emit('exit', -2, null); // a second event for the same process is ignored
  assert.equal(exits.length, 2);
  assert.equal(exits[1].expected, false);
  assert.match(exits[1].output, /ENOENT/);
});

test('B19: when Qubbot quits, every server it started is stopped', () => {
  const { spawn } = fakeSpawn();
  const sent = [];
  const managed = createManagedServers({ spawn, onExit: () => {} });
  managed.start({ port: 1, process: 'a', restart: { command: 'a', cwd: '/' } });
  managed.start({ port: 2, process: 'b', restart: { command: 'b', cwd: '/' } });
  managed.stopAll((pid, sig) => sent.push([pid, sig]));
  assert.deepEqual(sent, [[700, 'SIGTERM'], [701, 'SIGTERM']]);
});

const ids = () => { let n = 0; return () => `a${String(++n).padStart(15, '0')}`; };

test('B18: the stopped list keeps the command here; the page gets id, port, name, state, code and whether it can be reactivated', () => {
  const reg = createStoppedRegistry({ newId: ids(), now: () => 1000 });
  reg.add({ port: 8000, process: 'Python', restart: { command: 'python3 -m http.server 8000', cwd: '/x' } });
  reg.add({ port: 5173, process: 'node', restart: null, state: 'exited', exitCode: 1, output: 'boom' });
  reg.add({ port: 8000, process: 'Python', restart: { command: 'python3 -m http.server 8000', cwd: '/x' } }); // same server again: replaces
  assert.deepEqual(reg.list(), [
    { id: 'a000000000000003', port: 8000, process: 'Python', canRestart: true, state: 'stopped', exitCode: null, hasOutput: false, at: 1000 },
    { id: 'a000000000000002', port: 5173, process: 'node', canRestart: false, state: 'exited', exitCode: 1, hasOutput: true, at: 1000 },
  ]);
  assert.equal(reg.get('a000000000000003').restart.cwd, '/x');
  assert.equal(reg.get('../etc'), null);
  reg.update('a000000000000003', { state: 'starting', pid: 900 });
  assert.equal(reg.findByPid(900).id, 'a000000000000003');
  reg.forget('a000000000000002');
  assert.equal(reg.list().length, 1);
});

function restartDeps({ answer = true, entry, busy = false } = {}) {
  const registry = createStoppedRegistry({ newId: () => 'b000000000000001', now: () => 1 });
  registry.add(entry ?? { port: 8000, process: 'Python', restart: { command: 'python3 -m http.server 8000', cwd: '/Users/ana/site' } });
  const calls = { confirm: [], start: [] };
  return {
    calls,
    registry,
    platform: 'darwin',
    isPortBusy: async () => busy,
    confirm: async (row) => { calls.confirm.push(row); return answer; },
    start: (row) => { calls.start.push(row); return 900; },
  };
}

test('B18: reactivating asks first, then starts it inside Qubbot; the row waits as "starting"', async () => {
  const deps = restartDeps();
  const result = await restartServer('b000000000000001', deps);
  assert.equal(deps.calls.confirm[0].command, 'python3 -m http.server 8000');
  assert.equal(deps.calls.confirm[0].cwd, '/Users/ana/site');
  assert.equal(deps.calls.start[0].restart.cwd, '/Users/ana/site');
  assert.deepEqual(result, { port: 8000, process: 'Python' });
  assert.equal(deps.registry.list()[0].state, 'starting');
  assert.equal(deps.registry.findByPid(900).id, 'b000000000000001');
});

test('B18: no, a busy port, a second click, unknown ids and missing commands start nothing', async () => {
  const no = restartDeps({ answer: false });
  await assert.rejects(restartServer('b000000000000001', no), { code: 'restartRejected' });
  assert.deepEqual(no.calls.start, []);
  assert.equal(no.registry.list()[0].state, 'stopped');

  const busy = restartDeps({ busy: true });
  await assert.rejects(restartServer('b000000000000001', busy), { code: 'portInUse' });
  assert.deepEqual(busy.calls.confirm, []);

  const twice = restartDeps();
  await restartServer('b000000000000001', twice);
  await assert.rejects(restartServer('b000000000000001', twice), { code: 'alreadyStarting' });
  assert.equal(twice.calls.start.length, 1);

  await assert.rejects(restartServer('nope', restartDeps()), { code: 'unknownStopped' });
  const blind = restartDeps({ entry: { port: 3000, process: 'next-server', restart: null } });
  await assert.rejects(restartServer('b000000000000001', blind), { code: 'cannotRestart' });
  await assert.rejects(restartServer('b000000000000001', { ...restartDeps(), platform: 'win32' }), { code: 'cannotRestart' });
});

test('B19: once something listens on its port (it, or a process it spawned) the row leaves "Detenidos"', () => {
  const reg = createStoppedRegistry({ newId: ids(), now: () => 1 });
  const id = reg.add({ port: 8000, process: 'Python', restart: { command: 'x', cwd: '/' } });
  reg.add({ port: 3000, process: 'node', restart: { command: 'y', cwd: '/' } }); // stopped, not starting: stays
  reg.update(id, { state: 'starting', pid: 900 });
  reconcileStarting(reg, [{ pid: 900, port: 9999 }, { pid: 77, port: 3000 }]);
  assert.equal(reg.list().length, 2);
  reconcileStarting(reg, [{ pid: 901, port: 8000 }]); // a worker spawned by 900
  assert.deepEqual(reg.list().map((r) => r.port), [3000]);
});
