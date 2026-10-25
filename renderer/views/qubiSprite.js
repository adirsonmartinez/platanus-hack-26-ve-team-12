// "Qubi, el reparador": original pixel-art character (16×18). Used by the repair card (2D canvas)
// and by the map (as a texture with "nearest" filtering so the pixels stay crisp).
export const SPRITE_W = 16;
export const SPRITE_H = 18;

const PALETTE = {
  Y: '#f5c542', // helmet
  y: '#c99a2e', // helmet shadow
  S: '#f2c9a0', // skin
  s: '#d9a57a', // skin shadow
  E: '#1d2029', // eyes
  W: '#ececf0', // shirt
  B: '#3b6fd8', // overalls
  b: '#2a4f9e', // overalls shadow
  K: '#3a2a20', // boots
  H: '#e8b830', // hammer head
  h: '#7a5230', // handle
};

const BASE = [
  '.....YYYYYY.....',
  '....YYYYYYYY....',
  '...yYYYYYYYYy...',
  '...yyyyyyyyyy...',
  '....SSSSSSSS....',
  '....SESSSSES....',
  '....SSSSSSSS....',
  '.....SSssSS.....',
  '....WWBWWBWW....',
  '...WWBBBBBBWW...',
  '...SWBBBBBBWS...',
  '...S.BBBBBB.S...',
  '.....BBBBBB.....',
  '.....BB..BB.....',
  '.....bb..bb.....',
  '.....bb..bb.....',
  '....KKK..KKK....',
  '................',
];

const HAMMER_UP = [[13, 3, 'H'], [14, 3, 'H'], [15, 3, 'H'], [13, 4, 'H'], [14, 4, 'H'], [15, 4, 'H'], [14, 5, 'h'], [13, 6, 'h'], [13, 7, 'h'], [12, 8, 'S'], [12, 9, 'S']];
const HAMMER_DOWN = [[12, 10, 'S'], [13, 11, 'h'], [14, 12, 'h'], [13, 13, 'H'], [14, 13, 'H'], [15, 13, 'H'], [13, 14, 'H'], [14, 14, 'H'], [15, 14, 'H']];
const HAMMER_REST = [[12, 11, 'S'], [13, 12, 'h'], [13, 13, 'h'], [12, 14, 'H'], [13, 14, 'H'], [14, 14, 'H']];
const WALK_A = [[5, 15, '.'], [6, 15, '.'], [4, 15, 'b'], [5, 16, '.'], [4, 16, 'K'], [3, 16, 'K']];
const WALK_B = [[9, 15, '.'], [10, 15, '.'], [11, 15, 'b'], [10, 16, '.'], [12, 16, 'K'], [11, 16, 'K']];
// Thinking: a small cloud above the helmet
const THINK = [[14, 0, 'W'], [15, 0, 'W'], [14, 1, 'W'], [15, 1, 'W'], [13, 2, 'W']];

function frame(...overlays) {
  const rows = BASE.map((r) => r.split(''));
  for (const o of overlays) for (const [x, y, c] of o) rows[y][x] = c;
  return rows.map((r) => r.join(''));
}

export const FRAMES = {
  idle: frame(HAMMER_REST),
  walkA: frame(HAMMER_REST, WALK_A),
  walkB: frame(HAMMER_REST, WALK_B),
  think: frame(HAMMER_REST, THINK),
  hammerUp: frame(HAMMER_UP),
  hammerDown: frame(HAMMER_DOWN),
};

// Frames for each repair step (strings.repair.steps): walk, look, plan, shore up, done
export const STEP_FRAMES = [['walkA', 'walkB'], ['idle'], ['think', 'idle'], ['hammerUp', 'hammerDown'], ['hammerUp']];
export const STEP_FPS = [4, 1, 2, 6, 1];

export function drawSprite(ctx, name, scale, ox = 0, oy = 0) {
  const rows = FRAMES[name];
  for (let y = 0; y < SPRITE_H; y++) {
    for (let x = 0; x < SPRITE_W; x++) {
      const c = rows[y][x];
      if (c === '.') continue;
      ctx.fillStyle = PALETTE[c];
      ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
    }
  }
}
