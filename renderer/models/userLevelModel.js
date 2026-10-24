// How much the person knows about programming: 'new' (never coded), 'some' (has touched code) or 'pro'
// (programs). The welcome robot asks once and adapts what it says; then it keeps learning from how the
// person acts and writes, and when the evidence points to another level it suggests the change (never
// applies it on its own). Remembered between sessions, like the Vibe / Dev mode it goes with.
import { Observable } from '../core/observable.js';

export const LEVELS = ['new', 'some', 'pro'];
const KEY = 'platanus.level.v1';
const THRESHOLD = 3; // signals in one direction before suggesting a change; doubles after each "no"

// Words that show a technical person, or a lost one, in a chat message (the agent's prompt has its own
// lists in agent/voice.json; these only move the robot's level)
const TECHNICAL = ['api', 'endpoint', 'deploy', 'backend', 'frontend', 'schema', 'commit', 'branch', 'npm', 'docker',
  'framework', 'react', 'next', 'typescript', 'sql', 'query', 'middleware', 'oauth', 'webhook', 'regex', 'json', 'cli'];
const CONFUSED = ['no entiendo', 'no entendí', 'no entendi', 'qué significa', 'que significa', 'qué es eso', 'que es eso',
  'más simple', 'mas simple', 'me perdí', 'me perdi'];

// +1 technical, -1 lost, 0 nothing to learn
export function textSignal(text) {
  const lower = String(text ?? '').toLowerCase();
  if (CONFUSED.some((p) => lower.includes(p))) return -1;
  const words = lower.split(/[^\p{L}\p{N}]+/u);
  return words.filter((w) => TECHNICAL.includes(w)).length >= 2 ? 1 : 0;
}

const load = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (saved && LEVELS.includes(saved.level)) return { level: saved.level, confirmed: Boolean(saved.confirmed), patience: saved.patience ?? 1 };
  } catch { /* private mode or bad data */ }
  return { level: 'new', confirmed: false, patience: 1 };
};

export class UserLevelModel {
  // score: signals since the last change (+ up, - down); patience: how many thresholds a suggestion needs
  store = new Observable({ ...load(), score: 0, suggestion: null });

  // The person chose it (robot question, level chip or accepting a suggestion)
  set(level) {
    if (!LEVELS.includes(level)) return;
    this.store.set({ level, confirmed: true, score: 0, suggestion: null });
    this.#save();
  }

  // One piece of evidence: +1 looks more technical, -1 looks lost
  signal(delta) {
    const { level, score, patience, suggestion } = this.store.state;
    if (suggestion || !delta) return;
    const next = score + Math.sign(delta);
    const target = LEVELS[LEVELS.indexOf(level) + Math.sign(next)];
    if (!target) return; // nothing below beginner or above developer
    const due = Math.abs(next) >= THRESHOLD * patience;
    this.store.set({ score: due ? 0 : next, suggestion: due ? target : null });
  }

  learnFromText(text) {
    this.signal(textSignal(text));
  }

  accept() {
    const { suggestion } = this.store.state;
    if (suggestion) this.set(suggestion);
  }

  decline() {
    this.store.set({ suggestion: null, score: 0, patience: this.store.state.patience * 2 });
    this.#save();
  }

  // The app's Vibe / Dev switch: Dev means a programmer; Vibe brings a programmer down to "some"
  followMode(mode) {
    const { level } = this.store.state;
    if (mode === 'tech' && level !== 'pro') this.set('pro');
    if (mode === 'vibe' && level === 'pro') this.set('some');
  }

  #save() {
    const { level, confirmed, patience } = this.store.state;
    try { localStorage.setItem(KEY, JSON.stringify({ level, confirmed, patience })); } catch { /* private mode */ }
  }
}
