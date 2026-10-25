// Hand gestures from the camera, as plain numbers (no DOM, no camera). The hand comes as MediaPipe's
// 21 landmarks in image coordinates (0..1, x to the right of the image, y down).
// Pinch (thumb and index tips together) grabs the map. While pinching, the hand either drags it (the palm
// moves) or turns it (the hand turns like a knob, the palm stays): the first one past its threshold wins
// until the hand lets go, so a drag never turns the map by accident and a turn never drags it. Opening the
// hand or losing it lets go. Thresholds are relative to the hand's size, so distance to the camera does not matter.
// Precision: positions go through a One Euro filter (oneEuroFilter.js: steady at rest, quick when moving) and,
// when the hand carries MediaPipe's 3D landmarks (`landmarks.world`, metres; handTrackingService attaches
// them), the pinch is measured in 3D, so a hand turned away from the camera still pinches as it really is.
import { OneEuroFilter, PointFilter, HAND_FILTER } from './oneEuroFilter.js';

const WRIST = 0, THUMB_TIP = 4, INDEX_KNUCKLE = 5, INDEX_TIP = 8, MIDDLE_KNUCKLE = 9, MIDDLE_TIP = 12, PINKY_KNUCKLE = 17;

const PINCH_ON = 0.3;    // tips closer than this (× hand size) grab
const PINCH_OFF = 0.45;  // and farther than this let go (in between, it keeps its state)
const DEAD_ZONE = 0.004; // movement smaller than this (image units) is tremor, not a drag
const ANGLE_DEAD_ZONE = 0.01; // radians
const PAN_LOCK = 0.15;   // the palm moved this much (× hand size): it is a drag
const ROTATE_LOCK = 0.2; // the hand turned this much (radians, ~11°) first: it is a turn

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));

// Thumb-to-fingertip gap (the index by default) relative to the hand's size: in 3D (metres) when the hand
// has its world landmarks, else in the image
export function pinchGap(landmarks, tip = INDEX_TIP) {
  const w = landmarks.world;
  if (w?.length >= 21) return dist3(w[THUMB_TIP], w[tip]) / (dist3(w[WRIST], w[MIDDLE_KNUCKLE]) || 1);
  return dist(landmarks[THUMB_TIP], landmarks[tip]) / (dist(landmarks[WRIST], landmarks[MIDDLE_KNUCKLE]) || 1);
}
const still = (pinching, mode = null) => ({ pinching, mode, dx: 0, dy: 0, dAngle: 0 });
// Shortest signed difference between two angles
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

function palmOf(l) {
  return {
    x: (l[WRIST].x + l[INDEX_KNUCKLE].x + l[PINKY_KNUCKLE].x) / 3,
    y: (l[WRIST].y + l[INDEX_KNUCKLE].y + l[PINKY_KNUCKLE].y) / 3,
  };
}

// Direction of the hand (wrist to middle knuckle) as the person sees it: mirrored, so a growing angle is a
// clockwise turn for them
const angleOf = (l) => Math.atan2(l[MIDDLE_KNUCKLE].y - l[WRIST].y, -(l[MIDDLE_KNUCKLE].x - l[WRIST].x));

export class PinchTracker {
  #grab = null; // while pinching: { mode, at, sent, angle, raw, sentAngle, palm0, angle0, point, turn }
  #rotate;

  // rotate: false = a pinch only drags (turning is the two-hand gesture, spec/003-hand-gestures.md)
  constructor({ rotate = true } = {}) {
    this.#rotate = rotate;
  }

  // Already dragging or turning (the gesture is decided until the hand lets go)
  get busy() {
    return Boolean(this.#grab?.mode);
  }

  // landmarks: the hand's 21 points, or null when no hand is in view. Returns { pinching, mode, dx, dy,
  // dAngle }: mode is null (not decided yet), 'pan' or 'rotate'; dx, dy is the drag since the last frame
  // as the person sees it (mirrored in x); dAngle the turn since the last frame (clockwise > 0).
  // now: the frame's time in ms (optional: camera frames are assumed).
  update(landmarks, now = null) {
    if (!landmarks) return this.#release();
    const size = dist(landmarks[WRIST], landmarks[MIDDLE_KNUCKLE]) || 1;
    const gap = pinchGap(landmarks);
    if (!this.#grab && gap >= PINCH_ON) return still(false);
    if (this.#grab && gap > PINCH_OFF) return this.#release();

    const point = {
      x: (landmarks[THUMB_TIP].x + landmarks[INDEX_TIP].x) / 2,
      y: (landmarks[THUMB_TIP].y + landmarks[INDEX_TIP].y) / 2,
    };
    const angle = angleOf(landmarks);
    const palm = palmOf(landmarks);
    if (!this.#grab) {
      const filters = { point: new PointFilter(HAND_FILTER), turn: new OneEuroFilter(HAND_FILTER) };
      filters.point.filter(point, now);
      filters.turn.filter(angle, now);
      this.#grab = { mode: null, at: point, sent: point, angle, raw: angle, sentAngle: angle, palm0: palm, angle0: angle, ...filters };
      return still(true);
    }

    const g = this.#grab;
    g.at = g.point.filter(point, now);
    g.raw += angleDiff(angle, g.raw); // unwrapped, so the filter never sees a jump from +π to −π
    g.angle = g.turn.filter(g.raw, now);
    if (!g.mode) {
      if (this.#rotate && Math.abs(angleDiff(g.angle, g.angle0)) > ROTATE_LOCK) g.mode = 'rotate';
      else if (dist(palm, g.palm0) / size > PAN_LOCK) g.mode = 'pan';
      else return still(true);
    }

    if (g.mode === 'rotate') {
      const dAngle = angleDiff(g.angle, g.sentAngle);
      if (Math.abs(dAngle) < ANGLE_DEAD_ZONE) return still(true, 'rotate');
      g.sentAngle = g.angle;
      return { ...still(true, 'rotate'), dAngle };
    }
    const dx = g.at.x - g.sent.x, dy = g.at.y - g.sent.y;
    if (Math.hypot(dx, dy) < DEAD_ZONE) return still(true, 'pan');
    g.sent = g.at;
    return { ...still(true, 'pan'), dx: -dx, dy };
  }

  #release() {
    this.#grab = null;
    return still(false);
  }
}

// ---- Hold and move with two hands, the cursor and selecting by holding still (spec/003-hand-gestures.md) ----

const handSize = (l) => dist(l[WRIST], l[MIDDLE_KNUCKLE]) || 1;
const pinchPoint = (l) => ({ x: (l[THUMB_TIP].x + l[INDEX_TIP].x) / 2, y: (l[THUMB_TIP].y + l[INDEX_TIP].y) / 2 });

// Which finger touches the thumb: 'index' (grab: drag, two-hand zoom), 'middle' (turn) or null. The middle
// and ring fingers move together, so one tip must be clearly closer than the other (FINGER_MARGIN) to count;
// once pinched, a finger keeps it (same hysteresis as the grab) until it lets go. was: the previous answer.
const FINGER_MARGIN = 0.7;
export function pinchFinger(landmarks, was) {
  const gap = { index: pinchGap(landmarks, INDEX_TIP), middle: pinchGap(landmarks, MIDDLE_TIP) };
  if (was && gap[was] <= PINCH_OFF) return was;
  const best = gap.index <= gap.middle ? 'index' : 'middle';
  const other = best === 'index' ? 'middle' : 'index';
  return gap[best] < PINCH_ON && gap[best] < gap[other] * FINGER_MARGIN ? best : null;
}

// Pinched or not, with the same hysteresis as the grab: `was` is the previous state of that hand
export function isPinched(landmarks, was) {
  const gap = pinchGap(landmarks);
  return was ? gap <= PINCH_OFF : gap < PINCH_ON;
}

// The middle of the camera image covers the whole window, so the cursor reaches the edges without the
// hand leaving the camera (hands near the image border are tracked badly). Mirrored: the person's right.
export const POINTER_BOX = { x0: 0.15, x1: 0.85, y0: 0.15, y1: 0.85 };
const clamp01 = (v) => Math.min(1, Math.max(0, v));
// Image point -> window point (0..1, as the person sees it)
export function toViewport(p) {
  const b = POINTER_BOX;
  return { x: clamp01((1 - p.x - b.x0) / (b.x1 - b.x0)), y: clamp01((p.y - b.y0) / (b.y1 - b.y0)) };
}

// Hold and move (spec/003-hand-gestures.md): both hands pinch; one holds still and the other moves up (closer)
// or down (farther). Only zoom: turning is thumb + middle with one hand (SlideTurnTracker), so a sideways
// move of the free hand does nothing. The hand that moved more is the one that drives.
const TWO_LOCK = 0.15;        // the moving hand travelled this much (× hand size): the direction is decided
const TWO_DEAD_ZONE = 0.003;  // image units: tremor, not a move
export const ZOOM_RATE = 4;   // a tenth of the image height up zooms ×e^0.4 (≈ 1.5)
export const TURN_RATE = 3;   // a tenth of the image width sideways turns 0.3 rad (≈ 17°)

// a, b: the two pinching hands, always in the same order (matchHands). Returns { mode: null | 'zoom',
// factor (zoom since the last frame, 1 = none), dAngle (always 0), anchor (the holding hand in the window, 0..1) }.
export class TwoHandTracker {
  #s = null; // { start: [p, p], at: [p, p], sent, mode, mover, filters: [PointFilter, PointFilter] }

  // now: the frame's time in ms (optional)
  update(a, b, now = null) {
    const points = [pinchPoint(a), pinchPoint(b)];
    const size = (handSize(a) + handSize(b)) / 2;
    if (!this.#s) {
      const filters = [new PointFilter(HAND_FILTER), new PointFilter(HAND_FILTER)];
      filters.forEach((f, i) => f.filter(points[i], now));
      this.#s = { start: points, at: points, sent: null, mode: null, mover: null, filters };
      return { mode: null, factor: 1, dAngle: 0, anchor: toViewport(points[0]) };
    }
    const s = this.#s;
    s.at = points.map((p, i) => s.filters[i].filter(p, now));
    if (!s.mode) {
      const moved = s.at.map((p, i) => dist(p, s.start[i]) / size);
      const mover = moved[1] >= moved[0] ? 1 : 0;
      if (moved[mover] <= TWO_LOCK) return { mode: null, factor: 1, dAngle: 0, anchor: toViewport(s.at[1 - mover]) };
      s.mode = 'zoom';
      s.mover = mover;
      s.sent = { ...s.at[mover] }; // from here on, so the lock itself does not jump
      return { mode: s.mode, factor: 1, dAngle: 0, anchor: toViewport(s.at[1 - mover]) };
    }
    const m = s.mover;
    const anchor = toViewport(s.at[1 - m]);
    const dy = s.at[m].y - s.sent.y;
    if (Math.abs(dy) < TWO_DEAD_ZONE) return { mode: 'zoom', factor: 1, dAngle: 0, anchor };
    s.sent = { ...s.at[m] };
    return { mode: 'zoom', factor: Math.exp(-dy * ZOOM_RATE), dAngle: 0, anchor }; // up in the image = closer
  }

  reset() {
    this.#s = null;
  }
}

// Turning with one hand: thumb and middle finger together, the hand moves sideways (to the person's right =
// clockwise, like the old two-hand turn: TURN_RATE). Filtered like the other gestures, with a dead zone so a
// trembling hand does not turn the map. Returns { dAngle } (radians since the last frame).
export class SlideTurnTracker {
  #filter = new PointFilter(HAND_FILTER);
  #sent = null;

  update(landmarks, now = null) {
    const p = { x: (landmarks[THUMB_TIP].x + landmarks[MIDDLE_TIP].x) / 2, y: (landmarks[THUMB_TIP].y + landmarks[MIDDLE_TIP].y) / 2 };
    const at = this.#filter.filter(p, now);
    if (!this.#sent) {
      this.#sent = at;
      return { dAngle: 0 };
    }
    const dx = at.x - this.#sent.x;
    if (Math.abs(dx) < TWO_DEAD_ZONE) return { dAngle: 0 };
    this.#sent = at;
    return { dAngle: -dx * TURN_RATE }; // mirrored: image left = the person's right
  }

  reset() {
    this.#filter.reset();
    this.#sent = null;
  }
}

const POINTER_DEAD_ZONE = 0.004; // window units

// The cursor: the point between thumb and index, mirrored and mapped to the window, filtered (One Euro),
// with a dead zone so a resting hand does not shake it. Returns { x, y } (0..1) or null without a hand.
export class PointerTracker {
  #at = null;
  #sent = null;
  #filter = new PointFilter(HAND_FILTER);

  // now: the frame's time in ms (optional)
  update(landmarks, now = null) {
    if (!landmarks) return this.reset();
    const p = toViewport(pinchPoint(landmarks));
    if (!this.#at) {
      this.#at = this.#filter.filter(p, now);
      this.#sent = { ...p };
      return { ...p };
    }
    this.#at = this.#filter.filter(p, now);
    if (Math.hypot(this.#at.x - this.#sent.x, this.#at.y - this.#sent.y) >= POINTER_DEAD_ZONE) this.#sent = { ...this.#at };
    return { ...this.#sent };
  }

  reset() {
    this.#at = null;
    this.#sent = null;
    this.#filter.reset();
    return null;
  }
}

export const DWELL_MS = 800;
const DWELL_TOLERANCE = 0.02; // window units the cursor may drift while holding still

// Selecting by holding still: the same target under a still cursor for 800 ms fires once. Moving away,
// another target or none restarts it; after firing, it waits until the cursor leaves that target.
// key: a stable id of what is under the cursor (null = nothing selectable); now: ms.
export class DwellTimer {
  #key = null;
  #since = 0;
  #anchor = null;
  #fired = false;

  update(key, point, now) {
    if (!key) { this.reset(); return { progress: 0, fire: false }; }
    if (key !== this.#key) {
      this.#key = key;
      this.#since = now;
      this.#anchor = point;
      this.#fired = false;
    } else if (Math.hypot(point.x - this.#anchor.x, point.y - this.#anchor.y) > DWELL_TOLERANCE) {
      this.#since = now;
      this.#anchor = point;
    }
    if (this.#fired) return { progress: 0, fire: false };
    const progress = Math.min(1, (now - this.#since) / DWELL_MS);
    if (progress < 1) return { progress, fire: false };
    this.#fired = true;
    return { progress: 1, fire: true };
  }

  // Something was selected another way (a quick pinch): it does not fire again until the cursor leaves it
  markFired(key, point) {
    this.#key = key;
    this.#anchor = point;
    this.#fired = true;
  }

  reset() {
    this.#key = null;
    this.#anchor = null;
    this.#fired = false;
  }
}

// With two open hands, the cursor stays with the hand that had it: MediaPipe does not number hands
// between frames, so "the same hand" is the one whose palm is closest to where it was (D2). Without a
// previous one, the first hand of the frame.
export function pickCursorHand(hands, previousPalm) {
  if (!hands.length) return null;
  if (!previousPalm || hands.length === 1) return hands[0];
  return hands.reduce((best, h) => (dist(palmOf(h), previousPalm) < dist(palmOf(best), previousPalm) ? h : best));
}

// MediaPipe may list the hands in either order from one frame to the next. This keeps each hand in its
// place by where its palm was: { hands (reordered), previous: [slot it had, or -1 if new], palms }.
// A hand the tracker loses for a moment keeps its slot (its last palm is remembered), so when it comes back
// both hands are where they were. With two hands where there was only ever one, that one keeps the first place.
export function matchHands(hands, previousPalms = []) {
  const palms = hands.map(palmOf);
  const swap = () => ({ hands: [hands[1], hands[0]], palms: [palms[1], palms[0]] });
  if (hands.length === 2 && previousPalms.length === 2) {
    const straight = dist(palms[0], previousPalms[0]) + dist(palms[1], previousPalms[1]);
    const crossed = dist(palms[0], previousPalms[1]) + dist(palms[1], previousPalms[0]);
    return { ...(crossed < straight ? swap() : { hands, palms }), previous: [0, 1] };
  }
  if (hands.length === 2 && previousPalms.length === 1) {
    const stayed = dist(palms[0], previousPalms[0]) <= dist(palms[1], previousPalms[0]) ? 0 : 1;
    return { ...(stayed === 0 ? { hands, palms } : swap()), previous: [0, -1] };
  }
  if (hands.length === 1 && previousPalms.length) {
    const slot = previousPalms.length === 2 && dist(palms[0], previousPalms[1]) < dist(palms[0], previousPalms[0]) ? 1 : 0;
    const kept = [...previousPalms];
    kept[slot] = palms[0];
    return { hands, palms: kept, previous: [slot] };
  }
  return { hands, palms, previous: hands.map(() => -1) };
}

export { palmOf };
