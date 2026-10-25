// File operations limited to one working folder (the "workspace").
// Everything that touches the disk goes through here: nothing can escape the chosen folder.

const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const t = require('./strings');

// Folders that are neither listed nor watched (heavy or irrelevant for the map)
const IGNORED = new Set(['node_modules', '.git', '.DS_Store', 'dist', '.next']);
const WATCH_DEBOUNCE_MS = 120;

class Workspace {
  constructor() {
    this.root = null;
    this.watcher = null;
  }

  async open(dir) {
    this.root = await fs.realpath(dir);
    return this.root;
  }

  // No folder open: every operation (and every agent tool) is refused until one is opened again
  close() {
    this.unwatch();
    this.root = null;
  }

  // Turns a workspace-relative path into an absolute one and checks it does not escape
  // (via "../", absolute paths or symlinks pointing outside).
  async resolve(rel = '.') {
    if (!this.root) throw new Error(t.noWorkspace);
    if (typeof rel !== 'string') throw new Error(t.invalidPath);
    const abs = path.resolve(this.root, rel);
    if (!isInside(this.root, abs)) throw new Error(t.outsideWorkspace(rel));

    // If part of the path already exists, its real location must be inside too
    let probe = abs;
    while (!fsSync.existsSync(probe)) probe = path.dirname(probe);
    const real = await fs.realpath(probe);
    if (!isInside(this.root, real)) throw new Error(t.linkOutsideWorkspace(rel));
    return abs;
  }

  relative(abs) {
    return path.relative(this.root, abs).split(path.sep).join('/');
  }

  // Tree of files and folders (without the ignored ones)
  async tree(rel = '.', depth = 6) {
    const abs = await this.resolve(rel);
    const walk = async (dir, level) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const out = [];
      for (const entry of entries) {
        if (IGNORED.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          out.push({ type: 'dir', path: this.relative(full), children: level < depth ? await walk(full, level + 1) : [] });
        } else if (entry.isFile()) {
          const { size } = await fs.stat(full);
          out.push({ type: 'file', path: this.relative(full), size });
        }
      }
      return out;
    };
    return walk(abs, 0);
  }

  async mkdir(rel) {
    await fs.mkdir(await this.resolve(rel), { recursive: true });
  }

  async readFile(rel) {
    return fs.readFile(await this.resolve(rel), 'utf8');
  }

  async exists(rel) {
    try { await fs.access(await this.resolve(rel)); return true; } catch { return false; }
  }

  async writeFile(rel, content) {
    const abs = await this.resolve(rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, String(content ?? ''), 'utf8');
  }

  async remove(rel) {
    const abs = await this.resolve(rel);
    if (abs === this.root) throw new Error(t.cannotDeleteRoot);
    await fs.rm(abs, { recursive: true });
  }

  // Reports disk changes, grouping bursts so the map is not flooded
  watch(onChange) {
    this.unwatch();
    let pending = new Set();
    let timer = null;
    this.watcher = fsSync.watch(this.root, { recursive: true }, (_event, file) => {
      if (!file) return;
      const rel = file.split(path.sep).join('/');
      if (rel.split('/').some((part) => IGNORED.has(part))) return;
      pending.add(rel);
      clearTimeout(timer);
      timer = setTimeout(() => {
        const paths = [...pending];
        pending = new Set();
        onChange(paths);
      }, WATCH_DEBOUNCE_MS);
    });
  }

  unwatch() {
    this.watcher?.close();
    this.watcher = null;
  }
}

function isInside(root, target) {
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

module.exports = { Workspace };
