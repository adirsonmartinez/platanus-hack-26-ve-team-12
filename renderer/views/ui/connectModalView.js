// "Conectar mi cuenta": a glass modal over the map, drawn from ConnectViewModel. Each step is one small
// screen: what the service is for and a sign-in button, the wait for the browser, the choice (organization;
// a new project or one the person has), the progress while main works, and the outcome. Inputs only call
// the view model; the keys never pass through here.
import { strings } from '../../i18n/es.js';
import { icon } from '../icons.js';

const C = strings.accounts;

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const button = (label, className, onClick) => {
  const b = el('button', className, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
};

export function createConnectModalView({ connectViewModel: vm }) {
  const root = el('div', 'connect-layer');
  root.hidden = true;
  const card = el('div', 'connect-card');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  root.appendChild(card);
  document.body.appendChild(root);

  root.addEventListener('click', (e) => { if (e.target === root && vm.store.state.step !== 'working') vm.close(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !root.hidden && vm.store.state.step !== 'working') vm.close();
  });

  function head(S) {
    const h = el('div', 'connect-head');
    const logo = el('span', 'connect-logo');
    logo.innerHTML = icon('supabase');
    const title = el('h3', '', S.title);
    title.id = 'connect-title';
    card.setAttribute('aria-labelledby', title.id);
    const close = button('', 'connect-x', () => vm.close());
    close.innerHTML = icon('close');
    close.setAttribute('aria-label', C.close);
    close.disabled = vm.store.state.step === 'working';
    h.append(logo, title, close);
    return h;
  }

  function intro(S) {
    const list = el('ol', 'connect-steps');
    S.steps.forEach((s) => list.appendChild(el('li', '', s)));
    return [el('p', 'connect-text', S.intro), list, button(S.signIn, 'connect-primary', () => vm.signIn())];
  }

  function choose(S, state) {
    const parts = [];
    if (state.organizations.length > 1) {
      const label = el('label', 'connect-label', S.organization);
      const select = el('select', 'connect-select');
      state.organizations.forEach((o) => {
        const option = el('option', '', o.name);
        option.value = o.id;
        option.selected = o.id === state.organizationId;
        select.appendChild(option);
      });
      select.addEventListener('change', () => vm.pickOrganization(select.value));
      label.appendChild(select);
      parts.push(label);
    }
    const shown = vm.projectsShown();
    const option = (mode, title, note, extra = null) => {
      const b = button('', `connect-option${state.mode === mode ? ' chosen' : ''}`, () => vm.pickMode(mode));
      b.setAttribute('aria-pressed', String(state.mode === mode));
      const body = el('span', 'connect-option-body');
      body.append(el('b', '', title));
      if (note) body.append(el('small', '', note));
      b.append(el('span', 'connect-radio'), body);
      parts.push(b);
      if (extra && state.mode === mode) parts.push(extra);
    };
    option('new', S.newProject(state.suggested), S.newNote);
    let list = null;
    if (shown.length) {
      list = el('select', 'connect-select');
      shown.forEach((p) => {
        const o = el('option', '', p.name);
        o.value = p.id;
        o.selected = p.id === state.projectId;
        list.appendChild(o);
      });
      list.addEventListener('change', () => vm.pickProject(list.value));
    }
    option('existing', S.existing, shown.length ? null : S.noProjects, list);
    const go = button(S.connect, 'connect-primary', () => vm.connect());
    go.disabled = state.mode === 'existing' && !state.projectId;
    parts.push(go);
    return parts;
  }

  function waiting(text) {
    const box = el('div', 'connect-wait');
    box.append(el('span', 'connect-spinner'), el('p', 'connect-text', text));
    return [box];
  }

  function render(state) {
    root.hidden = !state.open;
    if (!state.open) return;
    const S = C[state.service] ?? C.supabase;
    const body = {
      intro: () => intro(S),
      signing: () => waiting(S.signing),
      choose: () => choose(S, state),
      working: () => waiting(S.stages[state.stage] ?? S.stages.starting),
      done: () => [el('p', 'connect-text', S.done(state.result?.name ?? '')), button(S.doneButton, 'connect-primary', () => vm.close())],
      error: () => [
        el('p', 'connect-error-title', S.failed),
        el('p', 'connect-text', state.errorKey ? S[state.errorKey] : state.error),
        button(S.retry, 'connect-primary', () => vm.signIn()),
      ],
    }[state.step]();
    card.replaceChildren(head(S), ...body);
    card.dataset.step = state.step;
  }

  vm.store.subscribe(render, { immediate: true });
}
