// Security traffic light per file: green (safe), yellow (review), red (risk), grey (not evaluated).
// The audit decides (applyAudit); the demo rules by file name only stand in until it arrives.
import { Observable } from '../core/observable.js';
import { baseName } from './fileTree.js';
import { strings } from '../i18n/es.js';

export const LEVELS = ['green', 'yellow', 'red', 'grey'];
export const LEVEL_RANK = { grey: 0, green: 1, yellow: 2, red: 3 };

export const worstLevel = (levels) => levels.reduce((worst, l) => (LEVEL_RANK[l] > LEVEL_RANK[worst] ? l : worst), 'grey');

// Returns { level, reasonKey }. reasonKey maps to strings.security.reasons.
export function demoScore(path) {
  const name = baseName(path).toLowerCase();
  if (/^\.env\.(example|sample|template)$/.test(name)) return { level: 'yellow', reasonKey: 'envTemplate' };
  if (/^\.env(\..+)?$/.test(name)) return { level: 'red', reasonKey: 'envFile' };
  if (/\.(pem|key|p12|pfx|keystore|jks)$/.test(name) || /^id_(rsa|ed25519|ecdsa)/.test(name)) return { level: 'red', reasonKey: 'privateKey' };
  if (/(secret|credential|password|passwd|private[-_]?key|service[-_]?account)/.test(name)) return { level: 'red', reasonKey: 'secretName' };
  if (/\.sql$/.test(name)) return { level: 'yellow', reasonKey: 'sql' };
  if (/(auth|login|session|token|jwt|middleware|crypto)/.test(name)) return { level: 'yellow', reasonKey: 'sensitiveLogic' };
  if (/^(dockerfile|docker-compose.*|vercel\.json|netlify\.toml|firebase\.json|config\.toml|\.npmrc)$/.test(name) ||
      /(\.config\.(js|cjs|mjs|ts)|\.ya?ml)$/.test(name) || /^(config|settings)\./.test(name)) {
    return { level: 'yellow', reasonKey: 'config' };
  }
  return { level: 'green', reasonKey: 'clean' };
}

// With an audit (electron/securityAudit.js, applyAudit) the lights come from what each file says, for the
// whole project; without one (the web version, before the first audit) from the demo rules by name.
// An agent (platanus_set_file_score) may only raise a light over the audit, never lower it: only the
// audit, run again after a change, turns a file green ("el LLM propone, el plano decide").
export class SecurityModel {
  #agentScores = new Map(); // path -> { level, reason, by }
  #audit = null; // { at, files: { path: { level, findings, accepted? } }, counts, score, history, truncated }

  // `version` changes every time a score changes, so view models know when to recompute.
  // audited: the lights come from the audit; score / counts / history / at: the whole project's
  store = new Observable({ version: 0, audited: false, score: null, counts: null, history: [], at: null });

  get audited() { return Boolean(this.#audit); }

  // The whole project's audit (main's security:audit / security:check); null clears it (a project closes)
  applyAudit(audit) {
    this.#audit = audit && typeof audit === 'object' && audit.files ? audit : null;
    if (this.#audit) this.#agentScores = new Map([...this.#agentScores].filter(([, o]) => o.by === 'agent'));
    else this.#agentScores.clear();
    const a = this.#audit;
    this.store.set({ version: this.store.state.version + 1, audited: Boolean(a), score: a?.score ?? null, counts: a?.counts ?? null, history: a?.history ?? [], at: a?.at ?? null });
  }

  // The audit's findings for a file: [{ rule, level, line }]
  findingsOf(path) {
    return this.#audit?.files?.[path]?.findings ?? [];
  }

  // { level, reason?, reasonKey?, by: 'audit' | 'accepted' | 'agent' | 'qubi' | 'demo', findings? }.
  // reasonKey is the rule (the audit's first finding, or the demo rule), so the detail is kept.
  scoreOf(path) {
    const override = this.#agentScores.get(path);
    if (!this.#audit) {
      const demo = demoScore(path);
      if (override) return { reasonKey: demo.reasonKey, ...override };
      return { ...demo, by: 'demo' };
    }
    const file = this.#audit.files?.[path];
    const findings = file?.findings ?? [];
    const level = file?.level ?? 'green';
    const base = {
      level, findings, reasonKey: findings[0]?.rule ?? 'clean', reason: describeFindings(findings, Boolean(file?.accepted)),
      by: file?.accepted ? 'accepted' : 'audit', ...(file?.accepted ? { accepted: true } : {}),
    };
    if (override?.by === 'agent' && LEVEL_RANK[override.level] > LEVEL_RANK[level]) return { ...base, level: override.level, reason: override.reason, by: 'agent' };
    return base;
  }

  setScore(path, level, reason = '', by = 'agent') {
    if (!path || !LEVELS.includes(level)) return false;
    this.#agentScores.set(path, { level, reason, by });
    this.store.set({ version: this.store.state.version + 1 });
    return true;
  }
}

// "Línea 12: …" for the first finding, and how many more there are
export function describeFindings(findings, accepted = false) {
  if (accepted) return strings.security.accepted;
  if (!findings?.length) return '';
  const [first] = findings;
  const text = strings.security.reasons[first.rule] ?? '';
  return strings.security.atLine(first.line, text) + (findings.length > 1 ? strings.security.more(findings.length - 1) : '');
}

// The project's security score (the ring on the map): starts at 100 and every open risk takes points
// off, so each repair moves it (a share of files would barely change in a big project). The same in
// electron/securityStore.js, which keeps its history.
const RED_POINTS = 15;
const YELLOW_POINTS = 5;
export const securityScore = ({ red = 0, yellow = 0 } = {}) => Math.max(0, 100 - red * RED_POINTS - yellow * YELLOW_POINTS);
// The ring's color: the worst light still open
export const scoreLevel = ({ red = 0, yellow = 0 } = {}) => (red ? 'red' : yellow ? 'yellow' : 'green');
