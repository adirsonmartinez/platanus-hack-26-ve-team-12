// What a project is, for the tour ("Recorrido"): its architecture (monolith, monorepo, services,
// library), stack, parts, docs, entry points, tests, infrastructure and candidate use cases, plus the
// stops of the tour. Pure and deterministic: the file tree and the text of a few files in (read by the
// caller, chosen by pickFilesToRead), facts out. These facts are the source of truth of the tour: the
// agent only narrates them (models/tourSpec.js). No user-facing text here: kinds and keys only.
import { baseName } from './fileTree.js';
import { isSecretFile } from './fileOpen.js';
import { folderGuide, folderTags } from './folderTags.js';

export const MAX_READS = 12;
export const MAX_READ_BYTES = 64 * 1024;
const MAX_DOCS = 6;
const MAX_ENTRIES = 6;
const MAX_USE_CASES = 8;
const MAX_STEPS = 8;

const ROOT_MANIFESTS = ['package.json', 'pnpm-workspace.yaml', 'lerna.json', 'turbo.json', 'nx.json', 'pyproject.toml', 'requirements.txt', 'go.mod', 'Cargo.toml'];
const COMPOSE = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'];
const MANIFEST = /^(package\.json|pyproject\.toml|requirements\.txt|go\.mod|Cargo\.toml|pom\.xml|build\.gradle(\.kts)?|Gemfile|composer\.json)$/;
const README = /^readme(\.(md|mdx|rst|txt))?$/i;
const DOC_FILE = /\.(md|mdx|rst)$/i;
const TEST_DIR = /^(tests?|__tests__|spec|specs|e2e)$/i;
const TEST_FILE = /\.(test|spec)\.[^/]+$/i;
const CODE = /\.(m?[jt]sx?|cjs|py|go|rs|java|kt|rb|php|cs|swift)$/i;
const LANG = { ts: 'ts', tsx: 'ts', mts: 'ts', js: 'js', jsx: 'js', mjs: 'js', cjs: 'js', py: 'py', go: 'go', rs: 'rs', java: 'java', kt: 'kt', rb: 'rb', php: 'php', cs: 'cs', swift: 'swift' };
// package name -> framework, in the order they are reported
const FRAMEWORKS = [['next', 'next'], ['react', 'react'], ['vue', 'vue'], ['svelte', 'svelte'], ['@angular/core', 'angular'], ['express', 'express'], ['fastify', 'fastify'],
  ['@nestjs/core', 'nest'], ['electron', 'electron'], ['vite', 'vite'], ['django', 'django'], ['flask', 'flask'], ['fastapi', 'fastapi']];
const ENTRY_NAME = /^(?:src\/)?(main|index|app|server|cli)\.(m?[jt]sx?|cjs|py|go|rb)$/;
const NEXT_PAGE = /^(?:src\/)?(?:app\/page|pages\/index)\.[jt]sx?$/;
// folders whose files are use cases, and what they are
const CASE_DIRS = [[/^(routes|api|controllers|handlers|endpoints)$/i, 'route'], [/^(pages|screens)$/i, 'page'], [/^(commands|cli)$/i, 'command']];
const NOT_A_CASE = /^(index|_app|_document|_layout|layout|page|loading|error|middleware|utils?|helpers?|types?|router|routes|server|main|app)$/i;
// order of the parts shown in the tour: what you see first, then the logic, then the data and server
const PART_ORDER = ['ui', 'scene3d', 'logic', 'agent', 'desktop', 'server', 'data'];
// folders that are not a part of the app itself (they get their own stop, or none)
const NOT_A_PART = new Set(['automation', 'docs', 'tests', 'assets']);

const stem = (path) => baseName(path).replace(/\.[^.]+$/, '');
const dirOf = (path) => path.split('/').slice(0, -1).join('/');
const join = (dir, rel) => {
  const parts = [];
  for (const seg of `${dir}/${rel}`.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.pop(); else parts.push(seg);
  }
  return parts.join('/');
};
const parseJson = (text) => {
  try { return JSON.parse(text); } catch { return null; }
};

// Every file and folder of the tree (secrets left out: they are never shown nor read)
function flatten(tree) {
  const files = [];
  const dirs = [];
  const walk = (nodes) => {
    for (const n of nodes ?? []) {
      if (isSecretFile(n.path)) continue;
      if (n.type === 'dir') { dirs.push(n.path); walk(n.children); } else files.push(n);
    }
  };
  walk(tree);
  return { files, dirs };
}

// The files worth reading (manifests, README, the parts' manifests, docs), in that order
export function pickFilesToRead(tree) {
  const { files } = flatten(tree);
  const ok = new Map(files.filter((f) => (f.size ?? 0) <= MAX_READ_BYTES).map((f) => [f.path, f]));
  const picked = [];
  const add = (path) => { if (ok.has(path) && !picked.includes(path)) picked.push(path); };
  [...ROOT_MANIFESTS, ...COMPOSE].forEach(add);
  files.filter((f) => !f.path.includes('/') && README.test(f.path)).forEach((f) => add(f.path));
  files.filter((f) => /^[^/]+(\/[^/]+)?\/[^/]+$/.test(f.path) && MANIFEST.test(baseName(f.path))).forEach((f) => add(f.path));
  files.filter((f) => /^docs?\//i.test(f.path) && DOC_FILE.test(f.path)).map((f) => f.path).sort().forEach(add);
  return picked.slice(0, MAX_READS);
}

// packages: ['apps/*', 'tools/x'] -> the folders they name
function expandGlobs(globs, dirs) {
  const out = [];
  for (const g of globs) {
    const clean = String(g).replace(/^\.\//, '').replace(/\/$/, '');
    const matches = clean.endsWith('/*') ? dirs.filter((d) => dirOf(d) === clean.slice(0, -2)) : dirs.filter((d) => d === clean);
    for (const m of matches) if (!out.includes(m)) out.push(m);
  }
  return out;
}

// pnpm-workspace.yaml "packages:" list (simple YAML: one "- 'glob'" per line)
const pnpmGlobs = (text) => [...String(text ?? '').matchAll(/^\s*-\s*['"]?([^'"\n#]+?)['"]?\s*$/gm)].map((m) => m[1]);

// docker-compose services that are built from a folder of the project: [{ name, build }]
function composeBuilds(text) {
  const out = [];
  let inServices = false;
  let current = null;
  for (const line of String(text ?? '').split('\n')) {
    if (/^services:\s*$/.test(line)) { inServices = true; continue; }
    if (/^\S/.test(line)) { inServices = false; current = null; continue; }
    if (!inServices) continue;
    const service = /^ {2}([\w.-]+):\s*$/.exec(line);
    if (service) { current = { name: service[1], build: null }; out.push(current); continue; }
    const build = /^\s{4,}build:\s*(\S+)?/.exec(line);
    if (build && current) current.build = build[1] ?? '.';
  }
  return out.filter((s) => s.build !== null);
}

function analyzeDocs(files, read) {
  const kindOf = (path) => {
    const name = baseName(path);
    if (!path.includes('/') && README.test(name)) return 'readme';
    if (/^contributing/i.test(name)) return 'contributing';
    if (/^changelog/i.test(name)) return 'changelog';
    if (/(^|\/)(adr|adrs|decisions)\//i.test(path) && DOC_FILE.test(name)) return 'adr';
    if (/^docs?\//i.test(path) && DOC_FILE.test(name)) return 'guide';
    return null;
  };
  const order = ['readme', 'guide', 'adr', 'contributing', 'changelog'];
  return files.map((f) => ({ path: f.path, kind: kindOf(f.path) })).filter((d) => d.kind)
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.path.localeCompare(b.path))
    .slice(0, MAX_DOCS)
    .map((d) => {
      const text = read(d.path);
      return {
        ...d,
        title: /^#\s+(.+)$/m.exec(text ?? '')?.[1].trim() ?? null,
        headings: [...(text ?? '').matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim()).slice(0, 8),
      };
    });
}

const entryKind = (path) => ({ server: 'server', cli: 'cli' }[stem(path)] ?? 'main');

function findEntries(paths, roots, manifests) {
  const out = [];
  const add = (path, kind, why) => { if (paths.has(path) && !out.some((e) => e.path === path)) out.push({ path, kind, why }); };
  for (const root of roots) {
    const pkg = manifests.get(join(root, 'package.json'));
    if (pkg?.main) add(join(root, pkg.main), entryKind(pkg.main), 'pkgMain');
    const bins = typeof pkg?.bin === 'string' ? [pkg.bin] : Object.values(pkg?.bin ?? {});
    for (const bin of bins) add(join(root, bin), 'cli', 'pkgBin');
  }
  for (const root of roots) {
    const prefix = root ? `${root}/` : '';
    for (const path of paths) {
      if (!path.startsWith(prefix)) continue;
      const rel = path.slice(prefix.length);
      if (NEXT_PAGE.test(rel)) add(path, 'web', 'framework');
    }
  }
  for (const root of roots) {
    const prefix = root ? `${root}/` : '';
    for (const path of paths) if (path.startsWith(prefix) && ENTRY_NAME.test(path.slice(prefix.length))) add(path, entryKind(path), 'name');
  }
  return out.slice(0, MAX_ENTRIES);
}

function findUseCases(files) {
  const out = [];
  for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    if (!CODE.test(f.path) || TEST_FILE.test(f.path)) continue;
    const parts = f.path.split('/');
    let from = null;
    let label = stem(f.path);
    // Next.js app router: app/checkout/page.tsx is the "checkout" page
    if (/^page$/.test(label) && parts.includes('app') && parts.length - parts.lastIndexOf('app') > 2) { from = 'page'; label = parts.at(-2); }
    // its folder (or the one above: pages/admin/users.tsx) says what it is
    for (const [re, kind] of CASE_DIRS) if (!from && parts.slice(-3, -1).some((p) => re.test(p))) from = kind;
    if (!from || NOT_A_CASE.test(label) || label.startsWith('[')) continue;
    label = label.replace(/[-_.]+/g, ' ').trim();
    if (out.some((u) => u.label === label)) continue;
    out.push({ id: `uc${out.length + 1}`, from, path: f.path, label });
    if (out.length === MAX_USE_CASES) break;
  }
  return out;
}

function testRunner(deps, scripts, texts) {
  const script = String(scripts.test ?? '');
  for (const name of ['vitest', 'jest', 'mocha']) if (deps.has(name) || script.includes(name)) return name;
  if (/node\s+--test/.test(script)) return 'node:test';
  if (texts.some((t) => /pytest/.test(t))) return 'pytest';
  return null;
}

export function analyzeProject(tree, contents = new Map()) {
  const { files, dirs } = flatten(tree);
  const paths = new Set(files.map((f) => f.path));
  const dirSet = new Set(dirs);
  const read = (path) => (contents instanceof Map ? contents.get(path) : contents?.[path]) ?? null;
  const manifests = new Map(files.filter((f) => baseName(f.path) === 'package.json').map((f) => [f.path, parseJson(read(f.path))]).filter(([, v]) => v));
  const rootPkg = manifests.get('package.json') ?? null;
  const topDirs = dirs.filter((d) => !d.includes('/') && !d.startsWith('.'));
  const hasManifest = (dir) => files.some((f) => dirOf(f.path) === dir && MANIFEST.test(baseName(f.path)));

  // --- architecture ---
  const evidence = [];
  let kind = 'unknown';
  let confidence = 'low';
  let units = [];
  const markers = [['pnpm-workspace.yaml', 'pnpmWorkspace'], ['lerna.json', 'lerna'], ['turbo.json', 'turbo'], ['nx.json', 'nx']].filter(([p]) => paths.has(p));
  const workspaces = Array.isArray(rootPkg?.workspaces) ? rootPkg.workspaces : rootPkg?.workspaces?.packages ?? null;
  if (workspaces) markers.push(['package.json', 'workspacesField']);
  const globs = [...pnpmGlobs(read('pnpm-workspace.yaml')), ...(workspaces ?? [])];
  const conventional = expandGlobs(['apps/*', 'packages/*', 'services/*'], dirs).filter(hasManifest);
  const compose = COMPOSE.find((p) => paths.has(p)) ?? null;
  const built = composeBuilds(read(compose));
  const dockerDirs = topDirs.filter((d) => hasManifest(d) && paths.has(`${d}/Dockerfile`));
  const unitKind = (path) => (path.startsWith('apps/') ? 'app' : path.startsWith('services/') ? 'service' : path.startsWith('packages/') ? 'package' : 'package');
  const unitOf = (path, k) => ({
    path, kind: k,
    manifest: files.find((f) => dirOf(f.path) === path && MANIFEST.test(baseName(f.path)))?.path ?? null,
    tags: folderTags(path, files.filter((f) => f.path.startsWith(`${path}/`))),
  });

  if (markers.length || conventional.length >= 2) {
    kind = 'monorepo';
    confidence = markers.length ? 'high' : 'medium';
    markers.forEach(([path, key]) => evidence.push({ key, path }));
    if (!markers.length) evidence.push({ key: 'packagesFolder', path: dirOf(conventional[0]) });
    const found = globs.length ? expandGlobs(globs, dirs) : conventional;
    units = (found.length ? found : conventional).map((p) => unitOf(p, unitKind(p)));
  } else if (built.length >= 2 || dockerDirs.length >= 2) {
    kind = 'services';
    if (built.length >= 2) {
      confidence = 'high';
      evidence.push({ key: 'composeServices', path: compose });
      units = built.map((s) => join('', s.build)).filter((p) => dirSet.has(p)).map((p) => unitOf(p, 'service'));
    } else {
      confidence = 'medium';
      evidence.push({ key: 'dockerPerFolder', path: dockerDirs[0] });
      units = dockerDirs.map((p) => unitOf(p, 'service'));
    }
  }

  const roots = ['', ...units.map((u) => u.path)];
  const entries = findEntries(paths, roots, manifests);
  if (kind === 'unknown') {
    const exports = rootPkg && (rootPkg.main || rootPkg.exports || rootPkg.types || rootPkg.module);
    const runs = rootPkg?.scripts && (rootPkg.scripts.start || rootPkg.scripts.dev);
    if (exports && !runs && !entries.some((e) => e.kind === 'server' || e.kind === 'web')) {
      kind = 'library'; confidence = 'high'; evidence.push({ key: 'libExports', path: 'package.json' });
    } else if (entries.length) {
      kind = 'monolith';
      confidence = entries[0].why === 'name' ? 'medium' : 'high';
      evidence.push({ key: 'appEntry', path: entries[0].path });
    }
  }

  // --- stack ---
  const langCount = new Map();
  for (const f of files) {
    const lang = LANG[/\.([^.]+)$/.exec(f.path)?.[1]?.toLowerCase()];
    if (lang) langCount.set(lang, (langCount.get(lang) ?? 0) + 1);
  }
  const deps = new Set([...manifests.values()].flatMap((p) => [...Object.keys(p.dependencies ?? {}), ...Object.keys(p.devDependencies ?? {})]));
  const pyTexts = files.filter((f) => /(^|\/)(pyproject\.toml|requirements\.txt)$/.test(f.path)).map((f) => read(f.path) ?? '');
  const hasPy = (name) => pyTexts.some((t) => new RegExp(`\\b${name}\\b`, 'i').test(t));
  const frameworks = FRAMEWORKS.filter(([pkg]) => deps.has(pkg) || hasPy(pkg)).map(([, name]) => name).filter((n, i, a) => a.indexOf(n) === i);
  const packageManager = paths.has('pnpm-lock.yaml') || paths.has('pnpm-workspace.yaml') ? 'pnpm' : paths.has('yarn.lock') ? 'yarn' : paths.has('package.json') ? 'npm' : null;

  // --- layers: the top-level folders (what each one is) ---
  const filesUnder = (dir) => files.filter((f) => f.path.startsWith(`${dir}/`));
  const layers = topDirs.map((path) => {
    const { key, tags } = folderGuide(path, filesUnder(path));
    return { path, key, tags };
  });

  // --- tests ---
  const testDirs = dirs.filter((d) => d.split('/').length <= 2 && TEST_DIR.test(baseName(d)) && !dirs.some((o) => o !== d && d.startsWith(`${o}/`) && TEST_DIR.test(baseName(o))));
  const scripts = rootPkg?.scripts ?? {};
  const tests = {
    dirs: testDirs,
    count: files.filter((f) => TEST_FILE.test(f.path) || (CODE.test(f.path) && testDirs.some((d) => f.path.startsWith(`${d}/`)))).length,
    runner: testRunner(deps, scripts, pyTexts),
    script: scripts.test ? 'test' : null,
  };

  const pickedScripts = {};
  for (const name of ['dev', 'start', 'test', 'build']) if (typeof scripts[name] === 'string') pickedScripts[name] = scripts[name].slice(0, 80);

  const shallowest = (list) => [...list].sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))[0] ?? null;
  const infra = {
    docker: paths.has('Dockerfile') ? 'Dockerfile' : shallowest([...paths].filter((p) => baseName(p) === 'Dockerfile')),
    compose,
    ci: dirSet.has('.github/workflows') ? '.github/workflows' : paths.has('.gitlab-ci.yml') ? '.gitlab-ci.yml' : null,
    migrations: shallowest(dirs.filter((d) => baseName(d) === 'migrations')),
  };

  return {
    version: 1,
    empty: files.length === 0,
    paths,
    dirs: dirSet,
    architecture: { kind, confidence, evidence },
    stack: { languages: [...langCount.entries()].sort((a, b) => b[1] - a[1]).map(([l]) => l), frameworks, packageManager },
    units,
    docs: analyzeDocs(files, read),
    entries,
    layers,
    tests,
    scripts: pickedScripts,
    infra,
    useCases: findUseCases(files),
  };
}

// The stops of the tour, in a fixed order. Ids are stable (the agent writes text for them by id).
//   { id, kind: 'place'|'doc'|'folder'|'file'|'usecase'|'start', target, role?, candidates? }
export function planSteps(facts) {
  const place = { id: 'place', kind: 'place', target: '' };
  const readme = facts.docs.find((d) => d.kind === 'readme')?.path ?? null;
  const entry = facts.entries[0]?.path ?? null;
  const start = { id: 'start', kind: 'start', target: readme ?? entry ?? '' };
  if (facts.empty) return [place, start];

  const steps = [place];
  const docs = [readme, facts.docs.find((d) => d.kind === 'guide')?.path].filter(Boolean);
  docs.forEach((target, i) => steps.push({ id: `doc${i + 1}`, kind: 'doc', target }));
  const rank = (layer) => {
    const i = Math.min(...layer.tags.map((t) => PART_ORDER.indexOf(t)).filter((n) => n >= 0));
    return Number.isFinite(i) ? i : -1;
  };
  const parts = facts.units.length
    ? facts.units.map((u) => u.path)
    : facts.layers.filter((l) => rank(l) >= 0 && !NOT_A_PART.has(l.key) && !facts.tests.dirs.includes(l.path)).sort((a, b) => rank(a) - rank(b)).map((l) => l.path);
  parts.slice(0, 3).forEach((target, i) => steps.push({ id: `part${i + 1}`, kind: 'folder', target, role: 'part' }));
  if (entry) steps.push({ id: 'entry', kind: 'file', target: entry, role: 'entry' });
  if (facts.tests.dirs[0]) steps.push({ id: 'tests', kind: 'folder', target: facts.tests.dirs[0], role: 'tests' });
  const candidates = facts.useCases.map((u) => u.id);
  for (let i = 0; i < Math.min(2, candidates.length); i++) steps.push({ id: `case${i + 1}`, kind: 'usecase', target: null, candidates });
  steps.push(start);

  // too many stops: drop the least needed first
  for (const id of ['doc2', 'case2', 'part3', 'tests', 'part2', 'case1']) {
    if (steps.length <= MAX_STEPS) break;
    const i = steps.findIndex((s) => s.id === id);
    if (i >= 0) steps.splice(i, 1);
  }
  return steps;
}
