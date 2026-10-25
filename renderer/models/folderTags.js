// What each part of a project is, so anyone can tell what lives in a folder: tags (ui, data…) and,
// for "vibe" mode, a friendly name key. Decided by folder and file names only (no file is read).
// Labels, friendly names and summaries are user-facing text: they live in i18n/es.js (strings.tags,
// strings.folders); this model only returns keys.
import { baseName } from './fileTree.js';

export const TAGS = ['ui', 'scene3d', 'logic', 'data', 'server', 'desktop', 'agent', 'security', 'tests', 'docs', 'config', 'assets'];

// Color of each tag (readable on the dark shell and on the light map)
export const TAG_COLOR = {
  ui: '#f5c542',
  scene3d: '#6aa8ff',
  logic: '#8b83ff',
  data: '#3ddc97',
  server: '#ffab40',
  desktop: '#7dd3fc',
  agent: '#c792ea',
  security: '#ff5a6a',
  tests: '#86efac',
  docs: '#a3a3a3',
  config: '#94a3b8',
  assets: '#f0abfc',
};

// Folder name -> tags. First match wins for the friendly name (strings.folders[key]); every match adds tags.
const FOLDER_RULES = [
  { key: 'screen', re: /^(renderer|frontend|client|web|app)$/i, tags: ['ui'] },
  { key: 'components', re: /^(components|ui|views|pages|screens|layouts|widgets)$/i, tags: ['ui'] },
  { key: 'styles', re: /^(styles|css|theme|themes)$/i, tags: ['ui'] },
  { key: 'scene', re: /^(scene|three|3d|webgl|builders|meshes)$/i, tags: ['scene3d'] },
  { key: 'viewmodels', re: /^viewmodels$/i, tags: ['logic'] },
  { key: 'services', re: /^services$/i, tags: ['logic', 'agent'] },
  { key: 'core', re: /^(core|utils|helpers|hooks|lib|src|packages)$/i, tags: ['logic'] },
  { key: 'models', re: /^(models|store|state|data|schema|schemas)$/i, tags: ['data'] },
  { key: 'database', re: /^(supabase|db|database|prisma|migrations|sql)$/i, tags: ['data', 'security'] },
  { key: 'server', re: /^(api|server|backend|routes|functions|edge-functions)$/i, tags: ['server'] },
  { key: 'desktop', re: /^(electron|desktop|main|tauri)$/i, tags: ['desktop'] },
  { key: 'agent', re: /^(agent|agents|ai|llm|mcp|chat|prompts|skills)$/i, tags: ['agent'] },
  { key: 'security', re: /^(auth|security|crypto|middleware|policies)$/i, tags: ['security'] },
  { key: 'tests', re: /^(tests?|__tests__|spec|specs|e2e|cypress)$/i, tags: ['tests'] },
  { key: 'docs', re: /^(docs?|documentation|wiki)$/i, tags: ['docs'] },
  { key: 'automation', re: /^(\.github|\.gitlab|\.circleci|ci|scripts|\.vscode|\.husky|config)$/i, tags: ['config'] },
  { key: 'assets', re: /^(public|assets|static|images|img|media|fonts|icons)$/i, tags: ['assets'] },
  { key: 'i18n', re: /^(i18n|locales|lang|translations)$/i, tags: ['ui'] },
];

// File name -> tags
const FILE_RULES = [
  { re: /(\.test|\.spec)\.[cm]?[jt]sx?$/i, tags: ['tests'] },
  { re: /^\.env/i, tags: ['security', 'config'] },
  { re: /\.(pem|key|p12|pfx|keystore|jks)$/i, tags: ['security'] },
  { re: /(auth|login|session|token|jwt|crypto|password|secret)/i, tags: ['security'] },
  { re: /\.(html|css|scss|tsx|jsx|vue|svelte)$/i, tags: ['ui'] },
  { re: /\.(sql|prisma)$/i, tags: ['data'] },
  { re: /\.(md|mdx|txt)$/i, tags: ['docs'] },
  { re: /\.(png|jpe?g|gif|svg|webp|ico|woff2?|ttf|glb|gltf)$/i, tags: ['assets'] },
  { re: /^(package(-lock)?\.json|.*\.config\.[cm]?[jt]s|.*\.ya?ml|.*\.toml|dockerfile|\.gitignore|\.npmrc)$/i, tags: ['config'] },
  { re: /(mcp|agent|prompt|llm)/i, tags: ['agent'] },
  { re: /(three|scene|mesh|camera)/i, tags: ['scene3d'] },
  { re: /\.[cm]?[jt]s$/i, tags: ['logic'] },
];

const unique = (list) => [...new Set(list)];

export function fileTags(path) {
  const name = baseName(path);
  for (const rule of FILE_RULES) if (rule.re.test(name)) return rule.tags;
  return [];
}

// Tags of a folder: its own name first, then the most common tags of what it contains (max 3)
export function folderTags(path, files = []) {
  const own = FOLDER_RULES.filter((r) => r.re.test(baseName(path))).flatMap((r) => r.tags);
  const counts = new Map();
  for (const f of files) for (const tag of fileTags(f.path ?? f)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  const common = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag]) => tag);
  return unique([...own, ...common]).slice(0, 3);
}

// Folder description for "vibe" mode: { key, tags } where key is a strings.folders entry or null
// ('' = the project root, key 'root').
export function folderGuide(path, files = []) {
  const tags = folderTags(path, files);
  if (!path) return { key: 'root', tags };
  const rule = FOLDER_RULES.find((r) => r.re.test(baseName(path)));
  return { key: rule?.key ?? null, tags };
}
