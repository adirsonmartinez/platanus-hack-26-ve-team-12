// The editor's preview (docs/features/file-editor/README.md → «Vista previa»): main serves the open
// project's files at qubbot-preview://project/<path>, so a page shows with its own CSS, scripts and images.
// The same rules as the editor and the agents: only inside the project (links resolved), never a secret
// (the MCP blocklist on the asked and on the real path). The window shows it in a sandboxed iframe whose
// origin is not the app's, so the page never reaches window.platanus. Tested in preview.test.js.
const fs = require('node:fs/promises');
const path = require('node:path');
const { isBlockedPath, isBlockedRealPath } = require('./mcpServer');

const PREVIEW_SCHEME = 'qubbot-preview';
const HOST = 'project';
const MAX_BYTES = 25 * 1024 * 1024; // a page, its scripts and images; not a video library

const MIME = {
  html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', json: 'application/json; charset=utf-8',
  map: 'application/json; charset=utf-8', txt: 'text/plain; charset=utf-8', md: 'text/plain; charset=utf-8',
  xml: 'application/xml; charset=utf-8', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon', bmp: 'image/bmp',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', wasm: 'application/wasm',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', mp4: 'video/mp4', webm: 'video/webm', pdf: 'application/pdf',
};

const mimeOf = (file) => MIME[path.extname(String(file)).slice(1).toLowerCase()] ?? 'application/octet-stream';

// qubbot-preview://project/<path> -> the project-relative path ('' for the root), or null when it is
// not a preview address or the path steps up, carries a NUL or is badly encoded
function previewPathOf(url) {
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  if (parsed.protocol !== `${PREVIEW_SCHEME}:` || parsed.hostname !== HOST) return null;
  let rel;
  try { rel = decodeURIComponent(parsed.pathname.replace(/^\/+/, '')); } catch { return null; }
  if (rel.includes('\0') || rel.replace(/\\/g, '/').split('/').includes('..')) return null;
  return rel;
}

const answer = (status, body = '', type = 'text/plain; charset=utf-8') => ({
  status,
  headers: { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  body: Buffer.isBuffer(body) ? body : Buffer.from(String(body)),
});

const inside = (root, real) => {
  const rel = path.relative(root, real);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

// -> { status, headers, body }: 200 with the file, 403 outside or secret, 404 missing, 413 too big
async function servePreview(root, rel, { maxBytes = MAX_BYTES } = {}) {
  if (!root || typeof rel !== 'string') return answer(404);
  const clean = rel.replace(/\\/g, '/');
  if (clean.split('/').includes('..') || path.isAbsolute(clean) || isBlockedPath(clean || '.')) return answer(403);
  let target = path.join(root, clean);
  let real;
  try {
    real = await fs.realpath(target);
    if ((await fs.stat(real)).isDirectory()) {
      target = path.join(target, 'index.html');
      real = await fs.realpath(target);
    }
  } catch {
    return answer(404);
  }
  if (!inside(await fs.realpath(root), real) || (await isBlockedRealPath(root, target))) return answer(403);
  const stat = await fs.stat(real).catch(() => null);
  if (!stat?.isFile()) return answer(404);
  if (stat.size > maxBytes) return answer(413);
  return answer(200, await fs.readFile(real), mimeOf(real));
}

module.exports = { PREVIEW_SCHEME, previewPathOf, mimeOf, servePreview };
