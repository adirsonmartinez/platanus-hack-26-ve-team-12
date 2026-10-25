// When each part of the video happens, from the recording's markers (scripts/demo/recordTour.mjs).
// Times of the recording are in ms; the video runs at FPS. A part plays a slice of the recording
// faster (rate) so the whole video stays under a minute.
export const FPS = 30;
export const SIZE = { width: 1920, height: 1080 };
export const INTRO = 8 * FPS;
export const OUTRO = 6 * FPS;
export const FADE = 15; // frames two parts overlap while one fades into the other

const s = (ms) => Math.round((ms / 1000) * FPS);

export function plan(markers) {
  const tour = { fromMs: Math.max(0, markers.tourStart - 900), toMs: markers.tourEnd + 400, rate: 1.6 };
  const agent = { fromMs: markers.tourEnd + 900, toMs: markers.end, rate: 1.25 };
  const length = (part) => Math.round(s(part.toMs - part.fromMs) / part.rate);
  const tourStart = INTRO - FADE;
  const agentStart = tourStart + length(tour) - FADE;
  const outroStart = agentStart + length(agent) - FADE;
  return {
    intro: { from: 0, duration: INTRO },
    tour: { ...tour, from: tourStart, duration: length(tour) },
    agent: { ...agent, from: agentStart, duration: length(agent) },
    outro: { from: outroStart, duration: OUTRO },
    total: outroStart + OUTRO,
  };
}

// Words on screen during the app parts: [recording marker, text]. The newest one passed is shown.
export const CAPTIONS = [
  ['tourStart', 'Pide un recorrido del proyecto'],
  ['step:1', 'Primero: cómo está armado'],
  ['step:2', 'Dónde está la documentación'],
  ['step:3', 'Sus partes, una por una'],
  ['step:5', 'Dónde arranca todo'],
  ['step:6', 'Cómo se prueba'],
  ['step:7', 'Un caso de uso, archivo por archivo'],
  ['step:8', 'Y por dónde empezar'],
  ['tourEnd', 'Pregunta lo que no entiendas'],
  ['ask', 'El agente revisa, paso a paso'],
  ['agentDone', 'Y te lo explica con tus palabras'],
];
