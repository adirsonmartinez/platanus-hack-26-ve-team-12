// Shared materials, geometries and primitives. Dark "digital twin" palette: silver volumes on dark slabs,
// one purple accent that glows (bloom), and amber/red glows reserved for security problems.
import * as THREE from 'three';

export const PALETTE = {
  background: 0x1c1f23,
  ground: 0x23262b,
  grid: 0x33373d,
  accent: 0x8b83ff, // team purple
  marker: 0xe6e9ec, // rings that point at a place (tour stop, robot target, build site): neutral, like the UI's white
  warn: 0xffc24a,
  danger: 0xff5a6a,
  ok: 0x3ddc97, // healthy integrations (the same green as the UI's --ok)
};

const cache = {};
function material(name, color = 0xffffff, options = {}) {
  if (cache[name]) return cache[name];
  return (cache[name] = new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.55,
    metalness: options.metalness ?? 0.25,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 1,
  }));
}

export const materials = {
  // Volumes
  get body()       { return material('body', 0xc9ced4); },
  get bodyLight()  { return material('bodyLight', 0xe6e9ec); },
  get bodyDark()   { return material('bodyDark', 0x8d959e); },
  // Windows, doors and screens: a cool mid grey, never black
  get glass()      { return material('glass', 0x7a8592, { roughness: 0.3, metalness: 0.35 }); },
  get metal()      { return material('metal', 0x6b737c, { roughness: 0.4, metalness: 0.7 }); },
  get white()      { return material('white', 0xf4f6f8, { roughness: 0.4, metalness: 0.1 }); },
  // Ground pieces
  get slab()       { return material('slab', 0x3b4048, { roughness: 0.8, metalness: 0.1 }); },
  get slabEdge()   { return material('slabEdge', 0x4d545d, { roughness: 0.6, metalness: 0.3 }); },
  // The integrations band across the top of the map: darker than the ground
  get band()       { return material('band', 0x17191d, { roughness: 1, metalness: 0 }); },
  get road()       { return material('road', 0x41474f, { roughness: 0.9, metalness: 0 }); },
  get roof()       { return material('roof', 0xdfe3e7, { roughness: 0.6, metalness: 0.15 }); },
  // Lit windows: faint purple, below the bloom threshold so they do not compete with alerts
  get windowLit()  { return material('windowLit', 0xb7b2ff, { emissive: PALETTE.accent, emissiveIntensity: 0.25, roughness: 0.3, metalness: 0 }); },
  // Glows (emissive values above 1 feed the bloom pass)
  get accentLit()  { return material('accentLit', PALETTE.accent, { emissive: PALETTE.accent, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0 }); },
  get supabaseLit(){ return material('supabaseLit', PALETTE.accent, { emissive: PALETTE.accent, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0 }); },
  get warnLit()    { return material('warnLit', PALETTE.warn, { emissive: PALETTE.warn, emissiveIntensity: 1.0, roughness: 0.3, metalness: 0 }); },
  get danger()     { return material('danger', PALETTE.danger, { roughness: 0.5, metalness: 0.1 }); },
  // Solid status colors for small pieces (file cubes): a faint glow below the bloom threshold
  get warnSolid()  { return material('warnSolid', PALETTE.warn, { emissive: PALETTE.warn, emissiveIntensity: 0.3, roughness: 0.45, metalness: 0 }); },
  get dangerSolid(){ return material('dangerSolid', PALETTE.danger, { emissive: PALETTE.danger, emissiveIntensity: 0.4, roughness: 0.45, metalness: 0 }); },
  // Small purple pieces (the welcome robot's eyes and lights): like warnSolid, it does not blob
  get accentSolid(){ return material('accentSolid', PALETTE.accent, { emissive: PALETTE.accent, emissiveIntensity: 0.5, roughness: 0.4, metalness: 0 }); },
  // The welcome robot: a glossy pearl shell and a dark glass face where its eyes and smile light up
  get robotShell() { return material('robotShell', 0xf1f3f6, { roughness: 0.28, metalness: 0.12 }); },
  get robotTrim()  { return material('robotTrim', 0xb9bfc7, { roughness: 0.35, metalness: 0.55 }); },
  get robotFace()  { return material('robotFace', 0x14161b, { roughness: 0.12, metalness: 0.6 }); },
  // Its eyes and smile: a pale purple that just crosses the bloom threshold (a soft glow, not a blob)
  get robotGlow()  { return material('robotGlow', 0xd4d0ff, { emissive: PALETTE.accent, emissiveIntensity: 1.1, roughness: 0.3, metalness: 0 }); },
  get dangerLit()  { return material('dangerLit', PALETTE.danger, { emissive: PALETTE.danger, emissiveIntensity: 1.0, roughness: 0.3, metalness: 0 }); },
  // Remi (same palette as his pixel-art sprite)
  get remiHelmet()       { return material('remiHelmet', 0xf5c542, { roughness: 0.45, metalness: 0 }); },
  get remiHelmetDark()   { return material('remiHelmetDark', 0xc99a2e, { roughness: 0.5, metalness: 0 }); },
  get remiSkin()         { return material('remiSkin', 0xf2c9a0, { metalness: 0 }); },
  get remiSkinDark()     { return material('remiSkinDark', 0xd9a57a, { metalness: 0 }); },
  get remiEye()          { return material('remiEye', 0x2f3540, { metalness: 0 }); },
  get remiShirt()        { return material('remiShirt', 0xececf0, { metalness: 0 }); },
  get remiOveralls()     { return material('remiOveralls', 0x3b6fd8, { metalness: 0 }); },
  get remiOverallsDark() { return material('remiOverallsDark', 0x2a4f9e, { metalness: 0 }); },
  get remiBoots()        { return material('remiBoots', 0x5a4434, { metalness: 0 }); },
  get remiHammer()       { return material('remiHammer', 0xe8b830, { metalness: 0.6, roughness: 0.3 }); },
  get remiHandle()       { return material('remiHandle', 0x7a5230, { metalness: 0 }); },
  // Remi's sparks
  get spark()      { return material('spark', 0xffd25a, { emissive: 0xffb020, emissiveIntensity: 1.4, roughness: 0.3, metalness: 0 }); },
};

// Lines that glow the same from every angle and zoom (unlit): an integration's lit way. A bright core in
// its true color, and a soft additive halo under it (so the glow does not depend on the bloom pass).
const glowCache = {};
function glowLine(name, color) {
  return (glowCache[name] ??= {
    core: new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.15), toneMapped: false }),
    halo: new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  });
}
export const glowLines = {
  get ok()   { return glowLine('ok', PALETTE.ok); },
  get warn() { return glowLine('warn', PALETTE.warn); },
  // The welcome robot's hover ring and thruster (soft purple light, the same from every angle)
  get accent() { return glowLine('accent', PALETTE.accent); },
};

const geometries = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 40),
};

// `y` is the base of the object, not its center
export function box(parent, mat, w, h, d, x = 0, y = 0, z = 0, rotationY = 0) {
  const mesh = new THREE.Mesh(geometries.box, mat);
  mesh.scale.set(w, h, d);
  mesh.position.set(x, y + h / 2, z);
  mesh.rotation.y = rotationY;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export function cylinder(parent, mat, radius, h, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geometries.cylinder, mat);
  mesh.scale.set(radius * 2, h, radius * 2);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

// Flat strip on the ground from (ax, az) to (bx, bz)
export function groundLink(parent, mat, ax, az, bx, bz, width, height) {
  const dx = bx - ax, dz = bz - az;
  return box(parent, mat, Math.hypot(dx, dz), height, width, (ax + bx) / 2, 0, (az + bz) / 2, -Math.atan2(dz, dx));
}

// Thin dark platform with a lighter beveled rim (the "tray" every building sits on)
export function platform(parent, w, d, x = 0, z = 0) {
  box(parent, materials.slabEdge, w, 0.22, d, x, 0, z);
  box(parent, materials.slab, w - 0.3, 0.06, d - 0.3, x, 0.22, z);
  return 0.28; // height of the top surface
}

// Status under a building: a bright rim in the level's color around its platform (it blooms)
export function glowPad(parent, color, w, d, y = 0.3) {
  const rim = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.5), toneMapped: false });
  const t = 0.06;
  [[0, -d / 2, w, t], [0, d / 2, w, t], [-w / 2, 0, t, d], [w / 2, 0, t, d]].forEach(([dx, dz, sx, sz]) => {
    box(parent, rim, sx, 0.03, sz, dx, y - 0.01, dz).castShadow = false;
  });
}

// Red diamond with a white "!" (it sticks out on both sides so it reads from any angle)
export function warningSign(size = 1.3) {
  const group = new THREE.Group();
  const k = size / 1.3;
  box(group, materials.dangerLit, 1.3 * k, 1.3 * k, 0.3 * k, 0, -0.65 * k, 0).rotation.z = Math.PI / 4;
  box(group, materials.white, 0.2 * k, 0.55 * k, 0.42 * k, 0, -0.2 * k, 0);
  box(group, materials.white, 0.2 * k, 0.2 * k, 0.42 * k, 0, -0.62 * k, 0);
  return group;
}
