// Example git history for the browser demo (same shape as the main process returns).
// A typical git flow, including a feature that committed a .env and "removed" it afterwards.
const sha = (n) => n.toString(16).padStart(7, '0').repeat(6).slice(0, 40);
const HOUR = 3600 * 1000;
const start = Date.parse('2026-10-23T18:00:00Z');

const steps = [
  // [id, parents, subject, files]
  [1, [], 'Initial commit', [['A', 'README.md'], ['A', 'package.json']]],
  [2, [1], 'Set up Electron app', [['A', 'electron/main.js'], ['A', 'electron/preload.js']]],
  [3, [2], 'Add isometric map', [['A', 'renderer/views/scene/mapView.js'], ['A', 'renderer/views/scene/sceneView.js']]],
  [4, [3], 'Add folder buildings', [['A', 'renderer/views/scene/builders/folderBuilder.js']]],
  [5, [2, 4], "Merge branch 'feature/map' into develop", []],
  [6, [5], 'Add login with Supabase', [['A', 'src/lib/auth.ts'], ['A', '.env'], ['M', 'package.json']]],
  [7, [6], 'Remove .env', [['D', '.env'], ['A', '.env.example']]],
  [8, [5, 7], "Merge branch 'feature/auth' into develop", []],
  [9, [8], 'Bump version to 0.1.0', [['M', 'package.json']]],
  [10, [1, 9], "Merge branch 'release/0.1.0'", []],
  [11, [8, 9], "Merge branch 'release/0.1.0' into develop", []],
  [12, [11], 'Add git view', [['A', 'renderer/views/scene/gitView.js'], ['A', 'renderer/models/gitModel.js']]],
  [13, [11], 'Add agent chat', [['A', 'renderer/models/agentModel.js'], ['M', 'renderer/i18n/es.js']]],
];

const AUTHORS = ['Adirson', 'Rafael', 'Hendry', 'Génesis'];

export const DEMO_GIT = {
  isRepo: true,
  head: { branch: 'feature/git-view', sha: sha(12) },
  branches: [
    { name: 'main', sha: sha(10), remote: false },
    { name: 'develop', sha: sha(11), remote: false },
    { name: 'feature/git-view', sha: sha(12), remote: false },
    { name: 'feature/chat', sha: sha(13), remote: false },
  ],
  tags: [{ name: 'v0.1.0', sha: sha(10) }],
  commits: steps
    .map(([id, parents, subject, files]) => ({
      sha: sha(id),
      parents: parents.map(sha),
      refs: '',
      subject,
      author: AUTHORS[id % AUTHORS.length],
      date: start + id * HOUR,
      files: files.map(([status, path]) => ({ status, path })),
    }))
    .reverse(), // newest first, like git log
};
