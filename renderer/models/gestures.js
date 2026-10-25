// Qubi's gestures by name (the Spanish words the voice uses in the tool gesto) and how long each one lasts,
// in seconds. views/scene/robotGestures.js plays them; callViewModel picks them.
export const GESTURES = {
  saludar: 1.6,
  celebrar: 1.8,
  pensar: 2.4,
  sorpresa: 1.2,
  encoger: 1.4,
  asentir: 1.0,
  negar: 1.1,
  bailar: 2.6,
  aplaudir: 1.6,
};

// What else the voice may say for each one (lowercase, without accents)
const SYNONYMS = {
  hola: 'saludar', adios: 'saludar', chao: 'saludar', despedir: 'saludar', despedirse: 'saludar', saludo: 'saludar',
  celebra: 'celebrar', festejar: 'celebrar', alegria: 'celebrar', bien: 'celebrar', exito: 'celebrar',
  piensa: 'pensar', pensando: 'pensar', duda: 'pensar',
  sorprender: 'sorpresa', sorprendido: 'sorpresa', asombro: 'sorpresa', wow: 'sorpresa', epa: 'sorpresa',
  encogerse: 'encoger', 'no se': 'encoger', hombros: 'encoger', ups: 'encoger',
  si: 'asentir', afirmar: 'asentir', ok: 'asentir',
  no: 'negar',
  baile: 'bailar', bailando: 'bailar', fiesta: 'bailar',
  aplauso: 'aplaudir', aplausos: 'aplaudir', aplaude: 'aplaudir',
};

// The gesture a word asks for, or null
export function gestureName(word) {
  const plain = String(word ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  if (Object.hasOwn(GESTURES, plain)) return plain;
  return SYNONYMS[plain] ?? null;
}
