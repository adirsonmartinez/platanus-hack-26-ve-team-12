// Builds the static web demo into dist/ (deployed to Vercel).
// The renderer already runs in a plain browser with a demo project; this only copies it and
// vendors three.js so the site does not depend on node_modules (renderer/vendor/ is already in the copy).

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const renderer = path.join(root, 'renderer');
const dist = path.join(root, 'dist');
const threeSource = path.join(root, 'node_modules', 'three', 'build', 'three.module.js');
const addonsSource = path.join(root, 'node_modules', 'three', 'examples', 'jsm');
const mediapipeSource = path.join(root, 'node_modules', '@mediapipe', 'tasks-vision');

const IMPORT_MAP = [
  ['"three": "../node_modules/three/build/three.module.js"', '"three": "./vendor/three.module.js"'],
  ['"three/addons/": "../node_modules/three/examples/jsm/"', '"three/addons/": "./vendor/addons/"'],
  ['"@mediapipe/tasks-vision": "../node_modules/@mediapipe/tasks-vision/vision_bundle.mjs"', '"@mediapipe/tasks-vision": "./vendor/mediapipe/vision_bundle.mjs"'],
];
// Hand tracking: the bundle and its WASM next to it in wasm/ (not the ES-module variant, which the app does not use)
const MEDIAPIPE_FILES = ['vision_bundle.mjs', 'wasm/vision_wasm_internal.js', 'wasm/vision_wasm_internal.wasm', 'wasm/vision_wasm_nosimd_internal.js', 'wasm/vision_wasm_nosimd_internal.wasm'];
// three.js addons the app imports: whole folders when their files import each other, single files otherwise
const ADDON_FOLDERS = ['postprocessing', 'shaders'];
const ADDON_FILES = ['loaders/GLTFLoader.js', 'utils/BufferGeometryUtils.js'];

fs.rmSync(dist, { recursive: true, force: true });
fs.cpSync(renderer, dist, { recursive: true });
fs.rmSync(path.join(dist, 'package.json'), { force: true }); // only for Node's test runner

fs.mkdirSync(path.join(dist, 'vendor'), { recursive: true });
fs.copyFileSync(threeSource, path.join(dist, 'vendor', 'three.module.js'));
ADDON_FOLDERS.forEach((folder) => fs.cpSync(path.join(addonsSource, folder), path.join(dist, 'vendor', 'addons', folder), { recursive: true }));
ADDON_FILES.forEach((file) => {
  const target = path.join(dist, 'vendor', 'addons', file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(addonsSource, file), target);
});
MEDIAPIPE_FILES.forEach((file) => {
  const target = path.join(dist, 'vendor', 'mediapipe', file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(mediapipeSource, file), target);
});
fs.copyFileSync(path.join(root, 'project-logo.png'), path.join(dist, 'favicon.png'));

const indexPath = path.join(dist, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
for (const [from, to] of IMPORT_MAP) {
  if (!html.includes(from)) throw new Error(`Import map entry not found in renderer/index.html: ${from}`);
  html = html.replace(from, to);
}
fs.writeFileSync(indexPath, html.replace('<title>', '<link rel="icon" type="image/png" href="favicon.png" />\n  <title>'));

console.log(`Web demo built in ${path.relative(root, dist)}/`);
