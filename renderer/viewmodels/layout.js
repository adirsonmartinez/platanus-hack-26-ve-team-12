// World layout shared by view models (to place things / aim the camera) and views (to build them).
// Units are map grid cells.
import { clamp } from '../core/format.js';
import { CAMERA } from './cameraViewModel.js';

// Git view: commits advance along X (newest at x = 0), each lane is a row along Z
export const GIT_LAYOUT = { step: 2.4, laneGap: 3.6, zoom: 1.2 };

// The map is laid out in tree terms: u goes across the tree, v down it. At a camera azimuth of π/4 that is
// right and down on screen ((+x, -z) and (+x, +z) on the ground); the default camera (azimuth 0) sees the
// tree at a diagonal, running down to the right.
const SQRT1_2 = Math.SQRT1_2;
export const toWorld = (u, v) => ({ x: (u + v) * SQRT1_2, z: (v - u) * SQRT1_2 });
export const screenOf = (x, z) => ({ u: (x - z) * SQRT1_2, v: (x + z) * SQRT1_2 });
export const SCREEN_ANGLE = Math.PI / 4; // rotation (around y) that lines up a box with the screen axes

// Plaza: the platform at the top of the tree, with the project's root files
export const PLAZA = { cube: 0.7, pitch: 1.0, margin: 0.9, minSize: 5 };

export function plazaGrid(fileCount) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(fileCount)));
  const size = Math.max(PLAZA.minSize, cols * PLAZA.pitch + PLAZA.margin * 2);
  return { cols, size };
}

// Folder on the map: its icon footprint and the platform it stands on
export const FOLDER = { size: 3, platform: 4.6 };

export const folderHeight = (files) => Math.min(1.2 + Math.log2(1 + files) * 1.4, 9);

// A folder as a box: wide and low, a bit taller with each doubling of its files (log scale, capped)
export const BOX = { size: 2.2, minHeight: 0.8, step: 0.45, maxHeight: 4.5 };
export const boxHeight = (files) => Math.min(BOX.minHeight + Math.log2(1 + files) * BOX.step, BOX.maxHeight);

// The tree: the project at the top, the top-level folders in rows below it, and the open path unfolding
// one level per block further down. `top` is the rows of top-level folders, `branch` the contents of an
// open folder: the same size at every depth (nothing shrinks as you go down).
const ROWS = { pitch: 9, cols: 8, rowGap: 9 };
export const TREE = {
  top: ROWS,
  branch: ROWS,
  gap: 5,          // from the project (or a folder) down to the bar its children hang from, and below
  itemHalf: { top: 2.6, branch: 2.6 }, // half of an item's depth on screen: where the next level starts
};

// Items hanging from a parent: rows of up to `cols`, centered under the parent (but never left of `minU`),
// the first row at `startV`. `insert` opens a gap of `height` after row `row` (an open folder's contents
// unfold there, and the rows below move down). Links (in screen coordinates [u1, v1, u2, v2]) draw it as a
// comb: a trunk down from the parent to a bar over the first row, one drop per item, and a spine on the
// left joining the rows.
export function treeBlock(count, { parentU, parentV, startV, pitch, cols, rowGap, minU = -Infinity, insert = null }) {
  const rows = Math.max(1, Math.ceil(count / cols));
  const width = (Math.min(count, cols) - 1) * pitch;
  const left = Math.max(parentU - width / 2, minU);
  const rowV = (r) => startV + r * rowGap + (insert && r > insert.row ? insert.height : 0);
  const slots = Array.from({ length: count }, (_, i) => ({ u: left + (i % cols) * pitch, v: rowV(Math.floor(i / cols)) }));
  const links = [];
  if (!count) return { slots, links, endV: startV, width: 0, spine: null };

  const bar = (r) => rowV(r) - rowGap / 2;
  const spine = rows > 1 ? left - pitch / 2 : null;
  links.push([parentU, parentV, parentU, bar(0)]);
  for (let r = 0; r < rows; r++) {
    const rowSlots = slots.slice(r * cols, (r + 1) * cols);
    const ends = rowSlots.map((s) => s.u).concat(r === 0 ? [parentU] : []).concat(spine === null ? [] : [spine]);
    links.push([Math.min(...ends), bar(r), Math.max(...ends), bar(r)]);
    rowSlots.forEach((s) => links.push([s.u, bar(r), s.u, s.v]));
  }
  if (spine !== null) links.push([spine, bar(0), spine, bar(rows - 1)]);
  return { slots, links, endV: rowV(rows - 1), width, spine };
}

// Integrations (Supabase…) live in a darker band across the top of the map, above the plaza. Their
// builders work along +x from the plaza; INTEGRATIONS.rotation turns that axis up the screen.
export const INTEGRATIONS = { rotation: (3 * Math.PI) / 4, bandTop: -23, bandBottom: -8, margin: 9, minWidth: 48 };
export function integrationToWorld({ x, z }) {
  const c = Math.cos(INTEGRATIONS.rotation), s = Math.sin(INTEGRATIONS.rotation);
  return { x: x * c + z * s, z: -x * s + z * c };
}

// The other integrations: nodes in a row along the band, right of Supabase (which sits at u = 0), joined
// to the plaza by a road along the band's lower edge
export const INTEGRATION_ROW = { firstU: 12, pitch: 11, busV: -10 };
export const integrationV = (INTEGRATIONS.bandTop + INTEGRATIONS.bandBottom) / 2;

// Supabase, in the integrations' own axes (+x up the screen once rotated), in line with the other nodes
export const SUPABASE_NODE = { x: -integrationV, z: 0 };
export const SCHEMA_CENTER = { x: SUPABASE_NODE.x - 0.4, z: SUPABASE_NODE.z - 13 };

// Camera target and zoom that fit ground points on screen at the default camera angle. Screen across is
// (cos a, -sin a) on the ground, screen depth (sin a, cos a), foreshortened by the elevation. The usable
// area leaves room for the panels floating over the map.
const VISIBLE = { across: 40, down: 24 };
export function fitView(points) {
  const a = CAMERA.azimuth, c = Math.cos(a), s = Math.sin(a);
  const across = points.map((p) => p.x * c - p.z * s);
  const depth = points.map((p) => p.x * s + p.z * c);
  const mid = (list) => (Math.min(...list) + Math.max(...list)) / 2;
  const span = (list) => Math.max(Math.max(...list) - Math.min(...list), 1);
  const r = mid(across), d = mid(depth);
  const zoom = clamp(Math.min(VISIBLE.across / span(across), VISIBLE.down / (span(depth) * Math.sin(CAMERA.elevation))), 0.4, 1.2);
  return { x: r * c + d * s, z: -r * s + d * c, zoom };
}

// Places for folders the map does not show yet (a folder an agent just created, a tour stop): a row under
// the whole tree, after everything else, so they never land on a folder. points: what the map draws.
export function ghostSlots(points, count) {
  const { pitch, cols, rowGap } = TREE.top;
  const below = points.length ? Math.max(...points.map((p) => screenOf(p.x, p.z).v)) : 0;
  const left = -((Math.min(count, cols) - 1) * pitch) / 2;
  return Array.from({ length: count }, (_, i) => toWorld(left + (i % cols) * pitch, below + rowGap + Math.floor(i / cols) * rowGap));
}
