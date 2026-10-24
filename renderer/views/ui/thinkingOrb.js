// Thinking orbs (libraries.dev, MIT): a small dotted orb that says what the agent is doing.
// The package's React component is a thin loop over its framework-free engine (`thinking-orbs/engine`);
// this is the same loop for plain DOM: one shared requestAnimationFrame clock for every orb on screen,
// paused while the window is hidden, skipping orbs scrolled out of view (as the package does with an
// IntersectionObserver), and one still frame with reduced motion (the package's frame, also when the
// setting changes while the app runs). An orb removed from the page stops drawing on its own.
//
// States (pick the one that names the activity): working, searching, solving, listening, connecting,
// composing, breathing (thinking), weaving (planning), shaping. Sizes: 64, 32 or 20 (the tuned presets;
// never scale the canvas with CSS beyond a few px).
import { resolvePreset, MODE_FRAMES, paintFrame } from 'thinking-orbs/engine';

const orbs = new Set();
let raf = 0;
const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
const reduced = () => Boolean(motionQuery?.matches);
const STILL_T = 0.6; // the package's still frame time

const offscreen = new WeakSet();
const io = typeof IntersectionObserver === 'function'
  ? new IntersectionObserver((entries) => { for (const e of entries) e.isIntersecting ? offscreen.delete(e.target) : offscreen.add(e.target); })
  : null;

function draw(orb, t) {
  const { ctx, size, dpr, frame, opts } = orb;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  paintFrame(ctx, frame(size, t, opts), true); // dark theme: light dots
}
const drawAt = (orb, seconds) => draw(orb, seconds * orb.speed);
const drawStill = (orb) => draw(orb, STILL_T);

function loop() {
  raf = 0;
  if (document.visibilityState === 'hidden' || reduced()) return;
  const t = performance.now() / 1000;
  for (const orb of orbs) {
    if (!orb.canvas.isConnected) { io?.unobserve(orb.canvas); orbs.delete(orb); continue; }
    // skip hidden ones (minimized chat…) and those scrolled out of the chat
    if (orb.canvas.offsetParent !== null && !offscreen.has(orb.canvas)) drawAt(orb, t);
  }
  if (orbs.size) raf = requestAnimationFrame(loop);
}
const start = () => { if (!raf && orbs.size && !reduced()) raf = requestAnimationFrame(loop); };
document.addEventListener('visibilitychange', start);
motionQuery?.addEventListener?.('change', () => {
  if (!reduced()) return start();
  cancelAnimationFrame(raf);
  raf = 0;
  for (const orb of orbs) if (orb.canvas.isConnected) drawStill(orb);
});

// Returns a <canvas>. label: what it is doing, for screen readers (omit when text beside it says it).
// speed: a multiplier on the preset's speed (e.g. 0.45 for "waiting its turn").
// still: one frame, never animated (an agent's avatar once its work is done).
export function thinkingOrb(state = 'working', { size = 20, label = '', className = '', speed = 1, still = false } = {}) {
  const canvas = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  canvas.className = `orb${className ? ` ${className}` : ''}`;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  if (label) { canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', label); }
  else canvas.setAttribute('aria-hidden', 'true');
  // the package draws 20, 32 and 64 px orbs: any other size uses the nearest one, scaled
  const preset = resolvePreset(state, [20, 32, 64].reduce((best, s) => (Math.abs(s - size) < Math.abs(best - size) ? s : best), 20));
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const orb = { canvas, ctx, size, dpr, frame: MODE_FRAMES[preset.mode], opts: preset.opts, speed: preset.speed * speed };
  if (still || reduced()) drawStill(orb);
  else drawAt(orb, performance.now() / 1000);
  if (still) return canvas;
  orbs.add(orb); // also with reduced motion: it starts moving if the setting is turned off
  io?.observe(canvas);
  start();
  return canvas;
}

// What each Platanus activity looks like (the package's recipe: search -> searching, write -> composing,
// debugging/fixing -> solving, planning -> weaving…). Keys are orbKeyOf() keys (runCardView.js).
export const STEP_ORB = {
  get_project: 'searching',
  list_risks: 'searching',
  read_file: 'working',
  write_file: 'composing',
  set_file_score: 'solving',
  show_folder: 'searching', // finding the folder on the map
  subagent: 'weaving',
  repair: 'solving', // Remi and the agent fixing a file
  improve: 'shaping', // "Mejorar mi mensaje": gives the message its shape (a spec)
  connect: 'connecting', // testing an agent's connection
  approval: 'listening', // the agent waits for the person to approve a change
  thinking: 'breathing',
  writing: 'composing',
  working: 'working',
};
