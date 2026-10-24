// The chat agent's voice: builds its system prompt from agent/voice.json (base rules, answer format,
// Vibe/Dev settings, adaptation hints) and the mode's skill (agent/skills/<name>/SKILL.md).
// Pure except loadVoice (reads the files). Tested in agentVoice.test.js.
//
// The person's recent messages are only *matched* against the config to pick hints ("writes short",
// "uses technical words"…); their words are never copied into the prompt.
const fs = require('node:fs');
const path = require('node:path');

const MODES = ['vibe', 'dev'];
const MAX_RECENT = 12;
const MAX_TEXT = 2000;

const stripFrontmatter = (text) => text.replace(/^---\r?\n[\s\S]*?\r?\n---(\r?\n)*/, '').trim(); // CRLF: Windows checkouts

function loadVoice(dir) {
  const config = JSON.parse(fs.readFileSync(path.join(dir, 'voice.json'), 'utf8'));
  const skills = {};
  for (const mode of MODES) {
    const name = config.modes?.[mode]?.skill;
    skills[mode] = name ? stripFrontmatter(fs.readFileSync(path.join(dir, 'skills', name, 'SKILL.md'), 'utf8')) : '';
  }
  return { config, skills };
}

const cleanRecent = (recent) =>
  (Array.isArray(recent) ? recent : []).filter((t) => typeof t === 'string').slice(-MAX_RECENT).map((t) => t.slice(0, MAX_TEXT));

const wordsOf = (text) => text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const EMOJI = /\p{Extended_Pictographic}/u;

// Which adaptation hints apply to these messages (texts from the config, in config order)
function styleHints(recent, adapt) {
  const texts = cleanRecent(recent).slice(-(adapt?.historyMessages ?? 6));
  if (!adapt || !texts.length) return [];
  const all = texts.join('\n').toLowerCase();
  const average = texts.reduce((n, t) => n + wordsOf(t).length, 0) / texts.length;
  const words = wordsOf(all);
  const technical = new Set(adapt.technical?.words ?? []);
  const hints = [];
  if (adapt.short && average <= adapt.short.maxAverageWords) hints.push(adapt.short.hint);
  if (adapt.long && average >= adapt.long.minAverageWords) hints.push(adapt.long.hint);
  if (adapt.technical && words.filter((w) => technical.has(w)).length >= adapt.technical.minHits) hints.push(adapt.technical.hint);
  if (adapt.confused?.words.some((w) => all.includes(w))) hints.push(adapt.confused.hint);
  if (adapt.formal?.words.some((w) => all.includes(w))) hints.push(adapt.formal.hint);
  if (adapt.emoji && EMOJI.test(all)) hints.push(adapt.emoji.hint);
  return hints;
}

const fill = (text, values) => text.replace(/\{(\w+)\}/g, (m, k) => (k in values ? String(values[k]) : m));

// task: replaces the base rules (e.g. a repair's instructions); the voice, format and hints stay
function composePrompt({ config, skills }, { mode, recent, task } = {}) {
  const m = MODES.includes(mode) ? mode : (config.defaultMode ?? 'vibe');
  const settings = config.modes?.[m] ?? {};
  const hints = styleHints(recent, config.adapt);
  return [
    typeof task === 'string' && task.trim() ? task.trim() : config.base.join('\n'),
    skills[m],
    fill(config.format.join('\n'), settings),
    settings.maxWords ? fill(config.lengthRule, settings) : '',
    hints.length ? [config.adapt.intro, ...hints.map((h) => `- ${h}`)].join('\n') : '',
  ].filter(Boolean).join('\n\n');
}

// "Mejorar mi mensaje": only the refine rules and the mode's line (the answer is JSON, not a chat reply)
function composeRefinePrompt({ config }, { mode } = {}) {
  const m = MODES.includes(mode) ? mode : (config.defaultMode ?? 'vibe');
  return [config.refine.base.join('\n'), config.refine.modes[m]].filter(Boolean).join('\n\n');
}

// "Recorrido": the tour rules and the mode's line (the answer is JSON that narrates the analyzer's facts)
function composeTourPrompt({ config }, { mode } = {}) {
  const m = MODES.includes(mode) ? mode : (config.defaultMode ?? 'vibe');
  return [config.tour.base.join('\n'), config.tour.modes[m]].filter(Boolean).join('\n\n');
}

module.exports = { loadVoice, composePrompt, composeRefinePrompt, composeTourPrompt, styleHints, MODES };
