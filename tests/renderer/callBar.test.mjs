// The call panel above Qubi (views/ui/callBarView.js): where it goes on the map, the title it shows and
// the voices the settings offer. Only the pure helpers; the DOM is checked in the real app.
import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { placePanel, anchorPoint, titleText, voiceOptions, pickVoice, VOICE_KEYS } from '../../renderer/views/ui/callBarView.js';
import { strings } from '../../renderer/i18n/es.js';

const stage = { width: 1000, height: 700 };
const panel = { width: 320, height: 150 };

test('placePanel: centered above the point, the tail under it', () => {
  const p = placePanel({ point: { x: 500, y: 400 }, stage, panel, margin: 12, gap: 14 });
  assert.equal(p.x, 340);
  assert.equal(p.y, 400 - 14 - 150);
  assert.equal(p.tailX, 160);
  assert.equal(p.tail, true);
});

test('placePanel: no point, or a point off the stage, falls back (null)', () => {
  assert.equal(placePanel({ point: null, stage, panel }), null);
  assert.equal(placePanel({ point: { x: -5, y: 300 }, stage, panel }), null);
  assert.equal(placePanel({ point: { x: 500, y: 701 }, stage, panel }), null);
  assert.equal(placePanel({ point: { x: NaN, y: 300 }, stage, panel }), null);
  assert.equal(placePanel({ point: { x: 500, y: 300 }, stage: { width: 0, height: 0 }, panel }), null);
});

test('placePanel: clamped inside the stage, the tail still points at Qubi', () => {
  const left = placePanel({ point: { x: 30, y: 400 }, stage, panel, margin: 12 });
  assert.equal(left.x, 12);
  assert.equal(left.tailX, 18); // never past the rounded corner
  const right = placePanel({ point: { x: 990, y: 400 }, stage, panel, margin: 12 });
  assert.equal(right.x, 1000 - 12 - 320);
  assert.equal(right.tailX, 320 - 18);
  // Qubi near the top: the panel cannot go above, it stays inside and drops the tail
  const top = placePanel({ point: { x: 500, y: 60 }, stage, panel, margin: 12, gap: 14 });
  assert.equal(top.y, 12);
  assert.equal(top.tail, false);
});

test('placePanel: moves left of an obstacle it would cover (the floating chat)', () => {
  const chat = { left: 640, top: 200, right: 1000, bottom: 700 };
  const p = placePanel({ point: { x: 700, y: 450 }, stage, panel, margin: 12, avoid: [chat] });
  assert.equal(p.x, 640 - 12 - 320);
  // above the chat's top edge nothing moves
  const free = placePanel({ point: { x: 700, y: 180 }, stage, panel, margin: 12, gap: 14, avoid: [chat] });
  assert.equal(free.x, 540);
});

test('placePanel: a stage narrower than the panel keeps it at the margin', () => {
  const p = placePanel({ point: { x: 100, y: 400 }, stage: { width: 300, height: 700 }, panel, margin: 12 });
  assert.equal(p.x, 12);
});

test('anchorPoint: a world point is projected; an element (Qubi\'s bubble) gives the middle of its top edge', () => {
  const toScreen = (x, y, z) => ({ x: x * 10, y: y * 10 + z });
  assert.deepEqual(anchorPoint({ x: 1, y: 2, z: 3 }, { toScreen }), { x: 10, y: 23 });
  assert.equal(anchorPoint(null, { toScreen }), null);
  assert.equal(anchorPoint({ x: 1, y: 2, z: 3 }), null, 'no projection: no point');
  // the bubble at client (300..540, 450..530), the stage at client (100, 50): the panel goes above the bubble
  const bubble = { getBoundingClientRect: () => ({ left: 300, top: 450, width: 240, height: 80 }) };
  const stageRect = () => ({ left: 100, top: 50 });
  const point = anchorPoint(bubble, { toScreen, stageRect });
  assert.deepEqual(point, { x: 320, y: 400 });
  const p = placePanel({ point, stage, panel, margin: 12, gap: 14 });
  assert.ok(p.y + panel.height <= point.y, 'the panel ends above the bubble, never on it');
  // a bubble that is not laid out (hidden) gives no point: the caller docks
  assert.equal(anchorPoint({ getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }) }, { stageRect }), null);
});

test('titleText: connecting (no phone ring), the live timer, ending', () => {
  const C = strings.call;
  assert.equal(titleText({ status: 'ringing' }, 0), C.state.connecting);
  assert.equal(titleText({ status: 'connecting' }, 0), C.state.connecting);
  assert.doesNotMatch(titleText({ status: 'ringing' }, 0), /llamando/i, 'it does not sound like a phone call');
  assert.equal(titleText({ status: 'live' }, 42), C.live(C.timer(42)));
  assert.equal(titleText({ status: 'live' }, 42), 'En vivo · 0:42');
  assert.equal(titleText({ status: 'ending' }, 3), C.state.ended);
});

test('voiceOptions: the chosen provider\'s voices; Automático shows both groups', () => {
  assert.deepEqual(voiceOptions('elevenlabs'), [{ group: 'elevenlabs', keys: VOICE_KEYS.elevenlabs }]);
  assert.deepEqual(voiceOptions('grok'), [{ group: 'grok', keys: VOICE_KEYS.grok }]);
  assert.deepEqual(voiceOptions('auto').map((g) => g.group), ['elevenlabs', 'grok']);
  assert.deepEqual(voiceOptions('nonsense').map((g) => g.group), ['elevenlabs', 'grok']);
  // every voice has its name in es.js (the contract's VOICES keys)
  for (const keys of Object.values(VOICE_KEYS)) for (const k of keys) assert.ok(strings.call.settings.voices[k], k);
});

test('pickVoice: keeps a voice of the provider, otherwise its first one', () => {
  assert.equal(pickVoice('elevenlabs', 'maggie'), 'maggie');
  assert.equal(pickVoice('elevenlabs', 'eve'), 'juan');
  assert.equal(pickVoice('grok', 'juan'), 'rex');
  assert.equal(pickVoice('auto', 'eve'), 'eve');
  assert.equal(pickVoice('auto', undefined), 'juan');
});
