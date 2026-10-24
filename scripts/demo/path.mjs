// The cursor's path for the recording: from one point to another in `ms`, eased (slow start, slow end)
// with a slight arc, as a hand moves a mouse. Pure and deterministic: same input, same frames.
//   cursorPath(from, to, { ms, fps, arc }) -> [{ t, x, y }]  t in ms from the start, the last one at `to`
const easeInOutCubic = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);

export function cursorPath(from, to, { ms = 800, fps = 60, arc = 0.12 } = {}) {
  const steps = Math.max(1, Math.round((ms / 1000) * fps));
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  // the arc bends to one side of the straight line, proportional to the distance
  const [nx, ny] = length ? [-dy / length, dx / length] : [0, 0];
  const frames = [];
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    const e = easeInOutCubic(k);
    const bend = Math.sin(Math.PI * e) * length * arc;
    frames.push({ t: Math.round((ms * i) / steps), x: Math.round(from.x + dx * e + nx * bend), y: Math.round(from.y + dy * e + ny * bend) });
  }
  return frames;
}

// How long a move should take for a distance in pixels (longer moves are a bit slower, never too slow)
export const moveMs = (from, to) => Math.round(Math.min(1100, 380 + Math.hypot(to.x - from.x, to.y - from.y) * 0.45));
