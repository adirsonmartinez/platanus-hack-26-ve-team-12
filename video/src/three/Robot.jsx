// The Platanus robot of the app (renderer/views/scene/builders/robotBuilder.js), posed frame by frame:
// it stands on a screen, hops to the next one in an arc (squashing when it lands), waves, and looks
// at the camera. Deterministic: the pose only depends on the frame.
import { useMemo } from 'react';
import { buildRobot } from '../../../renderer/views/scene/builders/robotBuilder.js';

const SCALE = 0.3;
const smooth = (k) => k * k * (3 - 2 * k);

// stops: [{ frame, x, z }] where it stands from that frame on; it hops `hop` frames before each one
export function Robot({ frame, stops, hop = 24, wave = [], camera }) {
  const robot = useMemo(() => buildRobot(), []);
  // heading to (or standing on) stops[i]; it leaves stops[i - 1] `hop` frames before stops[i].frame
  const i = Math.max(0, stops.findLastIndex((s) => s.frame - hop <= frame));
  const to = stops[i];
  const from = stops[Math.max(0, i - 1)];
  const k = i === 0 ? 1 : Math.min(1, Math.max(0, (frame - (to.frame - hop)) / hop));
  const e = smooth(k);
  const x = from.x + (to.x - from.x) * e;
  const z = from.z + (to.z - from.z) * e;
  const jumping = k > 0 && k < 1;
  const y = 0.1 + (jumping ? Math.sin(Math.PI * k) * 0.9 : 0);
  // a short squash right after landing
  const since = frame - to.frame;
  const squash = i > 0 && since >= 0 && since <= 6 ? 1 - 0.15 * Math.sin((Math.PI * since) / 6) : 1;

  robot.root.position.set(x, y, z);
  robot.root.scale.set(SCALE * (2 - squash), SCALE * squash, SCALE * (2 - squash));
  const look = jumping ? Math.atan2(to.x - from.x, to.z - from.z) : Math.atan2(camera.position.x - x, camera.position.z - z);
  robot.root.rotation.y = look;
  robot.body.rotation.x = jumping ? 0.25 : 0;
  robot.body.position.y = jumping ? 0 : Math.sin(frame / 9) * 0.06;
  const waving = wave.some(([a, b]) => frame >= a && frame <= b);
  robot.arms[1].rotation.z = waving ? 2.5 + Math.sin(frame / 2.6) * 0.35 : jumping ? 0.9 : 0.1;
  robot.arms[0].rotation.z = jumping ? -0.9 : -0.1;
  robot.head.rotation.z = Math.sin(frame / 14) * 0.08;
  const blink = frame % 96 < 4;
  robot.eyes.forEach((eye) => { eye.scale.y = blink ? 0.02 : 0.12; });
  return <primitive object={robot.root} />;
}
