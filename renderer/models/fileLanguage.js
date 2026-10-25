// Which syntax colors the editor uses for a file: a language key the editor view turns into a CodeMirror
// language (renderer/vendor/codemirror.js), or null for plain text. Well-known names first, then the extension.
const BY_NAME = [
  [/^\.env(\..+)?$/, 'properties'],
  [/^\.(gitignore|dockerignore|npmignore|gitattributes|editorconfig|npmrc|nvmrc)$/, 'properties'],
  [/^\.(bashrc|zshrc|profile|bash_profile|zprofile)$/, 'shell'],
  [/^(dockerfile|makefile|procfile)$/, 'shell'],
];

const BY_EXTENSION = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx',
  ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'tsx',
  json: 'json', jsonc: 'json', webmanifest: 'json',
  css: 'css', scss: 'css', less: 'css',
  html: 'html', htm: 'html', svg: 'html', xml: 'html', vue: 'html', svelte: 'html',
  md: 'markdown', mdx: 'markdown', markdown: 'markdown',
  py: 'python', sql: 'sql', yml: 'yaml', yaml: 'yaml', toml: 'toml',
  sh: 'shell', bash: 'shell', zsh: 'shell',
  ini: 'properties', properties: 'properties', conf: 'properties', cfg: 'properties',
};

export function languageOf(path) {
  const name = path.split('/').pop().toLowerCase();
  const known = BY_NAME.find(([pattern]) => pattern.test(name));
  if (known) return known[1];
  const dot = name.lastIndexOf('.');
  return dot > 0 ? BY_EXTENSION[name.slice(dot + 1)] ?? null : null;
}
