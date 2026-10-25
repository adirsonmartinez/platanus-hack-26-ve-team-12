// File icons standing on the ground of the tree (root files, the files of an open folder), riskiest first.
import * as THREE from 'three';
import { buildFileIcon } from './fileIconBuilder.js';

function addIcon(g, file, x, y, z, index) {
  const icon = buildFileIcon(file.level);
  icon.position.set(x, y, z);
  icon.traverse((o) => { o.userData.pick = { type: 'file', path: file.path }; });
  g.add(icon);
  return { mesh: icon, index };
}

// files: [{ path, level, x, z }] in world units, standing on the ground at `scale`
export function buildFileIcons(files, scale = 1) {
  const g = new THREE.Group();
  const icons = files.map((file, i) => {
    const icon = addIcon(g, file, file.x, 0, file.z, i);
    icon.mesh.scale.setScalar(scale);
    return icon;
  });
  return { group: g, top: 0, icons };
}
