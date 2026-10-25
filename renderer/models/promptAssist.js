// Help while the person writes to the agent: what is missing in the message (too short, no file, a
// secret pasted by mistake) and completions (file names after "@" or as they are typed; an empty box
// already shows ways to start under the chat). Pure: the composer view model calls it on every keystroke.
//
// tree: the project's entries [{ path, type: 'file' | 'dir' }] (projectModel.store.state.tree).
import { strings } from '../i18n/es.js';
import { isSecretFile } from './fileOpen.js';
import { allFiles } from './fileTree.js';

const A = strings.chat.assist;
const MAX_COMPLETIONS = 5;
const MIN_WORDS = 3;
// Things that look like a key or password typed into the message
const SECRET_TEXT = [
  /\b(?:sk|pk|rk)_(?:live|test)_[\w]{8,}/,
  /\bAKIA[0-9A-Z]{12,}/,
  /\bgh[pousr]_[\w]{20,}/,
  /\beyJ[\w-]{10,}\.[\w-]{10,}\./,
  /\b(?:contraseña|password|clave|token|secret)\s*[:=]\s*\S{6,}/i,
];

const words = (text) => text.toLowerCase().split(/[^\p{L}\p{N}_.\-/]+/u).filter(Boolean);
const baseName = (path) => path.split('/').pop();
const stem = (name) => name.replace(/^\./, '').replace(/\.[^.]+$/, '').toLowerCase();
// Files with secrets are never offered or suggested
const files = (tree) => allFiles(tree ?? []).filter((n) => !isSecretFile(n.path));

// Files the message already names (by path or by file name)
export function mentionedFiles(text, tree) {
  const lower = text.toLowerCase();
  return files(tree).filter((f) => lower.includes(f.path.toLowerCase()) || words(text).includes(baseName(f.path).toLowerCase())).map((f) => f.path);
}

// The file a message probably means when it names none ("repara el login" -> src/api/login.js)
export function guessFile(text, tree) {
  const said = new Set(words(text).filter((w) => w.length >= 3));
  return files(tree).find((f) => said.has(stem(baseName(f.path))))?.path ?? null;
}

// What is missing in the message -> [{ kind: 'short' | 'noTarget' | 'secret', text, path? }]
export function analyzePrompt(text, tree) {
  const draft = String(text ?? '').trim();
  if (!draft) return [];
  const hints = [];
  if (SECRET_TEXT.some((re) => re.test(draft))) hints.push({ kind: 'secret', text: A.hints.secret });
  if (words(draft).length < MIN_WORDS) return [...hints, { kind: 'short', text: A.hints.short }];
  const asks = words(draft).some((w) => A.actionWords.includes(w));
  if (asks && !draft.includes('`') && !mentionedFiles(draft, tree).length) {
    const path = guessFile(draft, tree);
    hints.push({ kind: 'noTarget', text: A.hints.noTarget(path ? baseName(path) : ''), ...(path ? { path } : {}) });
  }
  return hints;
}

// Completions for the word being typed -> [{ kind: 'file', label, detail, insert }]
export function completions(text, tree) {
  const draft = String(text ?? '');
  if (!draft.trim() || /\s$/.test(draft)) return [];
  const token = draft.split(/\s+/).pop();
  const at = token.startsWith('@');
  const query = (at ? token.slice(1) : token).toLowerCase();
  if (!query || (!at && query.length < 3)) return [];
  const pool = files(tree);
  const starts = pool.filter((f) => baseName(f.path).toLowerCase().startsWith(query));
  const inside = at ? pool.filter((f) => !starts.includes(f) && f.path.toLowerCase().includes(query)) : [];
  return [...starts, ...inside].slice(0, MAX_COMPLETIONS)
    .map((f) => ({ kind: 'file', label: baseName(f.path), detail: f.path, insert: `\`${f.path}\` ` }));
}

// The message with a completion applied (it replaces the word being typed)
export function applyCompletion(text, item) {
  return String(text ?? '').replace(/\S*$/, '') + item.insert;
}
