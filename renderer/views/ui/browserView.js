// The browser window over the map (desktop only): pages and images of the project, and the project on
// localhost, one tab each, in a sandboxed iframe (scripts and forms run; no popups, no navigating the app,
// no permissions). Its origin (qubbot-preview://project or localhost) is not the app's, so the page never
// reaches window.platanus; the CSP of index.html only lets it frame those two
// (docs/features/file-editor/README.md → «Navegador»). Same look as the editor (its classes).
import { strings } from '../../i18n/es.js';
import { icon } from '../icons.js';
import { makeDraggable } from './draggable.js';

const B = strings.browser;
const SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-modals allow-downloads';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const iconButton = (name, label, className = 'editor-icon-btn') => {
  const button = el('button', className);
  button.type = 'button';
  button.title = label;
  button.setAttribute('aria-label', label);
  button.innerHTML = icon(name); // static icon
  return button;
};

// onShowCode(path): a page's code in the editor; onOpenOutside(tab): the person's own browser.
// -> { root, draggable } (windowsView places the window in a zone)
export function createBrowserView({ stage, browserViewModel: vm, onShowCode = () => {}, onOpenOutside = () => {}, onGrab = () => {} }) {
  const root = el('section', 'editor browser');
  root.id = 'browser';
  root.hidden = true;
  root.setAttribute('aria-label', B.title);

  const head = el('header', 'editor-head');
  const closeWindow = iconButton('close', B.close);
  head.append(el('strong', '', B.title), closeWindow);

  const tabs = el('div', 'editor-tabs');
  tabs.setAttribute('role', 'tablist');

  const bar = el('div', 'editor-bar');
  const address = el('span', 'editor-path mono');
  const codeBtn = el('button', 'editor-chip', B.code);
  codeBtn.type = 'button';
  codeBtn.title = B.codeHint;
  const refresh = iconButton('retry', B.refresh);
  const outside = iconButton('openExternal', B.outside);
  bar.append(address, codeBtn, refresh, outside);

  const body = el('div', 'editor-body');
  const frame = el('iframe', 'browser-frame');
  frame.setAttribute('sandbox', SANDBOX);
  frame.setAttribute('referrerpolicy', 'no-referrer');
  frame.title = B.title;
  body.append(frame);

  root.append(head, tabs, bar, body);
  stage.appendChild(root);
  const draggable = makeDraggable({ el: root, handle: head, key: 'browser', area: stage, onGrab });

  const active = () => vm.tab(vm.store.state.active);

  function renderTabs({ tabs: list, active: current }) {
    tabs.replaceChildren(...list.map((t) => {
      const button = el('div', `editor-tab${t.path === current ? ' active' : ''}`);
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', String(t.path === current));
      button.title = t.path;
      button.append(el('span', 'level-dot green'), el('span', 'editor-tab-name', t.name));
      const close = iconButton('close', B.closeTab, 'editor-tab-close');
      close.addEventListener('click', (e) => { e.stopPropagation(); vm.close(t.path); });
      button.append(close);
      button.addEventListener('click', () => vm.activate(t.path));
      button.addEventListener('auxclick', (e) => { if (e.button === 1) vm.close(t.path); });
      return button;
    }));
    tabs.querySelector('.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  vm.store.subscribe((state) => {
    root.hidden = !state.open;
    const t = state.open ? active() : null;
    // a hidden window stops its page (sound, timers); a new address or a reload only when it changed
    if (!t) {
      if (frame.dataset.key) { frame.removeAttribute('src'); frame.dataset.key = ''; }
      return;
    }
    renderTabs(state);
    address.textContent = t.path;
    codeBtn.hidden = !t.page;
    const key = `${t.path}\n${t.stamp}`;
    if (frame.dataset.key !== key) {
      frame.dataset.key = key;
      frame.src = vm.url(t.path);
    }
  }, { immediate: true });

  closeWindow.addEventListener('click', () => vm.hide());
  codeBtn.addEventListener('click', () => { const t = active(); if (t?.page) onShowCode(t.path); });
  refresh.addEventListener('click', () => vm.refresh(vm.store.state.active));
  outside.addEventListener('click', () => { const t = active(); if (t) onOpenOutside(t); });

  // Keys, wheel and clicks here never reach the map
  for (const type of ['keydown', 'wheel', 'pointerdown', 'click', 'dblclick']) {
    root.addEventListener(type, (e) => e.stopPropagation());
  }

  return { root, draggable };
}
