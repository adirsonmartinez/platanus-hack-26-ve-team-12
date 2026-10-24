// Inter (the app's font), loaded before any frame is rendered
import { continueRender, delayRender, staticFile } from 'remotion';

export const FONT = 'Inter, system-ui, sans-serif';

const handle = delayRender('Inter');
new FontFace('Inter', `url(${staticFile('fonts/inter-latin-wght-normal.woff2')}) format('woff2')`, { weight: '100 900' })
  .load()
  .then((face) => { document.fonts.add(face); continueRender(handle); })
  .catch(() => continueRender(handle));
