// Modo Vibe: an agent run told in plain words. Each step becomes one short sentence with the file's
// name (not its path), the headline says what the agent is doing right now, and the recap counts what
// it did ("Leí 3 archivos · 1 en rojo"). Pure: the run card view (runCardView.js) draws it.
import { strings } from '../i18n/es.js';

const S = strings.chat.story;
const LEVEL_ORDER = ['red', 'yellow', 'green'];

const baseName = (path) => String(path ?? '').replace(/\/+$/, '').split('/').pop();

// One step -> { text, name, path, level, status }. `name` appears inside `text` so the view can
// turn it into a link to the map.
export function stepLine(step) {
  const status = step.status ?? 'running';
  if (step.kind === 'subagent') {
    return { text: S.helper(step.description || S.unknown.what), name: '', path: '', level: null, status };
  }
  const path = step.target || '';
  const name = baseName(path) || (step.name === 'show_folder' ? S.theProject : S.aFile);
  const known = step.name in S.done;
  const level = step.level ?? null;
  let text;
  if (!known) text = status === 'error' ? S.failed(S.unknown.what) : S.unknown[status === 'running' ? 'running' : 'done'];
  else if (status === 'running') text = S.running[step.name](name);
  else if (status === 'error') text = S.failed(S.what[step.name](name));
  // a change it was not allowed to make while the person only wanted to understand
  else if (status === 'skipped') text = S.skipped(S.what[step.name](name));
  else if (step.name === 'write_file' && step.diff?.created) text = S.created(name); // a new file, not a fix
  else text = S.done[step.name](name, S.levels[level]);
  return { text, name: path ? name : '', path, level, status };
}

// What it is doing right now, in one line
export function runHeadline(run, text) {
  if (run?.awaiting) return S.awaiting(baseName(run.awaiting)); // asking the person to approve a change
  const step = run?.steps?.findLast((s) => s.status === 'running');
  if (step) return stepLine(step).text;
  return text ? S.writing : S.thinking;
}

// What it did, counted: files read, traffic lights by color, fixes saved
export function runRecap(steps = []) {
  if (!steps.length) return '';
  const tools = steps.filter((s) => s.kind === 'tool' && s.status === 'done');
  const read = new Set(tools.filter((s) => s.name === 'read_file').map((s) => s.target)).size;
  const writes = tools.filter((s) => s.name === 'write_file');
  const created = writes.filter((s) => s.diff?.created).length;
  const fixes = writes.length - created;
  const parts = [];
  if (read) parts.push(S.recap.files(read));
  for (const level of LEVEL_ORDER) {
    const n = tools.filter((s) => s.name === 'set_file_score' && s.level === level).length;
    if (n) parts.push(S.recap.level(n, S.levels[level]));
  }
  if (created) parts.push(S.recap.created(created));
  if (fixes) parts.push(S.recap.fixes(fixes));
  const line = parts.length ? parts.join(' · ') : S.recap.steps(steps.length);
  return line.charAt(0).toUpperCase() + line.slice(1);
}
