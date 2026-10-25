// Isometric file for a file with a problem: a standing sheet with a folded corner and a few text
// lines, in its traffic-light color. The group's origin is its base, so it can grow from the ground.
import * as THREE from 'three';
import { box, materials as M } from '../materials.js';
import { LEVEL_STYLE } from '../../theme.js';

export const FILE_ICON = { width: 0.62, height: 0.84, depth: 0.12 };
const FOLD = 0.2;

let sheetGeometry = null;
let foldGeometry = null;
function geometries() {
  if (sheetGeometry) return { sheet: sheetGeometry, fold: foldGeometry };
  const { width, height, depth } = FILE_ICON;
  const w = width / 2;
  // The sheet without its top right corner
  const sheet = new THREE.Shape();
  sheet.moveTo(-w, 0);
  sheet.lineTo(w, 0);
  sheet.lineTo(w, height - FOLD);
  sheet.lineTo(w - FOLD, height);
  sheet.lineTo(-w, height);
  sheet.lineTo(-w, 0);
  sheetGeometry = new THREE.ExtrudeGeometry(sheet, { depth, bevelEnabled: false });
  sheetGeometry.translate(0, 0, -depth / 2);
  // The folded corner, on the front face
  const fold = new THREE.Shape();
  fold.moveTo(w - FOLD, height);
  fold.lineTo(w - FOLD, height - FOLD);
  fold.lineTo(w, height - FOLD);
  fold.lineTo(w - FOLD, height);
  foldGeometry = new THREE.ExtrudeGeometry(fold, { depth: 0.03, bevelEnabled: false });
  foldGeometry.translate(0, 0, depth / 2);
  return { sheet: sheetGeometry, fold: foldGeometry };
}

function mesh(parent, geometry, mat) {
  const m = new THREE.Mesh(geometry, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

export function buildFileIcon(level) {
  const g = new THREE.Group();
  const { sheet, fold } = geometries();
  const { width, height, depth } = FILE_ICON;
  mesh(g, sheet, LEVEL_STYLE[level].cube());
  mesh(g, fold, M.white);
  // Text lines on the front face
  [0.52, 0.4, 0.28].forEach((y, i) => {
    box(g, M.white, width * (i === 2 ? 0.4 : 0.6), 0.035, 0.02, -width * (i === 2 ? 0.1 : 0.04), height * y, depth / 2).castShadow = false;
  });
  return g;
}
