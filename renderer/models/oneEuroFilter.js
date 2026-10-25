// One Euro filter (Casiez, Roussel & Vogel, CHI 2012): smooths a noisy signal strongly while it barely moves
// and lightly while it moves fast, so a resting hand does not shake the cursor and a quick move does not lag.
// The cutoff frequency grows with the (smoothed) speed: cutoff = minCutoff + beta · |speed|. Times in ms;
// without them (or closer than any camera delivers), camera frames (30 per second) are assumed. Pure.
const DEFAULT_DT = 1 / 30;
const MIN_DT = 0.004; // closer than this (250 per second) is no camera: count it as a camera frame

// For hand positions in 0..1 units (image or window): ~1 Hz at rest; a quick move (~2 units/s) opens it to
// ~10 Hz. Tuned in tests/renderer/oneEuroFilter.test.mjs against the old fixed smoothing.
export const HAND_FILTER = { minCutoff: 1, beta: 4, dCutoff: 1 };

const alpha = (cutoff, dt) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));

export class OneEuroFilter {
  #minCutoff;
  #beta;
  #dCutoff;
  #x = null;  // last filtered value
  #dx = 0;    // last filtered speed (units per second)
  #t = null;  // last time (ms)

  constructor({ minCutoff = 1, beta = 0, dCutoff = 1 } = {}) {
    this.#minCutoff = minCutoff;
    this.#beta = beta;
    this.#dCutoff = dCutoff;
  }

  filter(value, t = null) {
    if (this.#x === null) {
      this.#x = value;
      this.#t = t;
      return value;
    }
    const gap = t !== null && this.#t !== null ? (t - this.#t) / 1000 : 0;
    const dt = gap >= MIN_DT ? gap : DEFAULT_DT;
    this.#t = t;
    const speed = (value - this.#x) / dt;
    this.#dx += alpha(this.#dCutoff, dt) * (speed - this.#dx);
    const cutoff = this.#minCutoff + this.#beta * Math.abs(this.#dx);
    this.#x += alpha(cutoff, dt) * (value - this.#x);
    return this.#x;
  }

  reset() {
    this.#x = null;
    this.#dx = 0;
    this.#t = null;
  }
}

// { x, y } with one filter per axis
export class PointFilter {
  #x;
  #y;

  constructor(options) {
    this.#x = new OneEuroFilter(options);
    this.#y = new OneEuroFilter(options);
  }

  filter(p, t = null) {
    return { x: this.#x.filter(p.x, t), y: this.#y.filter(p.y, t) };
  }

  reset() {
    this.#x.reset();
    this.#y.reset();
  }
}
