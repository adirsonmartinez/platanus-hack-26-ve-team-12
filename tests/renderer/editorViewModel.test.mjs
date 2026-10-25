// File editor: files clicked on the map open as tabs in a floating window, can be edited and saved.
import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEventBus, EVENTS } from '../../renderer/core/eventBus.js';
import { EditorViewModel } from '../../renderer/viewmodels/editorViewModel.js';

const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); };

// Fake workspace: files on "disk" as { path: { content, mtime, secret? } }
function fakeWorkspace(disk = {}, { saveReply = null } = {}) {
  const calls = { open: [], save: [] };
  return {
    calls,
    disk,
    openFile: async (path) => {
      calls.open.push(path);
      const f = disk[path];
      if (!f) return { ok: false, error: 'no existe' };
      if (f.code) return { ok: false, code: f.code, error: f.code };
      return { ok: true, data: { content: f.content, mtime: f.mtime, secret: Boolean(f.secret) } };
    },
    saveFile: async (path, content, mtime) => {
      calls.save.push([path, content, mtime]);
      if (saveReply) return saveReply;
      disk[path] = { ...disk[path], content, mtime: disk[path].mtime + 1 };
      return { ok: true, data: { mtime: disk[path].mtime } };
    },
  };
}

function setup(disk, options) {
  const bus = createEventBus();
  const workspace = fakeWorkspace(disk, options);
  const vm = new EditorViewModel({ workspace, bus });
  return { bus, workspace, vm };
}

const DISK = () => ({
  'src/a.ts': { content: 'const a = 1;\n', mtime: 10 },
  'src/b.ts': { content: 'const b = 2;\n', mtime: 20 },
  '.env': { content: 'KEY=123\n', mtime: 30, secret: true },
});
const tab = (vm, path) => vm.store.state.tabs.find((t) => t.path === path);

test('a file selected on the map opens as the active tab of a visible window', async () => {
  const { bus, vm } = setup(DISK());
  bus.emit(EVENTS.fileSelected, { path: 'src/a.ts', level: 'green' });
  assert.equal(tab(vm, 'src/a.ts').status, 'loading');
  await flush();
  const { open, active } = vm.store.state;
  assert.equal(open, true);
  assert.equal(active, 'src/a.ts');
  assert.deepEqual(
    { status: tab(vm, 'src/a.ts').status, name: tab(vm, 'src/a.ts').name, content: tab(vm, 'src/a.ts').content, level: tab(vm, 'src/a.ts').level },
    { status: 'ready', name: 'a.ts', content: 'const a = 1;\n', level: 'green' },
  );
});

test('several files open as tabs; opening one again only activates it (no second read)', async () => {
  const { vm, workspace } = setup(DISK());
  await vm.open('src/a.ts');
  await vm.open('src/b.ts');
  await vm.open('src/a.ts');
  assert.deepEqual(vm.store.state.tabs.map((t) => t.path), ['src/a.ts', 'src/b.ts']);
  assert.equal(vm.store.state.active, 'src/a.ts');
  assert.deepEqual(workspace.calls.open, ['src/a.ts', 'src/b.ts']);
});

test('secret files open too, flagged as secret', async () => {
  const { vm } = setup(DISK());
  await vm.open('.env');
  assert.equal(tab(vm, '.env').content, 'KEY=123\n');
  assert.equal(tab(vm, '.env').secret, true);
});

test('a file that cannot be read shows its error in the tab', async () => {
  const disk = { 'img.png': { code: 'binary' } };
  const { vm } = setup(disk);
  await vm.open('img.png');
  assert.deepEqual([tab(vm, 'img.png').status, tab(vm, 'img.png').error], ['error', 'binary']);
});

test('editing marks the tab dirty; saving sends the content and the mtime it was read with', async () => {
  const { vm, workspace } = setup(DISK());
  await vm.open('src/a.ts');
  vm.edit('src/a.ts', 'const a = 42;\n');
  assert.equal(vm.isDirty('src/a.ts'), true);
  await vm.save('src/a.ts');
  assert.deepEqual(workspace.calls.save, [['src/a.ts', 'const a = 42;\n', 10]]);
  assert.equal(vm.isDirty('src/a.ts'), false);
  assert.equal(tab(vm, 'src/a.ts').mtime, 11);
});

test('saving a clean tab does nothing', async () => {
  const { vm, workspace } = setup(DISK());
  await vm.open('src/a.ts');
  await vm.save('src/a.ts');
  assert.equal(workspace.calls.save.length, 0);
});

test('a save refused because the file changed on disk marks the tab stale and keeps the edits', async () => {
  const { vm } = setup(DISK(), { saveReply: { ok: false, code: 'changedOnDisk', error: 'cambió' } });
  await vm.open('src/a.ts');
  vm.edit('src/a.ts', 'mine');
  await vm.save('src/a.ts');
  assert.equal(tab(vm, 'src/a.ts').stale, true);
  assert.equal(tab(vm, 'src/a.ts').content, 'mine');
  assert.equal(vm.isDirty('src/a.ts'), true);
});

test('a cancelled save (the person said no) leaves the tab dirty without an error', async () => {
  const { vm } = setup(DISK(), { saveReply: { ok: false, code: 'cancelled', error: 'cancelado' } });
  await vm.open('.env');
  vm.edit('.env', 'KEY=456\n');
  await vm.save('.env');
  assert.equal(tab(vm, '.env').saveError, null);
  assert.equal(vm.isDirty('.env'), true);
});

test('a dirty tab does not close unless forced; closing the last tab hides the window', async () => {
  const { vm } = setup(DISK());
  await vm.open('src/a.ts');
  await vm.open('src/b.ts');
  vm.edit('src/b.ts', 'x');
  assert.equal(vm.close('src/b.ts'), false);
  assert.equal(vm.close('src/b.ts', { force: true }), true);
  assert.equal(vm.store.state.active, 'src/a.ts');
  vm.close('src/a.ts');
  assert.deepEqual([vm.store.state.tabs.length, vm.store.state.open, vm.store.state.active], [0, false, null]);
});

test('a change on disk reloads a clean tab and marks a dirty one stale', async () => {
  const { bus, vm, workspace } = setup(DISK());
  await vm.open('src/a.ts');
  await vm.open('src/b.ts');
  vm.edit('src/b.ts', 'mine');
  workspace.disk['src/a.ts'] = { content: 'from disk', mtime: 99 };
  bus.emit(EVENTS.diskChanged, { paths: ['src/a.ts', 'src/b.ts'] });
  await flush();
  assert.deepEqual([tab(vm, 'src/a.ts').content, tab(vm, 'src/a.ts').mtime], ['from disk', 99]);
  assert.deepEqual([tab(vm, 'src/b.ts').content, tab(vm, 'src/b.ts').stale], ['mine', true]);
});

test('reload discards the edits and reads the file again', async () => {
  const { vm, workspace } = setup(DISK());
  await vm.open('src/a.ts');
  vm.edit('src/a.ts', 'mine');
  workspace.disk['src/a.ts'] = { content: 'theirs', mtime: 50 };
  await vm.reload('src/a.ts');
  assert.deepEqual([tab(vm, 'src/a.ts').content, vm.isDirty('src/a.ts'), tab(vm, 'src/a.ts').stale], ['theirs', false, false]);
});

test('opening or closing a project closes every tab', async () => {
  const { bus, vm } = setup(DISK());
  await vm.open('src/a.ts');
  bus.emit(EVENTS.projectClosed, {});
  assert.deepEqual([vm.store.state.tabs.length, vm.store.state.open], [0, false]);
  await vm.open('src/a.ts');
  bus.emit(EVENTS.projectOpened, { name: 'x' });
  assert.equal(vm.store.state.tabs.length, 0);
});

// --- Preview («Vista previa»): pages and images of the project, and the project running on localhost ---

function previewSetup(disk = {}) {
  const bus = createEventBus();
  const workspace = fakeWorkspace({
    'index.html': { content: '<h1>hola</h1>', mtime: 1 },
    'src/a.ts': { content: 'const a = 1;\n', mtime: 10 },
    'logo.svg': { content: '<svg/>', mtime: 2 },
    ...disk,
  });
  const vm = new EditorViewModel({ workspace, bus, preview: true });
  return { bus, workspace, vm };
}

test('preview: a page opens in its preview, with the code one click away; code files have none', async () => {
  const { vm } = previewSetup();
  await vm.open('index.html');
  const page = tab(vm, 'index.html');
  assert.equal(page.view, 'preview');
  assert.equal(page.canPreview, true);
  assert.equal(page.content, '<h1>hola</h1>', 'the code is read too, for the code view');
  assert.equal(vm.previewUrl('index.html'), 'qubbot-preview://project/index.html?v=0');
  vm.setView('index.html', 'code');
  assert.equal(tab(vm, 'index.html').view, 'code');
  await vm.open('src/a.ts');
  assert.equal(tab(vm, 'src/a.ts').view, 'code');
  assert.equal(tab(vm, 'src/a.ts').canPreview, false);
  vm.setView('src/a.ts', 'preview');
  assert.equal(tab(vm, 'src/a.ts').view, 'code', 'nothing to preview');
  assert.equal(vm.previewUrl('src/a.ts'), null);
});

test('preview: an image is preview only (its bytes are not read as text); paths are encoded', async () => {
  const { vm, workspace } = previewSetup();
  await vm.open('img/mi foto.png');
  const image = tab(vm, 'img/mi foto.png');
  assert.equal(image.status, 'ready');
  assert.equal(image.view, 'preview');
  assert.equal(image.previewOnly, true);
  assert.ok(!workspace.calls.open.includes('img/mi foto.png'));
  assert.equal(vm.previewUrl('img/mi foto.png'), 'qubbot-preview://project/img/mi%20foto.png?v=0');
  vm.setView('img/mi foto.png', 'code');
  assert.equal(tab(vm, 'img/mi foto.png').view, 'preview');
});

test('preview: refresh, and any change on disk, reloads the pages in preview (CSS or scripts may have changed)', async () => {
  const { vm, bus } = previewSetup();
  await vm.open('index.html');
  vm.refresh('index.html');
  assert.equal(vm.previewUrl('index.html'), 'qubbot-preview://project/index.html?v=1');
  bus.emit(EVENTS.diskChanged, { paths: ['css/site.css'] });
  assert.equal(vm.previewUrl('index.html'), 'qubbot-preview://project/index.html?v=2');
  vm.setView('index.html', 'code');
  bus.emit(EVENTS.diskChanged, { paths: ['css/site.css'] });
  assert.equal(vm.previewUrl('index.html'), 'qubbot-preview://project/index.html?v=2', 'not while the code is shown');
});

test('preview: the project running on this computer opens as a preview tab; only localhost addresses', () => {
  const { vm } = previewSetup();
  assert.equal(vm.openUrl('http://localhost:3000'), true);
  const web = tab(vm, 'http://localhost:3000');
  assert.equal(web.kind, 'web');
  assert.equal(web.name, 'localhost:3000');
  assert.equal(web.view, 'preview');
  assert.equal(web.previewOnly, true);
  assert.equal(vm.store.state.active, 'http://localhost:3000');
  assert.equal(vm.previewUrl('http://localhost:3000'), 'http://localhost:3000/');
  vm.refresh('http://localhost:3000');
  assert.equal(vm.previewUrl('http://localhost:3000'), 'http://localhost:3000/', 'the view reloads the frame itself');
  assert.equal(tab(vm, 'http://localhost:3000').stamp, 1);
  assert.equal(vm.openUrl('http://127.0.0.1:5173/app'), true);
  for (const bad of ['https://example.com', 'http://localhost', 'file:///etc/passwd', 'http://localhost.evil.com:3000', 'javascript:alert(1)', 'http://localhost:99999']) {
    assert.equal(vm.openUrl(bad), false, bad);
  }
  assert.equal(vm.openUrl('http://localhost:3000'), true, 'the same address again: the same tab');
  assert.equal(vm.store.state.tabs.filter((t) => t.kind === 'web').length, 2);
});

test('preview: off (the web version, no desktop) -> pages open as code, no localhost tabs', async () => {
  const { vm } = setup({ 'index.html': { content: '<h1>x</h1>', mtime: 1 } });
  await vm.open('index.html');
  assert.equal(tab(vm, 'index.html').view, 'code');
  assert.equal(tab(vm, 'index.html').canPreview, false);
  assert.equal(vm.openUrl('http://localhost:3000'), false);
});
