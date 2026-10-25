// Synthetic hands for the gesture tests (spec/003-hand-gestures.md): MediaPipe's 21 landmarks in image
// coordinates (0..1, x to the right of the image, y down). Same shape as the hand in handGesture.test.mjs:
// wrist at (x, y + 0.2·scale), knuckles at (x, y), thumb and index tips `gap` apart around (x, y − 0.05·scale).
// Hand size (wrist to middle knuckle) = 0.2·scale. `turn` rotates it around the palm, like a knob.
export const OPEN = 0.15;
export const PINCHED = 0.02;

export function hand(x, y, gap, { turn = 0, scale = 1 } = {}) {
  const points = Array.from({ length: 21 }, () => ({ x, y, z: 0 }));
  points[0] = { x, y: y + 0.2 * scale, z: 0 };
  points[9] = { x, y, z: 0 };
  points[4] = { x: x - (gap * scale) / 2, y: y - 0.05 * scale, z: 0 };
  points[8] = { x: x + (gap * scale) / 2, y: y - 0.05 * scale, z: 0 };
  const cx = x, cy = y + (0.2 * scale) / 3;
  const cos = Math.cos(turn), sin = Math.sin(turn);
  return points.map((p) => ({ x: cx + (p.x - cx) * cos - (p.y - cy) * sin, y: cy + (p.x - cx) * sin + (p.y - cy) * cos, z: 0 }));
}

// A tiny deterministic tremor (image units)
export const jitter = (i, amount = 0.001) => (i % 2 ? amount : -amount);

// Hold and move: one hand pinches and stays (at x = hold), the other pinches and moves by (dx, dy) in the
// image. Up in the image is dy < 0; the person's right is dx < 0 (the camera image is mirrored).
export const holdAndMove = (dx, dy, { hold = 0.3, move = 0.7, y = 0.5 } = {}) => [hand(hold, y, PINCHED), hand(move + dx, y + dy, PINCHED)];
