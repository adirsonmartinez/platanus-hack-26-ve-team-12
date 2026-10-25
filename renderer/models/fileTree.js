// Pure helpers over the workspace tree: [{ type: 'dir' | 'file', path, size?, children? }]

export const baseName = (path) => path.split('/').pop();

export const countFiles = (nodes) =>
  nodes.reduce((n, node) => n + (node.type === 'file' ? 1 : countFiles(node.children ?? [])), 0);

export const countDirs = (nodes) =>
  nodes.reduce((n, node) => n + (node.type === 'dir' ? 1 + countDirs(node.children ?? []) : 0), 0);

export const allFiles = (nodes) =>
  nodes.flatMap((node) => (node.type === 'file' ? [node] : allFiles(node.children ?? [])));

// The root is represented as a folder with an empty path
export const rootNode = (tree) => ({ type: 'dir', path: '', children: tree });

export function findNode(tree, path) {
  if (path === '') return rootNode(tree);
  const walk = (nodes) => {
    for (const node of nodes) {
      if (node.path === path) return node;
      if (node.type === 'dir') {
        const found = walk(node.children ?? []);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(tree);
}
