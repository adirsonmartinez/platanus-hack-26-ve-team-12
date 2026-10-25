// Moves the floating windows (editor, browser) to the zone windowsViewModel gives them, with a short glide.
// The free area is the stage minus the side dock (and its open panel), the chat when it floats over the
// map, and the top row (security card, view switcher). A window without a zone goes back to its own
// place (draggable.js). Pure math in models/windowLayout.js.
import { freeArea, zoneRect, WINDOWS } from '../../models/windowLayout.js';

const GAP = 12;
const TOP = 96;    // below the security card and the view switcher
const BOTTOM = 14;

// windows: { editor: { root, draggable }, navegador: { root, draggable } }
export function createWindowsView({ stage, windowsViewModel: vm, windows }) {
  // what the windows must leave free, in stage pixels
  function area() {
    const s = stage.getBoundingClientRect();
    // the floating layout keeps closed panels laid out: the body's classes say what is really shown
    const body = document.body.classList;
    let left = GAP;
    for (const id of body.contains('sidebar-closed') ? ['side-dock'] : ['side-dock', 'sidebar']) {
      const node = document.getElementById(id);
      if (!node || node.hidden || !node.offsetParent) continue;
      const r = node.getBoundingClientRect();
      if (r.width && r.right > s.left && r.left < s.left + s.width / 2) left = Math.max(left, r.right - s.left + GAP);
    }
    let right = GAP;
    const chat = document.getElementById('chat');
    if (chat && !chat.hidden && chat.offsetParent && !body.contains('chat-closed') && !body.contains('chat-min')) {
      const r = chat.getBoundingClientRect();
      if (r.width && r.left < s.right && r.left > s.left + s.width / 2) right = Math.max(right, s.right - r.left + GAP);
    }
    return freeArea({ width: s.width, height: s.height, left, right, top: TOP, bottom: BOTTOM });
  }

  function place(name, placement, { glide = true } = {}) {
    const { root, draggable } = windows[name];
    if (!placement) {
      if (!root.dataset.zone) return;
      delete root.dataset.zone;
      root.classList.remove('zoned');
      root.style.width = '';
      root.style.zIndex = '';
      draggable.apply(); // its own remembered place (or the CSS one)
      return;
    }
    const rect = zoneRect(placement.zone, area());
    root.classList.toggle('zoned', glide);
    root.dataset.zone = placement.zone;
    Object.assign(root.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px`, right: 'auto', bottom: 'auto' });
    root.style.zIndex = placement.zone === 'completa' ? '27' : ''; // full screen covers the other window
  }

  const render = (state, { glide = true } = {}) => { for (const name of WINDOWS) place(name, state[name], { glide }); };
  vm.store.subscribe((state) => render(state), { immediate: true });

  // the room changes (window size, the chat or a side panel opening): the zones follow, without the glide
  const again = () => render(vm.store.state, { glide: false });
  window.addEventListener('resize', again);
  new MutationObserver(again).observe(document.body, { attributes: true, attributeFilter: ['class'] });
}
