// Trusted folders, like VS Code's workspace trust: in a folder the person trusts, the agent's changes are
// saved without asking one by one. Secrets are still refused and every change is still backed up (main.js).
// The list lives in the main process (userData/trusted-folders.json); the window can only ask, and the
// person answers in a native dialog. A folder is trusted by its exact path: not its subfolders or parents.
const fs = require('node:fs/promises');
const path = require('node:path');

const norm = (root) => path.resolve(String(root));

function isTrusted(list, root) {
  if (!root) return false;
  const key = norm(root);
  return list.some((entry) => norm(entry) === key);
}

function setTrusted(list, root, trusted) {
  if (!root) return [...list];
  const key = norm(root);
  const rest = list.filter((entry) => norm(entry) !== key);
  return trusted ? [...rest, key] : rest;
}

function createTrustStore(file) {
  const read = async () => {
    try {
      const list = JSON.parse(await fs.readFile(file, 'utf8'));
      return Array.isArray(list) ? list.filter((x) => typeof x === 'string') : [];
    } catch {
      return [];
    }
  };
  return {
    has: async (root) => isTrusted(await read(), root),
    set: async (root, trusted) => {
      await fs.writeFile(file, JSON.stringify(setTrusted(await read(), root, trusted), null, 2));
    },
  };
}

module.exports = { isTrusted, setTrusted, createTrustStore };
