// Where the floating windows go on the map (the editor and the browser), by fixed zones: halves side by
// side or stacked, or the whole free area. Qubi arranges them by voice (acomodar_ventanas) and the app
// splits them in halves when both are open. Pure: the view measures the stage and what it must leave free.
export const ZONES = ['izquierda', 'derecha', 'completa', 'arriba', 'abajo'];
export const WINDOWS = ['editor', 'navegador'];

const GAP = 12;
const MIN_W = 320;
const MIN_H = 200;

const plain = (word) => String(word ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

// The stage (width, height) minus the room kept on each side (the side dock, the chat, the top bar)
export function freeArea({ width, height, left = 0, right = 0, top = 0, bottom = 0 }) {
  const w = Math.max(MIN_W, width - left - right);
  const h = Math.max(MIN_H, height - top - bottom);
  return { x: Math.max(0, Math.min(left, width - w)), y: Math.max(0, Math.min(top, height - h)), w, h };
}

// The rectangle of a zone in that area (stage pixels), or null for an unknown zone
export function zoneRect(zone, area, gap = GAP) {
  const { x, y, w, h } = area;
  const halfW = Math.floor((w - gap) / 2);
  const halfH = Math.floor((h - gap) / 2);
  switch (zone) {
    case 'completa': return { x, y, w, h };
    case 'izquierda': return { x, y, w: halfW, h };
    case 'derecha': return { x: x + w - halfW, y, w: halfW, h };
    case 'arriba': return { x, y, w, h: halfH };
    case 'abajo': return { x, y: y + h - halfH, w, h: halfH };
    default: return null;
  }
}

const OPPOSITE = { izquierda: 'derecha', derecha: 'izquierda', arriba: 'abajo', abajo: 'arriba' };
export const opposite = (zone) => OPPOSITE[zone] ?? null;

// What Qubi says -> the fixed names (never free text): the window...
export function windowOf(word) {
  const w = plain(word);
  if (/\b(editor|codigo|code)\b/.test(w)) return 'editor';
  if (/\b(navegador|browser|juego|pagina|vista previa|preview|web)\b/.test(w)) return 'navegador';
  return null;
}

// ...and the zone
export function zoneOf(word) {
  if (typeof word !== 'string') return null;
  const w = plain(word);
  if (/\b(izquierda|left)\b/.test(w)) return 'izquierda';
  if (/\b(derecha|right)\b/.test(w)) return 'derecha';
  if (/\b(completa|grande|full|todo)\b/.test(w)) return 'completa';
  if (/\b(arriba|top)\b/.test(w)) return 'arriba';
  if (/\b(abajo|bottom)\b/.test(w)) return 'abajo';
  return null;
}
