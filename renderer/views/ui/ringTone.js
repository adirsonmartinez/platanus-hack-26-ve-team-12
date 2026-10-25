// The call's ring: a phone-like double ring drawn with WebAudio (no sound files). Two tones together
// (440 + 480 Hz, the classic ringback), 0.4 s on, a short pause, 0.4 s again: a 1 s pattern that repeats
// every 2 s for up to 8 s while the call connects, and stops the moment Qubi answers
// (docs/features/llamada/MEJORAS.md §5). The whole pattern is scheduled at once on one gain, so no timer
// can drift or keep ringing after stop().
export const RING = { tones: [440, 480], on: 0.4, gap: 0.2, every: 2, upTo: 8, volume: 0.06, fade: 0.02 };

// [start, end] of every burst, in seconds from the start
export function ringBursts({ on, gap, every, upTo } = RING) {
  const bursts = [];
  const round = (t) => Math.round(t * 1000) / 1000;
  for (let t0 = 0; t0 + on * 2 + gap <= upTo; t0 += every) {
    bursts.push([round(t0), round(t0 + on)], [round(t0 + on + gap), round(t0 + on * 2 + gap)]);
  }
  return bursts;
}

const defaultContext = () => {
  const Ctor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  return Ctor ? new Ctor() : null;
};

// createContext: for tests (a fake AudioContext). Every call is safe without audio: it just does not ring.
export function createRingTone({ createContext = defaultContext } = {}) {
  let ctx = null;
  let nodes = null; // { gain, oscillators } while ringing

  function start() {
    if (nodes) return true;
    try {
      ctx ??= createContext();
      if (!ctx) return false;
      if (ctx.state === 'suspended') ctx.resume?.()?.catch?.(() => {}); // the click that starts the call allows it
      const t = ctx.currentTime + 0.03;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t);
      for (const [a, b] of ringBursts()) {
        // short fades: a click-free ring
        gain.gain.setValueAtTime(0, t + a);
        gain.gain.linearRampToValueAtTime(RING.volume, t + a + RING.fade);
        gain.gain.setValueAtTime(RING.volume, t + b - RING.fade);
        gain.gain.linearRampToValueAtTime(0, t + b);
      }
      gain.connect(ctx.destination);
      const oscillators = RING.tones.map((hz) => {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = hz;
        o.connect(gain);
        o.start(t);
        o.stop(t + RING.upTo); // silent by itself after the last ring
        return o;
      });
      const mine = { gain, oscillators };
      oscillators[0].onended = () => { if (nodes === mine) release(); };
      nodes = mine;
      return true;
    } catch {
      nodes = null;
      return false;
    }
  }

  function release() {
    if (!nodes) return;
    const { gain, oscillators } = nodes;
    nodes = null;
    try { oscillators.forEach((o) => o.disconnect()); gain.disconnect(); } catch { /* already gone */ }
  }

  // Silence now (a quick fade, no click); the nodes go after it
  function stop() {
    if (!nodes || !ctx) return;
    const { gain, oscillators } = nodes;
    const now = ctx.currentTime;
    try {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0, now, 0.015);
      oscillators.forEach((o) => o.stop(now + 0.08));
    } catch { /* the context may be closed */ }
    nodes = null;
    setTimeout(() => { try { oscillators.forEach((o) => o.disconnect()); gain.disconnect(); } catch { /* gone */ } }, 120);
  }

  function dispose() {
    stop();
    try { ctx?.close?.(); } catch { /* already closed */ }
    ctx = null;
  }

  return { start, stop, dispose, get playing() { return Boolean(nodes); } };
}
