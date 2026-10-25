// Git view in 3D, minimal: each lane is a thin line, each commit a cube. Forks and merges are thin
// diagonal lines. HEAD floats slightly, framed by a square of lines on the ground. Commits that leaked
// secrets are red. Every lane has its own materials so it can be dimmed when another lane is focused.
import * as THREE from 'three';
import { box, groundLink, materials as M, PALETTE } from '../materials.js';

export const LANE_COLORS = {
  main: 0xf4f6f8, develop: PALETTE.accent, feature: 0x8d959e, release: 0xc9ced4,
  hotfix: PALETTE.warn, remote: 0x4a5159, other: 0x5d6670,
};
export const laneColorCss = (kind) => `#${LANE_COLORS[kind].toString(16).padStart(6, '0')}`;

const LINE = { width: 0.12, height: 0.03, y: 0.01 };
const CUBE = 0.8;
const MERGE_CUBE = 0.5;
const FRAME = 1.5; // HEAD square

function laneMaterials(kind) {
  const color = LANE_COLORS[kind];
  return {
    line: new THREE.MeshStandardMaterial({ color, roughness: 0.5, transparent: true }),
    cube: new THREE.MeshStandardMaterial({ color, roughness: 0.45, transparent: true }),
  };
}

// Square outline made of four thin lines, centered on (x, z)
function frame(parent, material, x, z, size) {
  const h = size / 2;
  const w = LINE.width;
  [[0, -h, size, w], [0, h, size, w], [-h, 0, w, size], [h, 0, w, size]].forEach(([dx, dz, sx, sz]) => {
    box(parent, material, sx, LINE.height, sz, x + dx, LINE.y, z + dz).castShadow = false;
  });
}

export function buildGitGraph({ lanes, commits, connectors, head }) {
  const group = new THREE.Group();
  const mats = new Map(lanes.map((l) => [l.name, laneMaterials(l.kind)]));
  const cubes = []; // { mesh, index, size, baseY } for the rise animation

  // Lines go from face to face, so they never cross or stick out of a cube
  const sizeAt = new Map(commits.map((c) => [`${c.x},${c.z}`, c.isMerge ? MERGE_CUBE : CUBE]));
  const half = (p) => (sizeAt.get(`${p.x},${p.z}`) ?? CUBE) / 2;
  function line(material, a, b, pick) {
    const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
    // Distance from the center to the cube face along the line direction (cubes are axis aligned)
    const edge = (p) => half(p) / Math.max(Math.abs(dx), Math.abs(dz)) * length;
    const start = edge(a), end = length - edge(b);
    if (end - start <= 0.01) return;
    const ux = dx / length, uz = dz / length;
    const mesh = groundLink(group, material, a.x + ux * start, a.z + uz * start, a.x + ux * end, a.z + uz * end, LINE.width, LINE.height);
    mesh.castShadow = false;
    if (pick) mesh.userData.pick = pick;
  }

  lanes.forEach((lane) => {
    const own = commits.filter((c) => c.lane === lane.name).sort((a, b) => a.x - b.x);
    for (let i = 1; i < own.length; i++) line(mats.get(lane.name).line, own[i - 1], own[i], { type: 'lane', name: lane.name });
  });

  connectors.forEach((c) => line((mats.get(c.lane) ?? mats.values().next().value).line, c.from, c.to));

  commits.forEach((commit, index) => {
    const size = commit.isMerge ? MERGE_CUBE : CUBE;
    const isHead = head?.sha === commit.sha;
    const baseY = isHead ? 0.35 : 0;
    const mesh = box(group, commit.risk ? M.dangerSolid : mats.get(commit.lane).cube, size, size, size, commit.x, baseY, commit.z);
    mesh.userData.pick = { type: 'commit', sha: commit.sha };
    cubes.push({ mesh, index, size, baseY });
  });

  let headFrame = null;
  if (head) {
    headFrame = new THREE.Group();
    frame(headFrame, M.accentLit, 0, 0, FRAME);
    headFrame.position.set(head.x, 0, head.z);
    group.add(headFrame);
  }

  return {
    group,
    cubes,
    headFrame,
    // Dim every lane except the focused one (null = all normal)
    setFocus(name) {
      mats.forEach((m, laneName) => {
        const opacity = name && laneName !== name ? 0.15 : 1;
        [m.line, m.cube].forEach((mat) => { mat.opacity = opacity; mat.depthWrite = opacity === 1; });
      });
    },
  };
}
