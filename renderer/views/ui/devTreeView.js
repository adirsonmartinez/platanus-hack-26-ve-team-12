// Dev tree sidebar view: expandable folders + files with search, risk filter and keyboard nav.
import { strings } from '../../i18n/es.js';
import { icon } from '../icons.js';

const S = strings.devTree;

/** Folder (open or closed) or file icon, tinted by its traffic light (safe stays grey). */
const entryIcon = (name, level) => {
  const n = document.createElement('span');
  n.className = `entry-icon ${level}`;
  n.innerHTML = icon(name); // static icon
  return n;
};

/** Tiny DOM helper. */
const h = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

export function createDevTree({ onOpenFolder, onOpenFile, onRepair, isRepairing }) {

  // ----- internal state (survives between render calls) -----
  const openFolders = new Set();   // folder paths that are expanded
  let searchText = '';
  let onlyRisks = false;

  let lastTree = [];
  let rootEl = null;
  let listEl = null;
  let toastTimer = null;

  // Issue 3: DOM refs for toolbar — build once, save refs, never rebuild
  let searchEl = null;
  let matchesEl = null;
  let riskBtnEl = null;

  // Flat list of every visible row for keyboard navigation
  let visibleRows = [];

  // Issue 4 / 8: row that had browser focus (by data-path)
  let focusedPath = null;

  // Issue 8: path to refocus after a keyboard-triggered render
  let keyboardFocusPath = null;

  // ---- helpers ----

  /** Check if a value matches the current search (issue 2: search text is lowercased + trimmed). */
  function matches(val) {
    if (!searchText) return true;
    return val.toLowerCase().includes(searchText);
  }

  /** Check if a file matches the current filters. */
  function matchFile(f) {
    if (!matches(f.name) && !matches(f.path)) return false;
    if (onlyRisks && f.level !== 'red' && f.level !== 'yellow') return false;
    return true;
  }

  /** True if this node (or any descendant) has a matching file. */
  function hasMatch(node) {
    for (const n of node.children || []) {
      if (n.type === 'file' && matchFile(n)) return true;
      if (n.type === 'dir' && hasMatch(n)) return true;
    }
    return false;
  }

  /** While searching or filtering, folders with matches open by themselves. */
  const filtering = () => Boolean(searchText) || onlyRisks;
  const isOpen = (n) => openFolders.has(n.path) || filtering();

  /** Collect every visible { node, depth } in tree order. */
  function collect(nodes, depth, out) {
    for (const n of nodes) {
      if (n.type === 'file') {
        if (matchFile(n)) out.push({ node: n, depth });
      } else {
        // Issue 9: only show folders that have matching children
        if (!hasMatch(n)) continue;
        out.push({ node: n, depth });
        if (isOpen(n)) collectChildren(n, depth + 1, out);
      }
    }
  }

  /** Collect children of an open folder (flat list). */
  function collectChildren(node, depth, out) {
    for (const n of node.children || []) {
      if (n.type === 'file') {
        if (matchFile(n)) out.push({ node: n, depth });
      } else if (n.type === 'dir') {
        if (hasMatch(n)) {
          out.push({ node: n, depth });
          if (isOpen(n)) collectChildren(n, depth + 1, out);
        }
      }
    }
  }

  /** Count visible red / yellow files within a node and all descendants. */
  function countRY(node) {
    let r = 0, y = 0;
    for (const n of node.children || []) {
      if (n.type === 'file' && matchFile(n)) {
        if (n.level === 'red') r++;
        else if (n.level === 'yellow') y++;
      }
      if (n.type === 'dir') {
        const sub = countRY(n); r += sub.r; y += sub.y;
      }
    }
    return { r, y };
  }

  function expandAll(nodes) {
    for (const n of nodes) { openFolders.add(n.path); if (n.children) expandAll(n.children); }
  }
  function collapseAll(nodes) {
    for (const n of nodes) { openFolders.delete(n.path); if (n.children) collapseAll(n.children); }
  }

  // ---- DOM builders ----

  /** Build toolbar once. Saves refs to search, matches, risk button. */
  function buildToolbar() {
    const bar = h('div', 'devtree-toolbar');

    const search = h('input', 'devtree-search', '');
    search.placeholder = S.search;
    search.type = 'search';
    search.value = searchText;
    search.setAttribute('role', 'searchbox');
    search.addEventListener('input', () => {
      searchText = search.value.toLowerCase().trim();
      render(lastTree);
    });

    matchesEl = h('span', 'devtree-matches', S.matches(0));

    // Icon buttons; the name is in the tooltip and for screen readers
    const iconButton = (className, name, label) => {
      const b = h('button', className);
      b.type = 'button';
      b.title = label;
      b.setAttribute('aria-label', label);
      b.innerHTML = icon(name); // static icon
      return b;
    };

    const expandBtn = iconButton('devtree-action', 'unfoldMore', S.expandAll);
    expandBtn.addEventListener('click', () => { expandAll(lastTree); render(lastTree); });

    const collapseBtn = iconButton('devtree-action', 'unfoldLess', S.collapseAll);
    collapseBtn.addEventListener('click', () => { collapseAll(lastTree); render(lastTree); });

    riskBtnEl = iconButton('devtree-action devtree-risk', 'alert', S.onlyRisks);
    riskBtnEl.addEventListener('click', () => { onlyRisks = !onlyRisks; render(lastTree); });

    searchEl = search;

    // Row 1: the search field (magnifier, text, how many match); row 2: the actions, risks filter on the right
    const box = h('label', 'devtree-searchbox');
    const glass = h('span', 'devtree-search-icon');
    glass.innerHTML = icon('search'); // static icon
    box.append(glass, search, matchesEl);
    const actions = h('div', 'devtree-toolbar-actions');
    actions.append(expandBtn, collapseBtn, riskBtnEl);
    bar.append(box, actions);
    return bar;
  }

  /** Build one tree row (issue 7: div, not button). */
  function buildRow(item) {
    const { node, depth } = item;
    const row = h('div', `devtree-row ${node.type}${node.level ? ' ' + node.level : ''}`, '');
    row.setAttribute('role', 'treeitem');
    row.setAttribute('aria-level', String(depth + 1));
    row.style.paddingLeft = `${(depth + 1) * 12}px`;
    if (depth >= 1) row.style.borderLeft = '1px solid var(--line)';

    // Issue 5: store type and path in data attributes for reliable checks
    row.dataset.type = node.type;
    row.dataset.path = node.path;
    // Opening a folder or a file: the hand may select the row (not its buttons) (spec/003-hand-gestures.md, D1)
    row.dataset.gesture = 'safe';

    // ---- folder row ----
    if (node.type === 'dir') {
      const opened = isOpen(node);
      row.setAttribute('aria-expanded', String(opened));
      row.classList.toggle('open', opened);

      const { r: redC, y: yellowC } = countRY(node);

      row.append(
        h('span', 'devtree-chevron', opened ? '▾' : '▸'),
        entryIcon(opened ? 'folderOpen' : 'folder', node.level),
        h('span', 'devtree-name', `${node.name}/`),
      );

      // Only what is at risk inside (the total is noise here)
      if (redC > 0) row.appendChild(h('span', 'devtree-count red', String(redC)));
      if (yellowC > 0) row.appendChild(h('span', 'devtree-count yellow', String(yellowC)));

      // Issue 7: action buttons inside a container, not nested in a <button>
      const actions = h('div', 'devtree-actions');
      const mapBtn = h('button', 'devtree-action-btn', S.map);
      mapBtn.type = 'button';
      mapBtn.addEventListener('click', (e) => { e.stopPropagation(); onOpenFolder(node.path); });
      actions.appendChild(mapBtn);
      row.appendChild(actions);

      row.addEventListener('click', () => {
        if (opened) openFolders.delete(node.path);
        else openFolders.add(node.path);
        if (depth === 0) onOpenFolder(node.path);
        if (rootEl) render(lastTree);
      });
    } else {
      // ---- file row ----
      row.append(
        entryIcon('file', node.level),
        h('span', 'devtree-name', node.name),
      );

      // Just the name with its extension: the icon's color already says its traffic light

      // title with technical reason
      row.title = node.reasonKey
        ? (strings.security.techReasons[node.reasonKey] ?? node.reason)
        : (node.reason || '');

      row.addEventListener('click', () => onOpenFile(node.path));

      // Issue 7: action buttons in separate container
      const actions = h('div', 'devtree-actions');

      // copy action (hover)
      const copyBtn = h('button', 'devtree-action-btn', S.copyPath);
      copyBtn.type = 'button';
      copyBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try { await navigator.clipboard.writeText(node.path); } catch { /* ignore */ }
        showCopiedToast();
      });
      actions.appendChild(copyBtn);

      // repair action (hover, red/yellow only)
      if ((node.level === 'red' || node.level === 'yellow') && !isRepairing(node.path)) {
        const repBtn = h('button', 'devtree-action-btn devtree-repair', S.repair);
        repBtn.type = 'button';
        repBtn.dataset.gesture = 'never'; // the hand cursor never selects it (spec/003-hand-gestures.md, B20)
        repBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          onRepair(node.path, repBtn);
        });
        actions.appendChild(repBtn);
      }

      row.appendChild(actions);
    }

    return row;
  }

  function showCopiedToast() {
    if (toastTimer) clearTimeout(toastTimer);
    let toast = rootEl?.querySelector('.devtree-toast');
    if (!toast) {
      toast = h('div', 'devtree-toast', '');
      rootEl.appendChild(toast);
    }
    toast.textContent = S.copied;
    toast.classList.add('show');
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
      toastTimer = null;
    }, 1200);
  }

  // ---- keyboard navigation ----

  function handleKeyDown(e) {
    // Issue 6: ignore events originating from input elements
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    const items = visibleRows;
    if (!items.length) return;
    const cur = items.indexOf(document.activeElement);
    if (cur < 0) return;

    const row = items[cur];

    switch (e.key) {
      case 'ArrowUp': {
        e.preventDefault();
        setFocus(cur > 0 ? cur - 1 : 0);
        break;
      }
      case 'ArrowDown': {
        e.preventDefault();
        setFocus(cur < items.length - 1 ? cur + 1 : items.length - 1);
        break;
      }
      case 'ArrowRight': {
        if (row.dataset.type === 'dir' && !openFolders.has(row.dataset.path)) {
          e.preventDefault();
          keyboardFocusPath = row.dataset.path;
          openFolders.add(row.dataset.path);
          if (rootEl) render(lastTree);
        }
        break;
      }
      case 'ArrowLeft': {
        if (row.dataset.type === 'dir' && openFolders.has(row.dataset.path)) {
          // Open dir -> close it
          e.preventDefault();
          keyboardFocusPath = row.dataset.path;
          openFolders.delete(row.dataset.path);
          if (rootEl) render(lastTree);
        } else if (cur > 0) {
          // Issue 11: file or closed dir -> go to parent folder (prev row with lower aria-level)
          e.preventDefault();
          const curLevel = parseInt(row.getAttribute('aria-level'), 10);
          let parentIdx = -1;
          for (let i = cur - 1; i >= 0; i--) {
            const prevLevel = parseInt(items[i].getAttribute('aria-level'), 10);
            if (prevLevel < curLevel) {
              parentIdx = i;
              break;
            }
          }
          setFocus(parentIdx >= 0 ? parentIdx : cur - 1);
        }
        break;
      }
      case 'Enter':
      case ' ': {
        e.preventDefault();
        keyboardFocusPath = row.dataset.path;
        if (row.dataset.type === 'dir') {
          openFolders.has(row.dataset.path)
            ? openFolders.delete(row.dataset.path)
            : openFolders.add(row.dataset.path);
          if (rootEl) render(lastTree);
        } else {
          onOpenFile(row.dataset.path);
        }
        break;
      }
    }
  }

  /** Set tabIndex on rows and browser-focus the given index. */
  function setFocus(idx) {
    if (idx < 0 || idx >= visibleRows.length) return;
    for (let i = 0; i < visibleRows.length; i++) {
      visibleRows[i].tabIndex = i === idx ? 0 : -1;
    }
    focusedPath = visibleRows[idx].dataset.path;
    visibleRows[idx]?.focus();
  }

  /** Apply tabIndex for the row that had browser focus (without moving focus). */
  function applyTabIndexState() {
    const found = focusedPath == null ? -1 : visibleRows.findIndex(r => r.dataset.path === focusedPath);
    const idx = found >= 0 ? found : 0; // one row is always reachable with Tab
    for (let i = 0; i < visibleRows.length; i++) {
      visibleRows[i].tabIndex = i === idx ? 0 : -1;
    }
  }

  // ---- public render(tree) ----

  /** @param {Array} tree top-level folder nodes.
   *  @returns {[HTMLDivElement]} root container. */
  function render(tree) {
      lastTree = tree || [];

      // Issue 3: create root / toolbar once
      if (!rootEl) {
        rootEl = h('div', 'devtree');
        rootEl.setAttribute('role', 'tree');
        rootEl.setAttribute('aria-label', S.search);
        rootEl.appendChild(buildToolbar());

        // Issue 6: keydown on list, not root
        listEl = h('div', 'devtree-list');
        listEl.addEventListener('keydown', handleKeyDown);
        rootEl.appendChild(listEl);
      }

      // A row that has the focus keeps it across redraws (e.g. a traffic light changed meanwhile)
      const focusedRow = listEl?.contains(document.activeElement) ? document.activeElement.dataset.path : null;
      if (focusedRow != null && keyboardFocusPath == null) keyboardFocusPath = focusedRow;
      visibleRows = [];

      // Issue 3: update toolbar elements (not rebuild)
      riskBtnEl.className = `devtree-action devtree-risk${onlyRisks ? ' active' : ''}`;
      riskBtnEl.setAttribute('aria-pressed', String(onlyRisks));

      // Collect items
      const items = [];
      collect(lastTree, 0, items);

      matchesEl.textContent = S.matches(items.length);
      matchesEl.hidden = !filtering(); // the count only matters while searching or filtering

      // Issue 9: no matches -> show message
      if (!items.length) {
        listEl.replaceChildren(h('p', 'devtree-empty', S.noMatches));
        // Issue 10: return array
        return [rootEl];
      }

      // Rebuild list container only
      listEl.replaceChildren();
      for (const item of items) {
        const row = buildRow(item);
        visibleRows.push(row);
        listEl.appendChild(row);
      }

      // Issue 4/8: maintain tabIndex without stealing focus, then restore browser focus
      // if this render was triggered by a keyboard action.
      applyTabIndexState();
      if (keyboardFocusPath != null) {
        const idx = visibleRows.findIndex(r => r.dataset.path === keyboardFocusPath);
        if (idx >= 0) {
          for (let i = 0; i < visibleRows.length; i++) {
            visibleRows[i].tabIndex = i === idx ? 0 : -1;
          }
          visibleRows[idx]?.focus();
          focusedPath = keyboardFocusPath;
        }
        keyboardFocusPath = null;
      }

      // Issue 10: render returns an array
      return [rootEl];
  }

  return { render };
}