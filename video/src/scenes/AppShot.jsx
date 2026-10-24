// The real app, recorded (scripts/demo/recordTour.mjs), in a window on the warm background. The view
// follows the cursor softly and leans in around each click, like a person showing their screen; a pill
// says what is happening (timing.js CAPTIONS, lined up with the recording's markers).
import { useMemo } from 'react';
import { AbsoluteFill, OffthreadVideo, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { CAPTIONS, FPS, SIZE } from '../timing.js';
import { Pill } from '../overlay/Caption.jsx';
import { BG } from './palette.js';

const WINDOW = 0.88;      // share of the frame the app window takes
const ZOOM = 1.16;        // how much it leans in around a click
const FOLLOW = 0.06;      // how fast the view follows the cursor (0..1 per frame)
const CLICK_WINDOW = [-1300, 700]; // ms around a click when the view is leaning in

const msAt = (part, frame) => part.fromMs + (frame / FPS) * 1000 * part.rate;

// The cursor's position at a time of the recording (the last move before it)
function cursorAt(cursor, ms) {
  let lo = 0;
  let hi = cursor.length - 1;
  if (hi < 0 || cursor[0].t > ms) return { x: SIZE.width / 2, y: SIZE.height / 2 };
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cursor[mid].t <= ms) lo = mid; else hi = mid - 1;
  }
  return cursor[lo];
}

// Per frame of the part: where the view looks and how close (smoothed, so it never jumps)
function useCamera(part, cursor) {
  return useMemo(() => {
    const clicks = cursor.filter((c) => c.type === 'down').map((c) => c.t);
    const out = [];
    let fx = 0.5;
    let fy = 0.5;
    let zoom = 1;
    for (let f = 0; f < part.duration; f++) {
      const ms = msAt(part, f);
      const c = cursorAt(cursor, ms);
      // mostly the cursor, a bit of the middle: the map and the chat both stay in view
      const tx = 0.65 * (c.x / SIZE.width) + 0.35 * 0.5;
      const ty = 0.65 * (c.y / SIZE.height) + 0.35 * 0.5;
      const near = clicks.some((t) => ms - t > CLICK_WINDOW[0] && ms - t < CLICK_WINDOW[1]);
      fx += (tx - fx) * FOLLOW;
      fy += (ty - fy) * FOLLOW;
      zoom += ((near ? ZOOM : 1.02) - zoom) * 0.05;
      out.push({ fx, fy, zoom });
    }
    return out;
  }, [part, cursor]);
}

export function AppShot({ part, markers, cursor, enter = false }) {
  const frame = useCurrentFrame();
  const camera = useCamera(part, cursor);
  const { fx, fy, zoom } = camera[Math.min(frame, camera.length - 1)];
  const ms = msAt(part, frame);
  // the newest caption whose moment has passed (only those inside this part)
  const caption = CAPTIONS.map(([key, text]) => ({ at: markers[key], text }))
    .filter((c) => c.at !== undefined && c.at >= part.fromMs - 200 && c.at <= ms)
    .at(-1);
  const captionAge = caption ? ((ms - caption.at) / 1000 / part.rate) * FPS : 0;
  // coming out of the intro's dive: the window settles from a bit bigger
  const settle = enter ? interpolate(frame, [0, 24], [1.14, 1], { extrapolateRight: 'clamp', easing: (t) => 1 - (1 - t) ** 3 }) : 1;
  const w = SIZE.width * WINDOW;
  const h = SIZE.height * WINDOW;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(120% 90% at 50% 40%, #f4eee5 0%, ${BG} 60%, #e2d6c5 100%)` }}>
      <div style={{
        position: 'absolute', left: (SIZE.width - w) / 2, top: (SIZE.height - h) / 2 - 18, width: w, height: h,
        borderRadius: 22, overflow: 'hidden', transform: `scale(${settle})`,
        boxShadow: '0 50px 120px rgba(60, 40, 20, 0.35), 0 12px 30px rgba(60, 40, 20, 0.25), inset 0 0 0 1px rgba(0,0,0,0.4)',
      }}>
        <div style={{ width: SIZE.width, height: SIZE.height, transform: `scale(${WINDOW})`, transformOrigin: '0 0' }}>
          <div style={{ width: SIZE.width, height: SIZE.height, transform: `scale(${zoom})`, transformOrigin: `${fx * 100}% ${fy * 100}%` }}>
            <OffthreadVideo
              src={staticFile('takes/tour.mp4')}
              startFrom={Math.round((part.fromMs / 1000) * FPS)}
              endAt={Math.round((part.toMs / 1000) * FPS)}
              playbackRate={part.rate}
              muted
              style={{ width: SIZE.width, height: SIZE.height }}
            />
          </div>
        </div>
      </div>
      {caption && <Pill key={caption.text} age={captionAge} text={caption.text} />}
    </AbsoluteFill>
  );
}
