// 0–8 s: the app's screens lying on a warm table; the camera glides over them while the robot hops from
// one to the next, then dives into the middle one (the next part is that screen, alive).
import { AbsoluteFill, Easing, useCurrentFrame } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import { MIDDLE, STILLS, Table, fillDistance, useCameraPath } from '../three/Table.jsx';
import { useTextures } from '../three/useImageTexture.js';
import { Robot } from '../three/Robot.jsx';
import { Headline } from '../overlay/Caption.jsx';
import { SIZE } from '../timing.js';

const ease = Easing.inOut(Easing.cubic);

function World({ frame, duration, textures }) {
  const { camera } = useThree();
  // ends looking straight at the middle screen, at the size the app window has in the next part
  const d = fillDistance(0.88);
  const end = MIDDLE.center.map((c, i) => c + MIDDLE.normal[i] * d);
  useCameraPath(camera, frame, [
    [0, [-6.8, 1.7, 5.4], [-3.7, 0.6, 0]],
    [95, [-1.6, 2.0, 5.8], [-0.6, 0.6, -0.1]],
    [170, [3.8, 1.8, 5.2], [2.8, 0.6, 0]],
    [duration, end, MIDDLE.center],
  ], ease);
  return (
    <>
      <Table textures={textures} />
      <Robot
        frame={frame}
        camera={camera}
        stops={[{ frame: 0, x: -3.2, z: 1.5 }, { frame: 88, x: 0.9, z: 1.1 }, { frame: 150, x: 3.3, z: 1.5 }, { frame: 205, x: -1.0, z: 1.15 }]}
        wave={[[10, 55], [158, 185]]}
      />
    </>
  );
}

export function Intro({ duration }) {
  const frame = useCurrentFrame();
  const textures = useTextures(STILLS);
  return (
    <AbsoluteFill>
      {textures && <ThreeCanvas width={SIZE.width} height={SIZE.height} shadows camera={{ fov: 35, near: 0.1, far: 60 }} gl={{ antialias: true }}>
        <World frame={frame} duration={duration} textures={textures} />
      </ThreeCanvas>}
      {frame < 118 && <Headline age={frame - 8} out={frame - 104} title="Te dieron un proyecto que no conoces." sub="Mil archivos, ninguna pista de por dónde empezar." style={{ left: 110, top: 96, maxWidth: 1100 }} />}
      {frame >= 120 && frame < duration - 22 && <Headline age={frame - 122} out={frame - (duration - 36)} title="Platanus te lo enseña como un mapa." sub="Y un agente que te lo explica con tus palabras." style={{ left: 110, top: 96, maxWidth: 1100 }} />}
    </AbsoluteFill>
  );
}
