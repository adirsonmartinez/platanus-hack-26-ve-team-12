// Draws GitViewModel on the 'git' layer: lines, cubes and one light label per live branch tip
// (with its tags). Cubes rise one after another when the graph is (re)built.
import { buildGitGraph, laneColorCss } from './builders/gitBuilder.js';
import { escapeHtml } from '../../core/format.js';
import { strings } from '../../i18n/es.js';

const RISE_SPEED = 3;
const RISE_STAGGER = 0.025;
const LABEL_HEIGHT = 1.6;

export function createGitView({ sceneView, labels, gitViewModel }) {
  let graph = null;
  let ownLabels = [];
  let riseT = 0;

  function clear() {
    if (graph) sceneView.layers.git.remove(graph.group);
    ownLabels.forEach((l) => l.remove());
    ownLabels = [];
    graph = null;
  }

  const addLabel = (options) => ownLabels.push(labels.add({ ...options, layer: 'git' }));

  function render(state) {
    clear();
    if (state.status !== 'ready' || !state.commits.length) return;
    graph = buildGitGraph(state);
    sceneView.layers.git.add(graph.group);
    graph.setFocus(state.focusLane);
    riseT = 0;

    // One label per commit that has live branches and/or tags
    const tagsBySha = new Map();
    state.tags.forEach((t) => tagsBySha.set(t.sha, [...(tagsBySha.get(t.sha) ?? []), t.name]));
    const tipShas = new Set(state.tips.map((t) => t.sha));
    const labelled = [...state.tips, ...state.tags.filter((t) => !tipShas.has(t.sha))];
    const seen = new Set();

    labelled.forEach((item) => {
      if (seen.has(item.sha)) return;
      seen.add(item.sha);
      const branches = (state.tips.find((t) => t.sha === item.sha)?.branches ?? []).map((b) =>
        `<span class="branch${b.isHead ? ' head' : ''}"><i style="background:${laneColorCss(b.kind)}"></i>${escapeHtml(b.name)}</span>`);
      const tags = (tagsBySha.get(item.sha) ?? []).map((name) => `<span class="tag">${escapeHtml(name)}</span>`);
      const isHead = state.head?.sha === item.sha;
      addLabel({
        html: (isHead ? `<b>${strings.git.head}</b>` : '') + branches.join('') + tags.join(''),
        anchor: { x: item.x, y: LABEL_HEIGHT + (isHead ? 0.35 : 0), z: item.z },
        className: 'git-pill',
      });
    });
  }

  gitViewModel.store.subscribe((state, previous) => {
    if (!previous || state.version !== previous.version) render(state);
    else if (graph && state.focusLane !== previous.focusLane) graph.setFocus(state.focusLane);
  }, { immediate: true });

  sceneView.onFrame((t, dt) => {
    if (!graph) return;
    riseT += dt * RISE_SPEED;
    graph.cubes.forEach(({ mesh, index, size, baseY }) => {
      const k = Math.min(Math.max(riseT - index * RISE_STAGGER, 0), 1);
      const s = Math.max(size * (1 - (1 - k) ** 3), 0.001);
      mesh.scale.y = s;
      mesh.position.y = baseY + s / 2; // grow from the ground, not from the middle
    });
    if (graph.headFrame) graph.headFrame.scale.setScalar(1 + Math.sin(t * 2.5) * 0.04);
  });

  return {
    pickTargets: () => (graph ? [graph.group] : []),
  };
}
