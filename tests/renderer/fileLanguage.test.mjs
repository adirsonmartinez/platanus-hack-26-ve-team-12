// Which syntax colors the editor uses for a file (by name, then extension)
import test from 'node:test';
import assert from 'node:assert/strict';
import { languageOf } from '../../renderer/models/fileLanguage.js';

test('known extensions map to their language', () => {
  const cases = {
    'src/main.ts': 'typescript', 'a.mts': 'typescript', 'App.tsx': 'tsx', 'index.js': 'javascript', 'x.cjs': 'javascript',
    'Button.jsx': 'jsx', 'package.json': 'json', 'tsconfig.json': 'json', 'styles/main.css': 'css', 'index.html': 'html',
    'README.md': 'markdown', 'app.py': 'python', 'supabase/migrations/001_init.sql': 'sql', 'ci.yml': 'yaml',
    'docker-compose.yaml': 'yaml', 'supabase/config.toml': 'toml', 'run.sh': 'shell', 'logo.svg': 'html',
  };
  for (const [path, lang] of Object.entries(cases)) assert.equal(languageOf(path), lang, path);
});

test('env files, dotfiles and well-known names', () => {
  assert.equal(languageOf('.env'), 'properties');
  assert.equal(languageOf('.env.local'), 'properties');
  assert.equal(languageOf('config/.env.example'), 'properties');
  assert.equal(languageOf('.zshrc'), 'shell');
  assert.equal(languageOf('Dockerfile'), 'shell');
  assert.equal(languageOf('.gitignore'), 'properties');
});

test('case does not matter and unknown files get no colors', () => {
  assert.equal(languageOf('NOTES.MD'), 'markdown');
  assert.equal(languageOf('LICENSE'), null);
  assert.equal(languageOf('data.bin'), null);
});
