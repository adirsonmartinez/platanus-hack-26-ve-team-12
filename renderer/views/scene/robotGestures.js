// Qubi's gestures and faces (pure, no three.js): what guideRobot plays on top of its pose. A gesture is a
// short one-shot move of the hands, head and body; it eases in and out, so it blends with whatever pose
// Qubi holds (talking, listening, pointing). An expression is how the face looks (eyes and mouth).
//   gestureFrame(name, t) -> { w, rz, rx, lz, lx, hx, hy, hz, spin, hop, sway, face } for t seconds into
//   the gesture, or null when it is over (or unknown). w (0..1) is how much the gesture wins over the pose;
//   r*/l* the right/left hand (z: raised to the side, x: forward is negative), h* the head (x: nod down,
//   y: turn, z: tilt), spin the whole robot's turn, hop how high it jumps, sway its sideways lean.
//   face: the expression it makes meanwhile.
//   faceOf(name) -> { eyeY, eyeScale, gazeX, gazeY, mouthX, mouthY, worried } for an expression.
// Names: models/gestures.js (the Spanish words the voice uses in the tool gesto).
import { GESTURES, gestureName } from '../../models/gestures.js';

export { GESTURES, gestureName };

const TAU = Math.PI * 2;
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);

export const EXPRESSIONS = {
  normal: { eyeY: 1, eyeScale: 1, gazeX: 0, gazeY: 0, mouthX: 1, mouthY: 1, worried: false },
  // happy: the eyes squint into a smile and the mouth grows
  feliz: { eyeY: 0.55, eyeScale: 1.05, gazeX: 0, gazeY: 0.005, mouthX: 1.25, mouthY: 1.25, worried: false },
  // surprised: big round eyes and a small "o"
  sorprendido: { eyeY: 1.25, eyeScale: 1.3, gazeX: 0, gazeY: 0.01, mouthX: 0.55, mouthY: 1.5, worried: false },
  // thinking: the eyes look up to one side, a flat little mouth
  pensativo: { eyeY: 0.85, eyeScale: 1, gazeX: 0.03, gazeY: 0.03, mouthX: 0.7, mouthY: 0.55, worried: false },
  // sorry: the worried face (eyes tilted, a frown)
  apenado: { eyeY: 0.9, eyeScale: 1, gazeX: 0, gazeY: -0.01, mouthX: 0.9, mouthY: 0.9, worried: true },
};

export function faceOf(name) {
  return EXPRESSIONS[name] ?? EXPRESSIONS.normal;
}

// In and out in the first and last 15% of the gesture
const envelope = (k) => Math.min(1, k / 0.15, (1 - k) / 0.15);

const MOVES = {
  saludar: (t) => ({ rz: 2.5 + Math.sin(t * 12) * 0.35, rx: 0, hz: -0.12, hx: -0.06, face: 'feliz' }),
  celebrar: (t, k) => ({
    rz: 2.7 + Math.sin(t * 16) * 0.15, lz: -2.7 - Math.sin(t * 16) * 0.15, rx: 0, lx: 0,
    hop: Math.abs(Math.sin(k * TAU)) * 0.55, spin: ease(k) * TAU, hx: -0.12, face: 'feliz',
  }),
  pensar: (t) => ({ rx: -2.1, rz: 0.55, lx: -0.3, hz: 0.24, hx: -0.14 + Math.sin(t * 2) * 0.03, hy: 0.15, face: 'pensativo' }),
  sorpresa: (t, k) => ({ rz: 1.3, lz: -1.3, rx: -0.2, lx: -0.2, hop: Math.sin(Math.min(k * 3, 1) * Math.PI) * 0.35, hx: -0.2, face: 'sorprendido' }),
  encoger: (t, k) => ({ rz: 0.85, lz: -0.85, rx: -0.5, lx: -0.5, hz: 0.22 * Math.sin(k * Math.PI), hop: 0.08 * Math.sin(k * Math.PI), face: 'apenado' }),
  asentir: (t, k) => ({ hx: Math.max(0, Math.sin(k * 2 * TAU)) * 0.3, face: 'feliz' }),
  negar: (t, k) => ({ hy: Math.sin(k * 3 * TAU) * 0.45, face: 'normal' }),
  bailar: (t) => ({
    rz: 1.6 + Math.sin(t * 8) * 0.6, lz: -1.6 + Math.sin(t * 8) * 0.6, rx: 0, lx: 0,
    sway: Math.sin(t * 8) * 0.18, spin: Math.sin(t * 4) * 0.5, hop: Math.abs(Math.sin(t * 8)) * 0.15, hz: Math.sin(t * 8) * 0.15, face: 'feliz',
  }),
  aplaudir: (t) => {
    const clap = Math.abs(Math.sin(t * 14));
    return { rx: -1.3, lx: -1.3, rz: -0.3 + clap * 0.45, lz: 0.3 - clap * 0.45, hx: -0.08, face: 'feliz' };
  },
};

export function gestureFrame(name, t) {
  const length = GESTURES[name];
  if (!length || !(t >= 0) || t >= length) return null;
  const k = t / length;
  return { w: envelope(k), ...MOVES[name](t, k) };
}
