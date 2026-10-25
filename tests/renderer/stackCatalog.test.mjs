import test from 'node:test';
import assert from 'node:assert/strict';
import { STACK_CATALOG, defaultSelection, toggleStack, integrationsOf } from '../../renderer/models/stackCatalog.js';

const catalog = [
  { id: 'nextjs', integration: null, base: true },
  { id: 'vercel', integration: 'vercel', requires: ['nextjs'] },
  { id: 'supabase', integration: 'supabase' },
  { id: 'native', integration: null, excludes: ['nextjs', 'vercel'] },
];

test('the demo catalog offers Next.js (base), Vercel and Supabase, all chosen to start', () => {
  assert.deepEqual(STACK_CATALOG.map((s) => s.id), ['nextjs', 'vercel', 'supabase']);
  assert.deepEqual(defaultSelection(), ['nextjs', 'vercel', 'supabase']);
});

test('a base technology cannot be unchosen', () => {
  assert.deepEqual(toggleStack(['nextjs', 'vercel'], 'nextjs', catalog), ['nextjs', 'vercel']);
});

test('toggling adds or removes a technology', () => {
  assert.deepEqual(toggleStack(['nextjs', 'vercel', 'supabase'], 'supabase', catalog), ['nextjs', 'vercel']);
  assert.deepEqual(toggleStack(['nextjs'], 'supabase', catalog), ['nextjs', 'supabase']);
});

test('choosing one adds what it requires; removing a requirement removes what needs it', () => {
  assert.deepEqual(toggleStack(['supabase'], 'vercel', catalog), ['nextjs', 'vercel', 'supabase']);
  const withoutBase = [{ ...catalog[0], base: false }, ...catalog.slice(1)];
  assert.deepEqual(toggleStack(['nextjs', 'vercel'], 'nextjs', withoutBase), []);
});

test('choosing one removes what it excludes, and what needed those', () => {
  const free = catalog.map((s) => ({ ...s, base: false }));
  assert.deepEqual(toggleStack(['nextjs', 'vercel', 'supabase'], 'native', free), ['supabase', 'native']);
});

test('the selection keeps the catalog order and unknown ids are ignored', () => {
  assert.deepEqual(toggleStack(['supabase', 'nextjs'], 'vercel', catalog), ['nextjs', 'vercel', 'supabase']);
  assert.deepEqual(toggleStack(['nextjs'], 'nope', catalog), ['nextjs']);
});

test('the map integrations a selection sets up', () => {
  assert.deepEqual(integrationsOf(['nextjs', 'vercel', 'supabase']), ['vercel', 'supabase']);
  assert.deepEqual(integrationsOf(['nextjs']), []);
});
