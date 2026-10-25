// Moving the map with a hand in front of the camera (off by default). The tracking service turns the
// camera image into hand landmarks (up to two hands); the trackers in models/handGesture.js turn them into
// gestures; this applies them (spec/003-hand-gestures.md):
//   · one hand pinching: pan the map like a mouse drag
//   · two hands pinching, one holding and the other moving: up or down zooms (around the holding hand),
//     sideways turns the map; the first direction stays until a hand lets go
//   · an open hand: a cursor; holding it still ~800 ms on something selectable selects it like a click
// What is under the cursor, clicking it and zooming around a point belong to the screen: they come as
// `actions` from main.js, so this stays free of DOM and three.js. Frames never leave the computer.
import { Observable } from '../core/observable.js';
import { PinchTracker, TwoHandTracker, PointerTracker, DwellTimer, isPinched, pickCursorHand, palmOf, matchHands } from '../models/handGesture.js';
import { CAMERA } from './cameraViewModel.js';

// A drag across the whole camera image moves the map this many screens (a short hand move goes far)
const PAN_GAIN = 1.6;
// Screen down is the ground seen at an angle, so it spans more ground than screen across
const DEPTH_STRETCH = 1 / Math.sin(CAMERA.elevation);
// Two-hand gestures need enough frames: on CPU, under this rate for this long, it turns off (B3)
const MIN_FPS = 20;
const SLOW_FOR_MS = 3000;
const FPS_WINDOW_MS = 1000;
// With the other hand in view, one pinch waits this long before dragging: people pinch one hand a moment
// before the other, and that moment should not drag the map before the two-hand gesture starts
const SECOND_HAND_GRACE_MS = 300;
// During a two-hand gesture, a hand the tracker loses (or a pinch that opens) for less than this is a blink
const TWO_KEEP_MS = 180;
// A pinch with one hand only drags: turning is the two-hand gesture now
const onePinch = () => new PinchTracker({ rotate: false });

const ERRORS = { NotAllowedError: 'denied', SecurityError: 'denied', NotFoundError: 'noCamera', OverconstrainedError: 'noCamera' };

const IDLE = { hand: false, pinching: false, gesture: null, cursor: null, ring: 0, selected: null, selectedKey: null };

export class HandControlViewModel {
  #tracking;
  #camera;
  #actions;
  #now;
  #tracker = onePinch();
  #pair = new TwoHandTracker();
  #pointer = new PointerTracker();
  #dwell = new DwellTimer();
  #run = 0; // increases each time it turns on or off, so late frames are ignored
  #twoHand = false; // both hands pinch: hold and move
  #waitRelease = false; // after a two-hand gesture, the hand that is still pinching does not drag until it lets go
  #pinched = [false, false];
  #palms = []; // where each hand's palm was in the last frame (keeps each hand in its place)
  #graceFrom = null; // when a single pinch started while the other hand was in view
  #twoLostAt = null; // during a two-hand gesture: since when one hand is missing or open
  #cursorPalm = null;
  #target = null;
  #frames = [];
  #slowSince = null;

  // status: 'off' | 'starting' | 'on' | 'error'; hand: a hand is in view; pinching: it holds the map;
  // gesture: null | 'pan' | 'hold' (two pinches, direction not decided) | 'zoom' | 'zoomIn' | 'zoomOut' | 'rotate'
  // | 'point' | 'wait' (after a two-hand gesture, until the other hand lets go); cursor: { x, y } (0..1 of the
  // window) or null; ring: 0..1 of the hold-still selection; selected: name of what was just selected;
  // twoHands: two-hand zoom available; fps / delegate: measured (shown in dev)
  store = new Observable({ status: 'off', error: null, ...IDLE, twoHands: true, fps: 0, delegate: null });

  // actions: { targetAt(x, y) -> { key, kind, label, selectable } | null, select(target), hover(target | null, x, y),
  //            zoomAt(factor, x, y) } with x, y in 0..1 of the window
  constructor({ tracking, camera, actions = {}, now = () => performance.now() }) {
    this.#tracking = tracking;
    this.#camera = camera;
    this.#actions = actions;
    this.#now = now;
  }

  get on() {
    return this.store.state.status === 'on' || this.store.state.status === 'starting';
  }

  async toggle() {
    if (this.on) return this.stop();
    const run = ++this.#run;
    this.#resetTrackers();
    this.#frames = [];
    this.#slowSince = null;
    this.store.set({ status: 'starting', error: null, ...IDLE, twoHands: true, fps: 0, delegate: null });
    try {
      await this.#tracking.start((hands, info) => { if (run === this.#run) this.#onFrame(hands, info); });
      if (run === this.#run) this.store.set({ status: 'on' });
    } catch (error) {
      if (run !== this.#run) return;
      this.#tracking.stop();
      this.store.set({ status: 'error', error: ERRORS[error?.name] ?? 'failed' });
    }
  }

  stop() {
    this.#run++;
    this.#tracking.stop();
    this.#resetTrackers();
    this.#actions.hover?.(null);
    this.store.set({ status: 'off', error: null, ...IDLE });
  }

  #resetTrackers() {
    this.#tracker = onePinch();
    this.#pair.reset();
    this.#pointer.reset();
    this.#dwell.reset();
    this.#twoHand = false;
    this.#waitRelease = false;
    this.#pinched = [false, false];
    this.#palms = [];
    this.#graceFrom = null;
    this.#twoLostAt = null;
    this.#cursorPalm = null;
    this.#target = null;
  }

  // hands: [landmarks, …] (or one hand's landmarks, or null: the older single-hand form)
  #onFrame(input, info = {}) {
    const raw = !input?.length ? [] : Array.isArray(input[0]) ? input.slice(0, 2) : [input];
    const now = info.now ?? this.#now();
    this.#measure(now, info.delegate);
    // Each hand keeps its place between frames, so its pinch state (with hysteresis) stays its own
    const match = matchHands(raw, this.#palms);
    const hands = match.hands;
    this.#pinched = hands.map((h, i) => isPinched(h, match.previous[i] >= 0 && this.#pinched[match.previous[i]]));
    this.#palms = match.palms;
    const twoHands = this.store.state.twoHands && hands.length === 2;

    // Two hands pinching: one holds, the other moves (B5-B9). It wins over a drag the first hand had started
    if (twoHands && this.#pinched[0] && this.#pinched[1]) {
      this.#twoLostAt = null;
      if (!this.#twoHand) {
        this.#twoHand = true;
        this.#tracker = onePinch(); // the drag stops here
        this.#camera.cancelFlight?.();
        this.#pair.reset();
        this.#graceFrom = null;
      }
      const { mode, factor, dAngle, anchor } = this.#pair.update(hands[0], hands[1]);
      let gesture = this.store.state.gesture;
      if (!mode) gesture = 'hold';
      else if (mode === 'rotate') {
        if (dAngle) this.#camera.turnBy(dAngle);
        gesture = 'rotate';
      } else if (factor !== 1) {
        if (this.#actions.zoomAt) this.#actions.zoomAt(factor, anchor.x, anchor.y);
        else this.#camera.zoomBy(factor);
        gesture = factor > 1 ? 'zoomIn' : 'zoomOut';
      } else if (!['zoomIn', 'zoomOut'].includes(gesture)) gesture = 'zoom';
      return this.#show({ hand: true, pinching: true, gesture, cursor: null });
    }
    if (this.#twoHand) {
      // A blink of the tracker is not the end of the gesture
      this.#twoLostAt ??= now;
      if (now - this.#twoLostAt < TWO_KEEP_MS) return this.#show({ hand: true, pinching: true, gesture: this.store.state.gesture, cursor: null });
      // one hand let go: the gesture ends; the other one must let go too before it drags
      this.#twoLostAt = null;
      this.#twoHand = false;
      this.#pair.reset();
      this.#waitRelease = true;
    }
    if (this.#waitRelease) {
      if (this.#pinched.some(Boolean)) return this.#show({ hand: hands.length > 0, pinching: false, gesture: 'wait', cursor: null });
      this.#waitRelease = false;
    }

    // One hand: the one pinching grabs (as before); otherwise the cursor's hand points
    const cursorHand = pickCursorHand(hands, this.#cursorPalm);
    const grabbing = hands.length === 2 ? hands[this.#pinched[0] ? 0 : this.#pinched[1] ? 1 : hands.indexOf(cursorHand)] : hands[0] ?? null;
    const { pinching, mode, dx, dy } = this.#tracker.update(grabbing ?? null);
    if (pinching) {
      // The other hand is in view and may pinch too: wait a moment before dragging (the moves of that
      // moment are not applied later, so nothing jumps)
      if (twoHands) this.#graceFrom ??= now;
      if (twoHands && now - this.#graceFrom < SECOND_HAND_GRACE_MS) {
        return this.#show({ hand: true, pinching: true, gesture: null, cursor: null });
      }
      this.#applyPan(dx, dy);
      return this.#show({ hand: true, pinching: true, gesture: mode, cursor: null });
    }
    this.#graceFrom = null;
    if (!cursorHand) return this.#show({ hand: false, pinching: false, gesture: null, cursor: null });
    this.#cursorPalm = palmOf(cursorHand);
    return this.#point(cursorHand, now);
  }

  // The cursor and the hold-still selection (B10-B18)
  #point(landmarks, now) {
    const cursor = this.#pointer.update(landmarks);
    const target = this.#actions.targetAt?.(cursor.x, cursor.y) ?? null;
    if ((target?.key ?? null) !== (this.#target?.key ?? null)) this.#actions.hover?.(target, cursor.x, cursor.y);
    this.#target = target;
    const { progress, fire } = this.#dwell.update(target?.selectable ? target.key : null, cursor, now);
    let { selected, selectedKey } = this.store.state;
    if (fire) {
      this.#actions.select?.(target);
      selected = target.label ?? null;
      selectedKey = target.key;
    } else if (selectedKey && target?.key !== selectedKey) {
      selected = null; // the cursor left what it selected
      selectedKey = null;
    }
    this.store.set({ hand: true, pinching: false, gesture: 'point', cursor, ring: fire ? 0 : progress, selected, selectedKey });
  }

  // Leaving the cursor: no hover, no ring (B12)
  #show(patch) {
    if (patch.cursor === null && this.store.state.cursor) {
      this.#pointer.reset();
      this.#dwell.reset();
      if (this.#target) this.#actions.hover?.(null);
      this.#target = null;
    }
    const s = this.store.state;
    const next = { ...patch, ring: 0, selected: null, selectedKey: null };
    if (Object.keys(next).some((k) => next[k] !== s[k])) this.store.set(next);
  }

  #applyPan(dx, dy) {
    if (!dx && !dy) return;
    // The map follows the hand, so the camera moves the other way (same screen axes as the arrow keys)
    const span = (CAMERA.viewHeight / this.#camera.zoom) * PAN_GAIN;
    const right = -dx * span, back = -dy * span * DEPTH_STRETCH;
    const az = this.#camera.azimuth;
    this.#camera.glideBy(Math.cos(az) * right + Math.sin(az) * back, -Math.sin(az) * right + Math.cos(az) * back);
  }

  // Frames per second over the last second; on CPU, too slow for too long turns two-hand zoom off (B2, B3)
  #measure(now, delegate) {
    this.#frames.push(now);
    while (this.#frames.length && this.#frames[0] < now - FPS_WINDOW_MS) this.#frames.shift();
    const elapsed = now - this.#frames[0];
    const fps = this.#frames.length > 1 && elapsed > 0 ? Math.round(((this.#frames.length - 1) * 1000) / elapsed) : this.store.state.fps;
    const patch = {};
    if (fps !== this.store.state.fps) patch.fps = fps;
    if (delegate && delegate !== this.store.state.delegate) patch.delegate = delegate;
    if (this.store.state.twoHands && delegate === 'CPU' && this.#frames.length > 1 && fps < MIN_FPS) {
      this.#slowSince ??= now;
      if (now - this.#slowSince >= SLOW_FOR_MS) {
        patch.twoHands = false;
        this.#tracking.setMaxHands?.(1); // one hand only: less work for the CPU
      }
    } else if (fps >= MIN_FPS) this.#slowSince = null;
    if (Object.keys(patch).length) this.store.set(patch);
  }
}
