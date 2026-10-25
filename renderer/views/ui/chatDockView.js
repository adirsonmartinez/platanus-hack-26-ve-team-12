// Pin for the chat: pinned, it becomes a column on the right (the map gives it its space). Its left edge
// can be dragged to change the width. Unpinned, minimized or closed, the chat floats over the map again.
import { strings } from '../../i18n/es.js';

const KEY = 'platanus.chat.dock.v1';
const MIN_W = 300;
const MAX_W = 720;

export function createChatDockView({ workspace, chat, pinButton }) {
  let state = { pinned: false, width: 372 };
  try { state = { ...state, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { /* nothing saved */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode */ } };

  // Column on the right that holds the pinned chat
  const dock = document.createElement('div');
  dock.id = 'chat-dock';

  const handle = document.createElement('div');
  handle.className = 'chat-resize';
  handle.title = strings.chat.resize;
  chat.appendChild(handle);

  const body = document.body;
  const visible = () => !body.classList.contains('chat-closed') && !body.classList.contains('chat-min');

  function apply() {
    const docked = state.pinned && visible();
    body.style.setProperty('--chat-w', `${state.width}px`);
    if (docked && !body.classList.contains('chat-docked')) {
      workspace.appendChild(dock);
      dock.appendChild(chat);
    } else if (!docked && body.classList.contains('chat-docked')) {
      workspace.appendChild(chat);
      dock.remove();
    }
    body.classList.toggle('chat-docked', docked);
    pinButton.classList.toggle('active', state.pinned);
    pinButton.setAttribute('aria-pressed', String(state.pinned));
    pinButton.title = state.pinned ? strings.chat.unpin : strings.chat.pin;
    pinButton.setAttribute('aria-label', pinButton.title);
  }

  pinButton.addEventListener('click', () => { state.pinned = !state.pinned; apply(); save(); });

  // Width: drag the left edge (the chat grows to the left)
  let drag = null;
  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    drag = { x: e.clientX, w: chat.getBoundingClientRect().width };
    try { handle.setPointerCapture(e.pointerId); } catch { /* synthetic event */ }
    body.classList.add('chat-resizing');
    e.preventDefault();
  });
  handle.addEventListener('pointermove', (e) => {
    if (!drag) return;
    state.width = Math.round(Math.min(MAX_W, Math.max(MIN_W, drag.w + (drag.x - e.clientX))));
    body.style.setProperty('--chat-w', `${state.width}px`);
  });
  const end = () => { if (drag) { drag = null; body.classList.remove('chat-resizing'); save(); } };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
  handle.addEventListener('dblclick', () => { state.width = 372; apply(); save(); });

  // Minimizing or closing the chat lets the map take the column back
  new MutationObserver(apply).observe(body, { attributes: true, attributeFilter: ['class'] });
  apply();
}
