// Screen state of the chat's text box while the person writes: hints about what is missing, completions
// (files after "@" or as their name is typed) and "Mejorar mi mensaje", which turns the message into a test-first
// spec (promptSpec.js) — written by the connected agent (agent/voice.json -> refine, its own session so
// the chat conversation is untouched) or, without one, made here. The previous text can be restored.
import { Observable } from '../core/observable.js';
import { analyzePrompt, completions, applyCompletion } from '../models/promptAssist.js';
import { parseSpec, localSpec, specToPrompt } from '../models/promptSpec.js';

export class ComposerViewModel {
  store = new Observable({ draft: '', hints: [], completions: [], active: 0, improving: false, previous: null, notice: null });
  #connection;
  #projectModel;
  #modeModel;

  constructor({ connection = null, projectModel, modeModel = null }) {
    this.#connection = connection;
    this.#projectModel = projectModel;
    this.#modeModel = modeModel;
  }

  get #tree() { return this.#projectModel?.store.state.tree ?? []; }
  get #mode() { return this.#modeModel?.tech ? 'dev' : 'vibe'; }

  // Every keystroke (typing clears the "undo" offer once the text moves on)
  setDraft(draft) {
    const text = String(draft ?? '');
    const { previous, notice } = this.store.state;
    const kept = text === this.store.state.draft ? { previous, notice } : { previous: null, notice: null };
    const list = completions(text, this.#tree);
    // While a file is being completed, "which file?" would only repeat what the list offers
    const hints = analyzePrompt(text, this.#tree).filter((h) => !(list.length && h.kind === 'noTarget'));
    this.store.set({ draft: text, hints, completions: list, active: 0, ...kept });
  }

  // Arrow keys move the highlighted completion
  move(step) {
    const { completions: list, active } = this.store.state;
    if (list.length) this.store.set({ active: (active + step + list.length) % list.length });
  }

  accept(index = this.store.state.active) {
    const item = this.store.state.completions[index];
    if (!item) return false;
    this.setDraft(applyCompletion(this.store.state.draft, item));
    this.store.set({ completions: [] }); // a chosen completion closes the list until the next keystroke
    return true;
  }

  // A hint with a file ("¿Te refieres a login.js?") adds it to the message
  addPath(path) {
    const draft = this.store.state.draft.replace(/\s*$/, ' ');
    this.setDraft(`${draft}\`${path}\` `);
  }

  dismiss() { this.store.set({ completions: [] }); }

  async improve() {
    const draft = this.store.state.draft.trim();
    if (!draft) return this.store.set({ notice: 'empty' });
    if (this.store.state.improving) return;
    this.store.set({ improving: true, completions: [], notice: null });
    let spec = null;
    if (this.#connection?.live) {
      const { text, error } = await this.#connection.ask(draft, '', { session: 'refine', voice: { mode: this.#mode, purpose: 'refine' } });
      if (!error) spec = parseSpec(text);
    }
    const notice = spec ? 'agent' : 'local';
    spec ??= localSpec(draft, { tree: this.#tree });
    const original = this.store.state.draft;
    this.setDraft(specToPrompt(spec, this.#mode));
    this.store.set({ improving: false, previous: original, notice, hints: [] });
  }

  undo() {
    const { previous } = this.store.state;
    if (previous == null) return;
    this.setDraft(previous);
    this.store.set({ previous: null, notice: null });
  }

  // After sending: an empty box again
  clear() { this.setDraft(''); this.store.set({ completions: [] }); }
}
