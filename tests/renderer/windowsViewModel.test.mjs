// Where the editor and the browser windows go: halves when both open, Qubi's zones by voice, the person's drag wins.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Observable } from '../../renderer/core/observable.js';
import { WindowsViewModel } from '../../renderer/viewmodels/windowsViewModel.js';

// A window as the view model sees it: an { open, tabs } store and show()
function fakeWindow(open = false, tabs = open ? 1 : 0) {
  const store = new Observable({ open, tabs: Array.from({ length: tabs }, (_, i) => ({ path: `t${i}` })) });
  return { store, show: () => { if (!store.state.tabs.length) return false; store.set({ open: true }); return true; } };
}
const setup = ({ editor = false, browser = false } = {}) => {
  const windows = { editor: fakeWindow(editor), navegador: fakeWindow(browser) };
  return { windows, vm: new WindowsViewModel({ windows }) };
};
const zones = (vm) => Object.fromEntries(['editor', 'navegador'].map((w) => [w, vm.store.state[w]?.zone ?? null]));

test('both open: the editor on the left half and the browser on the right; one alone keeps its own place', () => {
  const { windows, vm } = setup({ editor: true });
  assert.deepEqual(zones(vm), { editor: null, navegador: null });
  windows.navegador.store.set({ open: true, tabs: [{ path: 'index.html' }] });
  assert.deepEqual(zones(vm), { editor: 'izquierda', navegador: 'derecha' });
  assert.equal(vm.store.state.editor.by, 'auto');
  // one closes: the other goes back to its own place
  windows.navegador.store.set({ open: false });
  assert.deepEqual(zones(vm), { editor: null, navegador: null });
});

test('Qubi places one window; the other open one takes the opposite half; completa leaves it alone', () => {
  const { vm } = setup({ editor: true, browser: true });
  assert.deepEqual(vm.place('navegador', 'izquierda'), { ok: true, ventana: 'navegador', zona: 'izquierda' });
  assert.deepEqual(zones(vm), { editor: 'derecha', navegador: 'izquierda' });
  assert.equal(vm.store.state.navegador.by, 'qubi');
  vm.place('navegador', 'completa');
  assert.deepEqual(zones(vm), { editor: 'derecha', navegador: 'completa' });
  vm.place('editor', 'arriba');
  assert.deepEqual(zones(vm), { editor: 'arriba', navegador: 'abajo' });
});

test('a hidden window with tabs is shown to be placed; a window with nothing open says so', () => {
  const { windows, vm } = setup({ editor: false, browser: false });
  windows.editor.store.set({ tabs: [{ path: 'a.js' }] }); // hidden, with a tab
  assert.equal(vm.place('editor', 'derecha').ok, true);
  assert.equal(windows.editor.store.state.open, true);
  assert.deepEqual(vm.place('navegador', 'izquierda'), { ok: false, motivo: 'no-abierta', ventana: 'navegador' });
  assert.deepEqual(vm.place('chat', 'izquierda'), { ok: false, motivo: 'no-entendido' });
  assert.deepEqual(vm.place('editor', 'en el medio'), { ok: false, motivo: 'no-entendido' });
});

test('plain words from Qubi work too (el juego, a la derecha)', () => {
  const { vm } = setup({ editor: true, browser: true });
  assert.deepEqual(vm.place('el juego', 'a la derecha'), { ok: true, ventana: 'navegador', zona: 'derecha' });
  assert.deepEqual(zones(vm), { editor: 'izquierda', navegador: 'derecha' });
});

test('the person drags a window: it is theirs (no zone, no auto halves) until it closes; Qubi can still place it', () => {
  const { windows, vm } = setup({ editor: true });
  vm.grab('editor');
  windows.navegador.store.set({ open: true, tabs: [{ path: 'index.html' }] });
  assert.deepEqual(zones(vm), { editor: null, navegador: null }, 'no halves over a window the person placed');
  vm.place('editor', 'izquierda');
  assert.deepEqual(zones(vm), { editor: 'izquierda', navegador: 'derecha' });
  vm.grab('navegador');
  assert.deepEqual(zones(vm), { editor: 'izquierda', navegador: null });
  // closing forgets the drag: next time both open, they split again
  windows.navegador.store.set({ open: false });
  windows.editor.store.set({ open: false });
  windows.editor.store.set({ open: true });
  windows.navegador.store.set({ open: true });
  assert.deepEqual(zones(vm), { editor: 'izquierda', navegador: 'derecha' });
});
