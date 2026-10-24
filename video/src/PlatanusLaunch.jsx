// The product video: a 3D intro (the app's screens on a warm table, the Platanus robot hopping between
// them), the real app recorded (the tour, then the agent at work), and a 3D closing with the robot.
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from 'remotion';
import { CameraMotionBlur } from '@remotion/motion-blur';
import { FADE, plan } from './timing.js';
import { Intro } from './scenes/Intro.jsx';
import { AppShot } from './scenes/AppShot.jsx';
import { Outro } from './scenes/Outro.jsx';
import { BG } from './scenes/palette.js';
import './fonts.js';

// Fades a part in and out over FADE frames at its edges
function Fade({ duration, children, first = false, last = false }) {
  const frame = useCurrentFrame();
  const opacity = Math.min(
    first ? 1 : interpolate(frame, [0, FADE], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
    last ? 1 : interpolate(frame, [duration - FADE, duration], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
  );
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
}

export function PlatanusLaunch({ markers, cursor }) {
  if (!markers) return <AbsoluteFill style={{ background: BG }} />;
  const p = plan(markers);
  return (
    <AbsoluteFill style={{ background: BG }}>
      <Sequence durationInFrames={p.intro.duration} name="Intro 3D">
        <Fade duration={p.intro.duration} first>
          <CameraMotionBlur samples={6} shutterAngle={200}>
            <Intro duration={p.intro.duration} />
          </CameraMotionBlur>
        </Fade>
      </Sequence>
      <Sequence from={p.tour.from} durationInFrames={p.tour.duration} name="Recorrido (app)">
        <Fade duration={p.tour.duration}>
          <AppShot part={p.tour} markers={markers} cursor={cursor} enter />
        </Fade>
      </Sequence>
      <Sequence from={p.agent.from} durationInFrames={p.agent.duration} name="Agente (app)">
        <Fade duration={p.agent.duration}>
          <AppShot part={p.agent} markers={markers} cursor={cursor} />
        </Fade>
      </Sequence>
      <Sequence from={p.outro.from} durationInFrames={p.outro.duration} name="Cierre 3D">
        <Fade duration={p.outro.duration} last>
          <CameraMotionBlur samples={4} shutterAngle={160}>
            <Outro duration={p.outro.duration} />
          </CameraMotionBlur>
        </Fade>
      </Sequence>
    </AbsoluteFill>
  );
}
