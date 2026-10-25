// Servers listening on this computer. Inside Electron it goes through window.platanus.servers (the preload
// bridge); in a plain browser it serves example servers so the web demo shows the view.
import { DEMO_SERVERS } from '../models/demoServers.js';

const DESKTOP_ONLY = { ok: false, code: 'desktop-only', error: null };

export function createServerService(bridge = globalThis.window?.platanus) {
  const servers = bridge?.servers;
  if (!servers) {
    const desktopOnly = async () => DESKTOP_ONLY;
    return {
      isDesktop: false,
      list: async () => ({ ok: true, data: DEMO_SERVERS }),
      browsers: async () => ({ ok: true, data: [] }),
      stopped: async () => ({ ok: true, data: [] }),
      open: desktopOnly,
      stop: desktopOnly,
      pause: desktopOnly,
      resume: desktopOnly,
      restart: desktopOnly,
      cancelStart: desktopOnly,
      forget: desktopOnly,
      output: async () => ({ ok: true, data: '' }),
    };
  }
  return {
    isDesktop: true,
    list: () => servers.list(),
    browsers: () => servers.browsers(),
    stopped: () => servers.stopped(),
    open: (port, browser) => servers.open(port, browser),
    stop: (port) => servers.stop(port),
    pause: (port) => servers.pause(port),
    resume: (port) => servers.resume(port),
    restart: (id) => servers.restart(id),
    cancelStart: (id) => servers.cancelStart(id),
    forget: (id) => servers.forget(id),
    output: (key) => servers.output(key),
  };
}
