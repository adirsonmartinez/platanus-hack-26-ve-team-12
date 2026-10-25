// Git for the open project: the history (read only) and the write operations the chat asks for
// (commit, revert, reset, branch, switch). Every call uses execFile (no shell); values coming from
// the window are validated below before they reach git, and main.js asks before anything risky.

const { execFile } = require('node:child_process');

const MAX_COMMITS = 300;
const FIELD = '\x1f';
const RECORD = '\x1e';

function git(cwd, args) {
  return new Promise((resolve, reject) => {
    execFile('git', ['-c', 'core.quotepath=false', ...args], {
      cwd,
      timeout: 10_000,
      maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' },
    }, (error, stdout) => (error ? reject(error) : resolve(stdout)));
  });
}

const tryGit = (cwd, args) => git(cwd, args).catch(() => '');

// "A\tpath", "M\tpath", "R100\told\tnew" -> { status, path }
function parseNameStatus(line) {
  const [code, ...paths] = line.split('\t');
  if (!code || !paths.length) return null;
  return { status: code[0], path: paths[paths.length - 1] };
}

function parseLog(stdout) {
  return stdout.split(RECORD).filter((r) => r.trim()).map((record) => {
    const [header, ...lines] = record.split('\n');
    const [sha, parents, refs, subject, author, time] = header.split(FIELD);
    return {
      sha,
      parents: parents ? parents.split(' ') : [],
      refs,
      subject,
      author,
      date: Number(time) * 1000,
      files: lines.map(parseNameStatus).filter(Boolean),
    };
  });
}

// refname<FIELD>objectname<FIELD>*objectname (the last one is set for annotated tags)
function parseRefs(stdout) {
  return stdout.split('\n').filter(Boolean).map((line) => {
    const [name, object, peeled] = line.split(FIELD);
    return { name, sha: peeled || object };
  });
}

// { isRepo, error?, head: { branch, sha }, branches: [{ name, sha, remote }], tags: [{ name, sha }], commits: [...] }
async function readGitHistory(cwd) {
  if (!cwd) return { isRepo: false };
  try {
    const inside = (await git(cwd, ['rev-parse', '--is-inside-work-tree'])).trim();
    if (inside !== 'true') return { isRepo: false };
  } catch (error) {
    return { isRepo: false, error: error.code === 'ENOENT' ? 'git-missing' : undefined };
  }

  const refFormat = '--format=%(refname:short)%1f%(objectname)%1f%(*objectname)'; // %1f = FIELD
  const [log, heads, remotes, tags, branch, headSha] = await Promise.all([
    tryGit(cwd, ['log', '--all', '--date-order', `--max-count=${MAX_COMMITS}`, '--name-status',
      `--format=${RECORD}%H${FIELD}%P${FIELD}%D${FIELD}%s${FIELD}%an${FIELD}%at`]),
    tryGit(cwd, ['for-each-ref', refFormat, 'refs/heads']),
    tryGit(cwd, ['for-each-ref', refFormat, 'refs/remotes']),
    tryGit(cwd, ['for-each-ref', refFormat, 'refs/tags']),
    tryGit(cwd, ['symbolic-ref', '--short', '-q', 'HEAD']),
    tryGit(cwd, ['rev-parse', '-q', '--verify', 'HEAD']),
  ]);

  return {
    isRepo: true,
    head: { branch: branch.trim() || null, sha: headSha.trim() || null },
    branches: [
      ...parseRefs(heads).map((b) => ({ ...b, remote: false })),
      ...parseRefs(remotes).filter((b) => !b.name.endsWith('/HEAD') && b.name.includes('/')).map((b) => ({ ...b, remote: true })),
    ],
    tags: parseRefs(tags),
    commits: parseLog(log),
  };
}

// ---- Write operations ----
// Asked for from the chat ("haz un commit…", "cámbiate a main"). Every value that reaches a command
// line is validated here first, whatever the window sent: a revision or branch that started with "-"
// would be read by git as an option (e.g. `log --output=<file>` writes anywhere on disk).
// Each one returns { ok, data } | { ok: false, code } (main.js turns the code into Spanish).

const MAX_REF = 100;
// A commit: HEAD, HEAD~n or 4-40 hex digits
const REV = /^(HEAD(~\d{1,3})?|[0-9a-f]{4,40})$/i;
// A branch name git accepts (check-ref-format rules, simplified): starts with a letter, digit or "_"
const BRANCH = /^[A-Za-z0-9_][A-Za-z0-9_./-]*$/;

const isSafeRev = (rev) => typeof rev === 'string' && REV.test(rev);

function isSafeBranch(name) {
  if (typeof name !== 'string' || !name || name.length > MAX_REF || !BRANCH.test(name)) return false;
  return !/\.\.|\/\/|\/\.|@\{|\.lock$|[./]$/.test(name);
}

async function gitWrite(cwd, args) {
  if (!cwd) return { ok: false, code: 'noWorkspace' };
  try {
    const out = await git(cwd, args);
    return { ok: true, data: out.trim() };
  } catch (err) {
    return { ok: false, code: 'failed', detail: (err.message || String(err)).split('\n').slice(0, 3).join(' ') };
  }
}

// Files the next commit would take ("git add --all" respects .gitignore), and which of them are secrets.
// isSecret(path) decides (the MCP blocklist: .env, keys, credentials…). A rename counts both paths.
async function planCommit(cwd, isSecret) {
  if (!cwd) return { ok: false, code: 'noWorkspace' };
  let out;
  try {
    out = await git(cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  } catch {
    return { ok: false, code: 'failed' };
  }
  const parts = out.split('\0');
  const files = [];
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i];
    if (entry.length < 4) continue;
    files.push(entry.slice(3));
    if (entry[0] === 'R' || entry[0] === 'C') files.push(parts[++i]); // the original path follows
  }
  return { ok: true, data: { files, secrets: files.filter(isSecret) } };
}

// Commits exactly the files the person confirmed (literal pathspecs, so nothing else slips in)
async function gitCommit(cwd, message, files) {
  const text = typeof message === 'string' ? message.trim() : '';
  if (!text) return { ok: false, code: 'emptyMessage' };
  if (!Array.isArray(files) || !files.length) return { ok: false, code: 'nothingToCommit' };
  const stage = await gitWrite(cwd, ['add', '--all', '--', ...files.map((f) => `:(literal)${f}`)]);
  if (!stage.ok) return stage;
  return gitWrite(cwd, ['commit', '--message', text, '--', ...files.map((f) => `:(literal)${f}`)]);
}

// A new project starts with its own repository on main, so the chat can save progress ("haz un commit…")
// and the git view never shows a parent folder's repository. symbolic-ref instead of `init -b`: older gits.
async function gitInit(cwd) {
  const init = await gitWrite(cwd, ['init', '--quiet']);
  if (!init.ok) return init;
  return gitWrite(cwd, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
}

// A new commit that undoes the given one (history is kept)
async function gitRevert(cwd, rev) {
  if (!isSafeRev(rev)) return { ok: false, code: 'invalidRev' };
  return gitWrite(cwd, ['revert', '--no-edit', '--no-gpg-sign', rev]);
}

// Moves the branch to the given commit and DISCARDS uncommitted changes (main.js always asks first)
async function gitReset(cwd, rev) {
  if (!isSafeRev(rev)) return { ok: false, code: 'invalidRev' };
  return gitWrite(cwd, ['reset', '--hard', rev, '--']);
}

// New local branch from the current commit (the files on disk do not change)
async function gitCreateBranch(cwd, name) {
  const branch = typeof name === 'string' ? name.trim() : '';
  if (!isSafeBranch(branch)) return { ok: false, code: 'invalidBranch' };
  return gitWrite(cwd, ['switch', '--create', branch]);
}

// Switches to an existing branch, or to a commit (detached)
async function gitCheckout(cwd, target) {
  const ref = typeof target === 'string' ? target.trim() : '';
  if (isSafeBranch(ref) && !REV.test(ref)) return gitWrite(cwd, ['switch', ref]);
  if (isSafeRev(ref)) return gitWrite(cwd, ['switch', '--detach', ref]);
  return { ok: false, code: 'invalidTarget' };
}

// One line describing a commit, for the confirmation dialogs
async function gitShowShort(cwd, rev) {
  if (!isSafeRev(rev)) return { ok: false, code: 'invalidRev' };
  return gitWrite(cwd, ['log', '--oneline', '-1', rev, '--']);
}

module.exports = {
  readGitHistory, planCommit, gitCommit, gitRevert, gitReset, gitCreateBranch, gitCheckout, gitShowShort, gitInit,
  isSafeRev, isSafeBranch,
};
