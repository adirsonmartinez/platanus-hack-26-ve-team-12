// Small formatting helpers shared by the views
import test from 'node:test';
import assert from 'node:assert/strict';
import { daysAgo, formatBytes, formatCount } from '../../renderer/core/format.js';

test('daysAgo counts calendar days, not 24-hour blocks', () => {
  const now = new Date(2026, 9, 24, 9, 0); // Oct 24, 09:00 local
  assert.equal(daysAgo(new Date(2026, 9, 24, 0, 5).toISOString(), now), 0);
  assert.equal(daysAgo(new Date(2026, 9, 23, 23, 50).toISOString(), now), 1); // 10 minutes ago, but yesterday
  assert.equal(daysAgo(new Date(2026, 9, 21, 12, 0).toISOString(), now), 3);
  assert.equal(daysAgo(new Date(2026, 8, 24, 12, 0).toISOString(), now), 30);
});

test('daysAgo is null for a missing or broken date, and never negative', () => {
  const now = new Date(2026, 9, 24, 9, 0);
  assert.equal(daysAgo(undefined, now), null);
  assert.equal(daysAgo('not a date', now), null);
  assert.equal(daysAgo(new Date(2026, 9, 25).toISOString(), now), 0);
});

test('sizes in Spanish: decimal comma below 10, whole numbers above', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(1536), '1,5 KB');
  assert.equal(formatBytes(9 * 1024 ** 2), '9 MB');
  assert.equal(formatBytes(24.4 * 1024 ** 2), '24 MB');
  assert.equal(formatBytes(1.2 * 1024 ** 3), '1,2 GB');
});

test('counts with a dot every three digits', () => {
  assert.equal(formatCount(0), '0');
  assert.equal(formatCount(999), '999');
  assert.equal(formatCount(1250), '1.250');
  assert.equal(formatCount(1234567), '1.234.567');
});
