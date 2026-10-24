// Records the app for the product video: plays timeline.mjs in the running app (real pointer moves with
// an eased path, real clicks and typing), records the screen with the DevTools screencast, and writes:
//   <out>/frames/*.jpg + frames.ffconcat   the screen, with each frame's real duration
//   <out>/cursor-path.json                 [{ t, x, y, type: 'move'|'down'|'up' }] (ms from the start)
//   <out>/markers.json                     { name: ms } moments the video lines up with (captions, zooms)
// Start the app first in recording mode, with the simulated agent and the sample project:
//   PLATANUS_DEMO=1 PLATANUS_SIM=1 PLATANUS_SIM_DEFAULT=feria npx electron . --remote-debugging-port=9223 \
//     --open=scripts/demo/sample-project
//   node scripts/demo/recordTour.mjs [port] [outDir]
// The agent that was selected is put back at the end.
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './cdp.mjs';
import { cursorPath, moveMs } from './path.mjs';
import { timeline } from './timeline.mjs';

const port = Number(process.argv[2] ?? 9223);
const out = path.resolve(process.argv[3] ?? 'out/take');
const SIZE = { width: 1920, height: 1080 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'frames'), { recursive: true });

const cdp = await connect(port);
await cdp.call('Runtime.enable');
await cdp.call('Page.enable');
await cdp.call('Emulation.setDeviceMetricsOverride', { ...SIZE, deviceScaleFactor: 1, mobile: false });
const choice = await cdp.evaluate(`localStorage.getItem('platanus.agent.choice.v1')`);
if (!(await cdp.evaluate(`document.documentElement.classList.contains('demo')`))) {
  console.warn('Aviso: la app no está en modo grabación (PLATANUS_DEMO=1): el cursor no se verá.');
}
await cdp.call('Page.reload', { ignoreCache: true });
await sleep(6000);

// Simulador answers, Vibe mode, the chat open and fresh
const ready = await cdp.evaluate(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelector('#chat .voice-switch [data-mode="vibe"]')?.click();
  document.querySelector('.picker-pill').click();
  await wait(300);
  document.querySelectorAll('.picker-menu details').forEach((d) => { d.open = true; });
  await wait(200);
  const sim = [...document.querySelectorAll('.picker-menu .pick-agent:not(.external)')].find((b) => /Simulador/.test(b.textContent));
  sim?.querySelector('.pick-agent-main')?.click();
  document.body.click();
  return Boolean(sim);
})()`);
if (!ready) { console.error('No aparece "Simulador": inicia la app con PLATANUS_SIM=1'); process.exit(1); }
await sleep(800);

// --- recording ---
const frames = [];
let t0 = null;
cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
  const file = `f${String(frames.length).padStart(5, '0')}.jpg`;
  fs.writeFileSync(path.join(out, 'frames', file), Buffer.from(data, 'base64'));
  frames.push({ file, at: metadata.timestamp * 1000 });
  cdp.call('Page.screencastFrameAck', { sessionId });
});
await cdp.call('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: SIZE.width, maxHeight: SIZE.height, everyNthFrame: 1 });
const start = Date.now();
t0 = start;
const now = () => Date.now() - start;

const cursor = [];
const markers = {};
let at = { x: SIZE.width * 0.55, y: SIZE.height * 0.55 };
const mouse = (type, extra = {}) => cdp.call('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: 'left', ...extra });
await mouse('mouseMoved', { button: 'none' });

// The center of an element: { selector, text? } -> { x, y } (null if not on screen)
const centerOf = (target) => cdp.evaluate(`(() => {
  const shown = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  const all = [...document.querySelectorAll(${JSON.stringify(target.selector)})].filter((e) => shown(e) && e.textContent.includes(${JSON.stringify(target.text ?? '')}));
  const el = ${target.first ? 'all[0]' : 'all.at(-1)'};
  if (!el) return null;
  el.scrollIntoView({ block: 'nearest' });
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
})()`);

const director = {
  async move(target) {
    const to = target.selector ? await centerOf(target) : target;
    if (!to) throw new Error(`No encontré ${JSON.stringify(target)} en la pantalla`);
    const from = { ...at };
    const ms = moveMs(from, to);
    let last = 0;
    for (const f of cursorPath(from, to, { ms })) {
      await sleep(f.t - last);
      last = f.t;
      at = { x: f.x, y: f.y };
      await mouse('mouseMoved', { button: 'none' });
      cursor.push({ t: now(), x: at.x, y: at.y, type: 'move' });
    }
  },
  async click() {
    cursor.push({ t: now(), x: at.x, y: at.y, type: 'down' });
    await mouse('mousePressed', { clickCount: 1 });
    await sleep(70);
    await mouse('mouseReleased', { clickCount: 1 });
    cursor.push({ t: now(), x: at.x, y: at.y, type: 'up' });
  },
  hold: (ms) => sleep(ms),
  async type(text, cps = 17) {
    for (const ch of text) {
      await cdp.call('Input.insertText', { text: ch });
      await sleep(1000 / cps + (/[ ,?¿]/.test(ch) ? 40 : 0));
    }
  },
  async key(name) {
    const codes = { Enter: 13 };
    await cdp.call('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code: name, windowsVirtualKeyCode: codes[name] });
    await cdp.call('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code: name, windowsVirtualKeyCode: codes[name] });
  },
  async waitFor(js, timeout = 10000) {
    const until = Date.now() + timeout;
    while (Date.now() < until) {
      if (await cdp.evaluate(`Boolean(${js})`).catch(() => false)) return true;
      await sleep(150);
    }
    console.warn(`Aviso: se acabó el tiempo esperando ${js.slice(0, 80)}…`);
    return false;
  },
  exists: (selector) => cdp.evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length > 0`),
  async mark(name) { markers[name] = now(); console.log(`${(now() / 1000).toFixed(1)} s  ${name}`); },
};

try {
  await timeline(director);
} finally {
  await sleep(500);
  await cdp.call('Page.stopScreencast');
  await sleep(300);
  await cdp.call('Emulation.clearDeviceMetricsOverride');
  if (choice) await cdp.evaluate(`localStorage.setItem('platanus.agent.choice.v1', ${JSON.stringify(choice)})`);
  await cdp.call('Page.reload', {});
  cdp.close();

  // Frames come when the screen changes: each one lasts until the next (concat list for ffmpeg)
  const first = frames[0]?.at ?? 0;
  const lines = ['ffconcat version 1.0'];
  frames.forEach((f, i) => {
    const next = frames[i + 1]?.at ?? f.at + 500;
    lines.push(`file 'frames/${f.file}'`, `duration ${((next - f.at) / 1000).toFixed(4)}`);
  });
  if (frames.length) lines.push(`file 'frames/${frames.at(-1).file}'`);
  fs.writeFileSync(path.join(out, 'frames.ffconcat'), `${lines.join('\n')}\n`);
  // cursor and markers in the recording's time (the first frame is 0)
  const shift = Math.max(0, Math.round(first - t0));
  fs.writeFileSync(path.join(out, 'cursor-path.json'), JSON.stringify(cursor.map((c) => ({ ...c, t: c.t - shift }))));
  fs.writeFileSync(path.join(out, 'markers.json'), JSON.stringify(Object.fromEntries(Object.entries(markers).map(([k, v]) => [k, v - shift])), null, 2));
  console.log(`\n${frames.length} cuadros · ${(now() / 1000).toFixed(1)} s · ${out}`);
}
