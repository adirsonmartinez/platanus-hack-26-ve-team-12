// A floating icon bar (the top view switcher and the vertical side dock). When it holds both side
// panels (explorer, risks…) and views (map, git…) a divider splits the two groups. Icons can be
// dragged to a new place within their group (or moved with Alt+arrows when focused). The order is
// remembered in this computer, per bar.
const KEY = (bar) => `platanus.iconbar.order.v1${bar.id === 'stage-tabs' ? '' : `:${bar.id}`}`;

// Stable id of an icon: its side panel, its view, or its own id (chat)
const idOf = (b) => (b.dataset.side ? `side:${b.dataset.side}` : b.dataset.stage ? `stage:${b.dataset.stage}` : b.id);
const groupOf = (b) => (b.dataset.side ? 'side' : 'view');

export function createIconBarView({ bar, vertical = false }) {
  const [backKey, nextKey] = vertical ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight'];
  // true when the pointer is past the middle of the button (drop after it)
  const pastMiddle = (e, button) => {
    const r = button.getBoundingClientRect();
    return vertical ? e.clientY > r.top + r.height / 2 : e.clientX > r.left + r.width / 2;
  };
  const items = () => [...bar.children].filter((n) => n.tagName === 'BUTTON');

  const save = () => {
    try { localStorage.setItem(KEY(bar), JSON.stringify(items().map(idOf))); } catch { /* private mode */ }
  };

  // Restore the saved order (new icons that were not saved stay at the end)
  try {
    const order = JSON.parse(localStorage.getItem(KEY(bar)) ?? '[]');
    const byId = new Map(items().map((b) => [idOf(b), b]));
    for (const id of order) if (byId.has(id)) bar.appendChild(byId.get(id));
    for (const b of byId.values()) if (!order.includes(idOf(b))) bar.appendChild(b);
  } catch { /* nothing saved */ }
  // Side panels first, then the views (an order saved before the groups existed may mix them)
  for (const b of items().filter((x) => groupOf(x) === 'view')) bar.appendChild(b);
  const divider = document.createElement('span');
  divider.className = 'icon-bar-divider';
  divider.setAttribute('aria-hidden', 'true');
  if (items().some((x) => groupOf(x) === 'side')) items().find((x) => groupOf(x) === 'view')?.before(divider);
  const sameGroup = (a, b) => groupOf(a) === groupOf(b);

  let dragged = null;
  const clearMarks = () => items().forEach((b) => b.classList.remove('drop-before', 'drop-after'));

  for (const button of items()) {
    button.addEventListener('dragstart', (e) => {
      dragged = button;
      button.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', idOf(button));
    });
    button.addEventListener('dragend', () => {
      button.classList.remove('dragging');
      clearMarks();
      dragged = null;
    });
    button.addEventListener('dragover', (e) => {
      if (!dragged || dragged === button || !sameGroup(dragged, button)) return;
      e.preventDefault();
      const after = pastMiddle(e, button);
      clearMarks();
      button.classList.add(after ? 'drop-after' : 'drop-before');
    });
    button.addEventListener('drop', (e) => {
      if (!dragged || dragged === button || !sameGroup(dragged, button)) return;
      e.preventDefault();
      button[pastMiddle(e, button) ? 'after' : 'before'](dragged);
      clearMarks();
      save();
    });
    // Keyboard: Alt+← / Alt+→ (Alt+↑ / Alt+↓ on a vertical bar) moves the focused icon
    button.addEventListener('keydown', (e) => {
      if (!e.altKey || (e.key !== backKey && e.key !== nextKey)) return;
      e.preventDefault();
      const list = items().filter((x) => sameGroup(x, button));
      const i = list.indexOf(button);
      if (e.key === backKey && i > 0) list[i - 1].before(button);
      if (e.key === nextKey && i < list.length - 1) list[i + 1].after(button);
      button.focus();
      save();
    });
  }
}
