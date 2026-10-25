// Floating menu (the ⋯ of a row): one layer above the whole app, anchored to the button that opened it.
// It lives outside the scrolling side panel, so it is never cut off nor drawn behind the next cards.
// Menu-button pattern: the first item gets focus on open; ↑/↓, Home/End move; Esc closes and gives the
// focus back to the button; Tab closes. Only draws: what is open and what each item does come from outside.
import { icon as svgIcon } from '../icons.js';

const GAP = 6; // space between the button and the menu
const MARGIN = 8; // the menu never touches the window edges

// Below the button with right edges aligned; above when it does not fit below; always inside the window.
export function placeMenu(anchor, size, viewport) {
  const fitsBelow = anchor.bottom + GAP + size.height <= viewport.height - MARGIN;
  const fitsAbove = anchor.top - GAP - size.height >= MARGIN;
  const placement = fitsBelow || !fitsAbove ? 'below' : 'above';
  const wanted = placement === 'below' ? anchor.bottom + GAP : anchor.top - GAP - size.height;
  const top = Math.max(MARGIN, Math.min(wanted, viewport.height - MARGIN - size.height));
  const left = Math.max(MARGIN, Math.min(anchor.right - size.width, viewport.width - MARGIN - size.width));
  return { top: Math.round(top), left: Math.round(left), placement };
}

// Menu item icon keys -> Hugeicons names (views/icons.js)
const ICONS = {
  open: 'openExternal', browser: 'globe', app: 'appWindow', pause: 'pause', play: 'play', stop: 'stop',
  terminal: 'terminal', remove: 'close', output: 'output',
};

const node = (tag, className, text) => {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
};

// entries: [{ label, run, icon?, primary? } | { heading } | { separator: true }]
function build(entries) {
  return entries.map((entry) => {
    if (entry.separator) return node('div', 'floating-menu-sep');
    if (entry.heading) return node('div', 'floating-menu-label', entry.heading);
    const item = node('button', `floating-menu-item${entry.primary ? ' primary' : ''}`);
    item.type = 'button';
    item.setAttribute('role', 'menuitem');
    item.tabIndex = -1;
    const icon = node('span', 'mi-icon');
    icon.setAttribute('aria-hidden', 'true');
    if (ICONS[entry.icon]) icon.innerHTML = svgIcon(ICONS[entry.icon]);
    item.append(icon, node('span', 'mi-label', entry.label));
    item.addEventListener('click', (e) => { e.stopPropagation(); entry.run(); });
    return item;
  });
}

// onDismiss(): the menu asks to be closed (Esc, Tab); whoever owns the state closes it and calls hide()
export function createFloatingMenu({ id, label = '', onDismiss }) {
  const menu = node('div', 'floating-menu');
  menu.id = id;
  menu.hidden = true;
  menu.setAttribute('role', 'menu');
  if (label) menu.setAttribute('aria-label', label);
  document.body.appendChild(menu);

  let key = null;
  let anchor = null;

  const items = () => [...menu.querySelectorAll('[role="menuitem"]:not(:disabled)')];
  const focusAt = (i) => {
    const list = items();
    if (list.length) list[((i % list.length) + list.length) % list.length].focus({ preventScroll: true });
  };

  menu.addEventListener('keydown', (e) => {
    const index = items().indexOf(document.activeElement);
    const moves = { ArrowDown: index + 1, ArrowUp: index < 0 ? -1 : index - 1, Home: 0, End: -1 };
    if (e.key in moves) {
      e.preventDefault();
      focusAt(moves[e.key]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      const back = anchor;
      onDismiss();
      back?.focus({ preventScroll: true });
    } else if (e.key === 'Tab') {
      onDismiss();
    }
  });
  menu.addEventListener('click', (e) => e.stopPropagation());

  function position() {
    if (menu.hidden || !anchor?.isConnected) return;
    const { top, left, placement } = placeMenu(
      anchor.getBoundingClientRect(),
      { width: menu.offsetWidth, height: menu.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
    );
    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
    menu.dataset.placement = placement;
  }

  // Called on every render while open: the rows may have been redrawn, so it re-anchors to the new button
  // and keeps the focused item. Only a real opening animates and moves the focus to the first item.
  function show(nextKey, nextAnchor, entries) {
    const opening = menu.hidden || key !== nextKey;
    const focused = items().indexOf(document.activeElement);
    key = nextKey;
    anchor = nextAnchor;
    menu.replaceChildren(...build(entries));
    menu.hidden = false;
    position();
    if (opening) {
      menu.classList.remove('enter');
      void menu.offsetWidth; // restart the CSS animation
      menu.classList.add('enter');
      focusAt(0);
    } else if (focused >= 0) {
      focusAt(focused);
    }
  }

  function hide() {
    if (menu.hidden) return;
    menu.hidden = true;
    menu.replaceChildren();
    key = null;
    anchor = null;
  }

  return {
    show,
    hide,
    position,
    contains: (n) => menu.contains(n),
    get anchor() { return anchor; },
  };
}
