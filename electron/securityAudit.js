// The security audit (docs/features/seguridad/README.md): fixed rules that read what each file of the
// project says, not only its name, and decide its traffic light. Nothing here asks an AI: an agent may
// explain or repair a finding, but only this audit (run again after the change) turns a file green.
//   scanText(rel, text) -> [{ rule, level, line }]   (never the matched text: it could be a key)
//   nameFindings(rel)    -> the same, for files judged by their name only (.env, private keys…)
//   auditFile(root, rel) -> { level, findings, hash } | null (gone)
//   auditProject(root)   -> { files: { rel: { level, findings, hash } }, scanned, skipped, truncated }
// level: 'red' (risk) | 'yellow' (review) | 'green' (no finding) | 'grey' (could not be read: too big)
const fs = require('node:fs/promises');
const { execFile } = require('node:child_process');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_FILE_BYTES = 256 * 1024;
const MAX_FILES = 20000; // a whole project: generated images and the like are only listed, never read
// Folders that are not the person's own code, or are rebuilt from it
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'out', 'coverage', 'vendor', '.venv', 'venv', '__pycache__', '.turbo', '.cache', '.platanus-backups']);
const LOCK_FILES = new Set(['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'poetry.lock', 'cargo.lock', 'composer.lock', 'gemfile.lock']);
const CODE = /\.(m?[jt]sx?|cjs|py|rb|php|go|java|kt|cs|rs|vue|svelte)$/i;
const TEXT = /\.(m?[jt]sx?|cjs|py|rb|php|go|java|kt|cs|rs|vue|svelte|html?|sql|json|ya?ml|toml|ini|cfg|conf|env|sh|bash|zsh|md|txt|xml|properties|gradle|tf)$/i;
const RANK = { grey: 0, green: 1, yellow: 2, red: 3 };

// Files judged by their name (they are never read: they hold keys by design)
const ENV_TEMPLATE = /^\.env\.(example|sample|template|dist)$/i;
const ENV_FILE = /^\.env(\..+)?$/i;
const KEY_FILE = /\.(pem|key|p12|pfx|keystore|jks)$/i;
const SSH_KEY = /^id_(rsa|ed25519|ecdsa|dsa)$/i;
const SECRET_NAME = /(secret|credential|passwd|password|private[-_]?key|service[-_]?account)/i;

// Keys with a known shape (providers' prefixes) and private key blocks
const KNOWN_KEYS = [
  /\b(sk|rk|pk)_(live|test)_[0-9a-zA-Z]{16,}/, // Stripe
  /\bsk-(proj-|ant-)?[A-Za-z0-9_-]{20,}/,       // OpenAI / Anthropic style
  /\bAKIA[0-9A-Z]{16}\b/,                       // AWS access key
  /\b(ghp|gho|ghs|ghu)_[A-Za-z0-9]{30,}/,       // GitHub
  /\bgithub_pat_[A-Za-z0-9_]{40,}/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/,             // Slack
  /\bAIza[0-9A-Za-z_-]{35}\b/,                  // Google
  /\bxai-[A-Za-z0-9]{20,}/,                     // xAI
  /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
  // a connection string with its password (a local development database is not a leak)
  /\b(postgres(ql)?|mysql|mongodb(\+srv)?|redis):\/\/[^:\s/'"]+:[^@\s'"]{3,}@(?!(localhost|127\.0\.0\.1)[:/])/,
];
// password = "…", apiKey: '…' written in the code (not read from the environment)
const ASSIGNED_SECRET = /(pass(word|wd)?|secret|api[_-]?key|access[_-]?token|auth[_-]?token|private[_-]?key|client[_-]?secret)["']?\s*[:=]\s*["'`]([^"'`\s]{8,})["'`]/i;
const PLACEHOLDER = /^(x+|\*+|changeme|change[-_]?me|(your|tu|pon|put|replace|insert)[-_].*|.*[-_](aqui|here)([-_].*)?|<.*>|\$\{.*\}|example.*|placeholder|dummy|test(ing)?|password|secret|null|undefined|todo|xxx.*|\.\.\.)$/i;

// One line of the file -> does this rule hit? Each rule has patterns; a hit counts only when the pattern
// starts in real code (`where: 'code'`), not inside a text in quotes, a regex literal or a comment: the
// rules' own descriptions, docs strings and the audit's own patterns are not vulnerabilities.
// `where: 'any'` also counts inside quotes (an HTTP header is written as a text). `unless`: a line that
// also says this is fine. `check`: an extra look at the whole line once the pattern matched.
const LINE_RULES = [
  { rule: 'sqlInjection', level: 'red', where: 'code', patterns: [
    /\b(query|execute|raw|unsafe|prepare)\s*\(\s*`[^`]*\$\{/i,
    /\b(query|execute|raw)\s*\(\s*["'][^"']*\b(select|insert|update|delete)\b[^"']*["']\s*\+/i,
    /\.execute\s*\(\s*f["']/i,
    /\.execute\s*\(\s*["'][^"']*%s?[^"']*["']\s*%\s*\(/i] },
  { rule: 'commandInjection', level: 'red', where: 'code', patterns: [
    /\b(exec|execSync|spawnSync?)\s*\(\s*(`[^`]*\$\{|["'][^"']*["']\s*\+)/, /\bos\.system\s*\(\s*f["']/, /\bsubprocess\.\w+\([^)]*shell\s*=\s*True/] },
  { rule: 'tlsDisabled', level: 'red', where: 'code', anyFile: true, patterns: [
    /\brejectUnauthorized\s*:\s*false/, /\bNODE_TLS_REJECT_UNAUTHORIZED\s*=\s*["']?0/, /\bverify\s*=\s*False\b/] },
  { rule: 'jwtUnsafe', level: 'red', where: 'code', patterns: [/\balgorithms?\s*[:=]\s*\[?[^\]\n]*["']none["']/i] },
  { rule: 'jwtUnsafe', level: 'red', where: 'code', patterns: [/\bjwt\.decode\s*\(/], unless: /verify/i },
  { rule: 'evalUse', level: 'yellow', where: 'code', patterns: [/(?<![\w])eval\s*\(/, /(?<![.\w])(window|globalThis|self)\.eval\s*\(/, /\bnew Function\s*\(/,
    /\b(setTimeout|setInterval)\s*\(\s*["'`][^"'`]*["'`]\s*\+/] }, // a timer with a text runs it as code
  { rule: 'htmlInjection', level: 'yellow', where: 'code', patterns: [/\.(inner|outer)HTML\s*\+?=/], check: (line, at) => !safeHtml(line.slice(at)) },
  { rule: 'htmlInjection', level: 'yellow', where: 'code', patterns: [/\.insertAdjacentHTML\s*\(/, /\bdocument\.write(ln)?\s*\(/] },
  { rule: 'htmlInjection', level: 'yellow', where: 'code', patterns: [/\bdangerouslySetInnerHTML\b/] },
  { rule: 'htmlInjection', level: 'yellow', where: 'any', patterns: [/\bv-html\s*=/] },
  { rule: 'corsOpen', level: 'yellow', where: 'code', anyFile: true, patterns: [/\borigin\s*:\s*["']\*["']/i, /\bcors\(\s*\)/] },
  { rule: 'corsOpen', level: 'yellow', where: 'any', anyFile: true, patterns: [/Access-Control-Allow-Origin["']?\s*[,:]\s*["']\*["']/i] },
  { rule: 'weakHash', level: 'yellow', where: 'code', patterns: [/\bcreateHash\(\s*["'](md5|sha1)["']/i, /\bhashlib\.(md5|sha1)\(/] },
  { rule: 'insecureRandom', level: 'yellow', where: 'code', patterns: [/\bMath\.random\(\)/], check: (line) => /(token|secret|password|passwd|otp|session|salt|nonce)/i.test(line) },
  { rule: 'cookieInsecure', level: 'yellow', where: 'code', patterns: [/\b(res\.cookie|cookies\.set)\s*\(/], unless: /httpOnly/i },
  { rule: 'debugEnabled', level: 'yellow', where: 'code', patterns: [/^\s*DEBUG\s*=\s*True\b/, /\.run\([^)]*debug\s*=\s*True/] },
];

// innerHTML gets something safe: a fixed text, an icon of the app, markdown or text that was escaped.
// `rest` starts at ".innerHTML …="; anything else (a variable, a value from outside) needs a look.
const SAFE_CALL = /^(icon|iconSvg|svgIcon|markdownToHtml|escapeHtml|escape|sanitize|DOMPurify\.sanitize)\(/;
const APP_TEXT = /^(strings|S|t|C|R|P|G)\.[\w.]+$/;         // the app's own texts (i18n)
const CONSTANT = /^[A-Z][A-Z0-9_]*(\.[\w$]+|\[[^\]]+\])*$/;  // a fixed map of the app (RISK_ICON.red, BRANDS[key])
// One safe call spanning the whole value: icon(…), markdownToHtml(…)
function oneSafeCall(value) {
  const m = SAFE_CALL.exec(value);
  if (!m) return false;
  let depth = 0;
  for (let i = m[0].length - 1; i < value.length; i++) {
    if (value[i] === '(') depth++;
    else if (value[i] === ')' && --depth === 0) return i === value.length - 1;
  }
  return false;
}
function safeBranch(value) {
  const v = value.trim().replace(/^\((.*)\)$/s, '$1').trim();
  if (/^(["'])[^"'$]*\1$/.test(v) || v === '``') return true;      // a fixed text ('' clears it)
  if (CONSTANT.test(v) || oneSafeCall(v) || APP_TEXT.test(v)) return true;
  if (/^(["'])[^"'$]*\1(\s*\+\s*(["'])[^"'$]*\3)+$/.test(v)) return true; // fixed texts joined
  if (!/^`[\s\S]*`$/.test(v)) return false;
  // a template whose every ${…} is escaped, an icon, a number or a text of the app
  const flat = v.replace(/\b(escapeHtml|escape)\((?:[^()]|\([^()]*\))*\)/g, '0');
  return [...flat.matchAll(/\$\{([^}]*)\}/g)].map((m) => m[1].trim())
    .every((h) => /^(\d+|count|n|total|i|index)$/.test(h) || oneSafeCall(h) || APP_TEXT.test(h) || CONSTANT.test(h));
}
// innerHTML gets something safe: a fixed text, an icon or a fixed map of the app, markdown, escaped text,
// or a ternary of those. `rest` starts at ".innerHTML …="; anything else (a variable, a value from
// outside, a function that builds HTML) needs a look.
// The first `mark` (' ? ' or ' : ') outside quotes, templates and brackets, or -1
function topLevel(value, mark) {
  let depth = 0, quote = null;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (quote) { if (ch === '\\') i++; else if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    else if (depth === 0 && value.startsWith(mark, i)) return i;
  }
  return -1;
}
// a value, or `cond ? a : b` (also nested in b): every value it can take must be safe; the conditions
// are not shown, so they do not matter
function safeValue(value) {
  const v = value.trim();
  if (safeBranch(v)) return true;
  const q = topLevel(v, ' ? ');
  if (q < 0) return false;
  const rest = v.slice(q + 3);
  const c = topLevel(rest, ' : ');
  if (c < 0) return false;
  return safeValue(rest.slice(0, c)) && safeValue(rest.slice(c + 3));
}
// innerHTML gets something safe: a fixed text, an icon or a fixed map of the app, markdown, escaped text,
// or a ternary of those. `rest` starts at ".innerHTML …="; anything else (a variable, a value from
// outside, a function that builds HTML) needs a look.
function safeHtml(rest) {
  return safeValue(rest.replace(/^\.(inner|outer)HTML\s*\+?=\s*/, '').replace(/;?\s*(\/\/.*)?$/, ''));
}

// Which characters of a line of code are code (true) and which are inside a text in quotes, a regex
// literal or a comment (false). A template's ${…} is code. Good enough for one line at a time.
function codeMask(line) {
  const mask = new Array(line.length).fill(true);
  let state = 'code';
  let depth = 0; // ${ … } inside a template
  let prev = ''; // the last character of code that is not a space
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (state === 'code') {
      if (ch === '/' && line[i + 1] === '/') { mask.fill(false, i); break; }
      if (ch === '#' && /\.(py|rb|sh)$/.test(codeMask.file ?? '')) { mask.fill(false, i); break; }
      if (ch === '/' && line[i + 1] === '*') { const end = line.indexOf('*/', i + 2); const stop = end < 0 ? line.length : end + 2; mask.fill(false, i, stop); i = stop - 1; continue; }
      if (ch === "'" || ch === '"') { state = ch; mask[i] = false; continue; }
      if (ch === '`') { state = '`'; mask[i] = false; continue; }
      if (ch === '}' && depth > 0) { depth--; state = '`'; continue; }
      const before = line.slice(0, i).trimEnd();
      if (ch === '/' && !/(\+\+|--)$/.test(before) && (prev === '' || '(,=:[!&|?{};+-*%<>~^'.includes(prev) || /\b(return|typeof|in|of)$/.test(before))) {
        let j = i + 1, cls = false;
        for (; j < line.length; j++) {
          if (line[j] === '\\') { j++; continue; }
          if (line[j] === '[') cls = true; else if (line[j] === ']') cls = false; else if (line[j] === '/' && !cls) break;
        }
        if (j < line.length) { mask.fill(false, i, j + 1); i = j; prev = '/'; continue; }
      }
      if (!/\s/.test(ch)) prev = ch;
    } else {
      mask[i] = false;
      if (ch === '\\') { mask[i + 1] = false; i++; continue; }
      if (state === '`' && ch === '$' && line[i + 1] === '{') { depth++; state = 'code'; mask[i + 1] = false; i++; prev = '{'; continue; }
      if (ch === state) { state = 'code'; prev = ch; }
    }
  }
  return mask;
}

// A whole line that is a comment: // …, a line inside a /** … */ block (" * …"), or # in Python/Ruby/shell.
// "/* x */ code" and "--n;" are code: codeMask hides only the comment part
const isComment = (line, name = '') => /^\s*\/\//.test(line) || /^\s*\*(\s|$|\/)/.test(line) || (/\.(py|rb|sh)$/.test(name) && /^\s*#/.test(line));
// Tests and fixtures may hold bad patterns and fake keys on purpose
const TEST_FILE = /(^|\/)(tests?|__tests__|spec|specs|fixtures)\/|\.(test|spec)\.[cm]?[jt]sx?$/i;

// The columns that say a table keeps personal data
const PERSONAL = /\b(email|correo|tel[eé]fono|phone|c[eé]dula|documento|dni|nie|pasaporte|passport|direcci[oó]n|address|password|contrase[ñn]a|birth|nacimiento|ssn|tarjeta|card)\w*\s+\w+/i;

// SQL: tables with personal data and no rule of who may read them (row level security), and grants to
// everybody. A table without personal data is not flagged: there is nothing private to protect.
function sqlFindings(lines) {
  const out = [];
  const text = lines.join('\n');
  const tables = [];
  const create = /create\s+table\s+(if\s+not\s+exists\s+)?([\w."]+)\s*\(/gi;
  let m;
  while ((m = create.exec(text))) {
    const name = m[2].replace(/"/g, '').split('.').pop().toLowerCase();
    // the table's body: from its "(" to the matching ")"
    let depth = 0, end = m.index + m[0].length - 1;
    for (let i = end; i < text.length; i++) {
      if (text[i] === '(') depth++;
      else if (text[i] === ')' && --depth === 0) { end = i; break; }
    }
    const line = text.slice(0, m.index).split('\n').length;
    tables.push({ name, line, personal: PERSONAL.test(text.slice(m.index, end)) });
  }
  const protectedTables = new Set();
  const rls = /alter\s+table\s+(if\s+exists\s+)?([\w."]+)\s+enable\s+row\s+level\s+security/gi;
  while ((m = rls.exec(text))) protectedTables.add(m[2].replace(/"/g, '').split('.').pop().toLowerCase());
  for (const table of tables) {
    if (table.personal && !protectedTables.has(table.name)) out.push({ rule: 'sqlNoAccessRules', level: 'yellow', line: table.line });
  }
  lines.forEach((l, i) => {
    if (/\bgrant\s+all\b[^;]*\bto\s+(public|anon)\b/i.test(l)) out.push({ rule: 'sqlGrantAll', level: 'red', line: i + 1 });
  });
  return out;
}

// Dockerfile: the app runs as root (no USER), or the base image has no fixed version
function dockerFindings(lines) {
  const out = [];
  const from = lines.findIndex((l) => /^\s*FROM\s+/i.test(l));
  if (from >= 0) {
    const image = lines[from].trim().split(/\s+/)[1] ?? '';
    if (!image.includes('@') && (!image.includes(':') || image.endsWith(':latest'))) out.push({ rule: 'dockerLatest', level: 'yellow', line: from + 1 });
    if (!lines.some((l) => /^\s*USER\s+(?!root\b|0\b)\S+/i.test(l))) out.push({ rule: 'dockerRoot', level: 'yellow', line: from + 1 });
  }
  return out;
}

const base = (rel) => rel.split('/').pop();

// Whether git keeps a file out of the repository: { tracked, ignored } for a path of the project.
// A key file that is ignored and was never committed is the right way to keep it (green); one that is
// not ignored could be committed any day (yellow); one in the repository already leaked (red).
// Outside a git repository the root .gitignore is read with a small matcher.
const git = (root, args, input) => new Promise((resolve) => {
  const child = execFile('git', args, { cwd: root, timeout: 10_000, maxBuffer: 8 * 1024 * 1024 }, (error, stdout) => resolve({ ok: !error || error.code === 1, code: error?.code ?? 0, out: String(stdout ?? '') }));
  if (input != null) { child.stdin?.end(input); }
});
const globToRegex = (glob) => new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]').replace(/\u0000/g, '.*')}$`);
async function gitCheckFor(root) {
  const repo = await git(root, ['rev-parse', '--is-inside-work-tree']);
  if (repo.ok && repo.out.trim() === 'true') {
    const tracked = new Set((await git(root, ['ls-files', '-z'])).out.split('\0').filter(Boolean));
    return async (rel) => {
      if (tracked.has(rel)) return { tracked: true, ignored: false, history: true };
      // taken out of the repository later (git rm --cached) does not take it out of the history
      const log = await git(root, ['log', '--all', '--format=%H', '-1', '--', rel]);
      const history = Boolean(log.out.trim());
      const r = await git(root, ['check-ignore', '-q', '--', rel]);
      return { tracked: false, ignored: r.code === 0, history };
    };
  }
  let lines = [];
  try { lines = (await fs.readFile(path.join(root, '.gitignore'), 'utf8')).split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && !l.startsWith('!')); } catch { /* none */ }
  const rules = lines.map((l) => l.replace(/^\//, '').replace(/\/$/, '')).map((l) => ({ re: globToRegex(l), anchored: l.includes('/') }));
  return async (rel) => ({ tracked: false, ignored: rules.some(({ re, anchored }) => re.test(rel) || (!anchored && (re.test(base(rel)) || rel.split('/').some((part) => re.test(part))))) });
}

function nameFindings(rel) {
  const name = base(rel);
  if (ENV_TEMPLATE.test(name)) return null; // read: it should hold names, never values
  if (ENV_FILE.test(name)) return [{ rule: 'envFile', level: 'red', line: 0 }];
  if (KEY_FILE.test(name) || SSH_KEY.test(name)) return [{ rule: 'privateKey', level: 'red', line: 0 }];
  if (SECRET_NAME.test(name) && !CODE.test(name)) return [{ rule: 'secretName', level: 'red', line: 0 }];
  return null;
}

function scanText(rel, text) {
  const name = base(rel);
  const lines = String(text).split(/\r?\n/);
  const code = CODE.test(name);
  const out = [];
  const envTemplate = ENV_TEMPLATE.test(name);
  const testFile = TEST_FILE.test(rel);
  codeMask.file = name;
  lines.forEach((line, i) => {
    if (line.length > 2000) return; // minified: no human line to point at
    // a key in a test is most likely fake, but it is worth a look (a real one pasted there leaks the same)
    const secret = testFile ? { rule: 'secretInTest', level: 'yellow', line: i + 1 } : { rule: 'hardcodedSecret', level: 'red', line: i + 1 };
    if (KNOWN_KEYS.some((re) => re.test(line))) { out.push(secret); return; }
    if (envTemplate) {
      const value = line.match(/^\s*[A-Z0-9_]+\s*=\s*["']?([^"'#\s]*)/i)?.[1] ?? '';
      if (value.length >= 12 && !PLACEHOLDER.test(value) && !/^[a-z+]+:\/\/([^@/]*@)?(localhost|127\.0\.0\.1)[:/]/i.test(value)) out.push({ rule: 'envTemplateValue', level: 'yellow', line: i + 1 });
      return;
    }
    const assigned = line.match(ASSIGNED_SECRET);
    if (assigned && !PLACEHOLDER.test(assigned[3]) && !/process\.env|os\.environ|getenv|import\.meta\.env/.test(line)) {
      out.push(secret);
      return;
    }
    if (testFile || (code && isComment(line, name))) return;
    const mask = code ? codeMask(line) : null;
    for (const r of LINE_RULES) {
      if (!code && !r.anyFile) continue;
      if (r.unless?.test(line)) continue;
      const hit = r.patterns.some((re) => {
        const m = re.exec(line);
        if (!m) return false;
        // where it really starts (a leading space or ^ of the pattern is not the word itself)
        const at = m.index + (m[0].length - m[0].trimStart().length);
        if (r.where === 'code' && mask && !mask[at]) return false;
        return r.check ? r.check(line, at) : true;
      });
      if (hit) out.push({ rule: r.rule, level: r.level, line: i + 1 });
    }
  });
  if (/\.sql$/i.test(name)) out.push(...sqlFindings(lines));
  if (/^dockerfile(\..+)?$/i.test(name) || /\.dockerfile$/i.test(name)) out.push(...dockerFindings(lines));
  // one finding per rule and line, worst first, at most 20 per file
  const seen = new Set();
  return out
    .filter((f) => { const k = `${f.rule}:${f.line}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => RANK[b.level] - RANK[a.level] || a.line - b.line)
    .slice(0, 20);
}

const levelOf = (findings) => findings.reduce((worst, f) => (RANK[f.level] > RANK[worst] ? f.level : worst), 'green');
const hashOf = (text) => crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
const scannable = (rel) => TEXT.test(base(rel)) || /^dockerfile(\..+)?$/i.test(base(rel)) || ENV_TEMPLATE.test(base(rel));

// A key file judged by name, and what git does with it
async function namedLevel(rel, named, check) {
  if (!check) return named;
  const { tracked, ignored, history } = await check(rel);
  if (tracked) return named.map((f) => ({ ...f, level: 'red', line: 0 }));
  // in a commit of the history: whoever has the repository has the key; it must be changed (rotated)
  if (history) return [{ rule: 'secretInHistory', level: 'red', line: 0 }];
  if (ignored) return []; // kept out of the repository: that is how it should be
  return [{ rule: 'secretNotIgnored', level: 'yellow', line: 0 }];
}

// check: the git check of auditProject (a single file is checked with its own)
async function auditFile(root, rel, check = null) {
  const found = nameFindings(rel);
  const named = found ? await namedLevel(rel, found, check ?? (await gitCheckFor(root))) : null;
  const abs = path.join(root, rel);
  let stat;
  try { stat = await fs.lstat(abs); } catch { return null; }
  if (!stat.isFile()) return null; // a folder, or a link that may lead out of the project
  if (named) return { level: levelOf(named), findings: named.map(({ rule, level, line }) => ({ rule, level, line })), hash: `${stat.size}:${Math.round(stat.mtimeMs)}` };
  if (!scannable(rel)) return { level: 'green', findings: [], hash: `${stat.size}:${Math.round(stat.mtimeMs)}` };
  if (stat.size > MAX_FILE_BYTES) return { level: 'grey', findings: [], hash: `${stat.size}:${Math.round(stat.mtimeMs)}` };
  let text;
  try { text = await fs.readFile(abs, 'utf8'); } catch { return null; }
  const findings = scanText(rel, text);
  return { level: levelOf(findings), findings, hash: hashOf(text) };
}

// Every file of the project (skipping dependencies and builds), up to MAX_FILES
async function listFiles(root) {
  const out = [];
  let truncated = false;
  const walk = async (dir) => {
    let entries;
    try { entries = await fs.readdir(path.join(root, dir), { withFileTypes: true }); } catch { return; }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (out.length >= MAX_FILES) { truncated = true; return; }
      if (entry.isSymbolicLink()) continue; // a link may lead out of the project
      const rel = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name)) await walk(rel); }
      else if (entry.isFile() && !LOCK_FILES.has(entry.name.toLowerCase()) && entry.name !== '.DS_Store') out.push(rel);
    }
  };
  await walk('');
  return { files: out, truncated };
}

async function auditProject(root) {
  const { files: list, truncated } = await listFiles(root);
  const files = {};
  let skipped = 0;
  const check = await gitCheckFor(root);
  for (const rel of list) {
    const result = await auditFile(root, rel, check);
    if (!result) continue;
    if (result.level === 'grey') skipped++;
    files[rel] = result;
  }
  return { files, scanned: Object.keys(files).length, skipped, truncated };
}

module.exports = { scanText, nameFindings, auditFile, auditProject, listFiles, levelOf, gitCheckFor, MAX_FILE_BYTES, MAX_FILES };
