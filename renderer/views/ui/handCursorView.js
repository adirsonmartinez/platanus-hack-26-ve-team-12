// The hand cursor (spec/003-hand-gestures.md): a purple dot that follows the hand over the whole window,
// with a ring that fills while it holds still on something selectable. It never takes the mouse's place:
// the layer lets every click through (pointer-events: none).
// createHandTargets is the screen side the view model asks for (as `actions`): what is under a point,
// selecting it like a click, hovering it, and zooming around a point. The 3D side reuses the mouse code
// (inputController's pickAtScreen and zoomAt).
import { uiTarget, pickTarget } from './handTargets.js';

const px = (n, size) => Math.round(n * size);
const reducedMotion = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

// canvas: the 3D scene's canvas · pickAtScreen(x, y) / zoomAt(factor, x, y): inputController ·
// handlePick(pick): the active view's click · hover(pick | null, x, y): the hover card ·
// dialogOpen(): a confirmation dialog is open (nothing is selectable meanwhile)
export function createHandTargets({ canvas, pickAtScreen, zoomAt, handlePick, hover, dialogOpen = () => false }) {
  const ids = new WeakMap();
  let next = 1;
  const keyOf = (element) => {
    if (!ids.has(element)) ids.set(element, element.id || `${element.dataset?.side ?? element.dataset?.stage ?? element.dataset?.path ?? 'el'}#${next++}`);
    return ids.get(element);
  };

  return {
    targetAt(nx, ny) {
      const x = px(nx, window.innerWidth), y = px(ny, window.innerHeight);
      const element = document.elementFromPoint(x, y);
      if (!element) return null;
      if (element === canvas) return dialogOpen() ? null : pickTarget(pickAtScreen(x, y));
      return uiTarget(element, { dialogOpen: dialogOpen(), keyOf });
    },
    select(target) {
      if (dialogOpen()) return;
      if (target.kind === 'pick') handlePick(target.pick);
      else if (target.kind === 'ui' && target.selectable && target.element?.isConnected) target.element.click();
    },
    hover(target, nx, ny) {
      hover(target?.kind === 'pick' ? target.pick : null, px(nx ?? 0, window.innerWidth), px(ny ?? 0, window.innerHeight));
    },
    zoomAt(factor, nx, ny) {
      zoomAt(factor, px(nx, window.innerWidth), px(ny, window.innerHeight));
    },
  };
}

export function createHandCursorView({ handControlViewModel: vm }) {
  const cursor = document.createElement('div');
  cursor.id = 'hand-cursor';
  cursor.hidden = true;
  cursor.setAttribute('aria-hidden', 'true');
  const ring = document.createElement('span');
  ring.className = 'hand-ring';
  const dot = document.createElement('span');
  dot.className = 'hand-dot';
  cursor.append(ring, dot);
  document.body.appendChild(cursor);

  vm.store.subscribe(({ cursor: at, ring: progress, status }) => {
    const visible = Boolean(at) && status === 'on';
    cursor.hidden = !visible;
    if (!visible) return;
    cursor.style.transform = `translate(${px(at.x, window.innerWidth)}px, ${px(at.y, window.innerHeight)}px)`;
    // "Reducir movimiento": the ring fills in quarters, without a continuous sweep (B25)
    cursor.style.setProperty('--progress', String(reducedMotion() ? Math.floor(progress * 4) / 4 : progress));
    cursor.classList.toggle('holding', progress > 0);
  });
}
