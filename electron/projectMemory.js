// Project memory (docs/features/llamada/FASE2.md, phase 3): when a call with Qubi ends, Qubbot keeps
// a fixed summary of it, made without any model: what was asked, the files made, the audits and what is
// known about the project. The next call starts with it. One private JSON per project in
// userData/memory/<sha256(root) 16>.json. Everything is trimmed and anything that looks like a key is
// replaced by "[oculto]" before it touches the disk. Tested in projectMemory.test.js.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_CALLS = 20; // the newest calls
const MAX_LEARNED = 12; // the newest facts
const TEXT_MAX = 300; // a request, the notes
const PATH_MAX = 200; // a file or folder path
const FACT_MAX = 200; // one learned fact
// What one entry may hold once kept (the newest of each list)
const KEEP = { pedidos: 10, built: 40, audits: 12 };
// What the window may send at all: anything bigger is refused, not trimmed (it is not a real call)
const INPUT_TEXT_MAX = 5000;
const INPUT_LIST_MAX = 100;
const INPUT_FACTS_MAX = 50;
const STATUS = /^[a-z-]{1,20}$/;

// The same key formats the repo's own scan looks for (tests/secrets.test.mjs), global to replace them all
const KEY_PATTERNS = [
  /sk-ant-[A-Za-z0-9_-]{10,}/g,
  /\bsk-(proj-)?[A-Za-z0-9]{32,}/g,
  /\bxai-[A-Za-z0-9]{20,}/g,
  // the underscore family: Stripe secret/restricted keys (Stripe is in the services catalog) and
  // ElevenLabs keys (sk_ + 48, keyStore.js), which a person may say or type in a call request
  /\b[sr]k_(live|test)_[A-Za-z0-9]{10,}/g,
  /\bsk_[A-Za-z0-9]{32,}/g,
  /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bAIza[0-9A-Za-z_-]{30,}/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/g,
  /\bsbp_[a-f0-9]{30,}/g,
  /\beyJhbGciOi[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}(\.[A-Za-z0-9_-]+)?/g,
  // a private key block: the header and everything after it (the body has no fixed shape)
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*/g,
  /\b(api[_-]?key|apikey|secret|token|password|passwd)\s*[:=]\s*["'][A-Za-z0-9/+_.-]{20,}["']/gi,
];
const HIDDEN = '[oculto]';

const hideKeys = (text) => KEY_PATTERNS.reduce((out, re) => out.replace(re, HIDDEN), String(text));

// One line of plain text: no control characters, keys hidden, then trimmed (hiding first, so a key cut
// in half by the trim is never left behind)
const clean = (value, max) => hideKeys(value.replace(/[\r\n\t]+/g, ' ').replace(/\p{Cc}/gu, '')).trim().slice(0, max).trim();

const isText = (value) => typeof value === 'string' && value.length <= INPUT_TEXT_MAX;
const isList = (value) => Array.isArray(value) && value.length <= INPUT_LIST_MAX;
const validDate = (value) => typeof value === 'string' && value.length <= 40 && !Number.isNaN(Date.parse(value));

// An entry from the window -> the entry kept, or null when a field has the wrong type or size.
// Missing lists and notes are empty; a missing or bad date is now.
function cleanEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const { pedidos = [], built = [], audits = [], notes = '', at } = entry;
  if (!isList(pedidos) || !pedidos.every(isText)) return null;
  if (!isList(built) || !built.every(isText)) return null;
  if (!isList(audits) || !audits.every((a) => a && typeof a === 'object' && isText(a.folder) && typeof a.status === 'string' && STATUS.test(a.status))) return null;
  if (!isText(notes)) return null;
  const texts = (list, max, keep) => list.map((s) => clean(s, max)).filter(Boolean).slice(-keep);
  return {
    at: validDate(at) ? at : new Date().toISOString(),
    pedidos: texts(pedidos, TEXT_MAX, KEEP.pedidos),
    built: texts(built, PATH_MAX, KEEP.built),
    audits: audits.map((a) => ({ folder: clean(a.folder, PATH_MAX), status: a.status })).slice(-KEEP.audits),
    notes: clean(notes, TEXT_MAX),
  };
}

// Facts from the window -> cleaned strings, or null when it is not a list of short strings
function cleanFacts(facts) {
  if (!Array.isArray(facts) || facts.length > INPUT_FACTS_MAX || !facts.every(isText)) return null;
  return facts.map((f) => clean(f, FACT_MAX)).filter(Boolean);
}

const EMPTY = () => ({ calls: [], learned: [] });
const sameFact = (a, b) => a.toLowerCase() === b.toLowerCase();

function createProjectMemory({ dir }) {
  const fileFor = (root) => path.join(dir, `${crypto.createHash('sha256').update(String(root)).digest('hex').slice(0, 16)}.json`);

  // The saved memory, checked again on the way in (the file could have been edited by hand)
  function read(root) {
    let saved;
    try {
      saved = JSON.parse(fs.readFileSync(fileFor(root), 'utf8'));
    } catch {
      return EMPTY();
    }
    if (!saved || typeof saved !== 'object') return EMPTY();
    const calls = Array.isArray(saved.calls) ? saved.calls.map(cleanEntry).filter(Boolean).slice(-MAX_CALLS) : [];
    const learned = Array.isArray(saved.learned) ? cleanFacts(saved.learned.filter((f) => isText(f)).slice(-INPUT_FACTS_MAX)) : [];
    return { calls, learned: learned.slice(-MAX_LEARNED) };
  }

  // Written to a temporary file and renamed, so a crash never leaves half a memory; readable only by this user
  function write(root, memory) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const file = fileFor(root);
    const temp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(memory, null, 2), { mode: 0o600 });
    fs.chmodSync(temp, 0o600);
    fs.renameSync(temp, file);
    return memory;
  }

  return {
    fileFor,
    read,
    // -> the memory with this call added (the newest MAX_CALLS), or null when the entry is not valid
    append(root, entry) {
      const call = cleanEntry(entry);
      if (!call) return null;
      const memory = read(root);
      return write(root, { ...memory, calls: [...memory.calls, call].slice(-MAX_CALLS) });
    },
    // -> the memory with these facts (no repeats, the newest MAX_LEARNED), or null when they are not valid
    learn(root, facts) {
      const fresh = cleanFacts(facts);
      if (!fresh) return null;
      const memory = read(root);
      const learned = [...memory.learned];
      for (const fact of fresh) if (!learned.some((known) => sameFact(known, fact))) learned.push(fact);
      return write(root, { ...memory, learned: learned.slice(-MAX_LEARNED) });
    },
    forget(root) {
      fs.rmSync(fileFor(root), { force: true });
    },
  };
}

module.exports = { createProjectMemory, cleanEntry, cleanFacts, hideKeys, MAX_CALLS, MAX_LEARNED };
