// The raw recording (public/takes/raw, from scripts/demo/recordTour.mjs) -> what the video uses:
//   public/takes/tour.mp4       the screen at a steady 30 fps (each recorded frame kept for its real time)
//   public/takes/stills/*.jpg   three moments for the 3D screens: the map, the tour, the agent
// Uses the ffmpeg that comes with Remotion (npx remotion ffmpeg).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const takes = path.resolve('public/takes');
const raw = path.join(takes, 'raw');
const markers = JSON.parse(fs.readFileSync(path.join(raw, 'markers.json'), 'utf8'));
const ffmpeg = (args) => execFileSync('npx', ['remotion', 'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });

ffmpeg(['-f', 'concat', '-safe', '0', '-i', path.join(raw, 'frames.ffconcat'), '-fps_mode', 'cfr', '-r', '30', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-crf', '16', '-preset', 'slow', path.join(takes, 'tour.mp4')]);

// The frame shown at a time (ms) of the recording
const lines = fs.readFileSync(path.join(raw, 'frames.ffconcat'), 'utf8').split('\n');
const timeline = [];
let t = 0;
lines.forEach((line, i) => {
  const file = /^file '(.+)'$/.exec(line)?.[1];
  if (!file) return;
  timeline.push({ t, file });
  t += Number(/^duration (.+)$/.exec(lines[i + 1] ?? '')?.[1] ?? 0) * 1000;
});
const frameAt = (ms) => timeline.reduce((best, f) => (f.t <= ms ? f : best), timeline[0]).file;

fs.mkdirSync(path.join(takes, 'stills'), { recursive: true });
const stills = { map: (markers.tourStart ?? 2000) - 600, tour: (markers['step:7'] ?? markers['step:3'] ?? 20000) + 2500, agent: (markers.end ?? t) - 300 };
for (const [name, ms] of Object.entries(stills)) fs.copyFileSync(path.join(raw, frameAt(ms)), path.join(takes, 'stills', `${name}.jpg`));
console.log(`Listo: ${path.relative(process.cwd(), path.join(takes, 'tour.mp4'))} (${(t / 1000).toFixed(1)} s) y 3 imágenes fijas`);
