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

// Top face of a card: header, RLS badge and columns
function drawCard(ctx, table, exposed) {
  const W = ctx.canvas.width, H = ctx.canvas.height, hh = HEADER * PX, rh = ROW * PX;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = exposed ? '#ff3b4e' : '#5a50ea';
  ctx.fillRect(0, 0, W, hh);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${0.42 * PX}px system-ui, -apple-system, sans-serif`;
  ctx.fillText(table.name, 0.3 * PX, hh / 2);

  const badge = exposed ? strings.supabase.rlsOff : strings.supabase.rlsOn;
  ctx.font = `800 ${0.24 * PX}px system-ui, -apple-system, sans-serif`;
  const bw = ctx.measureText(badge).width + 0.3 * PX, bh = 0.42 * PX;
  const bx = W - bw - 0.25 * PX, by = hh / 2 - bh / 2;
  ctx.fillStyle = exposed ? '#1b1a2e' : '#3ecf8e';
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 10); ctx.fill();
  ctx.fillStyle = exposed ? '#ffffff' : '#1b1a2e';
  ctx.textAlign = 'center';
  ctx.fillText(badge, bx + bw / 2, hh / 2 + 1);

  table.columns.forEach((column, i) => {
    const y = hh + i * rh;
    const leaking = exposed && column.sensitive;
    ctx.fillStyle = leaking ? '#ffe3e7' : (i % 2 ? '#f4f3ff' : '#ffffff');
    ctx.fillRect(0, y, W, rh);
    ctx.fillStyle = '#e4e1fb';
    ctx.fillRect(0, y, W, 3);

    let x = 0.3 * PX;
    if (column.key) {
      ctx.font = `800 ${0.2 * PX}px system-ui, -apple-system, sans-serif`;
      const kw = ctx.measureText(column.key).width + 0.18 * PX, kh = 0.3 * PX;
      ctx.fillStyle = column.key === 'PK' ? '#f2dc3c' : '#2fd9a8';
      ctx.beginPath(); ctx.roundRect(x, y + rh / 2 - kh / 2, kw, kh, 6); ctx.fill();
      ctx.fillStyle = '#1b1a2e';
      ctx.textAlign = 'center';
      ctx.fillText(column.key, x + kw / 2, y + rh / 2 + 1);
      x += kw + 0.15 * PX;
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = leaking ? '#d81f35' : '#1b1a2e';
    ctx.font = `600 ${0.3 * PX}px system-ui, -apple-system, sans-serif`;
    ctx.fillText(column.name, x, y + rh / 2);

    ctx.textAlign = 'right';
    ctx.fillStyle = leaking ? '#d81f35' : '#8a86a8';
    ctx.font = `500 ${0.24 * PX}px ui-monospace, Menlo, monospace`;
    ctx.fillText(leaking ? `${column.type} · ${strings.supabase.exposed}` : column.type, W - 0.3 * PX, y + rh / 2);
  });

  ctx.strokeStyle = '#1b1a2e';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, W - 8, H - 8);
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
    box(g, M.white, CARD_WIDTH, 0.45, depth, 0, 0.15, 0);

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
      draw(exposed) {
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
      if (c.name !== 'users') groundLink(links, M.bodyDark, c.group.position.x, c.group.position.z, users.x, users.z, 0.2, 0.12);
    });
    // Trunk from the Supabase node to the users table
    groundLink(links, M.slabEdge, trunkStart.x, trunkStart.z, users.x, users.z, 0.4, 0.12);
  }

  // Warning sign over the table with the problem
  const warning = warningSign(1.1);
  if (users) warning.position.set(users.x, 3, users.z);
  warning.visible = false;
  root.add(warning);

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
