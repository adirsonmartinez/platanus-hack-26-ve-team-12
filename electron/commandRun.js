// Commands an agent may run in the open project (platanus_run_command, docs/features/comandos/README.md).
// Agents never get a shell: Qubbot runs one command from a short list, without a shell (no pipes, no
// redirections, no `;` or `&&`), inside the project, with a time limit, and only after the person's
// approval when it can change something. The output comes back trimmed and with anything that looks like
// a key covered. Tested in commandRun.test.js.
//   parseCommand(text)          -> { ok, argv } | { ok: false, reason }
//   classify(argv)              -> { ok, kind: 'read' | 'change', label } | { ok: false, reason }
//   commandNeedsApproval(mode, kind) -> boolean
//   createCommandRunner({ spawn }) -> { run({ root, cwd, argv, timeoutMs }) -> { exitCode, output, timedOut } }
const path = require('node:path');
const childProcess = require('node:child_process');

const MAX_LENGTH = 500;
const MAX_OUTPUT = 12_000;     // what goes back to the agent (the end, where errors are)
const TIMEOUT_MS = 5 * 60_000; // an install can take a while
const SHELL_CHARS = /[;&|<>`$\n\r\\]|\$\(/;

// Splits a command line into words; single and double quotes group words. No shell features.
function parseCommand(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return { ok: false, reason: 'empty' };
  if (raw.length > MAX_LENGTH) return { ok: false, reason: 'too-long' };
  if (SHELL_CHARS.test(raw)) return { ok: false, reason: 'shell' };
  const argv = [];
  let word = '';
  let quote = null;
  let started = false;
  for (const ch of raw) {
    if (quote) {
      if (ch === quote) quote = null; else word += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch; started = true;
    } else if (/\s/.test(ch)) {
      if (started) { argv.push(word); word = ''; started = false; }
    } else {
      word += ch; started = true;
    }
  }
  if (quote) return { ok: false, reason: 'quote' };
  if (started) argv.push(word);
  return argv.length ? { ok: true, argv } : { ok: false, reason: 'empty' };
}

const PACKAGE_MANAGERS = new Set(['npm', 'pnpm', 'yarn', 'bun']);
// Only reads: no change to the project and none of its code runs (tests, linters and scripts run the
// project's code and its config files, so they are 'change' and ask in the "Automático" mode)
const PM_READ = new Set(['ls', 'list', 'outdated', 'audit', 'why', 'view', 'info', '--version', '-v']);
const PM_CHANGE = new Set(['install', 'i', 'ci', 'add', 'remove', 'rm', 'uninstall', 'un', 'update', 'up', 'upgrade', 'run', 'run-script', 'test', 't', 'exec', 'dlx', 'create', 'init', 'build', 'dedupe', 'prune', 'rebuild', 'link']);
const PROJECT_TOOLS = new Set(['tsc', 'eslint', 'prettier', 'vitest', 'jest', 'playwright']);
// git, only to look, never at file contents (a committed key would be printed) and never changing refs
const GIT_LOG_FLAGS = /^(--oneline|--stat|--shortstat|--name-only|--name-status|--graph|--decorate|--all|--no-merges|-n|-\d+|--max-count=\d+|--since=[\w.:-]+|--until=[\w.:-]+|--author=[\w@. -]+|--format=(oneline|short)|\d+)$/;
const GIT_DIFF_FLAGS = /^(--stat|--shortstat|--name-only|--name-status|--cached|--staged)$/;
// Options that write somewhere, change the folder, the shell or the config: never
const FORBIDDEN_FLAG = /^(-o|-C|--output|--output-file|--outputFile|--outDir|--out-dir|--outFile|--out-file|--cwd|--dir|--prefix|--global|-g|--location|--script-shell|--userconfig|--globalconfig|--cache|--exec|-c|--git-dir|--work-tree|--no-index|--config|--rootDir|--tsBuildInfoFile|--declarationDir|--reporter-options)(=.*)?$/;
const GLOBAL = new Set(['global']);

// A word that points outside the project: an absolute path, a home path or a step up
const outside = (arg) => /^(\/|~|[A-Za-z]:[\\/])/.test(arg) || arg.split(/[\\/]/).includes('..') || /(^|=)(\/|~)/.test(arg);

function classify(argv) {
  const [cmd, sub = '', ...rest] = argv;
  const args = argv.slice(1);
  if (args.some((a) => GLOBAL.has(a) || /^(-g|--global|--location=global|--prefix.*)$/.test(a))) return { ok: false, reason: 'global' };
  if (args.some(outside)) return { ok: false, reason: 'outside' };
  if (args.some((a) => FORBIDDEN_FLAG.test(a))) return { ok: false, reason: 'flag' };
  const label = argv.join(' ');
  if (PACKAGE_MANAGERS.has(cmd)) {
    if (sub.startsWith('-') && !PM_READ.has(sub)) return { ok: false, reason: 'not-allowed' }; // `bun -e`, `pnpm -C`
    if (PM_READ.has(sub)) return { ok: true, kind: 'read', label };
    if (PM_CHANGE.has(sub) || (cmd !== 'npm' && /^[\w:.-]+$/.test(sub))) return { ok: true, kind: 'change', label }; // `pnpm dev`, `yarn build`
    if (!sub) return { ok: true, kind: 'change', label }; // `yarn` / `pnpm` alone install
    return { ok: false, reason: 'not-allowed' };
  }
  if (cmd === 'npx' || cmd === 'bunx' || cmd === 'pnpx') {
    if (!sub || sub.startsWith('-')) return { ok: false, reason: 'not-allowed' };
    return { ok: true, kind: 'change', label };
  }
  if (cmd === 'git') {
    const flags = rest;
    if (sub === 'status' && flags.every((a) => /^(-s|--short|-b|--branch|--porcelain)$/.test(a))) return { ok: true, kind: 'read', label };
    if (sub === 'log' && flags.every((a) => GIT_LOG_FLAGS.test(a))) return { ok: true, kind: 'read', label };
    if (sub === 'diff' && flags.length && flags.every((a) => GIT_DIFF_FLAGS.test(a)) && flags.some((a) => /stat|name/.test(a))) return { ok: true, kind: 'read', label };
    if (sub === 'branch' && flags.every((a) => /^(-a|--all|-v|-vv|--list|-r|--show-current)$/.test(a))) return { ok: true, kind: 'read', label };
    if (sub === 'remote' && flags.every((a) => a === '-v')) return { ok: true, kind: 'read', label };
    if (sub === 'rev-parse' && flags.every((a) => /^(--abbrev-ref|--short|HEAD|--show-toplevel)$/.test(a))) return { ok: true, kind: 'read', label };
    // taking files out of the repository while keeping them on disk (a committed key file)
    if (sub === 'rm' && flags[0] === '--cached' && flags.length > 1 && flags.slice(1).every((a) => !a.startsWith('-') && !a.includes(':'))) return { ok: true, kind: 'change', label, paths: flags.slice(1) };
    return { ok: false, reason: 'git' }; // contents, commits, refs and remotes go through the app's own git (with its dialogs)
  }
  if (cmd === 'node' || cmd === 'python3' || cmd === 'python') {
    // a script of the project (not -e code, not a file outside it: checked against the folder when it runs)
    if (!sub || sub.startsWith('-')) return { ok: false, reason: 'not-allowed' };
    return { ok: true, kind: 'change', label, file: sub };
  }
  if (PROJECT_TOOLS.has(cmd)) {
    // tsc only reads when it emits nothing; the others load the project's config and tests (code)
    const read = cmd === 'tsc' && args.includes('--noEmit');
    return { ok: true, kind: read ? 'read' : 'change', label, local: true };
  }
  return { ok: false, reason: 'not-allowed' };
}

// Reads run on their own except in manual mode; anything that can change the project asks unless the
// person chose "Sin preguntar"
function commandNeedsApproval(mode, kind) {
  if (mode === 'bypass') return false;
  if (mode === 'auto') return kind !== 'read';
  return true;
}

// The same key shapes the audit looks for (securityAudit.js), covered in the output
const KEY_SHAPES = [
  /\b(sk|rk|pk)_(live|test)_[0-9a-zA-Z]{16,}/g, /\bsk-(proj-|ant-)?[A-Za-z0-9_-]{20,}/g, /\bAKIA[0-9A-Z]{16}\b/g,
  /\b(ghp|gho|ghs|ghu)_[A-Za-z0-9]{30,}/g, /\bgithub_pat_[A-Za-z0-9_]{40,}/g, /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  /\bAIza[0-9A-Za-z_-]{35}\b/g, /\bxai-[A-Za-z0-9]{20,}/g, /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, // JWT (Supabase keys, sessions)
];
// NAME=value and name: value where the name says it is a secret: the value is covered
const NAMED_SECRET = /\b([A-Za-z0-9_]*(?:secret|token|password|passwd|api[_-]?key|access[_-]?key|private[_-]?key|credential)[A-Za-z0-9_]*["']?\s*[=:]\s*["']?)([^\s"']{4,})/gi;
// user:password@ in any URL
const URL_PASSWORD = /\b([a-z][a-z0-9+.-]*:\/\/[^:\s/@]+:)[^@\s]+@/gi;
function redact(text) {
  let out = String(text ?? '');
  for (const re of KEY_SHAPES) out = out.replace(re, '[oculto]');
  out = out.replace(URL_PASSWORD, '$1[oculto]@').replace(NAMED_SECRET, (m, name, value) => (value === '[oculto]' ? m : `${name}[oculto]`));
  // ANSI colors make no sense to an agent
  return out.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '');
}

const trimOutput = (text) => (text.length > MAX_OUTPUT ? `…\n${text.slice(-MAX_OUTPUT)}` : text);

// The environment a command gets: the app's own, minus anything named like a secret
function cleanEnv(env = process.env) {
  const out = {};
  for (const [k, v] of Object.entries(env)) {
    // a name part that says secret (OPENAI_API_KEY, GITHUB_TOKEN…); git's own config and the ssh agent stay
    const secret = k.split('_').some((part) => /^(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIALS?|AUTH|APIKEY)$/i.test(part));
    if (secret && !/^GIT_CONFIG_(KEY|VALUE|COUNT)/.test(k) && k !== 'SSH_AUTH_SOCK') continue;
    out[k] = v;
  }
  out.FORCE_COLOR = '0';
  out.CI = out.CI ?? '1'; // no interactive questions
  return out;
}

// cwd: a folder inside root (relative); the caller checks it really lands inside (links resolved)
function createCommandRunner({ spawn = childProcess.spawn, env = cleanEnv() } = {}) {
  return {
    run({ root, cwd = '.', argv, timeoutMs = TIMEOUT_MS }) {
      return new Promise((resolve) => {
        const [cmd, ...args] = argv;
        // tools of the project itself (tsc, eslint…) run through npx --no-install: never downloaded
        const [bin, binArgs] = classify(argv).local ? ['npx', ['--no-install', cmd, ...args]] : [cmd, args];
        let output = '';
        let timedOut = false;
        let child;
        try {
          child = spawn(bin, binArgs, { cwd: path.join(root, cwd), env, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        } catch (error) {
          resolve({ exitCode: -1, output: String(error.message), timedOut: false });
          return;
        }
        const keep = (chunk) => { output = (output + chunk).slice(-MAX_OUTPUT * 4); };
        child.stdout?.on('data', keep);
        child.stderr?.on('data', keep);
        const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, timeoutMs);
        child.on('error', (error) => { keep(`\n${error.message}`); });
        child.on('close', (code) => {
          clearTimeout(timer);
          resolve({ exitCode: code ?? -1, output: trimOutput(redact(output)), timedOut });
        });
      });
    },
  };
}

module.exports = { parseCommand, classify, commandNeedsApproval, redact, cleanEnv, createCommandRunner, MAX_OUTPUT, TIMEOUT_MS };
