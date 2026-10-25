// Top-left indicators on the map: a ring with the project's security score and a few counters.
import { strings } from '../../i18n/es.js';

const RING_RADIUS = 26;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

export function createHudView({ appViewModel, mapViewModel, gitViewModel, onShowRisks = () => {} }) {
  const hud = document.getElementById('hud');
  const t = strings.hud;

  hud.innerHTML = `
    <div class="hud-ring">
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle class="track" cx="32" cy="32" r="${RING_RADIUS}" />
        <circle class="value" cx="32" cy="32" r="${RING_RADIUS}" stroke-dasharray="${RING_LENGTH}" />
      </svg>
      <div><strong data-field="score"></strong><span>${t.security}</span></div>
    </div>
    <div class="hud-stat"><strong data-field="files"></strong><span>${t.files}</span></div>
    <div class="hud-stat risk"><strong data-field="risk"></strong><span>${t.risk}</span></div>
    <div class="hud-stat review"><strong data-field="review"></strong><span>${t.review}</span></div>
    <div class="hud-stat"><strong data-field="commits"></strong><span>${t.commits}</span></div>`;

  const field = (name) => hud.querySelector(`[data-field="${name}"]`);
  // The risk counters open the one list of risks (side panel)
  for (const stat of hud.querySelectorAll('.hud-stat.risk, .hud-stat.review')) {
    stat.setAttribute('role', 'button');
    stat.tabIndex = 0;
    stat.title = t.seeRisks;
    stat.addEventListener('click', onShowRisks);
    stat.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onShowRisks()));
  }
  const ring = hud.querySelector('.value');

  function render() {
    const { status, root } = mapViewModel.store.state;
    hud.hidden = status !== 'ready' || appViewModel.view !== 'map';
    if (!root) return;
    const score = root.securityScore;
    field('score').textContent = `${score}%`;
    field('files').textContent = root.total;
    field('risk').textContent = root.counts.red;
    field('review').textContent = root.counts.yellow;
    field('commits').textContent = gitViewModel.store.state.summary?.commits ?? '–';
    ring.style.strokeDashoffset = String(RING_LENGTH * (1 - score / 100));
    hud.dataset.level = root.scoreLevel; // the ring takes the worst open light: red, yellow or green
  }

  mapViewModel.store.subscribe(render);
  appViewModel.store.subscribe(render);
  gitViewModel.store.subscribe(render);
  render();
}
