// Help inside the chat's text box (state in composerViewModel.js):
//   - "Mejorar mi mensaje" (pencil with sparkles, in the composer bar): the message becomes a test-first
//     spec; a notice under it offers "Deshacer"
//   - hints while typing ("¿Te refieres a login.js?" adds the file; a pasted secret is flagged)
//   - file completions after "@" or as a name is typed: ↑ ↓ to move, Tab / Enter to choose, Esc to close
// Everything sits inside the composer (in flow), so nothing is clipped by the chat card or the beam.
import { strings } from '../../i18n/es.js';
import { icon } from './icons.js';
import { thinkingOrb, STEP_ORB } from './thinkingOrb.js';

const A = strings.chat.assist;

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

export function createComposerAssist({ vm, form, input, bar }) {
  const panel = el('div', 'composer-assist');
  panel.hidden = true;
  form.prepend(panel);

  const list = el('ul', 'composer-complete');
  list.id = 'chat-complete';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', A.completionsLabel);
  list.hidden = true;
  form.prepend(list);

  const improve = el('button', 'composer-icon composer-improve');
  improve.type = 'button';
  improve.dataset.tip = A.improveTip;
  improve.setAttribute('aria-label', A.improve);
  improve.appendChild(icon('improve', { size: 15 }));
  improve.addEventListener('click', () => vm.improve());
  bar.querySelector('.chat-more-wrap').after(improve);

  // The box and the view model stay in sync both ways
  input.setAttribute('aria-controls', list.id);
  input.addEventListener('input', () => { if (input.value !== vm.store.state.draft) vm.setDraft(input.value); });
  const write = (text) => {
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true })); // grows the box, hides the start suggestions
    input.focus();
    input.setSelectionRange(text.length, text.length);
  };

  // Registered in the capture phase: while the list is open, Enter chooses instead of sending
  input.addEventListener('keydown', (e) => {
    if (list.hidden) return;
    const handled = { ArrowDown: () => vm.move(1), ArrowUp: () => vm.move(-1), Tab: () => vm.accept(), Enter: () => vm.accept(), Escape: () => vm.dismiss() }[e.key];
    if (!handled || e.shiftKey || e.isComposing) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    handled();
  }, true);
  form.addEventListener('submit', (e) => { if (e.target === form && !input.value) vm.clear(); }); // sent: the box is empty again

  let improvingRow = null; // the "Ordenando tu mensaje…" row with its orb (kept while it lasts)
  vm.store.subscribe((state, prev) => {
    if (state.draft !== input.value) write(state.draft);

    list.hidden = !state.completions.length;
    if (state.completions !== prev?.completions || state.active !== prev?.active) {
      list.replaceChildren(...state.completions.map((item, i) => {
        const li = el('li', `complete-item${i === state.active ? ' active' : ''}`);
        li.id = `chat-complete-${i}`;
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', String(i === state.active));
        li.append(icon('file', { size: 13 }), el('strong', '', item.label), el('span', '', item.detail === item.label ? '' : item.detail));
        li.addEventListener('mousedown', (e) => { e.preventDefault(); vm.accept(i); }); // keep the focus in the box
        return li;
      }));
    }
    if (list.hidden) input.removeAttribute('aria-activedescendant');
    else input.setAttribute('aria-activedescendant', `chat-complete-${state.active}`);

    const rows = [];
    if (state.improving) {
      // Made when improving starts and attached right away, so the orbs' loop keeps drawing it
      if (!improvingRow) {
        improvingRow = el('p', 'assist-row working');
        improvingRow.dataset.state = STEP_ORB.improve;
        improvingRow.append(thinkingOrb(STEP_ORB.improve, { size: 20 }), el('span', '', A.improving));
      }
      rows.push(improvingRow);
    } else if (state.notice) {
      const row = el('p', `assist-row notice ${state.notice}`, A.notices[state.notice]);
      if (state.previous != null) {
        const undo = el('button', 'assist-undo', A.undo);
        undo.type = 'button';
        undo.addEventListener('click', () => vm.undo());
        row.appendChild(undo);
      }
      rows.push(row);
    }
    for (const hint of state.hints) {
      const row = el(hint.path ? 'button' : 'p', `assist-row hint ${hint.kind}`);
      row.append(icon(hint.kind === 'secret' ? 'danger' : 'idea', { size: 13 }), el('span', '', hint.text));
      if (hint.path) {
        row.type = 'button';
        row.addEventListener('click', () => vm.addPath(hint.path));
      }
      rows.push(row);
    }
    panel.replaceChildren(...rows);
    panel.hidden = !rows.length;
    if (!state.improving) improvingRow = null;
    improve.disabled = state.improving;
    improve.classList.toggle('busy', state.improving);
    form.classList.toggle('improving', state.improving);
  }, { immediate: true });
}
