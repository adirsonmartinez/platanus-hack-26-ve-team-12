// Git write operations: values from the window never reach git as options, and a commit plan
// spots secret files. Uses a real throwaway repository.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  isSafeRev, isSafeBranch, planCommit, gitCommit, gitRevert, gitReset, gitCreateBranch, gitCheckout, gitShowShort, gitInit,
} = require('./git');
const { isBlockedPath } = require('./mcpServer');

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'platanus-git-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  git('config', 'commit.gpgsign', 'false');
  fs.writeFileSync(path.join(dir, 'README.md'), '# hola\n');
  git('add', '.');
  git('commit', '-q', '-m', 'first');
  return { dir, git };
}

test('a new project gets its own repository on main, even inside another repository', async () => {
  const { dir: outer } = repo();
  const dir = path.join(outer, 'nuevo-proyecto');
  fs.mkdirSync(dir);
  assert.equal((await gitInit(dir)).ok, true);
  const top = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: dir, encoding: 'utf8' }).trim();
  assert.equal(fs.realpathSync(top), fs.realpathSync(dir));
  const branch = execFileSync('git', ['symbolic-ref', '--short', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();
  assert.equal(branch, 'main');
  assert.equal((await gitInit(null)).code, 'noWorkspace');
});

test('revisions: hashes and HEAD pass, anything that looks like an option does not', () => {
  for (const ok of ['HEAD', 'HEAD~2', 'a1b2c3d', 'A1B2C3D4', 'f'.repeat(40)]) assert.equal(isSafeRev(ok), true, ok);
  for (const bad of ['', '-1', '--output=/tmp/x', '-p', 'HEAD^', 'main', 'a1b', 'abc def', 'HEAD~1;rm', null, 42]) {
    assert.equal(isSafeRev(bad), false, String(bad));
  }
});

test('branch names: git flow names pass, options and invalid refs do not', () => {
  for (const ok of ['main', 'feature/login', 'fix/user-data_path', 'release/1.2.0', 'v2']) assert.equal(isSafeBranch(ok), true, ok);
  for (const bad of ['', '-f', '--orphan=x', 'a..b', 'a//b', 'feature/', 'x.lock', 'a@{1}', '.hidden', 'a b', 'feature/.x', 'x'.repeat(101)]) {
    assert.equal(isSafeBranch(bad), false, bad);
  }
});

test('option-like values are refused before git runs (nothing is written outside the project)', async () => {
  const { dir } = repo();
  const outside = path.join(os.tmpdir(), `platanus-git-escape-${process.pid}`);
  assert.equal((await gitShowShort(dir, `--output=${outside}`)).code, 'invalidRev');
  assert.equal((await gitRevert(dir, '-n')).code, 'invalidRev');
  assert.equal((await gitReset(dir, '--merge')).code, 'invalidRev');
  assert.equal((await gitCheckout(dir, '-f')).code, 'invalidTarget');
  assert.equal((await gitCreateBranch(dir, '--orphan=x')).code, 'invalidBranch');
  assert.equal(fs.existsSync(outside), false);
});

test('commit plan lists new and changed files and flags secrets that .gitignore lets through', async () => {
  const { dir } = repo();
  fs.writeFileSync(path.join(dir, 'README.md'), '# cambiado\n');
  fs.writeFileSync(path.join(dir, 'app.js'), 'console.log(1)\n');
  fs.writeFileSync(path.join(dir, '.env'), 'SECRET=1\n');
  fs.mkdirSync(path.join(dir, 'keys'));
  fs.writeFileSync(path.join(dir, 'keys', 'server.pem'), 'x\n');
  const plan = await planCommit(dir, isBlockedPath);
  assert.equal(plan.ok, true);
  assert.deepEqual([...plan.data.files].sort(), ['.env', 'README.md', 'app.js', 'keys/server.pem']);
  assert.deepEqual([...plan.data.secrets].sort(), ['.env', 'keys/server.pem']);

  fs.writeFileSync(path.join(dir, '.gitignore'), '.env\n*.pem\n');
  const ignored = await planCommit(dir, isBlockedPath);
  assert.deepEqual(ignored.data.secrets, []);
});

test('commit takes exactly the confirmed files', async () => {
  const { dir, git } = repo();
  fs.writeFileSync(path.join(dir, 'a.js'), '1\n');
  fs.writeFileSync(path.join(dir, 'b.js'), '2\n');
  const result = await gitCommit(dir, 'agrega a', ['a.js']);
  assert.equal(result.ok, true);
  assert.equal(git('log', '-1', '--format=%s'), 'agrega a');
  assert.equal(git('show', '--name-only', '--format=', 'HEAD'), 'a.js');
  assert.match(git('status', '--porcelain'), /\?\? b\.js/);
  assert.equal((await gitCommit(dir, '   ', ['b.js'])).code, 'emptyMessage');
  assert.equal((await gitCommit(dir, 'x', [])).code, 'nothingToCommit');
});

test('branch, switch and revert work with valid values', async () => {
  const { dir, git } = repo();
  assert.equal((await gitCreateBranch(dir, 'feature/login')).ok, true);
  assert.equal(git('branch', '--show-current'), 'feature/login');
  assert.equal((await gitCheckout(dir, 'main')).ok, true);
  assert.equal(git('branch', '--show-current'), 'main');
  fs.writeFileSync(path.join(dir, 'c.js'), '3\n');
  await gitCommit(dir, 'agrega c', ['c.js']);
  assert.equal((await gitRevert(dir, 'HEAD')).ok, true);
  assert.equal(fs.existsSync(path.join(dir, 'c.js')), false);
});
