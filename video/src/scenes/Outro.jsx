// The last 6 s: back on the warm table, close to the robot that waves next to the screens, and the name.
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import { STILLS, Table, useCameraPath } from '../three/Table.jsx';
import { useTextures } from '../three/useImageTexture.js';
import { Robot } from '../three/Robot.jsx';
import { FONT } from '../fonts.js';
import { ACCENT, BG, INK, MUTED } from './palette.js';
import { SIZE } from '../timing.js';

function World({ frame, duration, textures }) {
  const { camera } = useThree();
  useCameraPath(camera, frame, [
    [0, [0.6, 2.3, 7.4], [0.3, 0.4, 0.5]],
    [duration, [0.1, 1.9, 6.2], [0.3, 0.45, 0.6]],
  ], Easing.out(Easing.cubic));
  return (
    <>
      <Table textures={textures} />
      <Robot frame={frame} camera={camera} stops={[{ frame: 0, x: -1.3, z: 2.0 }]} wave={[[12, duration]]} />
    </>
  );
}

const rise = (age) => ({
  opacity: interpolate(age, [0, 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
  transform: `translateY(${interpolate(age, [0, 14], [24, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) })}px)`,
});

export function Outro({ duration }) {
  const frame = useCurrentFrame();
  const textures = useTextures(STILLS);
  return (
    <AbsoluteFill>
      {textures && <ThreeCanvas width={SIZE.width} height={SIZE.height} shadows camera={{ fov: 35, near: 0.1, far: 60 }} gl={{ antialias: true }}>
        <World frame={frame} duration={duration} textures={textures} />
      </ThreeCanvas>}
      {/* the right side fades into the warm table, so the words read clearly */}
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(90deg, transparent 32%, ${BG}e6 50%, ${BG} 62%)` }} />
      <div style={{ position: 'absolute', right: 120, top: 250, width: 780, fontFamily: FONT, color: INK }}>
        <div style={{ ...rise(frame - 10), display: 'flex', alignItems: 'center', gap: 22 }}>
          <div style={{ width: 84, height: 84, borderRadius: 22, background: ACCENT, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 50, fontWeight: 700, boxShadow: '0 16px 40px rgba(139,131,255,0.45)' }}>P</div>
          <div style={{ fontSize: 96, fontWeight: 750, letterSpacing: '-0.045em' }}>Platanus</div>
        </div>
        <div style={{ ...rise(frame - 22), marginTop: 30, fontSize: 46, fontWeight: 650, letterSpacing: '-0.025em', lineHeight: 1.1 }}>Entiende cualquier proyecto desde el primer día.</div>
        <div style={{ ...rise(frame - 32), marginTop: 20, fontSize: 28, color: MUTED, lineHeight: 1.35 }}>El mapa y el agente que te guían por el código, con tus palabras.</div>
        <div style={{ ...rise(frame - 44), marginTop: 40, display: 'inline-flex', padding: '18px 30px', borderRadius: 999, background: INK, color: '#fff', fontSize: 28, fontWeight: 600 }}>Abre tu proyecto y pide un recorrido</div>
      </div>
    </AbsoluteFill>
  );
}
