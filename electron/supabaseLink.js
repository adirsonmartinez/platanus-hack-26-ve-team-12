// The pure part of "Conectar mi cuenta" for Supabase (supabaseConnect.js does the calls): reading the
// answers of Supabase's MCP server, choosing the public key, and the text of .env.local and .gitignore.
// Tested in supabaseLink.test.js.

const ENV_URL = 'NEXT_PUBLIC_SUPABASE_URL';
const ENV_KEY = 'NEXT_PUBLIC_SUPABASE_ANON_KEY';
const REGION = 'sa-east-1'; // São Paulo: the closest one to Chile

// A tool result ({ content: [{ type: 'text', text }], isError }) -> the JSON in its text. Supabase may wrap
// data in other text (a note, tags), so the outermost [...] or {...} is taken.
function readToolJson(result) {
  const body = (result?.content ?? []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  if (result?.isError) {
    let message = body.trim();
    try { message = JSON.parse(message)?.error?.message ?? message; } catch { /* plain text */ }
    throw new Error(String(message).slice(0, 300) || 'Supabase error');
  }
  try { return JSON.parse(body); } catch { /* wrapped */ }
  const starts = [body.indexOf('['), body.indexOf('{')].filter((i) => i >= 0);
  if (starts.length) {
    const start = Math.min(...starts);
    const end = Math.max(body.lastIndexOf(']'), body.lastIndexOf('}'));
    try { return JSON.parse(body.slice(start, end + 1)); } catch { /* not JSON */ }
  }
  throw new Error('Supabase did not answer with JSON');
}

// Supabase wraps its answers by name: { organizations: [...] }, { projects: [...] }, maybe { project: {...} }.
// A bare list or item is accepted too.
function listOf(answer, key) {
  if (Array.isArray(answer)) return answer;
  return Array.isArray(answer?.[key]) ? answer[key] : [];
}
const itemOf = (answer, key) => (answer && typeof answer[key] === 'object' && !Array.isArray(answer[key]) ? answer[key] : answer);

// get_cost -> what confirm_cost needs back unchanged ({ type, recurrence, amount }); the amount is in USD
function readCost(answer) {
  const amount = Number(answer?.amount);
  const recurrence = answer?.recurrence === 'hourly' ? 'hourly' : answer?.recurrence === 'monthly' ? 'monthly' : null;
  if (!Number.isFinite(amount) || !recurrence) throw new Error('Supabase did not say the cost');
  return { type: answer.type === 'branch' ? 'branch' : 'project', amount, recurrence };
}

// get_publishable_keys -> the key a browser app may use: a modern publishable key, else the legacy anon
// key. Never a disabled key and never anything else (service_role is a secret).
function pickPublicKey(answer) {
  // a bare list, or the first list inside the answer ({ keys: [...] }, { publishable_keys: [...] }…)
  const list = Array.isArray(answer) ? answer : Object.values(answer ?? {}).find(Array.isArray) ?? [];
  const value = (k) => k.api_key ?? k.key ?? k.value ?? null;
  const live = list.filter((k) => !k.disabled && typeof value(k) === 'string');
  const modern = live.find((k) => value(k).startsWith('sb_publishable_'));
  const anon = live.find((k) => k.name === 'anon');
  return modern ? value(modern) : anon ? value(anon) : null;
}

// .env.local with our variables replaced (or added at the end); the person's other lines stay
function mergeEnv(textIn, vars) {
  const lines = String(textIn ?? '').split('\n');
  if (lines.at(-1) === '') lines.pop();
  for (const [name, val] of Object.entries(vars)) {
    const line = `${name}=${val}`;
    const at = lines.findIndex((l) => l.startsWith(`${name}=`));
    if (at >= 0) lines[at] = line;
    else lines.push(line);
  }
  return `${lines.join('\n')}\n`;
}

// .gitignore with ".env*.local" added, or null when a rule already keeps .env.local out of git
function protectEnv(textIn) {
  const rules = String(textIn ?? '').split('\n').map((l) => l.trim());
  if (rules.some((r) => ['.env*', '.env*.local', '.env.local', '*.local', '.env.*'].includes(r))) return null;
  const base = String(textIn ?? '');
  return `${base}${base && !base.endsWith('\n') ? '\n' : ''}.env*.local\n`;
}

function projectNameFor(folder) {
  const slug = String(folder ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '');
  return slug || 'mi-proyecto';
}

// get_project_url -> https://<ref>.supabase.co (plain text or JSON)
function readToolUrl(result) {
  const body = (result?.content ?? []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  return body.match(/https:\/\/[a-z0-9-]+\.supabase\.(co|in)\b/i)?.[0] ?? null;
}

// execute_sql -> its rows. Supabase answers { result: "…<untrusted-data-ID>\n[rows]\n</untrusted-data-ID>…" };
// only what is between the boundaries is data
function readSqlRows(result) {
  const body = (result?.content ?? []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  let textOut = body;
  try { textOut = JSON.parse(body)?.result ?? body; } catch { /* not wrapped in JSON */ }
  // The notice before the data names the boundary too: the data starts at the last opening before the closing
  const str = String(textOut);
  const close = str.match(/<\/(untrusted-data-[\w-]+)>/);
  if (!close) throw new Error('Supabase did not answer with rows');
  const open = `<${close[1]}>`;
  const start = str.lastIndexOf(open, close.index);
  if (start < 0) throw new Error('Supabase did not answer with rows');
  const rows = JSON.parse(str.slice(start + open.length, close.index).trim());
  if (!Array.isArray(rows)) throw new Error('Supabase did not answer with rows');
  return rows;
}

// Fixed, read-only queries for the database panel (main runs them; nothing from the window goes in)
const STATS_SQL = {
  totals: `select
    (select count(*) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE') as tables,
    (select coalesce(sum(n_live_tup), 0) from pg_stat_user_tables where schemaname = 'public') as rows,
    pg_database_size(current_database()) as bytes`,
  tables: `select relname as name, n_live_tup as rows, pg_total_relation_size(relid) as bytes
    from pg_stat_user_tables where schemaname = 'public' order by bytes desc limit 8`,
};

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
function readStats(totals, tables) {
  const t = totals?.[0] ?? {};
  return {
    tables: num(t.tables), rows: num(t.rows), bytes: num(t.bytes),
    top: (tables ?? []).map((r) => ({ name: String(r.name), rows: num(r.rows), bytes: num(r.bytes) })),
  };
}

// The database size each plan includes (free: 500 MB; pro: 8 GB); unknown plans show no bar
const PLAN_LIMIT = { free: 500 * 1024 ** 2, pro: 8 * 1024 ** 3, team: 8 * 1024 ** 3 };
const planLimitBytes = (plan) => PLAN_LIMIT[plan] ?? null;

// The project a folder already uses: the ref in its Supabase URL variable (NEXT_PUBLIC_, VITE_ or plain
// SUPABASE_URL) of an env file. Only that line is looked at; keys are never read out.
function refFromEnv(textIn) {
  for (const line of String(textIn ?? '').split('\n')) {
    const m = line.match(/^\s*(?:NEXT_PUBLIC_|VITE_)?SUPABASE_URL\s*=\s*["']?https:\/\/([a-z]{20})\.supabase\.(?:co|in)\b/);
    if (m) return m[1];
  }
  return null;
}

const isProjectRef = (ref) => typeof ref === 'string' && /^[a-z]{20}$/.test(ref);

const isReady = (project) => project?.status === 'ACTIVE_HEALTHY';

module.exports = { readToolJson, readToolUrl, readSqlRows, refFromEnv, readStats, planLimitBytes, isProjectRef, STATS_SQL, listOf, itemOf, readCost, pickPublicKey, mergeEnv, protectEnv, projectNameFor, isReady, ENV_URL, ENV_KEY, REGION };
