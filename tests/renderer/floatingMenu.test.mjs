// Where the floating ⋯ menu goes: below its button, above when it does not fit, always inside the window.
import test from 'node:test';
import assert from 'node:assert/strict';
import { placeMenu } from '../../renderer/views/ui/floatingMenu.js';

const VIEW = { width: 1200, height: 800 };
const SIZE = { width: 220, height: 260 };
const button = (top, right = 400) => ({ top, bottom: top + 24, left: right - 24, right });

test('opens below the button, right edges aligned', () => {
  assert.deepEqual(placeMenu(button(100), SIZE, VIEW), { top: 130, left: 180, placement: 'below' });
});

test('flips above when there is no room below', () => {
  const { top, placement } = placeMenu(button(700), SIZE, VIEW);
  assert.equal(placement, 'above');
  assert.equal(top, 700 - 6 - 260);
});

test('stays below when it fits neither way, and is pushed inside the window', () => {
  const tall = { width: 220, height: 780 };
  const { top, placement } = placeMenu(button(300), tall, VIEW);
  assert.equal(placement, 'below');
  assert.equal(top, VIEW.height - 8 - tall.height); // pushed up to fit; taller menus scroll inside (max-height)
});

test('never leaves the window on the left', () => {
  assert.equal(placeMenu(button(100, 60), SIZE, VIEW).left, 8);
});
