// Isometric folder for a subfolder: a back panel with its tab, a few sheets and a front panel that
// leans open, standing on the usual platform. Every folder has the same size: more files means more
// sheets inside (and a cover that opens a bit more). Problems light up the base.
import * as THREE from 'three';
import { box, glowPad, materials as M, platform } from '../materials.js';
import { LEVEL_STYLE } from '../../theme.js';

const PANEL = 0.16;      // thickness of each cover
const THICKNESS = 0.95;  // back to front
const TAB_HEIGHT = 0.32;
const HEIGHT = 2.6;
const MAX_SHEETS = 7;
const SHEET_GAP = 0.075;

// Extruded panel shapes, cached by size (the map rebuilds often)
const geometryCache = new Map();
function panelGeometry(width, height, withTab) {
  const key = `${width.toFixed(2)}:${height.toFixed(2)}:${withTab}`;
  if (geometryCache.has(key)) return geometryCache.get(key);
  const w = width / 2, r = 0.12;
  const s = new THREE.Shape();
  s.moveTo(-w, 0);
  s.lineTo(w, 0);
  s.lineTo(w, height - r);
  s.quadraticCurveTo(w, height, w - r, height);
  if (withTab) {
    // Tab on the left: flat top, sloped right edge
    const tabEnd = -w + width * 0.42;
    s.lineTo(tabEnd + TAB_HEIGHT, height);
    s.lineTo(tabEnd, height + TAB_HEIGHT);
    s.lineTo(-w + r, height + TAB_HEIGHT);
    s.quadraticCurveTo(-w, height + TAB_HEIGHT, -w, height + TAB_HEIGHT - r);
  } else {
    s.lineTo(-w + r, height);
    s.quadraticCurveTo(-w, height, -w, height - r);
  }
  s.lineTo(-w, 0);
  const geometry = new THREE.ExtrudeGeometry(s, { depth: PANEL, bevelEnabled: false, curveSegments: 4 });
  geometry.translate(0, 0, -PANEL / 2);
  geometryCache.set(key, geometry);
  return geometry;
}

function panel(parent, mat, width, height, withTab, y, z) {
  const mesh = new THREE.Mesh(panelGeometry(width, height, withTab), mat);
  mesh.position.set(0, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

// One sheet for an almost empty folder, up to MAX_SHEETS (log scale: 1, 3, 7, 15... files)
export const sheetCount = (files) => Math.min(Math.max(Math.floor(Math.log2(1 + files)), 1), MAX_SHEETS);

// size: footprint (width of the folder); files: how many files it holds
export function buildFolderIcon({ size, files, level, platformSize = size + 1.6 }) {
  const g = new THREE.Group();
  const base = platform(g, platformSize, platformSize);
  const width = size + 0.4;
  const h = HEIGHT;
  const sheets = sheetCount(files);
  const back = -THICKNESS / 2 + PANEL / 2;
  const front = THICKNESS / 2 - PANEL / 2;

  box(g, M.bodyDark, width, PANEL, THICKNESS, 0, base, 0);              // spine at the bottom
  panel(g, M.body, width, h, true, base, back);                         // back cover with the tab
  for (let i = 0; i < sheets; i++) {                                    // sheets, slightly uneven
    const inset = 0.3 + (i % 3) * 0.12;
    box(g, M.white, width - inset, h - 0.15 - (i % 2) * 0.12, 0.05, (i % 2 ? 0.08 : -0.05), base, back + 0.15 + i * SHEET_GAP);
  }
  // The fuller the folder, the more the front cover opens
  panel(g, M.bodyLight, width, h * 0.9, false, base, front).rotation.x = 0.06 + sheets * 0.035;

  const glow = LEVEL_STYLE[level]?.glow;
  if (glow) glowPad(g, glow, platformSize - 0.5, platformSize - 0.5, base + 0.01);

  return { group: g, top: base + h + TAB_HEIGHT };
}
