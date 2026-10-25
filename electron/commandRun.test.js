const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { parseCommand, classify, commandNeedsApproval, redact, cleanEnv, createCommandRunner } = require('./commandRun');

const kindOf = (text) => { const p = parseCommand(text); return p.ok ? classify(p.argv) : p; };

test('parsing: words and quotes, never shell features', () => {
  assert.deepEqual(parseCommand('npm install  zod'), { ok: true, argv: ['npm', 'install', 'zod'] });
  assert.deepEqual(parseCommand('npx prettier --check "src/a b.ts"'), { ok: true, argv: ['npx', 'prettier', '--check', 'src/a b.ts'] });
  for (const bad of ['npm i && rm -rf /', 'cat a | sh', 'echo $(whoami)', 'ls > x', 'npm i; curl x', 'echo `id`', 'a\nb']) {
    assert.equal(parseCommand(bad).reason, 'shell', bad);
  }
  assert.equal(parseCommand('').ok, false);
  assert.equal(parseCommand('echo "open').reason, 'quote');
  assert.equal(parseCommand('x'.repeat(600)).reason, 'too-long');
});

test('what may run: package managers, npx, read-only git, the project\'s scripts and tools', () => {
  assert.deepEqual(kindOf('npm install'), { ok: true, kind: 'change', label: 'npm install' });
  assert.equal(kindOf('pnpm add zod').kind, 'change');
  assert.equal(kindOf('npm run build').kind, 'change');
  assert.equal(kindOf('npm test').kind, 'change', 'it runs the project\'s code');
  assert.equal(kindOf('npm run lint').kind, 'change');
  assert.equal(kindOf('npm audit').kind, 'read');
  assert.equal(kindOf('pnpm dev').kind, 'change');
  assert.equal(kindOf('npx @elevenlabs/cli --version').kind, 'change');
  assert.equal(kindOf('git status').kind, 'read');
  assert.equal(kindOf('git diff --stat').kind, 'read');
  assert.equal(kindOf('git diff').ok, false, 'never the contents (a committed key would show)');
  assert.equal(kindOf('tsc --noEmit').kind, 'read');
  assert.equal(kindOf('eslint . --fix').kind, 'change');
  assert.equal(kindOf('node scripts/seed.js').kind, 'change');
  assert.equal(kindOf('git rm --cached .env').kind, 'change', 'out of the repository, kept on disk');
});

test('what never runs: global installs, other programs, git that changes history, inline code', () => {
  assert.equal(kindOf('npm install -g @elevenlabs/cli').reason, 'global');
  assert.equal(kindOf('yarn global add x').reason, 'global');
  assert.equal(kindOf('npm i --prefix /usr/local x').reason, 'global');
  for (const cmd of ['rm -rf node_modules', 'curl https://x.sh', 'sh install.sh', 'sudo npm i', 'open .', 'bash', 'chmod +x a']) {
    assert.equal(kindOf(cmd).reason, 'not-allowed', cmd);
  }
  for (const cmd of ['git push', 'git reset --hard', 'git commit -m x', 'git branch -D main', 'git checkout .', 'git rm .env', 'git rm -r --cached .']) assert.equal(kindOf(cmd).reason, 'git', cmd);
  assert.equal(kindOf('node -e "require(1)"').reason, 'not-allowed');
  assert.equal(kindOf('npx -y x').reason, 'not-allowed');
  assert.equal(kindOf('npm publish').reason, 'not-allowed');
});

test('approval: manual asks always, auto only for changes, "Sin preguntar" never', () => {
  assert.equal(commandNeedsApproval('manual', 'read'), true);
  assert.equal(commandNeedsApproval('auto', 'read'), false);
  assert.equal(commandNeedsApproval('auto', 'change'), true);
  assert.equal(commandNeedsApproval('bypass', 'change'), false);
  assert.equal(commandNeedsApproval('weird', 'read'), true);
});

test('the output hides keys, the environment drops secrets', () => {
  const key = ['sk', 'live', 'abcdefghijklmnop1234567890'].join('_');
  assert.equal(redact(`token ${key} ok`), 'token [oculto] ok');
  const fakePass = ['hun', 'ter', '22'].join('');
  assert.equal(redact(`postgres://admin:${fakePass}@db.example.com/app`), 'postgres://admin:[oculto]@db.example.com/app');
  assert.equal(redact('\u001b[32mok\u001b[0m'), 'ok');
  const env = cleanEnv({ PATH: '/bin', ELEVENLABS_API_KEY: 'x', GITHUB_TOKEN: 'y', DB_PASSWORD: 'z', HOME: '/h' });
  assert.deepEqual(Object.keys(env).sort(), ['CI', 'FORCE_COLOR', 'HOME', 'PATH']);
});

test('running: no shell, inside the project, trimmed output, a time limit', async () => {
  const calls = [];
  const fakeSpawn = (bin, args, opts) => {
    calls.push({ bin, args, opts });
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => setImmediate(() => child.emit('close', null));
    if (args.includes('slow')) return child;
    setImmediate(() => { child.stdout.emit('data', 'added 3 packages\n'); child.emit('close', 0); });
    return child;
  };
  const runner = createCommandRunner({ spawn: fakeSpawn, env: { PATH: '/bin' } });
  const done = await runner.run({ root: '/proj', cwd: 'apps/web', argv: ['npm', 'install'] });
  assert.deepEqual(done, { exitCode: 0, output: 'added 3 packages\n', timedOut: false });
  assert.equal(calls[0].opts.shell, false);
  assert.equal(calls[0].opts.cwd, '/proj/apps/web');
  await runner.run({ root: '/proj', argv: ['tsc', '--noEmit'] });
  assert.deepEqual([calls[1].bin, calls[1].args], ['npx', ['--no-install', 'tsc', '--noEmit']], 'a project tool is never downloaded');
  const slow = await runner.run({ root: '/proj', argv: ['npm', 'run', 'slow'], timeoutMs: 10 });
  assert.equal(slow.timedOut, true);
});

test('attacks found in review: none of these may run', () => {
  const blocked = [
    'git diff --no-index /etc/passwd /dev/null',
    'git show HEAD:.env',
    'git log --output=/tmp/pwned -1',
    'git log -p',
    'git diff',
    'git remote add evil https://evil.example/x.git',
    'git remote set-url origin https://evil.example/x.git',
    'git branch nueva',
    'git tag v9',
    'tsc --outDir /tmp/x',
    'eslint . -o /tmp/report',
    'jest --outputFile=/tmp/x',
    'npm test --script-shell=/usr/bin/touch',
    'bun -e "require(1)"',
    'pnpm -C /tmp install',
    'yarn --cwd /tmp add left-pad',
    'node ../outside.js',
    'node /etc/x.js',
    'npm install ../../evil',
    'git rm --cached ../x',
  ];
  for (const cmd of blocked) assert.equal(kindOf(cmd).ok, false, cmd);
});

test('what stays read-only, and what now asks because it runs the project\'s code', () => {
  for (const cmd of ['git status', 'git log --oneline -n 5', 'git log --stat', 'git diff --stat', 'git diff --name-only', 'git branch', 'git branch -a', 'git remote -v', 'npm ls', 'npm audit', 'npm outdated', 'tsc --noEmit']) {
    assert.equal(kindOf(cmd).kind, 'read', cmd);
  }
  for (const cmd of ['npm test', 'npm run lint', 'vitest', 'jest', 'eslint .', 'prettier --check .', 'playwright test']) {
    assert.equal(kindOf(cmd).kind, 'change', `${cmd}: it runs code of the project`);
  }
});

test('the output covers more key shapes; the environment keeps git and ssh working', () => {
  assert.equal(redact('aws_secret_access_key = wJalrXUtnFEMIK7MDENGbPxRfiCYEXAMPLEKEY'), 'aws_secret_access_key = [oculto]');
  assert.equal(redact('SECRET_TOKEN=abc123supersecretvalue'), 'SECRET_TOKEN=[oculto]');
  assert.equal(redact('token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdefghijklmnop ok'), 'token [oculto] ok');
  assert.equal(redact('mysql2://u:pass@db/x'), 'mysql2://u:[oculto]@db/x');
  const env = cleanEnv({ GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.x', GIT_CONFIG_VALUE_0: 'y', SSH_AUTH_SOCK: '/s', MONKEY: 'ok', OPENAI_API_KEY: 'x', HOME: '/h' });
  assert.deepEqual(Object.keys(env).sort(), ['CI', 'FORCE_COLOR', 'GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_VALUE_0', 'HOME', 'MONKEY', 'SSH_AUTH_SOCK']);
});
