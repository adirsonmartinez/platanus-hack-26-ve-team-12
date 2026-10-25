// Recording mode only (core/demoMode.js): a cursor drawn in the page that follows the real pointer, with
// a ring on each click, so the screen recording shows where the "person" moves and clicks. It never
// creates input itself: scripts/demo/recordTour.mjs moves the real pointer.
import { icon } from './icons.js';

export function createDemoCursor(root = document.body) {
  document.documentElement.classList.add('demo');
  const cursor = document.createElement('div');
  cursor.className = 'demo-cursor';
  cursor.setAttribute('aria-hidden', 'true');
  cursor.appendChild(icon('cursor', { size: 26 }));
  root.appendChild(cursor);
  const place = (x, y) => { cursor.style.transform = `translate(${x}px, ${y}px)`; };
  place(-100, -100);
  window.addEventListener('pointermove', (e) => place(e.clientX, e.clientY), { capture: true, passive: true });
  window.addEventListener('pointerdown', (e) => {
    const ring = document.createElement('span');
    ring.className = 'demo-click';
    ring.style.left = `${e.clientX}px`;
    ring.style.top = `${e.clientY}px`;
    root.appendChild(ring);
    cursor.classList.add('down');
    ring.addEventListener('animationend', () => ring.remove(), { once: true });
  }, { capture: true });
  window.addEventListener('pointerup', () => cursor.classList.remove('down'), { capture: true });
}
