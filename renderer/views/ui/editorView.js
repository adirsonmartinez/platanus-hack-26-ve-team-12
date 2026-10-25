// Floating editor over the map: a header (drag to move, double click: back in place), one tab per open
// file (traffic-light dot, name, unsaved dot / close), the file's path with its state, and the code in
// CodeMirror with syntax colors (renderer/vendor/codemirror.js; colors are CSS tokens, `--syntax-*`).
// Each tab keeps its own CodeMirror state (undo, cursor, scroll). ⌘S / Ctrl+S saves, Tab indents,
// ⌘F searches. Keys typed here never reach the map's shortcuts.
// Preview: pages, images and the project on localhost show in a sandboxed iframe (scripts and forms
// run; no popups, no navigating the app, no permissions). Its origin (qubbot-preview://project or
// localhost) is not the app's, so the page never reaches window.platanus; the CSP of index.html only
// lets it frame those two (docs/features/file-editor/README.md → «Vista previa»).
import { strings } from '../../i18n/es.js';
import { icon } from '../icons.js';
import { makeDraggable } from './draggable.js';
import { languageOf } from '../../models/fileLanguage.js';
import {
  EditorState, EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, highlightSpecialChars,
  drawSelection, dropCursor, rectangularSelection, defaultKeymap, history, historyKeymap, indentWithTab,
  syntaxHighlighting, bracketMatching, indentOnInput, indentUnit, foldGutter, foldKeymap, classHighlighter,
  search, searchKeymap, highlightSelectionMatches, closeBrackets, closeBracketsKeymap, LANGUAGES,
} from '../../vendor/codemirror.js';

const E = strings.editor;

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

// The editor's chrome, from the UI tokens (token colors are in shell.css, by tok-* class)
const theme = EditorView.theme({
  '&': { height: '100%', color: 'var(--text)', backgroundColor: 'transparent', fontSize: '12px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.6' },
  '.cm-content': { padding: '10px 0', caretColor: 'var(--accent)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'var(--syntax-selection)' },
  '.cm-gutters': { backgroundColor: 'var(--syntax-gutter)', color: 'var(--faint)', borderRight: '1px solid var(--line)' },
  '.cm-activeLine': { backgroundColor: 'var(--syntax-active-line)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--syntax-active-line)', color: 'var(--muted)' },
  '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': { backgroundColor: 'var(--accent-soft)', outline: '1px solid var(--accent)' },
  '.cm-selectionMatch': { backgroundColor: 'var(--syntax-match)' },
  '.cm-searchMatch': { backgroundColor: 'var(--syntax-match)', outline: '1px solid var(--line-strong)' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'var(--accent-soft)' },
  '.cm-foldPlaceholder': { backgroundColor: 'transparent', border: '1px solid var(--line-strong)', color: 'var(--muted)' },
  '.cm-panels': { backgroundColor: 'var(--glass-strong)', color: 'var(--text)' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--line)' },
  '.cm-panel.cm-search': { padding: '6px 8px', fontFamily: 'var(--sans)', fontSize: '11px' },
  '.cm-panel.cm-search input, .cm-panel.cm-search button': { fontFamily: 'var(--sans)', fontSize: '11px' },
  '.cm-textfield': { backgroundColor: 'rgba(0, 0, 0, .25)', border: '1px solid var(--line-strong)', borderRadius: '5px', color: 'var(--text)' },
  '.cm-button': { backgroundImage: 'none', backgroundColor: 'rgba(255, 255, 255, .06)', border: '1px solid var(--line-strong)', borderRadius: '5px', color: 'var(--text)' },
  '.cm-tooltip': { backgroundColor: 'var(--glass-strong)', border: '1px solid var(--line-strong)', color: 'var(--text)' },
}, { dark: true });

const SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-modals allow-downloads';

// onOpenOutside(tab): the same file or address in the person's browser
export function createEditorView({ stage, editorViewModel, onOpenOutside = () => {} }) {
  const vm = editorViewModel;
  const root = el('section', 'editor');
  root.id = 'editor';
  root.hidden = true;

  const head = el('header', 'editor-head');
  const title = el('strong', '', E.title);
  const closeWindow = iconButton('close', E.close);
  head.append(title, closeWindow);

  const tabs = el('div', 'editor-tabs');
  tabs.setAttribute('role', 'tablist');

  const bar = el('div', 'editor-bar');
  const path = el('span', 'editor-path mono');
  const secret = el('span', 'editor-secret', E.secret);
  secret.title = E.secretHint;
  const status = el('span', 'editor-status');
  const save = el('button', 'editor-save', E.save);
  save.type = 'button';
  save.title = E.saveHint;
  // Código / Vista previa, then reload and open in the browser (only for tabs with a preview)
  const views = el('div', 'editor-views');
  views.setAttribute('role', 'group');
  views.setAttribute('aria-label', E.preview.views);
  const viewButton = (view, label) => {
    const b = el('button', 'editor-view-btn', label);
    b.type = 'button';
    b.dataset.view = view;
    b.addEventListener('click', () => vm.setView(vm.store.state.active, view));
    return b;
  };
  views.append(viewButton('code', E.preview.code), viewButton('preview', E.preview.show));
  const refresh = iconButton('retry', E.preview.refresh);
  const outside = iconButton('openExternal', E.preview.outside);
  bar.append(path, secret, status, views, refresh, outside, save);

  const notice = el('div', 'editor-notice');
  const noticeText = el('span');
  const reload = el('button', 'editor-notice-btn', E.reload);
  reload.type = 'button';
  notice.append(noticeText, reload);

  const body = el('div', 'editor-body');
  const code = el('div', 'editor-code');
  const message = el('div', 'editor-message');
  const frame = el('iframe', 'editor-preview');
  frame.setAttribute('sandbox', SANDBOX);
  frame.setAttribute('referrerpolicy', 'no-referrer');
  frame.title = E.preview.show;
  frame.hidden = true;
  body.append(code, message, frame);

  root.append(head, tabs, bar, notice, body);
  stage.appendChild(root);
  makeDraggable({ el: root, handle: head, key: 'editor', area: stage });

  // --- CodeMirror: one view, one state per tab ---
  const states = new Map(); // path -> EditorState
  let shown = null; // path whose state is in the view

  function createState(tabPath, content) {
    const language = LANGUAGES[languageOf(tabPath)];
    return EditorState.create({
      doc: content,
      extensions: [
        lineNumbers(), highlightActiveLineGutter(), foldGutter(), highlightSpecialChars(), history(), drawSelection(),
        dropCursor(), EditorState.allowMultipleSelections.of(true), indentOnInput(), bracketMatching(), closeBrackets(),
        rectangularSelection(), highlightActiveLine(), highlightSelectionMatches(), search({ top: true }),
        syntaxHighlighting(classHighlighter), indentUnit.of('  '), EditorState.tabSize.of(2),
        EditorState.phrases.of(E.phrases), theme, language ? language() : [],
        keymap.of([
          ...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...foldKeymap, indentWithTab,
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) vm.edit(tabPath, update.state.doc.toString());
        }),
      ],
    });
  }

  const editor = new EditorView({ parent: code, state: EditorState.create() });

  const active = () => vm.tab(vm.store.state.active);

  function closeTab(tabPath) {
    if (vm.close(tabPath)) return;
    if (window.confirm(E.confirmClose(vm.tab(tabPath)?.name ?? tabPath))) vm.close(tabPath, { force: true });
  }

  function renderTabs({ tabs: list, active: current }) {
    tabs.replaceChildren(...list.map((t) => {
      const dirty = vm.isDirty(t.path);
      const button = el('div', `editor-tab${t.path === current ? ' active' : ''}${dirty ? ' dirty' : ''}`);
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', String(t.path === current));
      button.title = t.path;
      button.append(el('span', `level-dot ${t.level ?? 'green'}`), el('span', 'editor-tab-name', t.name));
      const close = iconButton('close', E.closeTab, 'editor-tab-close');
      close.addEventListener('click', (e) => { e.stopPropagation(); closeTab(t.path); });
      button.append(close);
      button.addEventListener('click', () => vm.activate(t.path));
      button.addEventListener('auxclick', (e) => { if (e.button === 1) closeTab(t.path); });
      return button;
    }));
    tabs.querySelector('.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function renderActive() {
    const t = active();
    // Keep the previous tab's state (undo, cursor) for when it comes back
    if (shown && shown !== t?.path && vm.tab(shown)) states.set(shown, editor.state);
    if (!t) { shown = null; root.classList.remove('is-previewing'); return; }

    path.textContent = t.path;
    const previewing = t.canPreview && t.view === 'preview';
    views.hidden = !t.canPreview || t.previewOnly;
    for (const b of views.children) b.setAttribute('aria-pressed', String(b.dataset.view === t.view));
    refresh.hidden = !previewing;
    outside.hidden = !t.canPreview;
    secret.hidden = !t.secret;
    root.classList.toggle('is-secret', t.secret);
    const dirty = vm.isDirty(t.path);
    status.textContent = t.status === 'loading' ? E.loading : t.saving ? E.saving : t.saveError ? t.saveError : dirty ? E.unsaved : t.status === 'ready' ? E.saved : '';
    status.className = `editor-status${t.saveError ? ' error' : dirty ? ' dirty' : ''}`;
    save.disabled = !dirty || t.saving;
    // in the preview, saving only matters when there are edits
    save.hidden = t.status !== 'ready' || t.previewOnly || (previewing && !dirty);
    status.hidden = previewing && !dirty && !t.saving;

    notice.hidden = !t.stale;
    noticeText.textContent = E.stale;

    // the preview: a new address (or a reload) only when it changed, so typing never reloads it
    frame.hidden = !previewing;
    root.classList.toggle('is-previewing', previewing);
    if (previewing) {
      const key = `${t.path}\n${t.stamp}`;
      if (frame.dataset.key !== key) {
        frame.dataset.key = key;
        frame.src = vm.previewUrl(t.path);
      }
      code.hidden = true;
      message.hidden = true;
      if (shown && vm.tab(shown)) states.set(shown, editor.state);
      shown = null;
      return;
    }

    const ready = t.status === 'ready';
    code.hidden = !ready;
    message.hidden = ready;
    message.textContent = t.status === 'error' ? (E.errors[t.error] ?? t.error ?? E.errors.failed) : E.loading;
    if (!ready) { shown = null; return; }

    if (shown !== t.path) {
      editor.setState(states.get(t.path) ?? createState(t.path, t.content));
      shown = t.path;
    }
    // The content changed from outside (a reload from disk): replace it, keeping the undo history
    const current = editor.state.doc.toString();
    if (current !== t.content) editor.dispatch({ changes: { from: 0, to: current.length, insert: t.content } });
  }

  vm.store.subscribe((state, previous) => {
    root.hidden = !state.open;
    // a hidden preview stops (a page's sound or timers must not go on)
    const t = state.open ? active() : null;
    if (!(t?.canPreview && t.view === 'preview') && frame.dataset.key) {
      frame.removeAttribute('src');
      frame.dataset.key = '';
    }
    if (!state.open) return;
    renderTabs(state);
    renderActive();
    if ((state.active !== previous?.active || state.open !== previous?.open) && active()?.status === 'ready') editor.focus();
    for (const key of states.keys()) if (!vm.tab(key)) states.delete(key);
  }, { immediate: true });

  // --- Input ---
  closeWindow.addEventListener('click', () => vm.hide());
  save.addEventListener('click', () => vm.save(vm.store.state.active));
  reload.addEventListener('click', () => vm.reload(vm.store.state.active));
  refresh.addEventListener('click', () => vm.refresh(vm.store.state.active));
  outside.addEventListener('click', () => { const t = active(); if (t) onOpenOutside(t); });

  // Typing here never moves the map (Esc, Q/E/G, WASD); ⌘S saves from anywhere in the window
  root.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      vm.save(vm.store.state.active);
    }
  });

  // Wheel and clicks inside the editor stay in the editor (the map must not zoom or pick under it)
  for (const type of ['wheel', 'pointerdown', 'click', 'dblclick']) {
    root.addEventListener(type, (e) => e.stopPropagation());
  }

  return root;
}
