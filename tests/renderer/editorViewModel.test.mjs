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
