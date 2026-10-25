// "Mejorar mi mensaje": a message becomes a small spec in the shape gentle-shell's ODD feature
// documents use (objective, problem, scope, constraints, tasks T1… with acceptance criteria) and test
// first (RED -> GREEN -> REFACTOR). The agent writes it as JSON (agent/voice.json -> refine); without an
// agent it is made here. Pure.
import { strings } from '../i18n/es.js';
import { SAFE_PATH } from './answerFormat.js';
import { mentionedFiles, guessFile } from './promptAssist.js';

const A = strings.chat.assist;
const MAX_TEXT = 300;
const MAX_ITEMS = 6;

/**
 * @typedef {{ id: string, do: string, accept: string }} SpecTask
 * @typedef {{ red: string, green: string, refactor: string }} SpecTest
 * @typedef {{
 *   objective: string, problem: string, scope: string[], constraints: string[],
 *   tasks: SpecTask[], test: SpecTest
 * }} PromptSpec
 */

const text = (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT) : '');
const list = (value) => (Array.isArray(value) ? value.map(text).filter(Boolean).slice(0, MAX_ITEMS) : []);

/** @returns {PromptSpec | null} */
function normalize(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const objective = text(raw.objective);
  const tasks = (Array.isArray(raw.tasks) ? raw.tasks : [])
    .map((t) => ({ do: text(t?.do), accept: text(t?.accept) }))
    .filter((t) => t.do)
    .slice(0, MAX_ITEMS)
    .map((t, i) => ({ id: `T${i + 1}`, ...t }));
  if (!objective || !tasks.length) return null;
  return {
    objective,
    problem: text(raw.problem),
    scope: list(raw.scope).map((p) => p.replace(/^`|`$/g, '')).filter((p) => SAFE_PATH.test(p)),
    constraints: list(raw.constraints),
    tasks,
    test: { red: text(raw.test?.red), green: text(raw.test?.green), refactor: text(raw.test?.refactor) },
  };
}

// The agent's answer -> a spec, or null when it is not one. Accepts a ```json fence or loose JSON.
/** @returns {PromptSpec | null} */
export function parseSpec(answer) {
  const source = String(answer ?? '');
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(source)?.[1];
  const candidate = fenced ?? source.slice(source.indexOf('{'), source.lastIndexOf('}') + 1);
  try {
    return normalize(JSON.parse(candidate));
  } catch {
    return null;
  }
}

const sentence = (draft) => {
  const clean = draft.replace(/\s+/g, ' ').trim();
  return clean.charAt(0).toUpperCase() + clean.slice(1);
};

// Made here (no agent): the message as the objective, the files it names (or the one it means) as the
// scope, and the three test-first steps
/** @returns {PromptSpec} */
export function localSpec(draft, { tree = [] } = {}) {
  const named = mentionedFiles(draft, tree);
  const guess = named.length ? null : guessFile(draft, tree);
  const scope = guess ? [guess] : named;
  const target = scope.length === 1 ? `\`${scope[0]}\`` : '';
  return normalize({
    objective: sentence(draft),
    problem: '',
    scope,
    constraints: A.local.constraints,
    tasks: A.local.tasks(target),
    test: { red: A.local.red, green: A.local.green, refactor: A.local.refactor },
  });
}

// The spec as the message the agent receives (Markdown, headings in the mode's words)
export function specToPrompt(spec, mode = 'vibe') {
  const L = A.spec[mode === 'dev' || mode === 'tech' ? 'dev' : 'vibe'];
  const section = (title, lines) => (lines.length ? `## ${title}\n${lines.join('\n')}` : '');
  return [
    section(L.objective, [spec.objective]),
    section(L.problem, spec.problem ? [spec.problem] : []),
    section(L.scope, spec.scope.map((p) => `- \`${p}\``)),
    section(L.constraints, spec.constraints.map((c) => `- ${c}`)),
    section(L.tasks, spec.tasks.map((t) => `- ${t.id} · ${t.do}${t.accept ? `\n  - ${L.accept}: ${t.accept}` : ''}`)),
    section(L.test, ['red', 'green', 'refactor'].filter((k) => spec.test[k]).map((k) => `- ${L[k]}: ${spec.test[k]}`)),
  ].filter(Boolean).join('\n\n');
}

// A message made by specToPrompt (headings and at least one task line)
export const isSpec = (message) => /^## /.test(String(message ?? '')) && /^- T1 · /m.test(String(message));
