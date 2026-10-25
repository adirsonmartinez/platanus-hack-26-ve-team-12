// The browser window: pages and images of the project, and the project running on localhost, in tabs.
import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEventBus, EVENTS } from '../../renderer/core/eventBus.js';
import { BrowserViewModel, canPreview } from '../../renderer/viewmodels/browserViewModel.js';

const setup = () => {
  const bus = createEventBus();
  return { bus, vm: new BrowserViewModel({ bus }) };
};
const tab = (vm, path) => vm.store.state.tabs.find((t) => t.path === path);

test('canPreview: pages, SVG and images', () => {
  for (const p of ['index.html', 'a/b.HTM', 'logo.svg', 'f.png', 'f.jpeg', 'f.webp', 'f.gif']) assert.equal(canPreview(p), true, p);
  for (const p of ['src/a.ts', 'README.md', '.env', 'style.css']) assert.equal(canPreview(p), false, p);
});

test('a project file opens as a tab and becomes the active one; the address is encoded', () => {
  const { vm } = setup();
  assert.equal(vm.openFile('index.html'), true);
  assert.equal(vm.openFile('img/mi foto.png'), true);
  assert.equal(vm.openFile('src/a.ts'), false);
  const s = vm.store.state;
  assert.equal(s.open, true);
  assert.equal(s.active, 'img/mi foto.png');
  assert.deepEqual(s.tabs.map((t) => [t.path, t.kind, t.name]), [['index.html', 'file', 'index.html'], ['img/mi foto.png', 'file', 'mi foto.png']]);
  assert.equal(vm.url('img/mi foto.png'), 'qubbot-preview://project/img/mi%20foto.png?v=0');
  assert.equal(tab(vm, 'index.html').page, true, 'a page has code to show');
  assert.equal(tab(vm, 'img/mi foto.png').page, false);
  vm.openFile('index.html');
  assert.equal(vm.store.state.tabs.length, 2, 'the same file again: the same tab');
  assert.equal(vm.store.state.active, 'index.html');
});

test('the project on localhost: only http://localhost or 127.0.0.1 with a port', () => {
  const { vm } = setup();
  assert.equal(vm.openUrl('http://localhost:3000'), true);
  assert.deepEqual([tab(vm, 'http://localhost:3000').kind, tab(vm, 'http://localhost:3000').name], ['web', 'localhost:3000']);
  assert.equal(vm.url('http://localhost:3000'), 'http://localhost:3000/');
  assert.equal(vm.openUrl('http://127.0.0.1:5173/app'), true);
  for (const bad of ['https://example.com', 'http://localhost', 'file:///etc/passwd', 'http://localhost.evil.com:3000', 'javascript:alert(1)', 'http://localhost:99999', 'http://localhost:0']) {
    assert.equal(vm.openUrl(bad), false, bad);
  }
});

test('refresh and any change on disk reload the project pages (a CSS or a script may have changed)', () => {
  const { vm, bus } = setup();
  vm.openFile('index.html');
  vm.openUrl('http://localhost:3000');
  vm.refresh('index.html');
  assert.equal(vm.url('index.html'), 'qubbot-preview://project/index.html?v=1');
  bus.emit(EVENTS.diskChanged, { paths: ['css/site.css'] });
  assert.equal(vm.url('index.html'), 'qubbot-preview://project/index.html?v=2');
  assert.equal(tab(vm, 'http://localhost:3000').stamp, 0, 'the dev server reloads itself');
  vm.refresh('http://localhost:3000');
  assert.equal(tab(vm, 'http://localhost:3000').stamp, 1, 'by hand it does');
});

test('close picks the neighbour; the last one closes the window; a project change closes everything', () => {
  const { vm, bus } = setup();
  vm.openFile('a.html');
  vm.openFile('b.html');
  vm.openFile('c.html');
  vm.activate('b.html');
  vm.close('b.html');
  assert.equal(vm.store.state.active, 'c.html');
  vm.close('c.html');
  vm.close('a.html');
  assert.equal(vm.store.state.open, false);
  vm.openFile('a.html');
  vm.hide();
  assert.equal(vm.store.state.open, false);
  assert.equal(vm.store.state.tabs.length, 1, 'hidden, not closed');
  vm.show();
  assert.equal(vm.store.state.open, true);
  bus.emit(EVENTS.projectOpened, {});
  assert.deepEqual(vm.store.state, { open: false, tabs: [], active: null });
});
