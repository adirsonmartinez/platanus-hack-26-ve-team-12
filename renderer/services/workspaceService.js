// Access to the project on disk. Inside Electron everything goes through window.platanus
// (the preload bridge). In a plain browser it serves a demo project so the UI can be built without Electron.
import { DEMO_TREE, demoFileContent } from '../models/demoProject.js';
import { findNode } from '../models/fileTree.js';
import { DEMO_GIT } from '../models/demoGit.js';

const DESKTOP_ONLY = { ok: false, error: 'desktop-only' };

export function createWorkspaceService(bridge = window.platanus) {
  if (!bridge) {
    // A new project in the browser is an empty folder without git; opening one brings the demo back
    let demo = { tree: DEMO_TREE, git: DEMO_GIT };
    const edits = new Map(); // path -> { content, mtime }: the editor's saves, in memory only
    return {
      isDesktop: false,
      choose: async () => {
        demo = { tree: DEMO_TREE, git: DEMO_GIT };
        return { ok: true, data: { name: 'demo', root: null } };
      },
      create: async () => {
        demo = { tree: [], git: { isRepo: false } };
        return { ok: true, data: { name: 'nuevo-proyecto', root: null } };
      },
      current: async () => ({ ok: true, data: null }),
      // The browser demo never writes to disk: nothing to trust
      trust: async () => ({ ok: true, data: false }),
      untrust: async () => ({ ok: true, data: false }),
      close: async () => ({ ok: true }),
      recent: async () => ({ ok: true, data: [] }),
      openRecent: async () => DESKTOP_ONLY,
      tree: async () => ({ ok: true, data: demo.tree }),
      read: async () => DESKTOP_ONLY,
      openFile: async (path) => ({ ok: true, data: { content: demoFileContent(path), mtime: 0, secret: false, ...edits.get(path) } }),
      saveFile: async (path, content, mtime) => {
        edits.set(path, { content, mtime: mtime + 1 });
        return { ok: true, data: { mtime: mtime + 1 } };
      },
      open: async () => DESKTOP_ONLY,
      kind: async (path) => ({ ok: true, data: (path && findNode(demo.tree, path)?.type) || null }),
      mkdir: async () => DESKTOP_ONLY,
      write: async () => DESKTOP_ONLY,
      remove: async () => DESKTOP_ONLY,
      gitHistory: async () => ({ ok: true, data: demo.git }),
      onChanged: () => () => {},
      onMenuAction: () => () => {},
      onDialog: () => () => {},
      isDev: false,
    };
  }

  return {
    isDesktop: true,
    choose: () => bridge.chooseWorkspace(),
    create: () => bridge.createWorkspace(),
    current: () => bridge.currentWorkspace(),
    trust: (ask = false) => bridge.trustWorkspace(ask),
    untrust: () => bridge.untrustWorkspace(),
    close: () => bridge.closeWorkspace(),
    recent: () => bridge.recentWorkspaces(),
    openRecent: (root) => bridge.openRecentWorkspace(root),
    tree: (path = '.') => bridge.tree(path),
    read: (path) => bridge.read(path),
    openFile: (path) => bridge.openFile(path),
    saveFile: (path, content, mtime) => bridge.saveFile(path, content, mtime),
    open: (path, how) => bridge.open(path, how),
    kind: (path) => bridge.kind(path),
    mkdir: (path) => bridge.mkdir(path),
    write: (path, content) => bridge.write(path, content),
    remove: (path) => bridge.remove(path),
    gitHistory: () => bridge.gitHistory(),
    onChanged: (callback) => bridge.onChanged(callback),
    // macOS system menu bar (Project menu): { action, root? }
    onMenuAction: (callback) => bridge.onMenuAction(callback),
    // A confirmation dialog of the main process opens (true) or closes (false)
    onDialog: (callback) => bridge.onDialog?.(callback) ?? (() => {}),
    isDev: Boolean(bridge.dev), // npm run dev

  };
}
