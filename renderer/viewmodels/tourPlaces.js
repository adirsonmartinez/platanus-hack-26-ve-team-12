// Where each stop of the tour (or each folder being built) is on the map. The map draws every top-level
// folder (`buildings`) and the folders of the open path (`branches`); anything else (a folder the agent
// just created, a stop deeper than what is open) gets a temporary "ghost" place in a row under the tree
// (layout.js ghostSlots) while it lasts. Pure.
//   placesFor(steps, { plaza, buildings, branches }) -> Map(step id -> place)
//   place: { kind: 'plaza'|'building'|'ghost', path, x, z, stand: { x, z }, zoom }
// A folder stop is its own place (apps/api and apps/web are two); a file goes to the place of the
// folder stop that holds it, else to its top folder; the project and root files are the plaza.
import { FOLDER, ghostSlots } from './layout.js';

const PLAZA_ZOOM = 1.6;
const FOLDER_ZOOM = 1.3;

const topOf = (path) => path.split('/')[0];
const inside = (path, dir) => path === dir || path.startsWith(`${dir}/`);

// The robot stands between the place and the plaza, just off the folder's platform
export function standBy(x, z, gap) {
  const length = Math.hypot(x, z);
  if (!length) return { x: 1.1, z: 1.1 };
  return { x: x - (x / length) * gap, z: z - (z / length) * gap };
}

export function placesFor(steps, { buildings = [], branches = [] } = {}) {
  const plazaPlace = { kind: 'plaza', path: '', x: 0, z: 0, stand: { x: 1.1, z: 1.1 }, zoom: PLAZA_ZOOM };
  const folders = steps.filter((s) => s.kind === 'folder' && s.target).map((s) => s.target);
  const drawn = [...buildings, ...branches.flatMap((b) => b.folders ?? [])];
  const isDrawn = (path) => drawn.some((b) => b.path === path);
  // Which path each stop is shown at ('' = the plaza): itself if the map draws it, else its top folder
  const pathOf = (step) => {
    const target = step.target ?? '';
    if (step.kind === 'place' || !target || !target.includes('/') && step.kind !== 'folder') return '';
    if (step.kind === 'folder' && isDrawn(target)) return target;
    if (isDrawn(topOf(target))) return topOf(target);
    if (step.kind === 'folder') return target;
    return folders.filter((f) => inside(target, f)).sort((a, b) => b.length - a.length)[0] ?? topOf(target);
  };
  const byPath = new Map([['', plazaPlace]]);
  const ghosts = [];
  for (const step of steps) {
    const path = pathOf(step);
    if (byPath.has(path) || ghosts.includes(path)) continue;
    const building = drawn.find((b) => b.path === path);
    if (building) byPath.set(path, { kind: 'building', path, x: building.x, z: building.z, stand: standBy(building.x, building.z, FOLDER.platform / 2 + 1), zoom: FOLDER_ZOOM });
    else ghosts.push(path);
  }
  ghostSlots(drawn, ghosts.length).forEach((slot, i) => {
    byPath.set(ghosts[i], { kind: 'ghost', path: ghosts[i], x: slot.x, z: slot.z, stand: standBy(slot.x, slot.z, FOLDER.platform / 2 + 1), zoom: FOLDER_ZOOM });
  });
  return new Map(steps.map((s) => [s.id, byPath.get(pathOf(s))]));
}
