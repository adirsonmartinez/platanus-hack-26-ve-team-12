// The warm table of the 3D parts: soft light, a floor that takes shadows, and the app's screens leaning
// back like open laptops (each one shows a still of the recording). The middle one shows the first
// frame of the recording, so diving into it leads straight into the app.
import * as THREE from 'three';
import { BG } from '../scenes/palette.js';

export const SCREEN = { w: 3.2, h: 1.8, depth: 0.09, tilt: 0.45 };
export const SCREENS = [
  { still: 'takes/stills/tour.jpg', x: -3.9, z: 0.1, rot: 0.2 },
  { still: 'takes/stills/map.jpg', x: 0, z: -0.4, rot: 0 },
  { still: 'takes/stills/agent.jpg', x: 3.9, z: 0.1, rot: -0.2 },
];
// The middle screen's center and the direction it faces (the camera ends looking straight at it)
const lift = (SCREEN.h / 2) * Math.sin(SCREEN.tilt) + 0.05;
export const MIDDLE = { center: [0, lift, -0.4], normal: [0, Math.cos(SCREEN.tilt), Math.sin(SCREEN.tilt)] };
// The camera distance at which the middle screen fills `share` of the frame's width (fov 35, 16:9)
export const fillDistance = (share) => SCREEN.w / (share * 2 * Math.tan((17.5 * Math.PI) / 180) * (16 / 9));

export const STILLS = SCREENS.map((s) => s.still);

function Screen({ texture, x, z, rot }) {
  return (
    <group position={[x, lift, z]} rotation={[SCREEN.tilt, rot, 0, 'YXZ']}>
      <mesh castShadow receiveShadow position={[0, SCREEN.depth / 2, 0]}>
        <boxGeometry args={[SCREEN.w + 0.16, SCREEN.depth, SCREEN.h + 0.16]} />
        <meshStandardMaterial color="#2a2b30" roughness={0.45} metalness={0.25} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, SCREEN.depth + 0.002, 0]}>
        <planeGeometry args={[SCREEN.w, SCREEN.h]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  );
}

// textures: { still file: texture } (useTextures(STILLS), loaded before the canvas is mounted)
export function Table({ textures }) {
  return (
    <>
      <color attach="background" args={[BG]} />
      <fog attach="fog" args={[BG, 9, 22]} />
      <hemisphereLight args={['#fff8ee', '#cbb9a2', 0.75]} />
      <ambientLight intensity={0.25} color="#fff1e0" />
      <directionalLight
        castShadow
        position={[-3, 8, 4]}
        intensity={2.8}
        color="#fff3e2"
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={9}
        shadow-camera-bottom={-9}
        shadow-bias={-0.0004}
        shadow-radius={6}
      />
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#efe6d8" roughness={0.92} />
      </mesh>
      {SCREENS.map((s) => <Screen key={s.still} {...s} texture={textures[s.still]} />)}
    </>
  );
}

// Moves the camera along keyframes [frame, position, target] with an eased path
export function useCameraPath(camera, frame, keys, ease) {
  const at = (pick) => {
    const i = Math.max(0, keys.findIndex((k, n) => frame >= k[0] && frame <= (keys[n + 1]?.[0] ?? Infinity)));
    const a = keys[i];
    const b = keys[i + 1] ?? a;
    const k = b === a ? 0 : ease(Math.min(1, Math.max(0, (frame - a[0]) / (b[0] - a[0]))));
    return pick(a).map((v, j) => v + (pick(b)[j] - v) * k);
  };
  camera.position.set(...at((k) => k[1]));
  camera.lookAt(new THREE.Vector3(...at((k) => k[2])));
}
