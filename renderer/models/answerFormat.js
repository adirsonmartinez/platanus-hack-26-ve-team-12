// What a chat answer carries besides its Markdown (the format is taught to the agent in agent/voice.json):
// a ```sugerencias block at the end with the next steps the person can click.
//   - una pregunta          -> { kind: 'ask', text }            (sent as a message)
//   - reparar: ruta         -> { kind: 'repair', path, text }   (Qubi + the agent repair it)
//   - auditar: ruta         -> { kind: 'audit', path, text }    (the agent checks whether the risk is real)
//   - ver: ruta / mapa: ruta -> { kind: 'locate', path, text }  (shows it on the map)
//   - abrir: ruta           -> { kind: 'open', path, text }     (opens its card in the chat; a page can open in the browser)
// Pure: used by the chat view model (chips) and the chat view (to hide the block while it streams).

const FENCE = /```\s*sugerencias[^\n]*\n?([\s\S]*?)(?:```|$)/i;
const ACTION = /^(reparar|auditar|ver|mapa|abrir)\s*:\s*(.+)$/i;
const KINDS = { reparar: 'repair', auditar: 'audit', ver: 'locate', mapa: 'locate', abrir: 'open' };
// A project path: relative, no "..", no quotes or brackets
export const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[\w@.\-/ ]{1,200}$/;
const MAX_SUGGESTIONS = 4;

const unwrap = (text) => text.trim().replace(/^[`*"']+|[`*"']+$/g, '').trim();

function parseSuggestion(line) {
  const action = ACTION.exec(line);
  if (action) {
    const path = unwrap(action[2]).replace(/\/+$/, '');
    if (SAFE_PATH.test(path)) return { kind: KINDS[action[1].toLowerCase()], path, text: line };
  }
  return { kind: 'ask', text: unwrap(line) };
}

export function splitAnswer(text) {
  const source = String(text ?? '');
  const match = FENCE.exec(source);
  if (!match) return { body: source, suggestions: [] };
  const body = (source.slice(0, match.index) + source.slice(match.index + match[0].length)).trim();
  const suggestions = match[1].split('\n')
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(Boolean)
    .slice(0, MAX_SUGGESTIONS)
    .map(parseSuggestion)
    .filter((s) => s.text);
  return { body, suggestions };
}
