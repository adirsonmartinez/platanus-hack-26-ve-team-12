// What the security audit remembers per project (docs/features/seguridad/README.md), in
// userData/security/<sha256(root) 16>.json, readable only by this user:
//   history:  [{ at, score, red, yellow, cause, paths }] how the score moved (newest last, at most 200)
//   accepted: { rel: { hash, at } } yellow findings the person looked at and accepted. They count as
//             green only while the file stays exactly the same (same hash); red ones are never accepted.
// createSecurityService runs the audit (securityAudit.js), applies the acceptances, keeps the last
// result of each project in memory and writes the history. It never stores file contents or keys.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { auditProject, auditFile } = require('./securityAudit');

const MAX_HISTORY = 200;
const CAUSES = ['open', 'audit', 'change', 'repair', 'accept'];
// The score the map shows (renderer/models/securityModel.js securityScore: keep both the same)
const RED_POINTS = 15;
const YELLOW_POINTS = 5;
const scoreOf = ({ red = 0, yellow = 0 }) => Math.max(0, 100 - red * RED_POINTS - yellow * YELLOW_POINTS);

const EMPTY = () => ({ history: [], accepted: {} });
const isText = (v) => typeof v === 'string' && v.length > 0 && v.length < 600;

function createSecurityStore({ dir }) {
  const fileFor = (root) => path.join(dir, `${crypto.createHash('sha256').update(String(root)).digest('hex').slice(0, 16)}.json`);

  // checked again on the way in: the file could have been edited by hand
  function read(root) {
    let saved;
    try { saved = JSON.parse(fs.readFileSync(fileFor(root), 'utf8')); } catch { return EMPTY(); }
    if (!saved || typeof saved !== 'object') return EMPTY();
    const history = (Array.isArray(saved.history) ? saved.history : [])
      .filter((h) => h && isText(h.at) && Number.isFinite(h.score) && CAUSES.includes(h.cause))
      .map((h) => ({ at: h.at, score: h.score, red: h.red | 0, yellow: h.yellow | 0, cause: h.cause, paths: (Array.isArray(h.paths) ? h.paths : []).filter(isText).slice(0, 5) }))
      .slice(-MAX_HISTORY);
    const accepted = {};
    for (const [rel, a] of Object.entries(saved.accepted && typeof saved.accepted === 'object' ? saved.accepted : {})) {
      if (isText(rel) && a && isText(a.hash) && isText(a.at)) accepted[rel] = { hash: a.hash, at: a.at };
    }
    return { history, accepted };
  }

  function write(root, data) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const file = fileFor(root);
    const temp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(data, null, 2), { mode: 0o600 });
    fs.chmodSync(temp, 0o600);
    fs.renameSync(temp, file);
    return data;
  }

  return {
    fileFor,
    read,
    // Adds a point to the history when the score or the counts moved, or when the person asked for an
    // audit or a repair ended (those are worth seeing even if nothing changed)
    record(root, { score, red, yellow, cause, paths = [] }, at = new Date().toISOString()) {
      const data = read(root);
      const last = data.history.at(-1);
      const moved = !last || last.score !== score || last.red !== red || last.yellow !== yellow;
      if (!moved && !['audit', 'repair'].includes(cause)) return data;
      data.history = [...data.history, { at, score, red, yellow, cause, paths: paths.filter(isText).slice(0, 5) }].slice(-MAX_HISTORY);
      return write(root, data);
    },
    accept(root, rel, hash, at = new Date().toISOString()) {
      const data = read(root);
      data.accepted[rel] = { hash, at };
      return write(root, data);
    },
    unaccept(root, rel) {
      const data = read(root);
      delete data.accepted[rel];
      return write(root, data);
    },
  };
}

// The view of one project's audit: files with their light (acceptances applied), counts, score, history
function view(result, data) {
  const files = {};
  const counts = { red: 0, yellow: 0, green: 0, grey: 0 };
  for (const [rel, f] of Object.entries(result.files)) {
    const accepted = f.level === 'yellow' && data.accepted[rel]?.hash === f.hash;
    const level = accepted ? 'green' : f.level;
    counts[level]++;
    files[rel] = { level, findings: f.findings, ...(accepted ? { accepted: true } : {}) };
  }
  return { at: result.at, files, counts, score: scoreOf(counts), truncated: Boolean(result.truncated), history: data.history };
}

function createSecurityService({ store, audit = auditProject, auditOne = auditFile, now = () => new Date().toISOString() }) {
  const last = new Map(); // root -> raw result { at, files, truncated }

  const finish = (root, result, cause, paths) => {
    last.set(root, result);
    const shown = view(result, store.read(root));
    const data = store.record(root, { score: shown.score, red: shown.counts.red, yellow: shown.counts.yellow, cause, paths }, result.at);
    return { ...shown, history: data.history };
  };

  return {
    // The whole project, read again
    async full(root, cause = 'audit') {
      const result = await audit(root);
      return finish(root, { at: now(), files: result.files, truncated: result.truncated }, cause, []);
    },
    // Only these files (they changed on disk); the whole project when it was not audited yet
    async check(root, paths, cause = 'change') {
      const prev = last.get(root);
      if (!prev) return this.full(root, cause === 'change' ? 'open' : cause);
      const files = { ...prev.files };
      const touched = [];
      for (const rel of [...new Set(paths)].slice(0, 200)) {
        const result = await auditOne(root, rel);
        if (result) files[rel] = result; else delete files[rel];
        touched.push(rel);
      }
      return finish(root, { at: now(), files, truncated: prev.truncated }, cause, touched);
    },
    // The person looked at a yellow file and accepts it as it is (only that exact content)
    async accept(root, rel) {
      const current = await auditOne(root, rel);
      if (!current || current.level !== 'yellow') return { ok: false, reason: current?.level === 'red' ? 'red' : 'not-yellow' };
      store.accept(root, rel, current.hash, now());
      return { ok: true, audit: await this.check(root, [rel], 'accept') };
    },
    async unaccept(root, rel) {
      store.unaccept(root, rel);
      return this.check(root, [rel], 'accept');
    },
    // The last result without reading anything (null before the first audit)
    current(root) {
      const result = last.get(root);
      return result ? view(result, store.read(root)) : null;
    },
    forget(root) { last.delete(root); },
  };
}

module.exports = { createSecurityStore, createSecurityService, scoreOf };
