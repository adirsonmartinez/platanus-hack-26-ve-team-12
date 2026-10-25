// What the welcome robot set up in a new project and is still waiting for the person's account (the map
// shows those integrations as 'pending', "Por conectar"), and which service project each folder is linked
// to once connected (the database panel reads its numbers). Remembered per project folder (its full path, so
// two folders with the same name never share it) in this computer (localStorage). No secrets here: a project
// id and its name.
const KEY = (root) => `platanus.setup.v1:${root}`;

export class SetupModel {
  prepare(root, integrations) {
    if (!root) return;
    this.#save(root, { ...this.#read(root), pending: [...integrations] });
  }

  pendingOf(root) {
    return root ? this.#read(root).pending : [];
  }

  markConnected(root, key) {
    if (!root) return;
    const data = this.#read(root);
    this.#save(root, { ...data, pending: data.pending.filter((k) => k !== key) });
  }

  // link: { projectId, name }
  link(root, key, link) {
    if (!root) return;
    const data = this.#read(root);
    this.#save(root, { ...data, links: { ...data.links, [key]: { projectId: String(link.projectId), name: String(link.name ?? '') } } });
  }

  linkOf(root, key) {
    return root ? this.#read(root).links[key] ?? null : null;
  }

  // { pending: [], links: {} }; the first version saved the pending list alone
  #read(root) {
    try {
      const data = JSON.parse(localStorage.getItem(KEY(root)) ?? 'null');
      if (Array.isArray(data)) return { pending: data, links: {} };
      return { pending: Array.isArray(data?.pending) ? data.pending : [], links: data?.links && typeof data.links === 'object' ? data.links : {} };
    } catch {
      return { pending: [], links: {} };
    }
  }

  #save(root, data) {
    try { localStorage.setItem(KEY(root), JSON.stringify(data)); } catch { /* private mode */ }
  }
}
