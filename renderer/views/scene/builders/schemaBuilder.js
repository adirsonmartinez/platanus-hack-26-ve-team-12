// Supabase schema: each table is an isometric card lying on the grid (name, RLS badge, columns),
// with foreign-key lines to `users` and a trunk line to the Supabase node.
import * as THREE from 'three';
import { box, groundLink, materials as M, warningSign } from '../materials.js';
import { SUPABASE_NODE as SB } from '../../../viewmodels/layout.js';
import { strings } from '../../../i18n/es.js';

const PX = 128; // texture pixels per map unit
const CARD_WIDTH = 4.6, HEADER = 0.9, ROW = 0.55;
// Card positions around the schema center, in table order
const CARD_SLOTS = [[0, 4.5], [-6.5, 4.5], [6.5, 4.5], [-6.5, -4.5], [0, -4.5], [6.5, -4.5]];
const easeOut = (k) => 1 - (1 - k) ** 3;

// The card's colors: the map labels' dark glass (labels.css), neutral chips, Inter and Roboto Mono like the
// chat. Dark enough to stay under the bloom threshold, so a calm table never glows; only a table with RLS off
// turns red (a real problem may glow).
const CARD = {
  fill: '#161616', header: '#222222', row: '#1b1b1b', line: 'rgba(255, 255, 255, 0.07)', edge: 'rgba(255, 255, 255, 0.16)',
  name: '#ffffff', column: '#ededed', type: '#8f8f8f', chip: 'rgba(255, 255, 255, 0.09)', chipText: '#dedede',
  danger: '#ff5a6a', dangerRow: '#2a1518', dangerText: '#ff8a96',
};
const SANS = 'Inter, system-ui, -apple-system, sans-serif';
const MONO = '"Roboto Mono", ui-monospace, Menlo, monospace';

function chip(ctx, text, x, cy, { size, padX, h, fill, color, align = 'left' }) {
  ctx.font = `600 ${size}px ${SANS}`;
  const w = ctx.measureText(text).width + padX * 2;
  const left = align === 'right' ? x - w : x;
  ctx.fillStyle = fill;
  ctx.beginPath(); ctx.roundRect(left, cy - h / 2, w, h, h / 2); ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.fillText(text, left + w / 2, cy + 1);
  return w;
}

// Top face of a card: header, RLS badge and columns
function drawCard(ctx, table, exposed) {
  const W = ctx.canvas.width, H = ctx.canvas.height, hh = HEADER * PX, rh = ROW * PX;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = CARD.fill;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = exposed ? CARD.danger : CARD.header;
  ctx.fillRect(0, 0, W, hh);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = exposed ? '#1a0b0d' : CARD.name;
  ctx.font = `600 ${0.4 * PX}px ${SANS}`;
  ctx.fillText(table.name, 0.3 * PX, hh / 2);

  const badge = exposed ? strings.supabase.rlsOff : strings.supabase.rlsOn;
  chip(ctx, badge, W - 0.25 * PX, hh / 2, {
    size: 0.22 * PX, padX: 0.15 * PX, h: 0.42 * PX, align: 'right',
    fill: exposed ? 'rgba(0, 0, 0, 0.28)' : CARD.chip, color: exposed ? '#1a0b0d' : CARD.chipText,
  });

  table.columns.forEach((column, i) => {
    const y = hh + i * rh;
    const leaking = exposed && column.sensitive;
    ctx.fillStyle = leaking ? CARD.dangerRow : (i % 2 ? CARD.row : CARD.fill);
    ctx.fillRect(0, y, W, rh);
    ctx.fillStyle = CARD.line;
    ctx.fillRect(0, y, W, 2);

    let x = 0.3 * PX;
    if (column.key) {
      x += chip(ctx, column.key, x, y + rh / 2, { size: 0.18 * PX, padX: 0.09 * PX, h: 0.3 * PX, fill: CARD.chip, color: CARD.chipText }) + 0.15 * PX;
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = leaking ? CARD.dangerText : CARD.column;
    ctx.font = `500 ${0.28 * PX}px ${SANS}`;
    ctx.fillText(column.name, x, y + rh / 2);

    ctx.textAlign = 'right';
    ctx.fillStyle = leaking ? CARD.dangerText : CARD.type;
    ctx.font = `400 ${0.22 * PX}px ${MONO}`;
    ctx.fillText(leaking ? `${column.type} · ${strings.supabase.exposed}` : column.type, W - 0.3 * PX, y + rh / 2);
  });

  // A fine light rim, like the labels' edge
  ctx.strokeStyle = exposed ? CARD.danger : CARD.edge;
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, W - 4, H - 4);
}

// center and trunkStart in world coordinates (the cards themselves stay aligned with the ground grid)
export function buildSchema(renderer, tables, trunkStart, center) {
  const root = new THREE.Group();
  root.visible = false;
  const links = new THREE.Group();
  root.add(links);

  const cards = tables.map((table, i) => {
    const depth = HEADER + table.columns.length * ROW + 0.15;
    const g = new THREE.Group();
    const [ox, oz] = CARD_SLOTS[i % CARD_SLOTS.length];
    g.position.set(center.x + ox, 0, center.z + oz);
    g.userData.pick = { type: 'table', name: table.name };
    const base = box(g, M.slabEdge, CARD_WIDTH + 0.25, 0.15, depth + 0.25, 0, 0, 0);
    box(g, M.slab, CARD_WIDTH, 0.45, depth, 0, 0.15, 0); // a dark slab, like the labels (never a lit white block)

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(CARD_WIDTH * PX);
    canvas.height = Math.round(depth * PX);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    // The header ends up toward -z (the back), so it reads from the initial camera angle
    const top = new THREE.Mesh(
      new THREE.PlaneGeometry(CARD_WIDTH, depth).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })
    );
    top.position.y = 0.603;
    g.add(top);
    root.add(g);

    return {
      name: table.name, group: g, index: i,
      exposed: false,
      draw(exposed) {
        this.exposed = exposed;
        drawCard(canvas.getContext('2d'), table, exposed);
        texture.needsUpdate = true;
        base.material = exposed ? M.danger : M.slabEdge;
      },
    };
  });

  // Foreign keys to users: lines on the ground, under the cards (no tables on the desktop: Qubbot has not
  // read the project's database, so there are no cards, links or warning to place)
  const users = cards.find((c) => c.name === 'users')?.group.position ?? null;
  if (users) {
    cards.forEach((c) => {
      if (c.name !== 'users') groundLink(links, M.road, c.group.position.x, c.group.position.z, users.x, users.z, 0.2, 0.12);
    });
    // Trunk from the Supabase node to the users table
    groundLink(links, M.road, trunkStart.x, trunkStart.z, users.x, users.z, 0.4, 0.12);
  }

  // Warning sign over the table with the problem
  const warning = warningSign(1.1);
  if (users) warning.position.set(users.x, 3, users.z);
  warning.visible = false;
  root.add(warning);

  // Inter may still be loading when the cards are first drawn: draw them again once it is there
  document.fonts?.ready.then(() => cards.forEach((c) => c.draw(c.exposed)));

  let open = false, openT = 0, anyExposed = false;

  return {
    group: root,
    setOpen(on) {
      open = on;
      if (on) root.visible = true;
    },
    // tables: [{ name, exposed }]
    setTables(list) {
      anyExposed = list.some((t) => t.exposed);
      cards.forEach((card) => card.draw(!!list.find((t) => t.name === card.name)?.exposed));
    },
    // Cards rise from the ground one after another on open, and sink on close
    update(t, dt) {
      if (!root.visible) return;
      openT = THREE.MathUtils.clamp(openT + (open ? dt : -dt * 1.6), 0, 1.5);
      cards.forEach((c) => {
        const k = easeOut(THREE.MathUtils.clamp((openT - c.index * 0.07) * 3, 0, 1));
        c.group.scale.set(1, Math.max(k, 0.001), 1);
        c.group.position.y = (1 - k) * -0.6;
      });
      links.visible = openT > 0.2;
      warning.visible = anyExposed && openT > 0.5;
      if (warning.visible) {
        warning.rotation.y = t * 2;
        warning.position.y = 3 + Math.sin(t * 3) * 0.2;
      }
      if (!open && openT === 0) root.visible = false;
    },
  };
}
