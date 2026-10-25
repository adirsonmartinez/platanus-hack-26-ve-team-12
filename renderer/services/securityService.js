// The security audit of the open project (electron/securityAudit.js through the preload bridge). Outside
// Electron (the web version) there is no audit: available is false and the demo rules stay.
const NONE = { ok: false, error: 'desktop-only' };

export function createSecurityService(bridge = window.platanus) {
  const api = bridge?.security;
  if (!api) {
    return { available: false, audit: async () => NONE, check: async () => NONE, accept: async () => NONE, unaccept: async () => NONE };
  }
  return {
    available: true,
    audit: (cause) => api.audit(cause),
    check: (paths, cause) => api.check(paths, cause),
    accept: (path) => api.accept(path),
    unaccept: (path) => api.unaccept(path),
  };
}
