// Example servers for the web demo (no Electron, no access to processes). Fictional data, shown as examples.
export const DEMO_SERVERS = [
  { port: 3000, process: 'node', address: '0.0.0.0', exposed: true },
  { port: 8000, process: 'Python', address: '*', exposed: true },
  { port: 5173, process: 'node', address: '127.0.0.1', exposed: false },
  { port: 5432, process: 'postgres', address: '127.0.0.1', exposed: false },
];
