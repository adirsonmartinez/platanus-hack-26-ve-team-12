import test from 'node:test';
import assert from 'node:assert/strict';
import { GESTURES, EXPRESSIONS, gestureFrame, gestureName, faceOf } from '../../renderer/views/scene/robotGestures.js';

test('every gesture plays for its length, eases in and out, and makes a known face', () => {
  for (const [name, length] of Object.entries(GESTURES)) {
    assert.ok(length >= 0.8 && length <= 3, name);
    assert.equal(gestureFrame(name, 0).w, 0, `${name} starts from the pose`);
    const mid = gestureFrame(name, length / 2);
    assert.equal(mid.w, 1, `${name} wins in the middle`);
    assert.ok(Object.hasOwn(EXPRESSIONS, mid.face), `${name}: ${mid.face}`);
    for (const value of Object.values(mid)) if (typeof value === 'number') assert.ok(Number.isFinite(value), name);
    assert.ok(gestureFrame(name, length * 0.99).w < 0.2, `${name} hands the pose back`);
    assert.equal(gestureFrame(name, length), null, `${name} is over`);
  }
  assert.equal(gestureFrame('volar', 0.5), null);
  assert.equal(gestureFrame('saludar', -1), null);
});

test('the moves look like what they are called', () => {
  assert.ok(gestureFrame('saludar', 0.8).rz > 2, 'a hand up');
  const party = gestureFrame('celebrar', 0.45);
  assert.ok(party.rz > 2 && party.lz < -2 && party.hop > 0, 'both hands up, jumping');
  assert.ok(gestureFrame('pensar', 1.2).rx < -1.5, 'a hand to the chin');
  assert.ok(gestureFrame('encoger', 0.7).rz > 0.5 && gestureFrame('encoger', 0.7).lz < -0.5, 'hands out: no idea');
  assert.ok(Math.abs(gestureFrame('negar', 0.1).hy) > 0.2, 'the head turns from side to side');
  assert.ok(gestureFrame('asentir', 0.12).hx > 0.15, 'the head goes down');
});

test('the voice may say the gesture in its own words', () => {
  assert.equal(gestureName('Saludar'), 'saludar');
  assert.equal(gestureName('adiós'), 'saludar');
  assert.equal(gestureName('Sí'), 'asentir');
  assert.equal(gestureName('fiesta'), 'bailar');
  assert.equal(gestureName('pensando'), 'pensar');
  assert.equal(gestureName('volar'), null);
  assert.equal(gestureName(undefined), null);
});

test('faces: happy squints, surprised widens, sorry is worried; an unknown one is normal', () => {
  assert.ok(faceOf('feliz').eyeY < 1 && faceOf('feliz').mouthX > 1);
  assert.ok(faceOf('sorprendido').eyeScale > 1 && faceOf('sorprendido').mouthX < 1);
  assert.equal(faceOf('apenado').worried, true);
  assert.deepEqual(faceOf('raro'), EXPRESSIONS.normal);
});
