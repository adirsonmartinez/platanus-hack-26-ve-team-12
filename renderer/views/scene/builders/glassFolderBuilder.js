// A folder of frosted glass: a dark back panel with its tab, white sheets with text lines peeking out,
// and a frosted front panel (MeshPhysicalMaterial transmission) that shows the sheets blurred through it.
// Every folder has the same size: more files means more sheets inside. Problems light up the base.
import * as THREE from 'three';
import { box, glowPad, materials as M, platform } from '../materials.js';
import { LEVEL_STYLE } from '../../theme.js';

const HEIGHT = 2.5;       // back panel, without its tab
export const GLASS_FOLDER_HEIGHT = HEIGHT + 0.26; // with its tab (files on the map match it)
const FRONT = 0.62;       // the front panel's height, as a share of HEIGHT
const DEPTH = 0.7;        // back to front
const PANEL = 0.08;
const TAB = 0.26;
const MAX_SHEETS = 4;

// One sheet for an almost empty folder, up to MAX_SHEETS (log scale)
const sheetCount = (files) => Math.min(Math.max(Math.floor(Math.log2(1 + files) / 2), 1), MAX_SHEETS);

const cache = new Map();
const cached = (key, make) => (cache.has(key) ? cache.get(key) : cache.set(key, make()).get(key));

// Rounded panel; `tab`: a raised tab on the left (back panel); `dip`: a soft dip in the middle of the
// top edge (front panel)
function panelGeometry(width, height, { tab = false, dip = false } = {}) {
  return cached(`panel:${width}:${height}:${tab}:${dip}`, () => {
    const w = width / 2, r = 0.16;
    const s = new THREE.Shape();
    s.moveTo(-w + r, 0);
    s.lineTo(w - r, 0);
    s.quadraticCurveTo(w, 0, w, r);
    s.lineTo(w, height - r);
    s.quadraticCurveTo(w, height, w - r, height);
    if (dip) {
      s.lineTo(0.45, height);
      s.quadraticCurveTo(0.3, height, 0.25, height - 0.09);
      s.lineTo(-0.25, height - 0.09);
      s.quadraticCurveTo(-0.3, height, -0.45, height);
    }
    if (tab) {
      const end = -w + width * 0.4;
      s.lineTo(end + TAB, height);
      s.quadraticCurveTo(end, height, end, height + TAB * 0.5);
      s.quadraticCurveTo(end, height + TAB, end - TAB, height + TAB);
      s.lineTo(-w + r, height + TAB);
      s.quadraticCurveTo(-w, height + TAB, -w, height + TAB - r);
    } else {
      s.lineTo(-w + r, height);
      s.quadraticCurveTo(-w, height, -w, height - r);
    }
    s.lineTo(-w, r);
    s.quadraticCurveTo(-w, 0, -w + r, 0);
    const geometry = new THREE.ExtrudeGeometry(s, { depth: PANEL, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2, curveSegments: 6 });
    geometry.translate(0, 0, -PANEL / 2);
    return geometry;
  });
}

// Frosted glass: lets the sheets through, blurred; a dark tint like the reference
function glass() {
  return cached('glass', () => new THREE.MeshPhysicalMaterial({
    color: 0xaab2bc, transmission: 0.7, roughness: 0.6, thickness: 0.4, ior: 1.3,
    metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.5,
  }));
}
const back = () => cached('back', () => new THREE.MeshStandardMaterial({ color: 0x3a4049, roughness: 0.7, metalness: 0.1 }));
const lineMat = () => cached('line', () => new THREE.MeshStandardMaterial({ color: 0xc9ced4, roughness: 0.8, metalness: 0 }));

function panel(parent, geometry, mat, y, z) {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.set(0, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

// size: the folder's width; files: how many files it holds
export function buildGlassFolder({ size, files, level, platformSize = size + 1.2 }) {
  const g = new THREE.Group();
  const base = platform(g, platformSize, platformSize);
  const width = size;

  panel(g, panelGeometry(width, HEIGHT, { tab: true }), back(), base, -DEPTH / 2);

  // Sheets, from the back, each a little lower and narrower; two text lines near the top
  const sheets = sheetCount(files);
  for (let i = 0; i < sheets; i++) {
    const w = width - 0.45 - i * 0.12, h = HEIGHT * 0.9 - i * 0.12;
    const z = -DEPTH / 2 + 0.14 + i * 0.1;
    box(g, M.white, w, h, 0.03, 0, base, z).castShadow = false;
    box(g, lineMat(), w * 0.78, 0.07, 0.01, 0, base + h - 0.32, z + 0.02).castShadow = false;
    box(g, lineMat(), w * 0.42, 0.07, 0.01, -w * 0.18, base + h - 0.5, z + 0.02).castShadow = false;
  }

  panel(g, panelGeometry(width + 0.06, HEIGHT * FRONT, { dip: true }), glass(), base, DEPTH / 2);
  box(g, back(), width, 0.12, DEPTH, 0, base, 0); // the fold at the bottom

  const glow = LEVEL_STYLE[level]?.glow;
  if (glow) glowPad(g, glow, platformSize - 0.4, platformSize - 0.4, base + 0.01);

  return { group: g, top: base + HEIGHT + TAB };
}
