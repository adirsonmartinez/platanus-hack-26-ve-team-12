// The whole project as a tree that unfolds down the screen. At the top, the project's name (its root, with
// no platform); below it, rows with every top-level folder and, right after the last one, the root files. Opening a
// folder unfolds its direct subfolders and files in a block below it, and opening one of those unfolds one more level: one path at a time (opening
// another folder folds the rest). Safe things stay calm, problems glow (amber / red) and come first.
// Above the plaza, a darker band holds the integrations. Esc goes back up. It also routes clicks and
// coordinates the schema.
import { Observable } from '../core/observable.js';
import { EVENTS } from '../core/eventBus.js';
import { strings } from '../i18n/es.js';
import { allFiles, baseName, countDirs, countFiles, findNode } from '../models/fileTree.js';
import { LEVEL_RANK, worstLevel, securityScore, scoreLevel } from '../models/securityModel.js';
import { fileTags, folderGuide } from '../models/folderTags.js';
import { fitView, folderHeight, INTEGRATION_ROW, integrationV, INTEGRATIONS, plazaGrid, screenOf, toWorld, TREE, treeBlock } from './layout.js';

const WELCOME_ZOOM = 1.9; // close to the plaza of a new project, where the robot stands
const emptyCounts = () => ({ green: 0, yellow: 0, red: 0, grey: 0 });
const parentOf = (path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
const topFolderOf = (path) => path.split('/')[0];
const MAX_BRANCH_ITEMS = 48; // subfolders and files below an open folder
const byRisk = (a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || a.path.localeCompare(b.path);

export class MapViewModel {
  #project;
  #security;
  #camera;
  #supabase;
  #bus;
  #session = 0;
  #welcomeSession = null; // session of a project just created, until it gets its first file
  #home = { x: 0, z: 0, zoom: 1 }; // the initial view: integrations down to the top-level folders

  // `version` changes whenever the map must be redrawn; `path` is the open folder, at any depth ('' = none);
  // `welcome`: a new, empty project, where a robot on the plaza asks what to build
  store = new Observable({
    status: 'empty', session: 0, projectName: '', path: '', crumbs: [],
    root: null, plaza: null, buildings: [], branches: [], opened: null, rootFiles: null, links: [], band: null, integrations: [], integrationLines: [], welcome: false, version: 0,
  });

  constructor({ projectModel, securityModel, camera, supabaseViewModel, bus }) {
    this.#project = projectModel;
    this.#security = securityModel;
    this.#camera = camera;
    this.#supabase = supabaseViewModel;
    this.#bus = bus;

    projectModel.store.subscribe(() => this.#recompute());
    securityModel.store.subscribe(() => this.#recompute());
  }

  openProject() {
    return this.#project.choose();
  }

  closeProject() {
    return this.#project.close();
  }

  async createProject() {
    const response = await this.#project.create();
    if (response.ok) {
      this.#welcomeSession = this.#project.store.state.session;
      this.#recompute();
      if (this.store.state.welcome) this.#camera.flyTo({ x: 0, z: 0 }, WELCOME_ZOOM);
      this.#bus.emit(EVENTS.projectCreated, { name: response.data.name });
    }
    else if (!response.cancelled) this.#bus.emit(EVENTS.projectCreateFailed, { error: response.error });
    return response;
  }

  // pick: { type: 'folder', path } | { type: 'file', path } | { type: 'supabase' } | { type: 'table', name }
  handlePick(pick) {
    switch (pick.type) {
      case 'folder': return this.toggleFolder(pick.path);
      case 'file': return this.selectFile(pick.path);
      case 'supabase': return this.toggleSchema();
      case 'table': return this.#supabase.selectTable(pick.name);
      default: return undefined;
    }
  }

  // Opens a folder at any depth beside its top-level folder ('' closes it)
  enterFolder(path) {
    if (path === this.store.state.path) return;
    const node = path && findNode(this.#project.store.state.tree, path);
    if (path && node?.type !== 'dir') return;
    this.#supabase.openSchema(false);
    this.#recompute({ path, announce: true });
  }

  // A click on a folder on the map: opens it, or closes it (with everything open inside it) when it is
  // already open
  toggleFolder(path) {
    const open = this.store.state.path;
    const isOpen = open === path || open.startsWith(`${path}/`);
    this.enterFolder(isOpen ? parentOf(path) : path);
  }

  // "Center view": back to the initial angle and framing (open folders stay open)
  home() {
    this.#camera.reset();
    this.#camera.flyTo(this.#home, this.#home.zoom);
  }

  // One level up: a subfolder goes back to its parent, a top-level folder closes
  goUp() {
    if (this.store.state.path !== '') this.enterFolder(parentOf(this.store.state.path));
  }

  // Shows a project file or folder (links in the chat, "ver: ruta"): opens the folder it is in, and a
  // file also opens its card in the chat. Returns false when the path is not in the project.
  show(path) {
    const node = findNode(this.#project.store.state.tree, path);
    if (!node) return false;
    const isDir = node.type === 'dir' || path === '';
    this.enterFolder(isDir ? path : parentOf(path));
    if (!isDir) this.selectFile(path);
    return true;
  }

  selectFile(path) {
    const node = findNode(this.#project.store.state.tree, path);
    if (!node || node.type === 'dir') return;
    const { level, reason, reasonKey, by } = this.#describeFile(node);
    this.#bus.emit(EVENTS.fileSelected, { path, level, reason, reasonKey, by });
  }

  toggleSchema() {
    this.#supabase.openSchema(!this.#supabase.store.state.schemaOpen);
  }

  // Esc closes the schema first, then the open folder
  escape() {
    if (this.#supabase.store.state.schemaOpen) this.#supabase.openSchema(false);
    else this.goUp();
  }

  // What the hover card shows for a pick (null = nothing to show)
  //   { kind: 'folder' | 'file', path, name, friendly?, tags, level, files?, red?, yellow?, size?, reason?, reasonKey? }
  describePick(pick) {
    const { buildings, rootFiles, branches } = this.store.state;
    if (pick.type === 'folder') {
      const b = [...buildings, ...branches.flatMap((x) => x.folders)].find((x) => x.path === pick.path);
      return b ? { kind: 'folder', ...b } : null;
    }
    if (pick.type === 'file') {
      const file = [...(rootFiles?.files ?? []), ...branches.flatMap((x) => x.files)].find((f) => f.path === pick.path);
      return file ? { kind: 'file', ...file, tags: fileTags(file.path) } : null;
    }
    return null;
  }

  // Where Remi goes to repair a file: next to its icon (the folder it is in opens; root files are always
  // shown), or the plaza when it is not on the map
  locateFile(path) {
    const folder = path.includes('/') ? topFolderOf(path) : '';
    if (folder) this.enterFolder(parentOf(path));
    const icons = folder ? this.store.state.opened?.files : this.store.state.rootFiles?.files;
    const icon = icons?.find((f) => f.path === path);
    if (icon) return { folder, x: icon.x, z: icon.z, height: 1, radius: 1.6 }; // just off the icon
    const plaza = this.store.state.plaza;
    return { folder, x: 0, z: 0, height: 1, radius: (plaza?.size ?? 5) / 2 };
  }

  // { counts, level, red, yellow } for every file under `nodes`
  #levelsOf(nodes) {
    const counts = emptyCounts();
    allFiles(nodes).forEach((f) => { counts[this.#security.scoreOf(f.path).level]++; });
    return { counts, level: worstLevel(Object.keys(counts).filter((l) => counts[l] > 0)), red: counts.red, yellow: counts.yellow };
  }

  // Tags and friendly name of a folder (shown in Vibe mode)
  #guideOf(path, nodes) {
    const guide = folderGuide(path, allFiles(nodes));
    return { tags: guide.tags, friendly: strings.describeFolder(guide, baseName(path)).name };
  }

  #describeFile(file) {
    const score = this.#security.scoreOf(file.path);
    const reason = score.reason || strings.security.reasons[score.reasonKey] || '';
    return {
      path: file.path, name: baseName(file.path), size: file.size ?? 0,
      level: score.level, reason, reasonKey: score.reasonKey, by: score.by,
    };
  }

  #announce(path, nodes) {
    const here = this.#levelsOf(nodes);
    this.#bus.emit(EVENTS.folderOpened, {
      name: path ? `${baseName(path)}/` : this.store.state.projectName,
      files: countFiles(nodes),
      folders: nodes.filter((c) => c.type === 'dir').length,
      counts: here.counts,
    });
  }

  // A folder with the levels of everything inside it
  #describeFolder(dir) {
    const nodes = dir.children ?? [];
    return { path: dir.path, name: baseName(dir.path), files: countFiles(nodes), ...this.#levelsOf(nodes) };
  }

  // Problems first (worst first), then by name
  #sortFolders(folders) {
    return folders.sort((a, b) => b.red - a.red || b.yellow - a.yellow || a.path.localeCompare(b.path));
  }

  // The deepest folder of `path` that still exists ('' when none)
  #existing(tree, path) {
    while (path && findNode(tree, path)?.type !== 'dir') path = parentOf(path);
    return path;
  }

  #recompute({ path = this.store.state.path, announce = false } = {}) {
    const { open, name, tree, session, integrations = [], integrationStatus = {} } = this.#project.store.state;
    const newSession = session !== this.#session;
    this.#session = session;
    if (newSession) path = '';
    path = open ? this.#existing(tree, path) : '';

    if (!open) {
      this.store.set({ status: 'empty', path: '', crumbs: [], root: null, plaza: null, buildings: [], branches: [], opened: null, rootFiles: null, links: [], band: null, integrations: [], integrationLines: [], welcome: false, version: this.store.state.version + 1 });
      return;
    }

    const projectName = name ?? strings.map.defaultProjectName;
    const project = this.#levelsOf(tree);
    const total = countFiles(tree);
    if (this.#welcomeSession !== session || total > 0) this.#welcomeSession = null;

    // The project's root has no platform: one trunk runs from the integrations' road (or, with no
    // integrations, from the project's root) down to the first row of folders (`grid` only keeps the
    // spacing where the project's name floats)
    const grid = plazaGrid(0);

    // Links of the tree, in world coordinates [x1, z1, x2, z2, kind]
    const links = [];
    const addLinks = (block, kind) => block.links.forEach(([u1, v1, u2, v2]) => {
      const a = toWorld(u1, v1), b = toWorld(u2, v2);
      links.push([a.x, a.z, b.x, b.z, kind]);
    });

    // Every top-level folder, problems first, in rows below the plaza
    const dirs = this.#sortFolders(tree.filter((c) => c.type === 'dir').map((dir) => ({ ...this.#describeFolder(dir), node: dir })));
    const top = path ? topFolderOf(path) : '';
    const topOptions = { parentU: 0, parentV: integrations.length ? INTEGRATION_ROW.busV : 0, startV: grid.size * Math.SQRT1_2 + TREE.gap + TREE.itemHalf.top, ...TREE.top };
    const topIndex = dirs.findIndex((d) => d.path === top);

    // The open path: each folder on it unfolds its direct contents (subfolders first, then files) right
    // below it. Its row of top-level folders stays put; the rows under it move down to make room.
    // Root files follow the folders in the same rows, riskiest first, right after the last folder
    const rootList = tree.filter((c) => c.type === 'file').map((f) => this.#describeFile(f)).sort(byRisk);
    const rootShown = rootList.slice(0, MAX_BRANCH_ITEMS);
    const topCount = dirs.length + rootShown.length;
    const firstBlock = treeBlock(topCount, topOptions);
    const branches = [];
    const branchLinks = [];
    let parent = topIndex >= 0 ? firstBlock.slots[topIndex] : null; // { u, v } on screen
    let endV = parent ? parent.v + TREE.itemHalf.top : 0;
    const levels = path ? path.split('/').map((_, i, parts) => parts.slice(0, i + 1).join('/')) : [];
    for (const dirPath of levels) {
      if (!parent) break;
      const children = findNode(tree, dirPath).children ?? [];
      const subfolders = this.#sortFolders(children.filter((c) => c.type === 'dir').map((d) => this.#describeFolder(d)));
      const inside = children.filter((c) => c.type === 'file').map((f) => this.#describeFile(f)).sort(byRisk);
      const shown = [...subfolders, ...inside].slice(0, MAX_BRANCH_ITEMS);
      // Kept right of the rows' spine (when they wrap), so the branch never runs over it
      const minU = firstBlock.spine === null ? -Infinity : firstBlock.spine + 2;
      const block = treeBlock(shown.length, { parentU: parent.u, parentV: parent.v, startV: endV + TREE.gap + TREE.itemHalf.branch, minU, ...TREE.branch });
      branchLinks.push(block);
      const next = levels[branches.length + 1];
      const placed = shown.map((item, i) => ({ ...item, ...toWorld(block.slots[i].u, block.slots[i].v), open: item.path === next }));
      branches.push({
        path: dirPath,
        top,
        ...toWorld(parent.u, (endV + block.endV) / 2 + TREE.gap),
        width: block.width,
        folders: placed.slice(0, Math.min(subfolders.length, shown.length)),
        files: placed.slice(subfolders.length),
        more: subfolders.length + inside.length - shown.length,
      });
      endV = block.endV + TREE.itemHalf.branch;
      const openIndex = placed.findIndex((item) => item.open);
      parent = openIndex >= 0 ? block.slots[openIndex] : null;
    }

    // The top-level rows, with a gap under the open folder's row as tall as its branches
    const openRow = topIndex >= 0 ? Math.floor(topIndex / TREE.top.cols) : -1;
    const gap = branches.length ? endV - (firstBlock.slots[topIndex].v + TREE.itemHalf.top) + TREE.gap : 0;
    const topBlock = treeBlock(topCount, { ...topOptions, insert: gap ? { row: openRow, height: gap } : null });
    addLinks(topBlock, 'top');
    branchLinks.forEach((block) => addLinks(block, 'branch'));
    const buildings = dirs.map(({ node, ...folder }, i) => ({
      ...folder,
      ...toWorld(topBlock.slots[i].u, topBlock.slots[i].v),
      height: folderHeight(folder.files),
      ...this.#guideOf(folder.path, node.children ?? []),
      open: folder.path === top,
      order: i,
    }));
    const opened = branches.at(-1) ?? null;
    const rootFiles = {
      files: rootShown.map((f, i) => ({ ...f, ...toWorld(topBlock.slots[dirs.length + i].u, topBlock.slots[dirs.length + i].v) })),
      more: rootList.length - rootShown.length,
    };

    // Integrations other than Supabase (it draws itself at u = 0): a row along the band, on a road
    const others = integrations.filter((key) => key !== 'supabase');
    const firstU = integrations.includes('supabase') ? INTEGRATION_ROW.firstU : 0;
    const nodes = others.map((key, i) => ({ key, u: firstU + i * INTEGRATION_ROW.pitch }));
    const withSupabase = integrations.includes('supabase');
    // Supabase's node sits on the trunk's line: its road drops straight to the integrations' road
    if (withSupabase) addLinks({ links: [[0, integrationV, 0, INTEGRATION_ROW.busV]] }, 'top');
    if (nodes.length) {
      const last = nodes.at(-1).u;
      addLinks({ links: [[0, INTEGRATION_ROW.busV, last, INTEGRATION_ROW.busV], ...nodes.map((n) => [n.u, INTEGRATION_ROW.busV, n.u, integrationV])] }, 'top');
    }
    const statusOf = (key) => integrationStatus[key] ?? 'connected';
    const integrationNodes = nodes.map((n) => ({ key: n.key, status: statusOf(n.key), ...toWorld(n.u, integrationV) }));

    // Lit lines: each live integration lights its way to the folders (down to the road, along it, down
    // the trunk). A stretch shared by several is purple if any of them is connected, amber if they only
    // have incidents; nothing lights a disconnected one's way.
    const trunkEnd = dirs.length ? topBlock.slots[0].v - TREE.top.rowGap / 2 : 0;
    const strongest = (list) => (list.includes('connected') ? 'connected' : list.includes('incident') ? 'incident' : null);
    const line = (u1, v1, u2, v2, status) => ({ from: toWorld(u1, v1), to: toWorld(u2, v2), status });
    const integrationLines = [];
    nodes.forEach((n, i) => {
      const status = statusOf(n.key);
      if (status !== 'disconnected') integrationLines.push(line(n.u, integrationV, n.u, INTEGRATION_ROW.busV, status));
      // The road from the previous node (or the trunk) to this one carries this one and every one after it
      const along = strongest(nodes.slice(i).map((m) => statusOf(m.key)));
      if (along) integrationLines.push(line(i ? nodes[i - 1].u : 0, INTEGRATION_ROW.busV, n.u, INTEGRATION_ROW.busV, along));
    });
    if (withSupabase && statusOf('supabase') !== 'disconnected') {
      integrationLines.push(line(0, integrationV, 0, INTEGRATION_ROW.busV, statusOf('supabase')));
    }
    const trunk = strongest(integrations.map(statusOf));
    if (trunk) integrationLines.push(line(0, INTEGRATION_ROW.busV, 0, trunkEnd, trunk));

    // The integrations band, across the top, as wide as the tree; none when there is nothing to hold
    const treeU = [0, ...links.flatMap(([x1, z1, x2, z2]) => [screenOf(x1, z1).u, screenOf(x2, z2).u])];
    const halfWidth = Math.max(INTEGRATIONS.minWidth / 2, ...treeU.map(Math.abs)) + INTEGRATIONS.margin;
    const bandCenter = toWorld(0, (INTEGRATIONS.bandTop + INTEGRATIONS.bandBottom) / 2);
    const band = integrations.length ? { ...bandCenter, width: halfWidth * 2, depth: INTEGRATIONS.bandBottom - INTEGRATIONS.bandTop } : null;

    // Project, then each folder down to the open one
    const crumbs = [{ name: projectName, path: '' }];
    path.split('/').filter(Boolean).forEach((name, i, parts) => crumbs.push({ name, path: parts.slice(0, i + 1).join('/') }));

    this.store.set({
      status: 'ready',
      session,
      projectName,
      path,
      crumbs,
      // Whole project (HUD)
      root: {
        total,
        dirs: countDirs(tree),
        ...project,
        // Share of evaluated files that are safe (100 when there is nothing to evaluate)
        securityScore: securityScore(project.counts),
        scoreLevel: scoreLevel(project.counts),
      },
      // The project's plaza; counts are the open folder's (at any depth), or the whole project's
      plaza: {
        name: projectName,
        empty: tree.length === 0, // a new project: no name card on the map (the welcome robot talks instead)
        files: [],
        cols: grid.cols,
        size: grid.size,
        total,
        folders: buildings.length,
        ...(path ? this.#levelsOf(findNode(tree, path).children ?? []) : project),
      },
      buildings,
      branches,
      opened,
      rootFiles,
      links,
      band,
      integrations: integrationNodes,
      integrationLines,
      welcome: this.#welcomeSession !== null,
      version: this.store.state.version + 1,
    });

    // The initial view: from the integrations (their nodes, not the empty ends of the band) down to the
    // top-level rows as they are with nothing open
    const bottom = firstBlock.endV + TREE.itemHalf.top;
    const width = Math.max(firstBlock.width / 2, 6) + 3;
    const lastNode = Math.max(6, ...nodes.map((n) => n.u + 4));
    const home = fitView([toWorld(-6, integrationV), toWorld(lastNode, integrationV), toWorld(-width, bottom), toWorld(width, bottom)]);
    this.#home = { x: home.x, z: home.z, zoom: home.zoom };

    this.#supabase.setOnScreen(true);
    if (opened) {
      // The newest level, with its parent folder above it
      if (announce) {
        const items = [...opened.folders, ...opened.files];
        const view = fitView([...items, branches.length > 1 ? branches.at(-2).folders.find((f) => f.open) : buildings.find((b) => b.open)]);
        this.#camera.flyTo(view, Math.min(view.zoom, 1.1));
      }
    } else if (newSession || announce) {
      this.#camera.flyTo(this.#home, this.#home.zoom);
    }
    if (announce && path) this.#announce(path, findNode(tree, path).children ?? []);
  }
}
