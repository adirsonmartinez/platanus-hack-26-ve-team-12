// Panels over the scene: empty state and Supabase schema (map view), git summary (git view).
// The breadcrumb lives in the status bar and stays visible in every tab while a project is open;
// the folder's traffic-light counts stay on the map, top left.
import { strings } from '../../i18n/es.js';
import { escapeHtml } from '../../core/format.js';

export function createPanelsView({ appViewModel, mapViewModel, supabaseViewModel, gitViewModel }) {
  const $ = (id) => document.getElementById(id);
  const onMap = () => appViewModel.view === 'map';

  // Empty state: no project open (shown in both views)
  $('new-project').addEventListener('click', () => mapViewModel.createProject());
  $('open-project').addEventListener('click', () => mapViewModel.openProject());
  const renderEmpty = () => { $('empty-state').hidden = mapViewModel.store.state.status === 'ready'; };

  // Breadcrumb: where you are; every segment but the last goes back to that folder
  $('crumbs').addEventListener('click', (e) => {
    const target = e.target.closest('[data-path]');
    if (target) mapViewModel.enterFolder(target.dataset.path);
  });
  const renderBreadcrumb = () => {
    const { status, crumbs } = mapViewModel.store.state;
    $('breadcrumb').hidden = status !== 'ready';
    if (status !== 'ready') return;
    $('crumbs').innerHTML = crumbs.map((c, i) => (i === crumbs.length - 1
      ? `<strong>${escapeHtml(c.name)}</strong>`
      : `<button type="button" data-gesture="safe" data-path="${escapeHtml(c.path)}">${escapeHtml(c.name)}</button><span class="sep">/</span>`)).join('');
    $('crumbs').title = crumbs.length > 1 ? strings.panels.upHint : '';
  };

  // Supabase schema
  $('schema-close').addEventListener('click', () => supabaseViewModel.openSchema(false));
  const renderSchema = () => {
    const state = supabaseViewModel.store.state;
    $('schema-panel').hidden = !state.schemaOpen || !onMap();
    const summary = $('schema-summary');
    const hasError = state.tables.some((t) => t.exposed);
    summary.textContent = strings.panels.schemaSummary(state.tables.length, hasError);
    summary.classList.toggle('bad', hasError);
  };

  // Git summary
  const renderGit = () => {
    const state = gitViewModel.store.state;
    const projectOpen = mapViewModel.store.state.status === 'ready';
    $('git-panel').hidden = onMap() || !projectOpen;
    const t = strings.git;
    let title = t.loading, summary = '', risky = '';
    if (state.status === 'ready') {
      title = t.title(state.summary.branch);
      summary = t.summary(state.summary);
      risky = state.summary.risky ? t.risky(state.summary.risky) : '';
    } else if (state.status === 'not-repo') {
      title = t.notRepo;
      summary = state.error === 'git-missing' ? t.gitMissing : t.notRepoHint;
    } else if (state.status === 'error') {
      title = t.error;
    }
    $('git-title').textContent = title;
    $('git-summary').textContent = summary;
    $('git-risky').textContent = risky;
    $('git-risky').hidden = !risky;
  };

  const renderAll = () => { renderEmpty(); renderBreadcrumb(); renderSchema(); renderGit(); };
  appViewModel.store.subscribe(renderAll);
  mapViewModel.store.subscribe(() => { renderEmpty(); renderBreadcrumb(); renderGit(); });
  supabaseViewModel.store.subscribe(renderSchema);
  gitViewModel.store.subscribe(renderGit);
  renderAll();
}
