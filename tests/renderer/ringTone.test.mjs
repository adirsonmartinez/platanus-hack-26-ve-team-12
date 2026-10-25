// The call's ring (views/ui/ringTone.js): two phone tones drawn with WebAudio, a 1 s pattern every 2 s
// for up to 8 s, stopped the moment Qubi answers. A fake AudioContext records what is scheduled.
import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRingTone, ringBursts, RING } from '../../renderer/views/ui/ringTone.js';

function fakeContext() {
  const ctx = {
    currentTime: 10, state: 'running', destination: { name: 'out' }, oscillators: [], gains: [], closed: false, resumed: 0,
    resume() { ctx.resumed++; return Promise.resolve(); },
    close() { ctx.closed = true; return Promise.resolve(); },
    createOscillator() {
      const o = { frequency: { value: 0 }, type: 'sine', started: null, stops: [], connectedTo: null,
        connect(n) { o.connectedTo = n; }, disconnect() {}, start(t) { o.started = t; }, stop(t) { o.stops.push(t); } };
      ctx.oscillators.push(o);
      return o;
    },
    createGain() {
      const events = [];
      const g = { events, connectedTo: null, connect(n) { g.connectedTo = n; }, disconnect() {},
        gain: {
          setValueAtTime: (v, t) => events.push(['set', v, t]),
          linearRampToValueAtTime: (v, t) => events.push(['ramp', v, t]),
          setTargetAtTime: (v, t) => events.push(['target', v, t]),
          cancelScheduledValues: (t) => events.push(['cancel', t]),
        } };
      ctx.gains.push(g);
      return g;
    },
  };
  return ctx;
}

test('ringBursts: 0.4 s, a pause, 0.4 s again; every 2 s; nothing past 8 s', () => {
  const bursts = ringBursts();
  assert.equal(bursts.length, 8); // 4 rings x 2 tones bursts
  assert.deepEqual(bursts.slice(0, 2), [[0, 0.4], [0.6, 1]]);
  assert.deepEqual(bursts[2], [2, 2.4]);
  assert.ok(bursts.every(([a, b]) => Math.abs(b - a - RING.on) < 1e-9 && b <= RING.upTo));
  assert.equal(RING.tones.join('+'), '440+480');
});

test('start: two oscillators (440 and 480 Hz) through one gain, the whole pattern scheduled', () => {
  const ctx = fakeContext();
  const ring = createRingTone({ createContext: () => ctx });
  assert.equal(ring.start(), true);
  assert.equal(ring.playing, true);
  assert.deepEqual(ctx.oscillators.map((o) => o.frequency.value), [440, 480]);
  const [gain] = ctx.gains;
  assert.ok(ctx.oscillators.every((o) => o.connectedTo === gain && o.started >= ctx.currentTime));
  assert.equal(gain.connectedTo, ctx.destination);
  const peaks = gain.events.filter(([kind, v]) => kind === 'ramp' && v > 0);
  assert.equal(peaks.length, 8);
  assert.ok(peaks.every(([, v]) => v <= 0.1), 'quiet: a ring, not an alarm');
  // the oscillators stop by themselves after the last ring
  const last = Math.max(...ctx.oscillators.flatMap((o) => o.stops));
  assert.ok(last <= ctx.currentTime + RING.upTo + 0.1);
});

test('start twice does not ring twice; stop silences now and lets it start again', () => {
  const ctx = fakeContext();
  let made = 0;
  const ring = createRingTone({ createContext: () => { made++; return ctx; } });
  ring.start();
  ring.start();
  assert.equal(ctx.oscillators.length, 2);
  ctx.currentTime = 11;
  ring.stop();
  assert.equal(ring.playing, false);
  const [gain] = ctx.gains;
  assert.ok(gain.events.some(([kind, t]) => kind === 'cancel' && t === 11));
  assert.ok(ctx.oscillators.every((o) => o.stops.some((t) => t >= 11 && t < 11.2)));
  ring.stop(); // a no-op
  ring.start();
  assert.equal(ctx.oscillators.length, 4);
  assert.equal(made, 1, 'one AudioContext, reused');
  ring.dispose();
  assert.equal(ctx.closed, true);
});

test('no WebAudio (or it throws): no ring, no error', () => {
  const ring = createRingTone({ createContext: () => { throw new Error('no audio'); } });
  assert.equal(ring.start(), false);
  assert.equal(ring.playing, false);
  ring.stop();
  const none = createRingTone({ createContext: () => null });
  assert.equal(none.start(), false);
});

test('a suspended context is resumed (the click that starts the call allows it)', () => {
  const ctx = fakeContext();
  ctx.state = 'suspended';
  createRingTone({ createContext: () => ctx }).start();
  assert.equal(ctx.resumed, 1);
});
