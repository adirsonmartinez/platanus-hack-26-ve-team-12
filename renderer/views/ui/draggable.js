// Lets a floating card (the side panel, the chat) be dragged by its header anywhere in an area.
// The position is remembered; double-clicking the header docks it back in its place.
// While moved, the body gets the class `${key}-moved` (so the rest of the layout stops making room for it).
const KEY = (key) => `platanus.drag.v1:${key}`;

export function makeDraggable({ el, handle, key, area, disabled = () => false }) {
  let state = { x: null, y: null, h: null };
  try { state = { ...state, ...JSON.parse(localStorage.getItem(KEY(key)) ?? '{}') }; } catch { /* nothing saved */ }
  const save = () => { try { localStorage.setItem(KEY(key), JSON.stringify(state)); } catch { /* private mode */ } };

  const apply = () => {
    const moved = state.x !== null;
    document.body.classList.toggle(`${key}-moved`, moved);
    el.classList.toggle('moved', moved);
    if (moved) Object.assign(el.style, { left: `${state.x}px`, top: `${state.y}px`, right: 'auto', bottom: 'auto', height: `${state.h}px` });
    else Object.assign(el.style, { left: '', top: '', right: '', bottom: '', height: '' });
  };

  // Keep the header reachable inside the area
  const clamp = () => {
    if (state.x === null) return;
    const box = area.getBoundingClientRect();
    state.h = Math.min(state.h, box.height - 8);
    state.x = Math.min(Math.max(state.x, 0), Math.max(0, box.width - el.offsetWidth));
    state.y = Math.min(Math.max(state.y, 0), Math.max(0, box.height - state.h));
  };

  let drag = null;
  handle.classList.add('drag-handle');
  handle.addEventListener('pointerdown', (e) => {
    if (disabled() || e.button !== 0 || e.target.closest('button, input, textarea, select, a')) return;
    const box = area.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, box };
    if (state.x === null) state.h = r.height; // keep its size when it leaves its place
    try { handle.setPointerCapture(e.pointerId); } catch { /* synthetic event */ }
    el.classList.add('dragging');
  });
  handle.addEventListener('pointermove', (e) => {
    if (!drag) return;
    state.x = e.clientX - drag.box.left - drag.dx;
    state.y = e.clientY - drag.box.top - drag.dy;
    clamp();
    apply();
  });
  const end = (e) => {
    if (!drag) return;
    drag = null;
    el.classList.remove('dragging');
    try { handle.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    save();
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
  handle.addEventListener('dblclick', (e) => {
    if (e.target.closest('button, input, textarea, select, a')) return;
    state = { x: null, y: null, h: null };
    apply();
    save();
  });
  window.addEventListener('resize', () => { clamp(); apply(); });
  apply();
}
