const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { scanText, nameFindings, auditFile, auditProject } = require('./securityAudit');

const rules = (findings) => findings.map((f) => f.rule);
// Keys are built at run time: written out, they would look like credentials to the repo's own scan
const STRIPE = ['sk', 'live', 'abcdefghijklmnop1234567890'].join('_');

test('SQL built by pasting values in is a red risk; a fixed query or parameters are fine', () => {
  const bad = "const { rows } = await db.query(`insert into orders (items, total) values ('${JSON.stringify(items)}', ${total}) returning id`);";
  assert.deepEqual(scanText('apps/api/src/routes/orders.ts', `import x from 'y';\n${bad}`), [{ rule: 'sqlInjection', level: 'red', line: 2 }]);
  assert.deepEqual(scanText('a.ts', "db.query('select * from users where id = ' + id)"), [{ rule: 'sqlInjection', level: 'red', line: 1 }]);
  assert.deepEqual(scanText('a.py', 'cur.execute(f"select * from t where id = {id}")'), [{ rule: 'sqlInjection', level: 'red', line: 1 }]);
  assert.deepEqual(scanText('a.ts', "db.query('select id, name from products order by name')"), []);
  assert.deepEqual(scanText('a.ts', 'db.query("insert into orders (items) values ($1)", [items])'), []);
  assert.deepEqual(scanText('a.ts', '// db.query(`select ${x}`) was the old way'), [], 'a comment is not code');
});

test('keys written in the code are red, never with their value; env lookups and placeholders are fine', () => {
  const found = scanText('src/pay.ts', `const stripe = new Stripe('${STRIPE}');`);
  assert.deepEqual(found, [{ rule: 'hardcodedSecret', level: 'red', line: 1 }]);
  assert.ok(!JSON.stringify(found).includes(STRIPE), 'the finding never carries the key');
  assert.deepEqual(rules(scanText('a.js', 'const password = "Sup3rS3cretPass!"')), ['hardcodedSecret']);
  assert.deepEqual(scanText('a.js', 'const password = process.env.DB_PASSWORD'), []);
  assert.deepEqual(scanText('a.js', 'const apiKey = "your-api-key"'), []);
  assert.deepEqual(rules(scanText('config.yml', 'url: postgres://admin:hunter22@db.example.com/app')), ['hardcodedSecret']);
});

test('env templates: names only are fine; a real-looking value needs a look', () => {
  assert.deepEqual(scanText('.env.example', 'DATABASE_URL=\nPAYMENTS_PUBLIC_KEY=your-key\nAPI=http://localhost:4000'), []);
  assert.deepEqual(scanText('.env.example', 'DATABASE_URL=postgres://feria:feria@localhost:5432/feria\nKEY=pon-aqui-tu-clave-publica'), [], 'a local database and a Spanish placeholder');
  assert.deepEqual(rules(scanText('.env.example', 'TOKEN=a8f9d7s6f5g4h3j2k1')), ['envTemplateValue']);
  assert.deepEqual(rules(scanText('.env.example', `STRIPE=${STRIPE}`)), ['hardcodedSecret']);
  assert.equal(nameFindings('.env.example'), null, 'a template is read, not judged by its name');
  assert.deepEqual(rules(nameFindings('.env.local')), ['envFile']);
  assert.deepEqual(rules(nameFindings('keys/server.pem')), ['privateKey']);
  assert.deepEqual(rules(nameFindings('config/secrets.json')), ['secretName']);
  assert.equal(nameFindings('src/auth.ts'), null, 'code is read, never judged by its name');
});

test('SQL tables: personal data without access rules needs a look; plain data or protected tables do not', () => {
  const plain = 'create table products (id serial primary key, name text not null, price numeric not null);';
  assert.deepEqual(scanText('db/001_init.sql', plain), []);
  const people = '-- people\ncreate table ingresos_feria (\n  id bigserial primary key,\n  cedula text not null,\n  email text\n);';
  assert.deepEqual(scanText('db/002.sql', people), [{ rule: 'sqlNoAccessRules', level: 'yellow', line: 2 }]);
  assert.deepEqual(scanText('db/002.sql', `${people}\nalter table ingresos_feria enable row level security;`), []);
  assert.deepEqual(rules(scanText('db/003.sql', 'grant all on table orders to anon;')), ['sqlGrantAll']);
});

test('Dockerfile: running as root or on a moving image needs a look', () => {
  const root = 'FROM node:22-alpine\nWORKDIR /app\nCOPY . .\nCMD ["node", "server.js"]';
  assert.deepEqual(rules(scanText('Dockerfile', root)), ['dockerRoot']);
  assert.deepEqual(scanText('Dockerfile', `${root}\nUSER node`), []);
  assert.deepEqual(rules(scanText('Dockerfile', 'FROM node:latest\nUSER node')), ['dockerLatest']);
});

test('other code patterns', () => {
  const cases = {
    commandInjection: 'exec(`convert ${file} out.png`)',
    tlsDisabled: 'https.request({ rejectUnauthorized: false })',
    jwtUnsafe: "jwt.verify(token, key, { algorithms: ['none'] })",
    evalUse: 'const result = eval(userInput);',
    htmlInjection: 'el.innerHTML = comment.text;',
    corsOpen: "app.use(cors({ origin: '*' }))",
    weakHash: "crypto.createHash('md5').update(password)",
    insecureRandom: 'const token = Math.random().toString(36);',
    cookieInsecure: "res.cookie('session', id);",
  };
  for (const [rule, line] of Object.entries(cases)) assert.deepEqual(rules(scanText('src/x.ts', line)), [rule], rule);
  assert.deepEqual(scanText('src/x.ts', "el.innerHTML = '';"), [], 'clearing with a fixed text is fine');
  assert.deepEqual(scanText('src/x.ts', "res.cookie('session', id, { httpOnly: true, secure: true });"), []);
  assert.deepEqual(scanText('README.md', 'Never use eval(x) in production'), [], 'docs are not code');
});

test('auditProject: reads the project, skips dependencies, keeps a hash per file; auditFile follows changes', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-'));
  const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
  put('src/orders.ts', 'db.query(`select * from t where id = ${id}`)');
  put('src/ok.ts', 'export const x = 1;');
  put('node_modules/lib/index.js', 'eval(x)');
  put('.env', 'SECRET=1');
  put('logo.png', 'binary');
  put('big.json', 'x'.repeat(300 * 1024));
  const audit = await auditProject(root);
  assert.deepEqual(Object.keys(audit.files).sort(), ['.env', 'big.json', 'logo.png', 'src/ok.ts', 'src/orders.ts']);
  assert.equal(audit.files['src/orders.ts'].level, 'red');
  assert.equal(audit.files['src/ok.ts'].level, 'green');
  assert.equal(audit.files['.env'].level, 'yellow', 'not in .gitignore (no git here): it could be committed');
  assert.equal(audit.files['logo.png'].level, 'green');
  assert.equal(audit.files['big.json'].level, 'grey', 'too big to read: not evaluated');
  assert.equal(audit.skipped, 1);
  const before = audit.files['src/orders.ts'].hash;
  put('src/orders.ts', "db.query('select * from t where id = $1', [id])");
  const after = await auditFile(root, 'src/orders.ts');
  assert.equal(after.level, 'green');
  assert.notEqual(after.hash, before);
  assert.equal(await auditFile(root, 'src/gone.ts'), null);
});

test('key files: committed is red, not ignored is yellow, ignored and never committed is fine', async () => {
  const { execSync } = require('node:child_process');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-git-'));
  for (const f of ['.env', '.env.local', 'server.pem']) fs.writeFileSync(path.join(root, f), 'X=1');
  fs.writeFileSync(path.join(root, '.gitignore'), '.env.local\n');
  execSync('git init -q && git add .env .gitignore && git -c user.email=t@t -c user.name=t commit -qm init', { cwd: root });
  const { files } = await auditProject(root);
  assert.deepEqual(files['.env'].findings, [{ rule: 'envFile', level: 'red', line: 0 }], 'in the repository: the keys leaked');
  assert.deepEqual(files['.env.local'], { level: 'green', findings: [], hash: files['.env.local'].hash }, 'ignored: the right place for keys');
  assert.deepEqual(files['server.pem'].findings, [{ rule: 'secretNotIgnored', level: 'yellow', line: 0 }]);
  // outside git, the root .gitignore decides
  const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-plain-'));
  fs.writeFileSync(path.join(plain, '.env.local'), 'X=1');
  fs.writeFileSync(path.join(plain, '.gitignore'), '# keys\n.env*.local\n');
  assert.equal((await auditProject(plain)).files['.env.local'].level, 'green');
});

test('precision: words inside text, regex literals and comments are not code', () => {
  // the rules' own descriptions and the audit's own patterns (false positives found on team-12)
  assert.deepEqual(scanText('renderer/i18n/es.js', "  tlsDisabled: 'Regla: rejectUnauthorized:false, NODE_TLS_REJECT_UNAUTHORIZED=0 o verify=False.',"), []);
  assert.deepEqual(scanText('renderer/i18n/es.js', "  evalUse: 'Regla evalUse: eval() o new Function(). Reemplazar por JSON.parse.',"), []);
  assert.deepEqual(scanText('renderer/i18n/es.js', "  corsOpen: \"Regla corsOpen: origin '*' o cors() sin opciones.\","), []);
  assert.deepEqual(scanText('electron/securityAudit.js', "    test: (l) => /\\.innerHTML\\s*\\+?=/.test(l) || /dangerouslySetInnerHTML/.test(l),"), []);
  assert.deepEqual(scanText('src/a.js', 'const x = 1; // never call eval(input) here'), []);
  // the real thing is still found
  assert.deepEqual(scanText('src/a.js', "https.request({ rejectUnauthorized: false })").map((f) => f.rule), ['tlsDisabled']);
  assert.deepEqual(scanText('src/a.js', "res.setHeader('Access-Control-Allow-Origin', '*');").map((f) => f.rule), ['corsOpen'], 'a header is written as text');
  assert.deepEqual(scanText('src/a.js', 'const r = eval(input); // bad').map((f) => f.rule), ['evalUse']);
});

test('precision: innerHTML from an icon, escaped text or markdown is fine; anything else needs a look', () => {
  const safe = [
    'b.innerHTML = icon(name); // static icon',
    'answer.innerHTML = markdownToHtml(body);',
    "s.label.el.innerHTML = site.kind === 'building' ? `<span>${count}</span>` : `<strong>${escapeHtml(name)}</strong><span>${count}</span>`;",
    "s.label.el.innerHTML = `<strong>${escapeHtml(`${s.folder}/`)}</strong>`;",
    "el.innerHTML = '';",
  ];
  for (const line of safe) assert.deepEqual(scanText('src/v.js', line), [], line);
  for (const line of ['el.innerHTML = html;', 'el.innerHTML = `<b>${user.name}</b>`;', 'el.innerHTML += comment.text;']) {
    assert.deepEqual(scanText('src/v.js', line).map((f) => f.rule), ['htmlInjection'], line);
  }
});

test('precision: tests may hold bad patterns on purpose; a key in a test still needs a look', () => {
  assert.deepEqual(scanText('electron/securityAudit.test.js', 'db.query(`select * from t where id = ${id}`)'), [], 'a test of the rules is not a vulnerability');
  assert.deepEqual(scanText('tests/x.test.mjs', "store.set('nope', 'sk-123456789012345678901234')"), [{ rule: 'secretInTest', level: 'yellow', line: 1 }]);
});

test('precision: fixed icon maps, ternaries of safe values and app texts are fine', () => {
  const safe = [
    "badge.innerHTML = file.level === 'red' ? RISK_ICON.red : RISK_ICON.yellow; // static SVG",
    'b.innerHTML = SERVER_ICON[icon];',
    'template.innerHTML = BRANDS[key];',
    'template.innerHTML = iconSvg(name);',
    "logo.innerHTML = icon(LOGOS.has(agent.id) ? agent.id : 'bot');",
    "answer.innerHTML = body ? markdownToHtml(body) : running && waiting ? `<p>${strings.chat.thinking}</p>` : '';",
  ];
  for (const line of safe) assert.deepEqual(scanText('src/v.js', line), [], line);
  for (const line of ['label.el.innerHTML = bubbleHtml(state.bubble);', 'fail.innerHTML = run.error;', "x.innerHTML = ok ? icon('a') : userHtml;"]) {
    assert.deepEqual(scanText('src/v.js', line).map((f) => f.rule), ['htmlInjection'], line);
  }
});

test('review: no false negatives behind ternaries, comments, divisions or other HTML sinks', () => {
  const htmlHits = ['el.innerHTML = ok ? userInput : \'\';', 'el.innerHTML = cond ? user.name : `<b>${count}</b>`;', 'el.innerHTML = cond ? a && user : \'\';',
    'el.outerHTML = data;', "el.insertAdjacentHTML('beforeend', html);", 'document.write(text);'];
  for (const line of htmlHits) assert.deepEqual(scanText('src/v.js', line).map((f) => f.rule), ['htmlInjection'], line);
  assert.deepEqual(scanText('src/a.js', '/* ok */ db.query(`SELECT * FROM t WHERE id = ${id}`)').map((f) => f.rule), ['sqlInjection']);
  assert.deepEqual(scanText('src/a.js', '--n; el.innerHTML = user;').map((f) => f.rule), ['htmlInjection']);
  assert.deepEqual(scanText('src/a.js', 'i++ / 2; eval(code); x = 1 / 3').map((f) => f.rule), ['evalUse']);
  assert.deepEqual(scanText('src/a.js', 'window.eval(code);').map((f) => f.rule), ['evalUse']);
  assert.deepEqual(scanText('src/a.js', "setTimeout('run(' + x + ')', 10);").map((f) => f.rule), ['evalUse']);
  // and these stay fine
  for (const line of ["el.innerHTML = t.title;", "el.innerHTML = '<b>' + 'x' + '</b>';", "el.innerHTML = ok ? icon('a') : '';", ' * Never use eval(x): it runs text as code.']) {
    assert.deepEqual(scanText('src/v.js', line), [], line);
  }
});

test('review: a key file committed once stays red even after git rm --cached (the key is still in the history)', async () => {
  const { execSync } = require('node:child_process');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-hist-'));
  fs.writeFileSync(path.join(root, '.env'), 'X=1');
  const git = (cmd) => execSync(`git -c user.email=t@t -c user.name=t ${cmd}`, { cwd: root });
  git('init -q'); git('add .env'); git('commit -qm leak'); git('rm -q --cached .env');
  fs.writeFileSync(path.join(root, '.gitignore'), '.env\n');
  git('add .gitignore'); git('commit -qm ignore');
  const { files } = await auditProject(root);
  assert.deepEqual(files['.env'].findings, [{ rule: 'secretInHistory', level: 'red', line: 0 }]);
});
