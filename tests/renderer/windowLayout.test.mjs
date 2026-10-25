// Window zones on the map: where the editor and the browser go when Qubi (or the app) arranges them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ZONES, WINDOWS, freeArea, zoneRect, opposite, windowOf, zoneOf } from '../../renderer/models/windowLayout.js';

test('the zones and the windows are fixed lists', () => {
  assert.deepEqual(ZONES, ['izquierda', 'derecha', 'completa', 'arriba', 'abajo']);
  assert.deepEqual(WINDOWS, ['editor', 'navegador']);
});

test('freeArea: the stage minus what is reserved on each side (the dock, the chat, the top bar)', () => {
  assert.deepEqual(freeArea({ width: 1400, height: 900, left: 80, right: 400, top: 96, bottom: 14 }), { x: 80, y: 96, w: 920, h: 790 });
  // never negative, never smaller than a usable window
  const tiny = freeArea({ width: 300, height: 200, left: 200, right: 200, top: 96, bottom: 14 });
  assert.ok(tiny.w >= 320 && tiny.h >= 200);
});

test('zoneRect: halves side by side or stacked, or the whole free area; a gap between halves', () => {
  const area = { x: 80, y: 96, w: 1000, h: 800 };
  assert.deepEqual(zoneRect('completa', area), { x: 80, y: 96, w: 1000, h: 800 });
  assert.deepEqual(zoneRect('izquierda', area), { x: 80, y: 96, w: 494, h: 800 });
  assert.deepEqual(zoneRect('derecha', area), { x: 586, y: 96, w: 494, h: 800 });
  assert.deepEqual(zoneRect('arriba', area), { x: 80, y: 96, w: 1000, h: 394 });
  assert.deepEqual(zoneRect('abajo', area), { x: 80, y: 502, w: 1000, h: 394 });
  assert.equal(zoneRect('diagonal', area), null);
});

test('opposite: the other half (completa has none)', () => {
  assert.equal(opposite('izquierda'), 'derecha');
  assert.equal(opposite('derecha'), 'izquierda');
  assert.equal(opposite('arriba'), 'abajo');
  assert.equal(opposite('abajo'), 'arriba');
  assert.equal(opposite('completa'), null);
});

test('windowOf / zoneOf: what Qubi may say, in plain words, to the fixed names; anything else is null', () => {
  for (const word of ['editor', 'Código', 'el codigo', 'code']) assert.equal(windowOf(word), 'editor', word);
  for (const word of ['navegador', 'el juego', 'Vista previa', 'browser', 'la página', 'preview']) assert.equal(windowOf(word), 'navegador', word);
  assert.equal(windowOf('chat'), null);
  assert.equal(windowOf(undefined), null);
  for (const [word, zone] of [['izquierda', 'izquierda'], ['a la izquierda', 'izquierda'], ['Left', 'izquierda'], ['derecha', 'derecha'],
    ['right', 'derecha'], ['completa', 'completa'], ['pantalla completa', 'completa'], ['grande', 'completa'], ['full', 'completa'],
    ['arriba', 'arriba'], ['abajo', 'abajo'], ['top', 'arriba'], ['bottom', 'abajo']]) {
    assert.equal(zoneOf(word), zone, word);
  }
  assert.equal(zoneOf('en el medio'), null);
  assert.equal(zoneOf(42), null);
});
