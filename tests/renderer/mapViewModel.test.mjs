import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { MapViewModel } from '../../renderer/viewmodels/mapViewModel.js';
import { SecurityModel } from '../../renderer/models/securityModel.js';
import { Observable } from '../../renderer/core/observable.js';
import { createEventBus, EVENTS } from '../../renderer/core/eventBus.js';
import { screenOf } from '../../renderer/viewmodels/layout.js';

const at = (item) => screenOf(item.x, item.z); // { u: right, v: down } on screen

const file = (path) => ({ type: 'file', path, size: 100 });
const dir = (path, children) => ({ type: 'dir', path, children });

// src has a red file two levels down and a yellow one; docs and tests are clean; .env at the root is red
const TREE = [
  file('.env'),
  file('README.md'),
  file('package.json'),
  dir('src', [
    file('src/index.js'),
    file('src/login.js'),
    dir('src/lib', [dir('src/lib/keys', [file('src/lib/keys/server.pem')]), file('src/lib/util.js')]),
  ]),
  dir('docs', [file('docs/guide.md')]),
  dir('tests', [file('tests/app.test.js')]),
];

function setup(tree = TREE) {
  const security = new SecurityModel();
  const projectModel = { store: new Observable({ open: true, name: 'demo', tree, usesSupabase: false, integrations: [], session: 1 }) };
  const flights = [];
  const supabase = { store: { state: { schemaOpen: false } }, openSchema() {}, setOnScreen() {}, selectTable() {} };
  const bus = createEventBus();
  const events = [];
  for (const name of ['folderOpened', 'fileSelected']) bus.on(EVENTS[name], (p) => events.push([name, p]));
  const vm = new MapViewModel({
    projectModel, securityModel: security, camera: { flyTo: (to, zoom) => flights.push({ ...to, zoom }), reset() {} }, supabaseViewModel: supabase, bus,
  });
  projectModel.store.set({ session: 1 }); // first compute
  return { vm, security, projectModel, events, flights, state: () => vm.store.state };
}

test('a project without problems shows every top-level folder and root file, all calm', () => {
  const { state } = setup([file('README.md'), file('package.json'), dir('docs', [file('docs/guide.md')]), dir('app', [file('app/main.js')])]);
  assert.equal(state().status, 'ready');
  assert.deepEqual(state().buildings.map((b) => b.path), ['app', 'docs']);
  assert.ok(state().buildings.every((b) => b.level === 'green'));
  assert.deepEqual(state().rootFiles.files.map((f) => f.path), ['package.json', 'README.md']);
  assert.equal(state().rootFiles.more, 0);
  assert.equal(state().opened, null);
});

test('folders with problems come first (worst first), then the rest by name', () => {
  const { state } = setup();
  assert.deepEqual(state().buildings.map((b) => b.path), ['src', 'docs', 'tests']);
  const [src, docs] = state().buildings;
  assert.equal(src.level, 'red');
  assert.equal(src.red, 1);
  assert.equal(src.yellow, 1);
  assert.equal(docs.level, 'green');
});

test('root files follow the top-level folders in the same rows, right after the last one, riskiest first', () => {
  const { state } = setup();
  const { rootFiles, buildings } = state();
  assert.deepEqual(rootFiles.files.map((f) => f.path), ['.env', 'package.json', 'README.md']);
  assert.equal(rootFiles.files[0].level, 'red');
  // One row: src, docs, tests, then the files, at the same pitch
  const row = [...buildings, ...rootFiles.files].map((x) => at(x));
  row.forEach((p) => assert.ok(Math.abs(p.v - row[0].v) < 1e-9));
  const steps = row.slice(1).map((p, i) => p.u - row[i].u);
  steps.forEach((d) => assert.ok(Math.abs(d - steps[0]) < 1e-9 && d > 0));
  const many = setup(Array.from({ length: 60 }, (_, i) => file(`f${String(i).padStart(2, '0')}.txt`)));
  assert.equal(many.state().rootFiles.files.length, 48);
  assert.equal(many.state().rootFiles.more, 12);
});

test('with no folders, root files hang right below the project', () => {
  const { state } = setup([file('README.md'), file('index.html')]);
  state().rootFiles.files.forEach((f) => assert.ok(at(f).v > state().plaza.size / 2));
});

test('an open folder pushes down the rows under it, root files included', () => {
  const dirs = 'abcdefgh'.split('').map((n) => dir(n, [file(`${n}/one.js`)]));
  const { vm, state } = setup([...dirs, file('README.md')]); // README.md wraps to the second row
  const before = at(state().rootFiles.files[0]).v;
  vm.enterFolder('a');
  const lowestItem = Math.max(...state().opened.files.map((f) => at(f).v));
  const after = at(state().rootFiles.files[0]).v;
  assert.ok(after > before);
  assert.ok(after > lowestItem + 2);
});

test('opening a folder unfolds its direct subfolders and files below it', () => {
  const { vm, state } = setup();
  vm.enterFolder('src');
  assert.equal(state().path, 'src');
  const { opened } = state();
  assert.equal(opened.path, 'src');
  assert.equal(opened.top, 'src');
  assert.deepEqual(opened.folders.map((f) => f.path), ['src/lib']);
  assert.equal(opened.folders[0].level, 'red'); // the key two levels down
  assert.deepEqual(opened.files.map((f) => f.path), ['src/login.js', 'src/index.js']); // riskiest first
  // Below the folder (down on screen), under it (nudged right of the road on the left edge)
  const [src] = state().buildings;
  const items = [...opened.folders, ...opened.files];
  items.forEach((f) => assert.ok(at(f).v > at(src).v + 2));
  const mean = items.reduce((sum, f) => sum + at(f).u, 0) / items.length;
  assert.ok(Math.abs(mean - at(src).u) < 4);
  assert.equal(src.open, true);
});

test('opening a subfolder unfolds one more level, below the previous one', () => {
  const { vm, state } = setup();
  vm.enterFolder('src/lib');
  assert.equal(state().path, 'src/lib');
  assert.deepEqual(state().opened.folders.map((f) => f.path), ['src/lib/keys']);
  assert.deepEqual(state().opened.files.map((f) => f.path), ['src/lib/util.js']);
  assert.equal(state().opened.top, 'src');
  // The path stays unfolded: src's contents, then lib's, each lower
  assert.deepEqual(state().branches.map((b) => b.path), ['src', 'src/lib']);
  const [first, second] = state().branches;
  const lib = first.folders.find((f) => f.path === 'src/lib');
  assert.equal(lib.open, true);
  [...second.folders, ...second.files].forEach((f) => assert.ok(at(f).v > at(lib).v + 2));
  assert.deepEqual(state().crumbs.map((c) => [c.name, c.path]), [['demo', ''], ['src', 'src'], ['lib', 'src/lib']]);
  assert.equal(state().buildings.find((b) => b.path === 'src').open, true);
});

test('clicking an open folder on the map closes it, and everything open inside it', () => {
  const { vm, state } = setup();
  vm.handlePick({ type: 'folder', path: 'src' });
  assert.equal(state().path, 'src');
  vm.handlePick({ type: 'folder', path: 'src' });
  assert.equal(state().path, '');
  vm.handlePick({ type: 'folder', path: 'src' });
  vm.handlePick({ type: 'folder', path: 'src/lib' });
  vm.handlePick({ type: 'folder', path: 'src/lib' });
  assert.equal(state().path, 'src'); // closing lib goes back to src
  vm.handlePick({ type: 'folder', path: 'src/lib' });
  vm.handlePick({ type: 'folder', path: 'src' });
  assert.equal(state().path, ''); // closing src folds lib too
});

test('a clean folder opens too, and it is announced in the chat', () => {
  const { vm, state, events } = setup();
  vm.enterFolder('docs');
  assert.equal(state().path, 'docs');
  assert.deepEqual(state().opened.files.map((f) => f.path), ['docs/guide.md']);
  const [, detail] = events.find(([name]) => name === 'folderOpened');
  assert.equal(detail.name, 'docs/');
});

test('Esc goes up one level, then closes the folder', () => {
  const { vm, state } = setup();
  vm.enterFolder('src/lib/keys');
  assert.equal(state().path, 'src/lib/keys');
  vm.escape();
  assert.equal(state().path, 'src/lib');
  vm.escape();
  vm.escape();
  assert.equal(state().path, '');
  assert.equal(state().opened, null);
});

test('a fixed file stays on the map, calm', () => {
  const { vm, security, state } = setup();
  vm.enterFolder('src');
  security.setScore('src/login.js', 'green');
  assert.equal(state().opened.files.find((f) => f.path === 'src/login.js').level, 'green');
  security.setScore('src/lib/keys/server.pem', 'green');
  assert.equal(state().path, 'src');
  assert.equal(state().buildings.find((b) => b.path === 'src').level, 'green');
});

test('if the open folder disappears from disk, the map goes up to what is left', () => {
  const { vm, state, projectModel } = setup();
  vm.enterFolder('src/lib/keys');
  projectModel.store.set({ tree: [dir('src', [file('src/index.js'), dir('src/lib', [file('src/lib/util.js')])])] });
  assert.equal(state().path, 'src/lib');
  projectModel.store.set({ tree: [file('README.md')] });
  assert.equal(state().path, '');
});

test('a big folder shows its first items and counts the rest', () => {
  const { vm, state } = setup([dir('big', Array.from({ length: 60 }, (_, i) => file(`big/f${String(i).padStart(2, '0')}.js`)))]);
  vm.enterFolder('big');
  assert.equal(state().opened.files.length, 48);
  assert.equal(state().opened.more, 12);
});

test('locating a deep file opens the folder it is in and points at its icon', () => {
  const { vm, state } = setup();
  const spot = vm.locateFile('src/lib/keys/server.pem');
  assert.equal(state().path, 'src/lib/keys');
  const icon = state().opened.files.find((f) => f.path === 'src/lib/keys/server.pem');
  assert.equal(spot.x, icon.x);
  assert.equal(spot.z, icon.z);
  assert.equal(spot.folder, 'src');
});

test('locating a root file points at its icon', () => {
  const { vm, state } = setup();
  const spot = vm.locateFile('.env');
  const icon = state().rootFiles.files.find((f) => f.path === '.env');
  assert.equal(spot.folder, '');
  assert.deepEqual([spot.x, spot.z], [icon.x, icon.z]);
});

test('showing a file opens its folder and its card in the chat', () => {
  const { vm, state, events } = setup();
  assert.equal(vm.show('docs/guide.md'), true);
  assert.equal(state().path, 'docs');
  const [, detail] = events.find(([name]) => name === 'fileSelected');
  assert.equal(detail.path, 'docs/guide.md');
  assert.equal(detail.level, 'green');
  assert.equal(vm.show('nope.js'), false);
});

test('hover describes folders, subfolders and files on the map', () => {
  const { vm } = setup();
  vm.enterFolder('src');
  assert.equal(vm.describePick({ type: 'folder', path: 'src' }).kind, 'folder');
  assert.equal(vm.describePick({ type: 'folder', path: 'src/lib' }).level, 'red');
  assert.equal(vm.describePick({ type: 'file', path: 'src/login.js' }).level, 'yellow');
  assert.equal(vm.describePick({ type: 'file', path: 'README.md' }).level, 'green');
});

test('the project is a tree: top-level folders hang in a row below the plaza, left to right', () => {
  const { state } = setup();
  const { buildings, plaza } = state();
  buildings.forEach((b) => assert.ok(at(b).v > plaza.size / 2));
  const us = buildings.map((b) => at(b).u);
  assert.deepEqual(us, [...us].sort((a, b) => a - b));
  assert.ok(state().links.length > 0);
});

test('a folder in an upper row unfolds right below it: the rows under it move down to make room', () => {
  const dirs = 'abcdefghij'.split('').map((n) => dir(n, [file(`${n}/one.js`), dir(`${n}/sub`, [file(`${n}/sub/x.js`)])]));
  const { vm, state } = setup(dirs);
  const rowOf = () => Object.fromEntries(state().buildings.map((b) => [b.path, at(b).v]));
  const before = rowOf();
  assert.ok(before.i > before.a); // i and j are on the second row
  vm.enterFolder('a');
  const after = rowOf();
  const items = [...state().opened.folders, ...state().opened.files];
  items.forEach((f) => {
    assert.ok(at(f).v > after.a); // below a…
    assert.ok(at(f).v < after.i - 2); // …and above the next row, which moved down
  });
  assert.ok(after.i > before.i);
  assert.equal(after.b, before.b); // the open folder's own row stays put
});

test('opening another top-level folder folds the previous branch: one path at a time', () => {
  const { vm, state } = setup();
  vm.enterFolder('src/lib');
  vm.enterFolder('docs');
  assert.deepEqual(state().branches.map((b) => b.path), ['docs']);
  assert.deepEqual(state().buildings.filter((b) => b.open).map((b) => b.path), ['docs']);
});

test('with no integrations there is no band (nothing to hold)', () => {
  const { state } = setup();
  assert.equal(state().band, null);
  assert.deepEqual(state().integrations, []);
});

test('an empty project (a new one) has no name card; one with files does', () => {
  assert.equal(setup([]).state().plaza.empty, true);
  assert.equal(setup().state().plaza.empty, false);
  assert.equal(setup([file('README.md')]).state().plaza.empty, false);
});

test('the integrations band runs across the top, above the plaza and as wide as the tree', () => {
  const { state, projectModel } = setup();
  projectModel.store.set({ integrations: ['vercel'] });
  const { band, buildings } = state();
  const c = screenOf(band.x, band.z);
  assert.ok(c.v + band.depth / 2 < -state().plaza.size / 2);
  const widest = Math.max(...buildings.map((b) => Math.abs(at(b).u)));
  assert.ok(band.width / 2 > widest);
});

test('integrations sit in the band, in a row to the right of Supabase', () => {
  const { state, projectModel } = setup();
  projectModel.store.set({ integrations: ['supabase', 'vercel', 'github', 'clerk', 'posthog'], usesSupabase: true, integrationStatus: { clerk: 'incident' } });
  const { integrations, band } = state();
  assert.deepEqual(integrations.map((i) => i.status), ['connected', 'connected', 'incident', 'connected']);
  assert.deepEqual(integrations.map((i) => i.key), ['vercel', 'github', 'clerk', 'posthog']); // Supabase draws itself
  const c = screenOf(band.x, band.z);
  integrations.forEach((i) => {
    assert.ok(Math.abs(at(i).v - c.v) < band.depth / 2);
    assert.ok(at(i).u > 6 && at(i).u < band.width / 2);
  });
  const us = integrations.map((i) => at(i).u);
  assert.deepEqual(us, [...us].sort((a, b) => a - b));
});

test('lit lines: each live integration lights its way to the folders; a disconnected one stays dark', () => {
  const { state, projectModel } = setup();
  projectModel.store.set({
    integrations: ['supabase', 'vercel', 'clerk', 'posthog'], usesSupabase: true,
    integrationStatus: { vercel: 'connected', clerk: 'incident', posthog: 'disconnected' },
  });
  const { integrations, integrationLines } = state();
  const [vercel, clerk, posthog] = integrations;
  const touches = (node) => integrationLines.filter((l) => [l.from, l.to].some((p) => Math.abs(p.x - node.x) < 1e-9 && Math.abs(p.z - node.z) < 1e-9));
  assert.equal(touches(vercel)[0].status, 'connected');
  assert.equal(touches(clerk)[0].status, 'incident');
  assert.equal(touches(posthog).length, 0); // dark: nothing lit reaches it
  // The trunk down to the folders carries Vercel: purple
  const trunk = integrationLines.find((l) => Math.abs(at(l.from).u) < 1e-9 && Math.abs(at(l.to).u) < 1e-9);
  assert.equal(trunk.status, 'connected');
  // The road beyond Clerk (toward PostHog) is not lit
  const beyond = integrationLines.filter((l) => Math.max(at(l.from).u, at(l.to).u) > at(clerk).u + 1e-9);
  assert.equal(beyond.length, 0);
});

test('Supabase joins the same road and lit line as the other integrations', () => {
  const { state, projectModel } = setup();
  projectModel.store.set({ integrations: ['supabase'], usesSupabase: true, integrationStatus: { supabase: 'connected' } });
  const { integrationLines, links } = state();
  // Its drop runs on the trunk's line (u = 0), from the node down to the integrations' road
  const drop = integrationLines.find((l) => Math.abs(at(l.from).u) < 1e-9 && at(l.from).v < -12);
  assert.equal(drop.status, 'connected');
  assert.ok(links.some(([x1, z1]) => Math.abs(screenOf(x1, z1).u) < 1e-9 && screenOf(x1, z1).v < -12));
  // …and its way goes on down the trunk
  assert.ok(integrationLines.some((l) => l.status === 'connected' && at(l.to).v > 0));
  projectModel.store.set({ integrationStatus: { supabase: 'disconnected' } });
  assert.equal(state().integrationLines.length, 0);
});

test('"center view" goes back to the initial view, even with a folder open', () => {
  const { vm, flights } = setup();
  const initial = flights.at(-1);
  vm.enterFolder('src');
  assert.notDeepEqual(flights.at(-1), initial);
  vm.home();
  assert.deepEqual(flights.at(-1), initial);
});

// A new project: the workspace creates an empty folder and opens it
function setupNew() {
  const s = setup([]);
  s.projectModel.create = async () => {
    s.projectModel.store.set({ tree: [], session: s.projectModel.store.state.session + 1 });
    return { ok: true, data: { name: 'nuevo' } };
  };
  return s;
}

test('a just created, empty project shows the robot that asks what to build', async () => {
  const { vm, state, flights } = setupNew();
  assert.equal(state().welcome, false);
  await vm.createProject();
  assert.equal(state().welcome, true);
  // The camera comes closer to the plaza, so the robot reads well
  const last = flights.at(-1);
  assert.deepEqual([last.x, last.z], [0, 0]);
  assert.ok(last.zoom > 1.5);
});

test('the robot leaves once the project has files, and does not come back', async () => {
  const { vm, state, projectModel } = setupNew();
  await vm.createProject();
  projectModel.store.set({ tree: [file('index.html')] });
  assert.equal(state().welcome, false);
  projectModel.store.set({ tree: [] });
  assert.equal(state().welcome, false);
});

test('opening an existing project, even an empty one, shows no robot', () => {
  const { state, projectModel } = setup([]);
  projectModel.store.set({ session: 2 });
  assert.equal(state().welcome, false);
});

test('the robot leaves when another project is opened', async () => {
  const { vm, state, projectModel } = setupNew();
  await vm.createProject();
  projectModel.store.set({ session: projectModel.store.state.session + 1 });
  assert.equal(state().welcome, false);
});
