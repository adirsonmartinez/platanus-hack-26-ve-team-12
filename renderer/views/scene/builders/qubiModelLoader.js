// Optional 3D model for Qubi: renderer/assets/qubi/qubi.glb (or scene.gltf from a glTF download).
// Scaled to Qubi's height, standing on y = 0 and facing +z. Resolves to null when there is no model,
// so the blocky Qubi from qubiBuilder.js is used instead.
import * as THREE from 'three';

const CANDIDATES = ['assets/qubi/qubi.glb', 'assets/qubi/scene.gltf'];
const HEIGHT = 2.4; // same as the blocky Qubi

export async function loadRemiModel() {
  let loader;
  try {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    loader = new GLTFLoader();
  } catch {
    return null; // loader not available (e.g. a web build without three's addons)
  }
  for (const url of CANDIDATES) {
    try {
      const gltf = await loader.loadAsync(url);
      return fit(gltf.scene);
    } catch {
      // not there: try the next one
    }
  }
  return null;
}

function fit(scene) {
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const scale = HEIGHT / Math.max(size.y, 1e-6);
  scene.scale.setScalar(scale);
  const center = box.getCenter(new THREE.Vector3());
  scene.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
  scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const holder = new THREE.Group(); // poses rotate this, so the model's own offset stays intact
  holder.add(scene);
  return holder;
}
