// Opening a project file from the chat: whether it can open in the browser, whether it holds secrets
// (never shown) and the preview of its first lines. Pure. The main process checks again before opening
// (electron/fileOpen.js, isBlockedRealPath).
const BROWSER = /\.(?:html?|svg|pdf|png|jpe?g|gif|webp)$/i;
// Same names the agent is refused, on any part of the path (BLOCKED_SEGMENT in electron/mcpServer.js):
// .git/config is as secret as .env. Templates like .env.example are fine.
const SECRET_SEGMENT = /^(?:\.env(?:\..*)?|\.git|\.ssh|\.aws|\.gnupg|\.npmrc|\.netrc|\.pypirc|\.docker|\.htpasswd|credentials(?:\.json)?|secrets?\.(?:json|ya?ml|toml)|service[-_]?account[^/]*\.json|id_(?:rsa|ed25519|ecdsa|dsa)[^/]*|[^/]+\.(?:pem|key|p12|pfx|keystore|jks))$/i;
const ENV_TEMPLATE = /^\.env\.(?:example|sample|template)$/i;
const PREVIEW_LINES = 30;
const MAX_LINE = 200;

export const opensInBrowser = (path) => BROWSER.test(String(path ?? ''));
export const isSecretFile = (path) => String(path ?? '').replace(/\\/g, '/').split('/').some((seg) => SECRET_SEGMENT.test(seg) && !ENV_TEMPLATE.test(seg));

// { lines, more } or null for a binary file
export function previewOf(text, max = PREVIEW_LINES) {
  const source = String(text ?? '');
  if (source.includes('\u0000')) return null;
  const all = source.replace(/\r\n/g, '\n').split('\n');
  return { lines: all.slice(0, max).map((l) => l.slice(0, MAX_LINE)), more: Math.max(0, all.length - max) };
}

// What a file is, for Modo Vibe (plain words in strings.chat.cards.kinds[kind]). By name only.
const KINDS = [
  ['secret', (p) => isSecretFile(p)],
  ['test', (p) => /(?:^|\/)(?:tests?|__tests__|e2e)\/|\.(?:test|spec)\.[^/]+$/i.test(p)],
  ['page', (p) => /\.html?$/i.test(p)],
  ['styles', (p) => /\.(?:css|scss|sass|less)$/i.test(p)],
  ['settings', (p) => /(?:^|\/)(?:package(?:-lock)?\.json|tsconfig[^/]*\.json|vercel\.json|netlify\.toml|render\.yaml|\.[\w-]+rc(?:\.\w+)?|[^/]+\.config\.[cm]?[jt]s|\.gitignore|\.env\.(?:example|sample|template))$/i.test(p) || /\.(?:toml|ya?ml|ini)$/i.test(p)],
  ['code', (p) => /\.(?:[cm]?[jt]sx?|py|rb|go|rs|java|kt|swift|php|cs|vue|svelte)$/i.test(p)],
  ['data', (p) => /\.(?:json|csv|sql|xml|db|sqlite)$/i.test(p)],
  ['text', (p) => /\.(?:md|mdx|txt|rst)$/i.test(p)],
  ['image', (p) => /\.(?:png|jpe?g|gif|webp|svg|ico|avif)$/i.test(p)],
  ['document', (p) => /\.(?:pdf|docx?|xlsx?|pptx?)$/i.test(p)],
  ['script', (p) => /\.(?:sh|bash|zsh|ps1|bat|cmd)$/i.test(p)],
];
export const fileKind = (path) => KINDS.find(([, test]) => test(String(path ?? '')))?.[0] ?? 'other';
