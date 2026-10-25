// Whether the open folder is trusted (like VS Code's workspace trust): in a trusted folder the agent saves its
// changes without asking one by one. Asked each time a project opens, created or existing. The answer comes
// from a native dialog in the main process (electron/trust.js), which keeps the list; this model only mirrors
// it for the menu. The browser demo writes nothing, so there is nothing to trust (`available: false`).
import { Observable } from '../core/observable.js';

export class TrustModel {
  #workspace;

  store = new Observable({ available: false, trusted: false });

  constructor({ workspace, projectModel }) {
    this.#workspace = workspace;
    let session = projectModel.store.state.session;
    projectModel.store.subscribe(({ open, session: now }) => {
      if (!open) return this.store.set({ available: false, trusted: false });
      if (now === session) return;
      session = now;
      this.ask();
    });
  }

  // Asks the person (main skips the dialog when the folder is already trusted)
  async ask() {
    if (!this.#workspace.isDesktop) return;
    const response = await this.#workspace.trust(true);
    if (response.ok) this.store.set({ available: true, trusted: Boolean(response.data) });
  }

  async revoke() {
    const response = await this.#workspace.untrust();
    if (response.ok) this.store.set({ trusted: false });
  }
}
