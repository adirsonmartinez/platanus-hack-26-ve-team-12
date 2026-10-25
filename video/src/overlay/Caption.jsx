// Words on screen: a big headline (3D parts) or a pill over the app (recorded parts). They fade and rise in.
import { interpolate } from 'remotion';
import { FONT } from '../fonts.js';
import { INK, MUTED } from '../scenes/palette.js';

const appear = (age, length = 12) => ({
  opacity: interpolate(age, [0, length], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
  transform: `translateY(${interpolate(age, [0, length], [18, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}px)`,
});

export function Headline({ age, out, title, sub, align = 'left', style }) {
  const fade = out === undefined ? 1 : interpolate(out, [0, 10], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div style={{ position: 'absolute', fontFamily: FONT, color: INK, textAlign: align, opacity: fade, ...style }}>
      <div style={{ ...appear(age), fontSize: 68, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.05 }}>{title}</div>
      {sub && <div style={{ ...appear(age - 6), marginTop: 18, fontSize: 30, fontWeight: 500, color: MUTED, letterSpacing: '-0.01em' }}>{sub}</div>}
    </div>
  );
}

export function Pill({ age, text }) {
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 34, display: 'flex', justifyContent: 'center' }}>
      <div style={{
        ...appear(age, 10), fontFamily: FONT, fontSize: 34, fontWeight: 600, letterSpacing: '-0.015em', color: '#fff',
        padding: '16px 30px', borderRadius: 999, background: 'rgba(20, 20, 24, 0.82)', backdropFilter: 'blur(16px)',
        boxShadow: '0 18px 50px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(255,255,255,0.08)',
      }}>{text}</div>
    </div>
  );
}
