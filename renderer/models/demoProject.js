// Example file tree used when the page runs in a browser (no Electron, no disk access).
const file = (path) => ({ type: 'file', path, size: 1 });
const dir = (path, children) => ({ type: 'dir', path, children });

export const DEMO_TREE = [
  dir('src', [
    file('src/main.ts'),
    file('src/app.ts'),
    dir('src/lib', [file('src/lib/auth.ts'), file('src/lib/db.ts')]),
    dir('src/routes', [file('src/routes/index.ts'), file('src/routes/users.ts'), file('src/routes/tx.ts')]),
  ]),
  dir('components', [file('components/Button.tsx'), file('components/Card.tsx'), file('components/Chat.tsx'), file('components/Map.tsx')]),
  dir('public', [file('public/logo.svg'), file('public/favicon.ico')]),
  dir('supabase', [file('supabase/config.toml'), dir('supabase/migrations', [file('supabase/migrations/001_init.sql')])]),
  dir('tests', [file('tests/auth.test.ts')]),
  dir('docs', []),
  file('package.json'),
  file('README.md'),
  file('tsconfig.json'),
];

// What the editor shows for a demo file (the web demo has no disk). Unknown files get a short placeholder.
const DEMO_CONTENT = {
  'src/main.ts': "import { createApp } from './app';\n\nconst app = createApp();\napp.listen(3000);\n",
  'src/app.ts': "import { router } from './routes';\n\nexport function createApp() {\n  return router();\n}\n",
  'src/lib/auth.ts': "export function verify(token: string) {\n  // TODO: check the signature\n  return token.length > 0;\n}\n",
  'src/lib/db.ts': "import { createClient } from '@supabase/supabase-js';\n\nexport const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);\n",
  'package.json': '{\n  "name": "platanus-demo",\n  "version": "0.1.0",\n  "private": true\n}\n',
  'README.md': '# Qubbot demo\n\nProyecto de ejemplo para la demo web.\n',
  'tsconfig.json': '{\n  "compilerOptions": { "strict": true, "target": "ES2022" }\n}\n',
  'supabase/migrations/001_init.sql': 'create table users (\n  id uuid primary key,\n  email text not null\n);\n',
};

export function demoFileContent(path) {
  return DEMO_CONTENT[path] ?? `// ${path}\n`;
}
