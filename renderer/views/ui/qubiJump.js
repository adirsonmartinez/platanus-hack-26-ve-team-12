// Qubi jumps across the interface: from the "Reparar" button, hop by hop, into the map.
// Resolves when he lands (right away with reduced motion), so the 3D walk starts there.
import { drawSprite, SPRITE_H, SPRITE_W } from '../qubiSprite.js';

const SCALE = 3;
const HOPS = 3;
const MS = 900;

export function qubiJump(fromEl, toEl) {
  const from = fromEl?.getBoundingClientRect();
  const to = toEl?.getBoundingClientRect();
  if (!from || !to || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve();

  const canvas = document.createElement('canvas');
  canvas.width = SPRITE_W * SCALE;
  canvas.height = SPRITE_H * SCALE;
  canvas.className = 'qubi-jumper';
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  drawSprite(ctx, 'hammerUp', SCALE);
  document.body.appendChild(canvas);

  const start = { x: from.left + from.width / 2 - canvas.width / 2, y: from.top - canvas.height };
  const end = { x: to.left + to.width / 2 - canvas.width / 2, y: to.top + to.height * 0.55 - canvas.height };
  // A few hops along the way, each one an arc
  const frames = [];
  const steps = HOPS * 8;
  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    const hop = (k * HOPS) % 1;
    const lift = Math.sin(hop * Math.PI) * (70 - 30 * k);
    const x = start.x + (end.x - start.x) * k;
    const y = start.y + (end.y - start.y) * k - lift;
    const squash = hop < 0.08 || hop > 0.92 ? 'scale(1.15, 0.85)' : 'scale(1)';
    frames.push({ transform: `translate(${x}px, ${y}px) ${squash}`, offset: k });
  }
  const animation = canvas.animate(frames, { duration: MS, easing: 'linear', fill: 'forwards' });
  return animation.finished.catch(() => {}).then(() => {
    canvas.animate([{ opacity: 1 }, { opacity: 0, transform: `translate(${end.x}px, ${end.y + 10}px) scale(0.6)` }], { duration: 180, fill: 'forwards' })
      .finished.catch(() => {}).then(() => canvas.remove());
  });
}
