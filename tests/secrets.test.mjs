// Guard: no credential is ever committed. Scans every file git tracks (and staged changes)
// for well-known key formats and for secret-looking assignments.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

const PATTERNS = [
  ['Anthropic key', /sk-ant-[A-Za-z0-9_-]{10,}/],
  ['OpenAI key', /\bsk-(proj-)?[A-Za-z0-9]{32,}/],
  ['xAI key', /\bxai-[A-Za-z0-9]{20,}/],
  ['Stripe key', /\b[sr]k_(live|test)_[A-Za-z0-9]{10,}/],
  ['ElevenLabs key', /\bsk_[A-Za-z0-9]{32,}/],
  ['GitHub token', /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,}/],
  ['AWS key', /\bAKIA[0-9A-Z]{16}\b/],
  ['Google key', /\bAIza[0-9A-Za-z_-]{30,}/],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ['Supabase token', /\bsbp_[a-f0-9]{30,}/],
  ['JWT', /\beyJhbGciOi[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/],
  ['Private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['Secret assignment', /\b(api[_-]?key|apikey|secret|token|password|passwd)\s*[:=]\s*["'][A-Za-z0-9/+_.-]{20,}["']/i],
];
const SECRET_FILE = /(^|\/)(\.env(\.(?!example$)[^/]+)?|id_(rsa|ed25519|ecdsa)[^/]*|[^/]+\.(pem|key|p12|pfx)|\.npmrc|credentials\.json)$/i;

const files = execFileSync('git', ['ls-files', '--cached'], { encoding: 'utf8' }).split('\n').filter(Boolean);

test('no secret files are tracked', () => {
  assert.deepEqual(files.filter((f) => SECRET_FILE.test(f)), []);
});

test('no tracked file contains a credential', () => {
  const hits = [];
  for (const file of files) {
    if (file.startsWith('tests/secrets.test.mjs')) continue; // the patterns themselves
    let text;
    try {
      if (statSync(file).size > 2_000_000) continue;
      text = readFileSync(file, 'utf8');
    } catch { continue; } // deleted in the working tree
    for (const [name, re] of PATTERNS) if (re.test(text)) hits.push(`${file}: ${name}`);
  }
  assert.deepEqual(hits, []);
});

test('the scanner does catch a key (positive control)', () => {
  assert.ok(PATTERNS[0][1].test('const k = "sk-ant-api03-abcdefghijklmnop"'));
  assert.ok(SECRET_FILE.test('config/.env.local') && !SECRET_FILE.test('.env.example'));
});
