const test = require('node:test');
const assert = require('node:assert/strict');
const { needsApproval, approvalMode, APPROVAL_MODES } = require('./approval');

const change = (over) => ({ path: 'src/app.js', exists: true, oldBytes: 1000, newBytes: 1100, ...over });

test('three modes; anything else is manual', () => {
  assert.deepEqual(APPROVAL_MODES, ['manual', 'auto', 'bypass']);
  assert.equal(approvalMode('auto'), 'auto');
  assert.equal(approvalMode('yolo'), 'manual');
  assert.equal(approvalMode(undefined), 'manual');
});

test('manual asks for every change; bypass for none', () => {
  assert.equal(needsApproval('manual', change()), true);
  assert.equal(needsApproval('bypass', change({ path: 'package.json' })), false);
  assert.equal(needsApproval('bypass', change({ newBytes: 0 })), false);
});

test('auto saves ordinary edits and new files on its own', () => {
  assert.equal(needsApproval('auto', change()), false);
  assert.equal(needsApproval('auto', change({ path: 'src/new.js', exists: false, oldBytes: 0 })), false);
});

test('auto still asks for what can break installs, deploys or run code', () => {
  for (const path of ['package.json', 'web/package-lock.json', 'pnpm-lock.yaml', '.github/workflows/release.yml', 'Dockerfile', 'docker-compose.yml', 'vercel.json', 'render.yaml', 'netlify.toml', 'supabase/migrations/1.sql', 'scripts/deploy.sh', 'Makefile', '.husky/pre-commit']) {
    assert.equal(needsApproval('auto', change({ path })), true, path);
  }
});

test('auto asks when a change deletes most of a file', () => {
  assert.equal(needsApproval('auto', change({ oldBytes: 1000, newBytes: 400 })), true);
  assert.equal(needsApproval('auto', change({ oldBytes: 1000, newBytes: 600 })), false);
});

test('auto: a Windows-style path (backslashes) is as sensitive as the normal one', () => {
  assert.equal(needsApproval('auto', { path: '.github\\workflows\\ci.yml', exists: true, oldBytes: 10, newBytes: 10 }), true);
  assert.equal(needsApproval('auto', { path: 'scripts\\deploy.sh', exists: true, oldBytes: 10, newBytes: 10 }), true);
});
