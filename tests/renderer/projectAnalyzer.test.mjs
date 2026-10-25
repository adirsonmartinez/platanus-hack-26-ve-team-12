// The tour's analyzer: what kind of project it is, where its docs, entry points, tests and use cases
// are, and the stops of the tour. Pure: a file tree and the text of a few files in, facts out.
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeProject, pickFilesToRead, planSteps, MAX_READS } from '../../renderer/models/projectAnalyzer.js';

// ['a/b.js', 'c.md'] -> a nested tree like the one the workspace returns
function treeOf(paths, sizes = {}) {
  const root = [];
  for (const full of paths) {
    const parts = full.split('/');
    let level = root;
    parts.forEach((_, i) => {
      const path = parts.slice(0, i + 1).join('/');
      const last = i === parts.length - 1;
      let node = level.find((n) => n.path === path);
      if (!node) {
        node = last ? { type: 'file', path, size: sizes[path] ?? 100 } : { type: 'dir', path, children: [] };
        level.push(node);
      }
      if (!last) level = node.children;
    });
  }
  return root;
}
const json = (o) => JSON.stringify(o);

const MONOLITH = {
  tree: treeOf(['package.json', 'package-lock.json', 'README.md', 'docs/arquitectura.md', 'src/server.js', 'src/routes/orders.js', 'src/routes/products.js', 'src/routes/index.js',
    'src/services/payments.js', 'src/models/order.js', 'public/index.html', 'tests/orders.test.js', 'tests/products.test.js', 'db/migrations/001_init.sql', 'Dockerfile', '.env', '.github/workflows/ci.yml']),
  contents: {
    'package.json': json({ name: 'tienda', main: 'src/server.js', scripts: { start: 'node src/server.js', test: 'node --test tests', dev: 'nodemon src/server.js' }, dependencies: { express: '^4' } }),
    'README.md': '# Tienda\n\nIntro\n\n## Cómo empezar\n\n## Arquitectura\n',
    'docs/arquitectura.md': '# Arquitectura de la tienda\n\n## Capas\n',
  },
};

const MONOREPO = {
  tree: treeOf(['package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml', 'README.md', 'apps/web/package.json', 'apps/web/app/page.tsx', 'apps/web/app/checkout/page.tsx',
    'apps/api/package.json', 'apps/api/src/server.ts', 'apps/api/src/routes/orders.ts', 'packages/ui/package.json', 'packages/ui/src/index.ts', 'tests/e2e/checkout.spec.ts']),
  contents: {
    'package.json': json({ name: 'feria', private: true, scripts: { dev: 'pnpm -r dev', test: 'vitest' }, devDependencies: { vitest: '^2' } }),
    'pnpm-workspace.yaml': "packages:\n  - 'apps/*'\n  - 'packages/*'\n",
    'apps/web/package.json': json({ name: 'web', dependencies: { next: '15', react: '19' } }),
    'apps/api/package.json': json({ name: 'api', main: 'src/server.ts', dependencies: { express: '^4' } }),
    'packages/ui/package.json': json({ name: '@feria/ui', main: 'src/index.ts' }),
    'README.md': '# Feria online\n',
  },
};

const SERVICES = {
  tree: treeOf(['docker-compose.yml', 'README.md', 'users/package.json', 'users/Dockerfile', 'users/index.js', 'billing/pyproject.toml', 'billing/Dockerfile', 'billing/main.py']),
  contents: {
    'docker-compose.yml': 'services:\n  users:\n    build: ./users\n  billing:\n    build: ./billing\n  db:\n    image: postgres\n',
    'users/package.json': json({ name: 'users', dependencies: { fastify: '^4' } }),
  },
};

const LIBRARY = {
  tree: treeOf(['package.json', 'README.md', 'src/index.ts', 'src/parse.ts', 'test/parse.test.ts']),
  contents: { 'package.json': json({ name: 'tiny-parse', main: 'dist/index.js', types: 'dist/index.d.ts', scripts: { build: 'tsc', test: 'jest' }, devDependencies: { jest: '29' } }) },
};

const analyze = (p) => analyzeProject(p.tree, new Map(Object.entries(p.contents)));

test('a single app with its own server is a monolith, with its evidence', () => {
  const f = analyze(MONOLITH);
  assert.equal(f.architecture.kind, 'monolith');
  assert.ok(f.architecture.evidence.some((e) => e.key === 'appEntry' && e.path === 'src/server.js'));
  assert.deepEqual(f.stack.frameworks, ['express']);
  assert.equal(f.stack.packageManager, 'npm');
  assert.ok(f.stack.languages.includes('js'));
});

test('workspaces make a monorepo; each app and package is a part', () => {
  const f = analyze(MONOREPO);
  assert.equal(f.architecture.kind, 'monorepo');
  assert.equal(f.architecture.confidence, 'high');
  assert.ok(f.architecture.evidence.some((e) => e.key === 'pnpmWorkspace'));
  assert.deepEqual(f.units.map((u) => [u.path, u.kind]), [['apps/web', 'app'], ['apps/api', 'app'], ['packages/ui', 'package']]);
  assert.equal(f.stack.packageManager, 'pnpm');
  for (const fw of ['next', 'react', 'express']) assert.ok(f.stack.frameworks.includes(fw), fw);
});

test('a compose file with two built services is "varios servicios"', () => {
  const f = analyze(SERVICES);
  assert.equal(f.architecture.kind, 'services');
  assert.ok(f.architecture.evidence.some((e) => e.key === 'composeServices'));
  assert.deepEqual(f.units.map((u) => u.path).sort(), ['billing', 'users']);
  assert.equal(f.infra.compose, 'docker-compose.yml');
});

test('a package that only exports code is a library', () => {
  const f = analyze(LIBRARY);
  assert.equal(f.architecture.kind, 'library');
  assert.equal(f.tests.runner, 'jest');
});

test('docs: the README first (with its title and sections), then the guides', () => {
  const f = analyze(MONOLITH);
  assert.deepEqual(f.docs.map((d) => [d.path, d.kind]), [['README.md', 'readme'], ['docs/arquitectura.md', 'guide']]);
  assert.equal(f.docs[0].title, 'Tienda');
  assert.deepEqual(f.docs[0].headings, ['Cómo empezar', 'Arquitectura']);
});

test('entry points come from package.json and from well known names', () => {
  assert.deepEqual(analyze(MONOLITH).entries[0], { path: 'src/server.js', kind: 'server', why: 'pkgMain' });
  const mono = analyze(MONOREPO).entries.map((e) => e.path);
  assert.ok(mono.includes('apps/api/src/server.ts'));
  assert.ok(mono.includes('apps/web/app/page.tsx'));
});

test('tests, scripts and infrastructure', () => {
  const f = analyze(MONOLITH);
  assert.deepEqual(f.tests, { dirs: ['tests'], count: 2, runner: 'node:test', script: 'test' });
  assert.equal(f.scripts.start, 'node src/server.js');
  assert.deepEqual(f.infra, { docker: 'Dockerfile', compose: null, ci: '.github/workflows', migrations: 'db/migrations' });
});

test('use cases come from routes and pages, named after the file (index is not one)', () => {
  const f = analyze(MONOLITH);
  assert.deepEqual(f.useCases.map((u) => [u.label, u.from]), [['orders', 'route'], ['products', 'route']]);
  assert.deepEqual(f.useCases.map((u) => u.id), ['uc1', 'uc2']);
  const web = analyze(MONOREPO).useCases.map((u) => u.label);
  assert.ok(web.includes('checkout') && web.includes('orders'));
});

test('secrets are never in the facts the agent sees, nor read', () => {
  const f = analyze(MONOLITH);
  assert.ok(!f.paths.has('.env'));
  assert.ok(!pickFilesToRead(MONOLITH.tree).includes('.env'));
});

test('what is read: the manifests and docs first, never more than the limit or a huge file', () => {
  const many = treeOf(['package.json', 'README.md', ...Array.from({ length: 20 }, (_, i) => `packages/p${i}/package.json`), 'docs/big.md'], { 'docs/big.md': 500 * 1024 });
  const picked = pickFilesToRead(many);
  assert.equal(picked[0], 'package.json');
  assert.ok(picked.includes('README.md'));
  assert.ok(picked.length <= MAX_READS);
  assert.ok(!picked.includes('docs/big.md'));
});

test('an empty project, and one with no manifest, are handled', () => {
  const empty = analyzeProject([], new Map());
  assert.equal(empty.empty, true);
  assert.equal(empty.architecture.kind, 'unknown');
  assert.deepEqual(planSteps(empty).map((s) => s.kind), ['place', 'start']);
  const loose = analyzeProject(treeOf(['notas.txt', 'foto.png']), new Map());
  assert.equal(loose.architecture.kind, 'unknown');
});

test('the stops: always the plaza first and "por dónde empezar" last, at most 8, ids stable', () => {
  const steps = planSteps(analyze(MONOLITH));
  assert.equal(steps[0].kind, 'place');
  assert.equal(steps.at(-1).kind, 'start');
  assert.equal(steps.at(-1).target, 'README.md');
  assert.ok(steps.length <= 8);
  assert.equal(new Set(steps.map((s) => s.id)).size, steps.length);
  assert.ok(steps.some((s) => s.kind === 'doc' && s.target === 'README.md'));
  assert.ok(steps.some((s) => s.kind === 'file' && s.target === 'src/server.js'));
  assert.ok(steps.some((s) => s.kind === 'usecase' && s.candidates.includes('uc1')));
  const mono = planSteps(analyze(MONOREPO));
  assert.deepEqual(mono.filter((s) => s.kind === 'folder' && s.role === 'part').map((s) => s.target), ['apps/web', 'apps/api', 'packages/ui'].slice(0, mono.filter((s) => s.role === 'part').length));
});

test('a "views" folder of an app is not a list of use cases', () => {
  const f = analyzeProject(treeOf(['package.json', 'renderer/views/icons.js', 'renderer/views/scene/mapView.js', 'src/pages/admin/users.tsx']), new Map());
  assert.deepEqual(f.useCases.map((u) => u.path), ['src/pages/admin/users.tsx']);
});
