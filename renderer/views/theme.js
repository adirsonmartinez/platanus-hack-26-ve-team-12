// How each traffic-light level looks, in the 3D scene and in HTML.
// Safe stays calm (silver, no glow); only problems glow, so they are what stands out.
import { materials, PALETTE } from './scene/materials.js';

const css = (hex) => `#${hex.toString(16).padStart(6, '0')}`;

export const LEVEL_STYLE = {
  // material: glowing pieces (rims, pads); cube: solid pieces (file cubes)
  green:  { color: '#8fd6b4', glow: null, material: () => materials.body, cube: () => materials.body },
  yellow: { color: css(PALETTE.warn), glow: PALETTE.warn, material: () => materials.warnLit, cube: () => materials.warnSolid },
  red:    { color: css(PALETTE.danger), glow: PALETTE.danger, material: () => materials.dangerLit, cube: () => materials.dangerSolid },
  grey:   { color: '#6b737c', glow: null, material: () => materials.metal, cube: () => materials.metal },
};

// Building shade by folder name (subtle silvers); anything else rotates through neutral shades
export const FOLDER_STYLES = [
  { pattern: /^(src|app|lib|server|api|backend|frontend|packages|core)$/i, body: () => materials.bodyLight },
  { pattern: /^(components|ui|views|pages|screens|routes|layouts|hooks)$/i, body: () => materials.body },
  { pattern: /^(public|assets|static|images|img|media|fonts)$/i, body: () => materials.body },
  { pattern: /^(supabase|db|database|prisma|migrations|sql)$/i, body: () => materials.bodyLight },
  { pattern: /^(test|tests|__tests__|spec|e2e|cypress)$/i, body: () => materials.bodyDark },
  { pattern: /^(docs?|documentation)$/i, body: () => materials.bodyDark },
  { pattern: /^\./, body: () => materials.metal }, // .github, .vscode, .husky…
];
export const FALLBACK_BODIES = [() => materials.body, () => materials.bodyLight, () => materials.bodyDark];
