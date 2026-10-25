// Agent permissions: which changes of the agent the person approves one by one (rules in
// electron/approval.js). 'manual' asks for every change, 'auto' only for risky ones, 'bypass' for none.
// init() always tells the main process the mode (a reload must not leave 'bypass' on there). 'bypass' is never
// remembered and the main process asks the person to confirm it each time.
import { Observable } from '../core/observable.js';

export const APPROVAL_MODES = ['manual', 'auto', 'bypass'];
const KEY = 'platanus.approval.v1';
const load = () => {
  try { return localStorage.getItem(KEY) === 'auto' ? 'auto' : 'manual'; } catch { return 'manual'; }
};

export class ApprovalModel {
  store = new Observable({ mode: 'manual' });
  #service;

  constructor(service) {
    this.#service = service;
  }

  async init() {
    await this.set(load());
  }

  async set(mode) {
    if (!APPROVAL_MODES.includes(mode)) return;
    const result = await this.#service.setApproval(mode);
    if (!result?.ok) {
      if (APPROVAL_MODES.includes(result?.data)) this.store.set({ mode: result.data });
      return;
    }
    this.store.set({ mode: result.data });
    try { localStorage.setItem(KEY, result.data === 'auto' ? 'auto' : 'manual'); } catch { /* private mode */ }
  }
}
