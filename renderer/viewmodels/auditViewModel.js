// The security audit, seen from the window (docs/features/seguridad/README.md). It runs the fixed rules of
// main (securityService) when a project opens, when files change on disk, when the person (or Qubi) asks,
// and after a repair, and hands the result to the securityModel, which colors the map. Runs go one after
// another; a run of a project that is no longer open is dropped.
//   store: { status: 'idle' | 'auditing' | 'error', last: null | { cause, before, after, fixed, worse, at } }
//   last: what the latest audit the person asked for changed since the one before (fixed / worse: paths)
import { Observable } from '../core/observable.js';
import { EVENTS } from '../core/eventBus.js';
import { LEVEL_RANK } from '../models/securityModel.js';

const levelsOf = (audit) => Object.fromEntries(Object.entries(audit?.files ?? {}).map(([path, f]) => [path, f.level]));
const risky = (level) => level === 'red' || level === 'yellow';

export class AuditViewModel {
  #security;
  #service;
  #bus;
  #session = 0;
  #chain = Promise.resolve();
  #audit = null; // the last result applied

  store = new Observable({ status: 'idle', last: null });

  constructor({ securityModel, service, bus = null }) {
    this.#security = securityModel;
    this.#service = service;
    this.#bus = bus;
  }

  get available() { return Boolean(this.#service?.available); }

  // A project opened: the whole project, read again (the lights of last time are not trusted)
  open() {
    this.#session++;
    this.#audit = null;
    this.#security.applyAudit(null);
    this.store.set({ status: 'idle', last: null });
    return this.#queue(() => this.#service.audit('open'), 'open');
  }

  close() {
    this.#session++;
    this.#audit = null;
    this.#security.applyAudit(null);
    this.store.set({ status: 'idle', last: null });
  }

  // The person or Qubi asks: everything again ('audit'), or after a repair ('repair')
  auditNow(cause = 'audit') {
    return this.#queue(() => this.#service.audit(cause), cause);
  }

  // Files that changed on disk (or a repair's files)
  check(paths, cause = 'change') {
    const list = [...new Set((paths ?? []).filter((p) => typeof p === 'string' && p))];
    if (!list.length) return Promise.resolve(this.#audit);
    return this.#queue(() => this.#service.check(list, cause), cause);
  }

  // A yellow file the person reviewed: it counts as fine while it stays the same. -> { ok, reason? }
  async accept(path) {
    if (!this.available) return { ok: false, reason: 'unavailable' };
    const session = this.#session;
    const res = await this.#service.accept(path);
    if (!res?.ok || !res.data?.ok) return { ok: false, reason: res?.data?.reason ?? 'failed' };
    if (session === this.#session) this.#apply(res.data.audit, 'accept');
    return { ok: true };
  }

  async unaccept(path) {
    if (!this.available) return { ok: false };
    const session = this.#session;
    const res = await this.#service.unaccept(path);
    if (res?.ok && session === this.#session) this.#apply(res.data, 'accept');
    return { ok: Boolean(res?.ok) };
  }

  // -> the audit applied, or null (no service, failed, or another project opened meanwhile)
  #queue(run, cause) {
    if (!this.available) return Promise.resolve(null);
    const session = this.#session;
    const next = this.#chain.then(async () => {
      if (session !== this.#session) return null;
      this.store.set({ status: 'auditing' });
      let res;
      try { res = await run(); } catch { res = null; }
      if (session !== this.#session) return null;
      if (!res?.ok) { this.store.set({ status: 'error' }); return null; }
      this.#apply(res.data, cause);
      this.store.set({ status: 'idle' });
      return res.data;
    });
    this.#chain = next.catch(() => null);
    return next;
  }

  #apply(audit, cause) {
    const before = this.#audit;
    this.#audit = audit;
    this.#security.applyAudit(audit);
    // what an audit the person (or Qubi) asked for changed, for the chat and for Qubi. A repair judges its
    // own file (repairViewModel): files that changed on disk meanwhile were already checked one by one
    if (cause !== 'audit') return;
    const was = levelsOf(before);
    const now = levelsOf(audit);
    const fixed = Object.keys(was).filter((p) => risky(was[p]) && !risky(now[p] ?? 'green'));
    const worse = Object.keys(now).filter((p) => LEVEL_RANK[now[p]] > LEVEL_RANK[was[p] ?? 'green'] && risky(now[p]));
    const last = { cause, before: before?.score ?? null, after: audit.score, fixed, worse, at: audit.at };
    this.store.set({ last });
    this.#bus?.emit(EVENTS.auditFinished, last);
  }
}
