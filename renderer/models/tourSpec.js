// The words of the tour ("Recorrido"). The stops come from the analyzer (projectAnalyzer.js); this
// module gives each one a title, a sentence and the robot's bubble:
//   scriptedTour  written here from the facts (no agent, or what the agent left out)
//   parseTour     the agent's answer (agent/voice.json -> tour), kept only where it matches the facts:
//                 known stop ids, real non-secret paths, plain short text
//   mergeTour     agent text where valid, script elsewhere. The architecture, the stops and their order
//                 never come from the agent ("el LLM propone, el plano decide").
// Pure.
import { strings } from '../i18n/es.js';
import { baseName } from './fileTree.js';
import { isSecretFile } from './fileOpen.js';
import { folderGuide } from './folderTags.js';

const T = strings.tour;
const S = T.script;
const MAX = { title: 60, say: 240, bubble: 70, ask: 120, summary: 240 };
const MAX_FLOW = 4;
const PART_TAGS = ['ui', 'scene3d', 'logic', 'agent', 'desktop', 'server', 'data'];

/**
 * @typedef {{ id: string, kind: string, target: string|null, role?: string, title: string, say: string,
 *   bubble: string, flow?: string[], open?: string|null, folder?: string|null, ask?: string }} TourStep
 * @typedef {{ source: 'agent'|'script', agent?: string, architecture: { kind: string, confidence: string },
 *   summary: string, steps: TourStep[] }} Tour
 */

// Plain, short text: no HTML, Markdown marks or links (the card shows it as text)
export const plain = (value, max) => (typeof value === 'string'
  ? value.replace(/<[^>]*>/g, ' ').replace(/(?:https?:\/\/|www\.)\S+/gi, ' ').replace(/[*_`#>~|[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, max).trim()
  : '');

const quote = (list) => list.map((x) => `«${x}»`).join(' y ');
const partTag = (tags = []) => tags.find((t) => PART_TAGS.includes(t)) ?? 'other';

// What the agent receives: the facts (no file contents, no secrets, no commands) and the stops
export function factsForAgent(facts, slots) {
  return {
    architecture: { kind: facts.architecture.kind, confidence: facts.architecture.confidence, evidence: facts.architecture.evidence.map((e) => e.key) },
    stack: facts.stack,
    units: facts.units.map(({ path, kind }) => ({ path, kind })),
    docs: facts.docs.map(({ path, kind, title, headings }) => ({ path, kind, title, headings })),
    entries: facts.entries,
    layers: facts.layers.map(({ path, tags }) => ({ path, tags })),
    tests: facts.tests,
    scripts: Object.keys(facts.scripts),
    infra: facts.infra,
    useCases: facts.useCases,
    stops: slots.map(({ id, kind, target, role, candidates }) => ({ id, kind, target, ...(role ? { role } : {}), ...(candidates ? { candidates } : {}) })),
  };
}

/** @returns {Tour} */
export function scriptedTour(facts, slots, mode = 'vibe') {
  const dev = mode === 'dev' || mode === 'tech';
  const kind = facts.empty ? 'empty' : facts.architecture.kind;
  const readme = facts.docs.find((d) => d.kind === 'readme');
  const entry = facts.entries[0];
  const firstPart = slots.find((s) => s.role === 'part')?.target ?? null;
  const context = {
    count: facts.units.length,
    units: facts.units.map((u) => baseName(u.path)).join(', '),
    manager: facts.stack.packageManager,
    stack: (facts.stack.frameworks.length ? facts.stack.frameworks : facts.stack.languages).slice(0, 3).join(', '),
    run: facts.scripts.dev ?? facts.scripts.start ?? '',
  };
  let caseIndex = 0;
  const steps = slots.map((slot) => {
    const base = { id: slot.id, kind: slot.kind, target: slot.target, ...(slot.role ? { role: slot.role } : {}) };
    switch (slot.kind) {
      case 'place':
        return { ...base, title: S.place.title, say: S.place[dev ? 'dev' : 'vibe'][kind](context), bubble: S.place.bubble };
      case 'doc': {
        const doc = facts.docs.find((d) => d.path === slot.target);
        if (doc?.kind === 'readme') return { ...base, title: S.readme.title, say: S.readme.say({ sections: quote(doc.headings.slice(0, 2)) }), bubble: S.readme.bubble };
        return { ...base, title: S.guide.title({ name: doc?.title ?? baseName(slot.target) }), say: S.guide.say(), bubble: S.guide.bubble };
      }
      case 'folder': {
        if (slot.role === 'tests') return { ...base, title: S.tests.title, say: S.tests.say({ count: facts.tests.count, runner: facts.tests.runner }), bubble: S.tests.bubble };
        const unit = facts.units.find((u) => u.path === slot.target);
        const layer = facts.layers.find((l) => l.path === slot.target);
        const guide = unit ? folderGuide(unit.path, []) : layer ?? folderGuide(slot.target, []);
        const tags = unit?.tags ?? guide.tags;
        const name = dev || unit ? baseName(slot.target) : strings.describeFolder(guide, slot.target).name;
        const what = T.parts[partTag(tags)];
        const unitKind = unit ? T.unitKinds[unit.kind] : '';
        const say = dev ? S.part.dev({ what, path: slot.target, kind: unitKind }) : `${unitKind ? `Es una ${unitKind}. ` : ''}${S.part.vibe({ what })}`;
        const label = [unitKind && `${unitKind[0].toUpperCase()}${unitKind.slice(1)}`, strings.tags[partTag(tags)]].filter(Boolean).join(' · ') || name;
        return { ...base, title: S.part.title({ name }), say, bubble: S.part.bubble({ label }) };
      }
      case 'file':
        return {
          ...base, title: S.entry.title, bubble: S.entry.bubble,
          say: dev ? S.entry.dev({ path: slot.target, why: S.entry.why[entry?.why] }) : S.entry.vibe({ name: baseName(slot.target) }),
        };
      case 'usecase': {
        const uc = facts.useCases[caseIndex++] ?? facts.useCases[0];
        return {
          ...base, target: uc.path, flow: [uc.path], title: S.usecase.title({ label: uc.label }), bubble: S.usecase.bubble({ label: uc.label }),
          say: S.usecase.say({ label: uc.label, from: uc.from, path: dev ? uc.path : baseName(uc.path) }),
        };
      }
      case 'start':
      default:
        if (facts.empty) return { ...base, title: S.start.title, say: S.emptyStart, bubble: S.start.bubble, open: null, folder: null, ask: '' };
        return {
          ...base, title: S.start.title, bubble: S.start.bubble,
          say: S.start.say({ doc: readme && baseName(readme.path), entry: entry && baseName(entry.path) }),
          open: readme?.path ?? entry?.path ?? null,
          folder: firstPart,
          ask: T.askPrompt(firstPart ? baseName(firstPart) : baseName(readme?.path ?? 'README.md')),
        };
    }
  });
  return { source: 'script', architecture: { kind: facts.architecture.kind, confidence: facts.architecture.confidence }, summary: steps[0].say, steps };
}

const realFile = (facts, path) => typeof path === 'string' && facts.paths.has(path) && !isSecretFile(path);

// The agent's answer -> the parts of it that match the facts, or null (then the script is used)
export function parseTour(answer, facts, slots) {
  const source = String(answer ?? '');
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(source)?.[1];
  let raw;
  try {
    raw = JSON.parse(fenced ?? source.slice(source.indexOf('{'), source.lastIndexOf('}') + 1));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const textStops = new Set(slots.filter((s) => s.kind !== 'usecase' && s.kind !== 'start').map((s) => s.id));
  const steps = {};
  for (const [id, value] of Object.entries(raw.steps ?? {})) {
    if (!textStops.has(id)) continue;
    const say = plain(value?.say, MAX.say);
    if (say) steps[id] = { title: plain(value?.title, MAX.title), say, bubble: plain(value?.bubble, MAX.bubble) };
  }
  const caseSlots = slots.filter((s) => s.kind === 'usecase').length;
  const seen = new Set();
  const usecases = (Array.isArray(raw.usecases) ? raw.usecases : []).map((u) => {
    const uc = facts.useCases.find((c) => c.id === u?.candidate);
    if (!uc || seen.has(uc.id)) return null;
    const say = plain(u.say, MAX.say);
    if (!say) return null;
    seen.add(uc.id);
    const flow = (Array.isArray(u.flow) ? u.flow : []).filter((p) => realFile(facts, p)).slice(0, MAX_FLOW);
    return { candidate: uc.id, path: uc.path, label: uc.label, title: plain(u.title, MAX.title), say, flow: flow.length ? flow : [uc.path] };
  }).filter(Boolean).slice(0, caseSlots);
  const startSay = plain(raw.start?.say, MAX.say);
  const start = {
    say: startSay,
    open: realFile(facts, raw.start?.open) ? raw.start.open : null,
    folder: typeof raw.start?.folder === 'string' && facts.dirs.has(raw.start.folder) && !isSecretFile(raw.start.folder) ? raw.start.folder : null,
    ask: plain(raw.start?.ask, MAX.ask),
  };
  const skippable = new Set(slots.filter((s) => ['folder', 'file', 'doc'].includes(s.kind)).map((s) => s.id));
  const skip = (Array.isArray(raw.skip) ? raw.skip : []).filter((id) => skippable.has(id));
  const valid = Object.keys(steps).length + usecases.length + (startSay ? 1 : 0);
  if (valid * 2 < slots.length) return null;
  return { summary: plain(raw.summary, MAX.summary), steps, usecases, start, skip };
}

/** @returns {Tour} */
export function mergeTour(scripted, agentTour, { agent = '' } = {}) {
  if (!agentTour) return scripted;
  let caseIndex = 0;
  const steps = scripted.steps.filter((s) => !agentTour.skip.includes(s.id)).map((s) => {
    if (s.kind === 'usecase') {
      const u = agentTour.usecases[caseIndex++];
      if (!u) return s;
      const label = u.title.replace(/^caso de uso:\s*/i, '');
      return { ...s, target: u.path, flow: u.flow, title: u.title || s.title, say: u.say, bubble: label ? plain(S.usecase.bubble({ label }), MAX.bubble) : s.bubble };
    }
    if (s.kind === 'start') {
      const a = agentTour.start;
      return { ...s, say: a.say || s.say, open: a.open ?? s.open, folder: a.folder ?? s.folder, ask: a.ask || s.ask };
    }
    const a = agentTour.steps[s.id];
    return a ? { ...s, title: a.title || s.title, say: a.say, bubble: a.bubble || s.bubble } : s;
  });
  return { ...scripted, source: 'agent', agent, summary: agentTour.summary || scripted.summary, steps };
}
