import test from 'node:test';
import assert from 'node:assert/strict';
import { TAGS, TAG_COLOR, fileTags, folderTags, folderGuide } from '../../renderer/models/folderTags.js';
import { strings } from '../../renderer/i18n/es.js';

test('every tag has a color and a Spanish label (labels live in es.js, not in the model)', () => {
  for (const tag of TAGS) {
    assert.ok(TAG_COLOR[tag], tag);
    assert.ok(strings.tags[tag], tag);
  }
});

test('files get tags by name', () => {
  assert.deepEqual(fileTags('src/app.test.js'), ['tests']);
  assert.ok(fileTags('.env.local').includes('security'));
  assert.deepEqual(fileTags('styles/main.css'), ['ui']);
});

test('folders: own name first, then the most common file tags, at most 3', () => {
  const tags = folderTags('electron', ['main.js', 'a.test.js', 'b.test.js', 'README.md'].map((p) => ({ path: p })));
  assert.equal(tags[0], 'desktop');
  assert.ok(tags.length <= 3);
});

test('guide keys map to friendly names and summaries in es.js', () => {
  assert.equal(folderGuide('renderer').key, 'screen');
  assert.equal(folderGuide('').key, 'root');
  for (const key of ['screen', 'root', 'desktop', 'docs']) assert.ok(strings.folders[key].name && strings.folders[key].summary, key);
  const unknown = strings.describeFolder(folderGuide('zzz', [{ path: 'zzz/a.sql' }]), 'zzz');
  assert.match(unknown.name, /zzz/);
});
