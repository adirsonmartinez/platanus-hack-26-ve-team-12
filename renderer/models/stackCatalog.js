// The technologies a new project can start with (the welcome robot's cards). Data only: each one has a logo
// (renderer/icons/iconNames.js STACK_LOGOS), the map integration it sets up (or null) and its rules:
//   base:     always chosen, cannot be removed
//   requires: choosing it also chooses these; removing one of these removes it
//   excludes: choosing it removes these (e.g. a mobile app instead of a web one)
// Names and one-line descriptions live in es.js (map.welcome.catalog.<id>). Adding React Native, Clerk or AWS
// later is adding a row here, its strings and its logo.
export const STACK_CATALOG = [
  { id: 'nextjs', logo: 'nextjs', integration: null, base: true },
  { id: 'vercel', logo: 'vercel', integration: 'vercel', requires: ['nextjs'] },
  { id: 'supabase', logo: 'supabase', integration: 'supabase' },
];

const ordered = (ids, catalog) => catalog.map((s) => s.id).filter((id) => ids.has(id));

export function defaultSelection(catalog = STACK_CATALOG) {
  return catalog.map((s) => s.id);
}

export function toggleStack(selection, id, catalog = STACK_CATALOG) {
  const byId = Object.fromEntries(catalog.map((s) => [s.id, s]));
  const item = byId[id];
  if (!item) return [...selection];
  const chosen = new Set(selection);
  // Removing drops everything that (directly or not) requires what is gone
  const drop = (gone) => {
    chosen.delete(gone);
    catalog.filter((s) => chosen.has(s.id) && s.requires?.includes(gone)).forEach((s) => drop(s.id));
  };
  // Adding brings its requirements and pushes out what it excludes
  const add = (wanted) => {
    if (chosen.has(wanted)) return;
    chosen.add(wanted);
    byId[wanted]?.excludes?.forEach((other) => { if (chosen.has(other)) drop(other); });
    byId[wanted]?.requires?.forEach(add);
  };
  if (!chosen.has(id)) add(id);
  else if (!item.base) drop(id);
  return ordered(chosen, catalog);
}

export function integrationsOf(selection, catalog = STACK_CATALOG) {
  return catalog.filter((s) => selection.includes(s.id) && s.integration).map((s) => s.integration);
}
