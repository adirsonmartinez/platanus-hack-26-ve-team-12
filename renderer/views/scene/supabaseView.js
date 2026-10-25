// Draws the Supabase node, its status label and the schema cards from SupabaseViewModel. The node is
// built along +x from the plaza and turned up the screen, into the integrations band (layout.js).
import { buildSupabaseNode } from './builders/supabaseBuilder.js';
import { INTEGRATIONS, integrationToWorld, SCHEMA_CENTER } from '../../viewmodels/layout.js';
import { buildSchema } from './builders/schemaBuilder.js';
import { strings } from '../../i18n/es.js';

export function createSupabaseView({ sceneView, labels, supabaseViewModel, supabaseModel }) {
  const node = buildSupabaseNode();
  node.group.userData.pick = { type: 'supabase' };
  node.group.visible = false;
  node.group.rotation.y = INTEGRATIONS.rotation;
  sceneView.layers.map.add(node.group);

  // the example tables only in the web demo: on the desktop Qubbot has not read the project's database
  const schema = buildSchema(sceneView.renderer, supabaseViewModel.store.state.demo ? supabaseModel.tables : [], integrationToWorld(node.trunkStart), integrationToWorld(SCHEMA_CENTER));
  sceneView.layers.map.add(schema.group);

  const label = labels.add({
    html: '<span class="dot"></span><span class="txt"></span> <b></b>',
    anchor: { ...integrationToWorld(node.labelAnchor), y: node.labelAnchor.y },
    className: 'sb-label',
    hidden: true,
  });
  const labelText = label.el.querySelector('.txt');
  const labelStatus = label.el.querySelector('b');

  supabaseViewModel.store.subscribe((state, previous) => {
    node.group.visible = state.visible;
    label.el.hidden = !state.visible;
    label.el.classList.toggle('vuln', state.vulnerable);
    labelText.textContent = state.vulnerable ? strings.supabase.vulnerable : state.demo ? strings.supabase.connected : strings.supabase.state[state.status] ?? strings.supabase.state.unknown;
    labelStatus.textContent = state.vulnerable ? strings.supabase.critical : state.latencyMs == null ? '' : strings.supabase.latency(state.latencyMs);
    if (!previous || state.vulnerable !== previous.vulnerable) node.setVulnerable(state.vulnerable);
    if (!previous || state.tables !== previous.tables) schema.setTables(state.tables);
    if (!previous || state.schemaOpen !== previous.schemaOpen) schema.setOpen(state.schemaOpen);
  }, { immediate: true });

  sceneView.onFrame((t, dt) => {
    node.update(t);
    schema.update(t, dt);
  });

  return {
    pickTargets: () => {
      const targets = [node.group];
      if (supabaseViewModel.store.state.schemaOpen) targets.push(schema.group);
      return targets;
    },
  };
}
