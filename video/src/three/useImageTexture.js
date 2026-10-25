// Images (from public/) as three.js textures, loaded once and shared. The frame waits for them, and the
// 3D canvas is only mounted once they are there (a texture that arrives later is not drawn).
import { useEffect, useState } from 'react';
import { cancelRender, continueRender, delayRender, staticFile } from 'remotion';
import * as THREE from 'three';

const cache = new Map();

function loadTexture(file) {
  if (!cache.has(file)) {
    cache.set(file, new Promise((resolve, reject) => {
      new THREE.TextureLoader().load(staticFile(file), (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 8;
        resolve(t);
      }, undefined, reject);
    }));
  }
  return cache.get(file);
}

// { file: texture } once every file is loaded, null before
export function useTextures(files) {
  const [handle] = useState(() => delayRender(`texturas ${files.join(', ')}`));
  const [textures, setTextures] = useState(null);
  useEffect(() => {
    Promise.all(files.map(loadTexture))
      .then((list) => { setTextures(Object.fromEntries(files.map((f, i) => [f, list[i]]))); continueRender(handle); })
      .catch((err) => cancelRender(err));
  }, [files.join('|'), handle]);
  return textures;
}
