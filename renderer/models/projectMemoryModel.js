// What Qubi remembers of a project between calls (docs/features/llamada/FASE2.md, fase 3). Main keeps one
// JSON per project (electron/projectMemory.js: trimmed, keys scrubbed); in the web version it lives only
// in this window. The memory is a fixed summary the app writes, never a model's words: the requests,
// the files made, the audits and a few facts of the project.
import { strings } from '../i18n/es.js';
import { allFiles } from './fileTree.js';
import { isSecretFile } from './fileOpen.js';

export const MEMORY_TEXT_MAX = 800; // what the voice gets as {{project_memory}} (and at the end of its context)
const MAX_CALLS = 20;               // the same limits main applies (electron/projectMemory.js)
const MAX_LEARNED = 12;
const PEDIDO_MAX = 300;
const NOTES_MAX = 300;
const PATH_MAX = 200;
const LIST = { calls: 6, built: 15, learned: MAX_LEARNED }; // most items per list in the text, before trimming
const ITEM = { calls: 140, built: 120, learned: 80 };       // characters per item in the text
const MAX_FOLDERS = 8;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'out', 'coverage', 'vendor', '__pycache__']);
// Extension -> language name (product names, the same in Spanish)
const LANGUAGE = { ts: 'TypeScript', tsx: 'TypeScript', mts: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript',
  py: 'Python', go: 'Go', rs: 'Rust', java: 'Java', kt: 'Kotlin', rb: 'Ruby', php: 'PHP', cs: 'C#', swift: 'Swift' };
const LOCKS = [['pnpm-lock.yaml', 'pnpm'], ['yarn.lock', 'yarn'], ['package-lock.json', 'npm'], ['package.json', 'npm'], ['requirements.txt', 'pip'], ['pyproject.toml', 'pip'], ['go.mod', 'go modules'], ['Cargo.toml', 'cargo']];

const unique = (list) => [...new Set(list)];
const text = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const strs = (list, max) => (Array.isArray(list) ? list.map((s) => text(s, max)).filter(Boolean) : []);
const empty = () => ({ calls: [], learned: [] });
// Bridges answer either the value or { ok, data }
const unwrap = (res) => (res && typeof res === 'object' && 'ok' in res && 'data' in res ? res.data : res);

// Any shape in, { calls, learned } out: a broken file or bridge is just an empty memory
function normalize(memory) {
  if (!memory || typeof memory !== 'object') return empty();
  const calls = (Array.isArray(memory.calls) ? memory.calls : []).filter((c) => c && typeof c === 'object').map((c) => ({
    at: text(c.at, 40),
    pedidos: strs(c.pedidos, PEDIDO_MAX),
    built: strs(c.built, PATH_MAX),
    audits: (Array.isArray(c.audits) ? c.audits : []).filter((a) => a && typeof a === 'object').map((a) => ({ folder: text(a.folder, PATH_MAX), status: text(a.status, 20) })),
    notes: text(c.notes, NOTES_MAX),
  }));
  return { calls, learned: unique(strs(memory.learned, PATH_MAX)) };
}

// The short text the voice reads (pure, at most MEMORY_TEXT_MAX): newest requests first, the files that
// already exist (never a secret one) and what was learned. Lists shrink from their end until it fits.
export function memoryText(memory) {
  const M = strings.memory;
  const { calls, learned } = normalize(memory);
  const recent = [...calls].reverse();
  const lists = {
    calls: unique(recent.flatMap((c) => c.pedidos).map((p) => p.slice(0, ITEM.calls))).slice(0, LIST.calls),
    built: unique(recent.flatMap((c) => c.built).filter((p) => !isSecretFile(p)).map((p) => p.slice(0, ITEM.built))).slice(0, LIST.built),
    learned: learned.filter((f) => !isSecretFile(f)).map((f) => f.slice(0, ITEM.learned)).slice(0, LIST.learned),
  };
  if (!lists.calls.length && !lists.built.length && !lists.learned.length) return M.empty;
  let out = M.text(lists);
  while (out.length > MEMORY_TEXT_MAX) {
    const longest = Object.keys(lists).filter((k) => lists[k].length).sort((a, b) => lists[b].join().length - lists[a].join().length)[0];
    if (!longest) break;
    lists[longest] = lists[longest].slice(0, -1);
    out = M.text(lists);
  }
  return out.slice(0, MEMORY_TEXT_MAX);
}

// Fixed facts of the project from its tree alone (no file is read): the main folders, the languages most
// used and the package manager. Deterministic; at most MAX_LEARNED.
export function learnFacts(tree = []) {
  const nodes = Array.isArray(tree) ? tree : [];
  const folders = nodes.filter((n) => n.type === 'dir' && !n.path.startsWith('.') && !SKIP_DIRS.has(n.path) && !isSecretFile(n.path))
    .slice(0, MAX_FOLDERS).map((n) => `${n.path}/`);
  const count = new Map();
  for (const f of allFiles(nodes.filter((n) => !SKIP_DIRS.has(n.path)))) {
    const lang = LANGUAGE[/\.([^./]+)$/.exec(f.path)?.[1]?.toLowerCase()];
    if (lang) count.set(lang, (count.get(lang) ?? 0) + 1);
  }
  const languages = [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([l]) => l);
  const top = new Set(nodes.filter((n) => n.type === 'file').map((n) => n.path));
  const manager = LOCKS.find(([file]) => top.has(file))?.[1];
  return unique([...folders, ...languages, ...(manager ? [manager] : [])]).slice(0, MAX_LEARNED);
}

// The web version (no bridge): the same rules as main, kept in this window only
function localMemory() {
  const byRoot = new Map();
  const get = (root) => byRoot.get(root) ?? empty();
  const copy = (m) => normalize(m);
  return {
    available: false,
    read: async (root) => copy(get(root)),
    append: async (root, entry) => {
      const m = get(root);
      const next = { ...m, calls: [...m.calls, ...normalize({ calls: [entry] }).calls].slice(-MAX_CALLS) };
      byRoot.set(root, next);
      return copy(next);
    },
    learn: async (root, facts) => {
      const m = get(root);
      const next = { ...m, learned: unique([...m.learned, ...strs(facts, PATH_MAX)]).slice(-MAX_LEARNED) };
      byRoot.set(root, next);
      return copy(next);
    },
    forget: async (root) => { byRoot.delete(root); },
  };
}

// bridge: window.platanus.memory = { read(root), append(root, entry), learn?(root, facts), forget(root) }
// (IPC memory:*). Never rejects: a memory that fails to load or save is just an empty one.
export function createProjectMemory(bridge = globalThis.window?.platanus?.memory) {
  if (!bridge) return localMemory();
  const call = (fn) => Promise.resolve().then(fn).then(unwrap).then(normalize).catch(() => empty());
  // a bridge with no learn: the facts are kept for this session and added to what main returns
  const learnedHere = new Map();
  const withLearned = (root, m) => ({ ...m, learned: unique([...m.learned, ...(learnedHere.get(root) ?? [])]).slice(0, MAX_LEARNED) });
  return {
    available: true,
    read: (root) => call(() => bridge.read(root)).then((m) => withLearned(root, m)),
    append: (root, entry) => call(() => bridge.append(root, entry)).then((m) => withLearned(root, m)),
    learn: (root, facts) => {
      if (typeof bridge.learn === 'function') return call(() => bridge.learn(root, facts));
      learnedHere.set(root, unique([...(learnedHere.get(root) ?? []), ...strs(facts, PATH_MAX)]).slice(-MAX_LEARNED));
      return call(() => bridge.read(root)).then((m) => withLearned(root, m));
    },
    forget: (root) => {
      learnedHere.delete(root);
      return Promise.resolve().then(() => bridge.forget?.(root)).then(() => undefined).catch(() => undefined);
    },
  };
}
