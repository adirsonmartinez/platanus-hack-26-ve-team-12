// Bridge for "Conectar mi cuenta" (electron/supabaseConnect.js via preload). No logic: main signs in, asks and
// writes the keys; the window only sends the person's pick. The browser demo cannot connect accounts.
import { strings } from '../i18n/es.js';

export function createIntegrationService(bridge = window.platanus) {
  if (!bridge?.supabaseStart) {
    const desktopOnly = async () => ({ ok: false, error: strings.accounts.desktopOnly });
    return { available: false, start: desktopOnly, connect: desktopOnly, signOut: desktopOnly, stats: desktopOnly, dashboard: desktopOnly, linked: desktopOnly, onProgress: () => () => {} };
  }
  return {
    available: true,
    start: () => bridge.supabaseStart(),
    connect: (choice) => bridge.supabaseConnect(choice),
    signOut: () => bridge.supabaseSignOut(),
    stats: (projectId) => bridge.supabaseStats(projectId),
    linked: () => bridge.supabaseLinked(),
    dashboard: (projectId) => bridge.supabaseDashboard(projectId),
    onProgress: (callback) => bridge.onSupabaseProgress(callback),
  };
}
