// The voice call with Qubi (docs/features/llamada/VOZ.md): asks main for a one-time credential to talk to
// ElevenLabs (a signed address) or Grok Voice (a short-lived client secret), says which voice services are
// connected, signs in to ElevenLabs and saves or removes a pasted key. Keys never come back to the window:
// main only answers with their last 4 characters. In a plain browser there is no bridge: the call is
// always simulated there.
// Every method answers and never rejects: a broken bridge is just something that could not be done.
const safely = (fn, fallback) => Promise.resolve().then(fn).catch(() => fallback);

export function createVoiceService(
  bridge = globalThis.window?.platanus?.voice,
  { keys = globalThis.window?.platanus?.keys, links = globalThis.window?.platanus?.links } = {},
) {
  const none = { elevenlabs: { ready: false }, grok: { ready: false } };
  if (!bridge) {
    return {
      available: false,
      status: async () => ({ ready: false, reason: 'desktop-only' }),
      start: async () => ({ ok: false, reason: 'no-key' }),
      providers: async () => none,
      login: async () => ({ ok: false, reason: 'failed' }),
      loginCancel: async () => {},
      setKey: async () => ({ ok: false, error: 'failed' }),
      removeKey: async () => ({ ok: false, error: 'failed' }),
      openLink: async () => ({ ok: false }),
    };
  }
  // Only what the window may know of a provider: ready, and the last 4 characters of its key
  const providerOf = (p) => ({ ready: Boolean(p?.ready), ...(typeof p?.last4 === 'string' ? { last4: p.last4.slice(-4) } : {}) });
  return {
    available: true,
    status: () => safely(() => bridge.status(), { ready: false, reason: 'failed' }),
    start: (req) => safely(() => bridge.start(req), { ok: false, reason: 'failed' }),
    providers: () => safely(async () => {
      if (!bridge.providers) return none;
      const res = await bridge.providers();
      return { elevenlabs: providerOf(res?.elevenlabs), grok: providerOf(res?.grok) };
    }, none),
    login: () => safely(() => (bridge.login ? bridge.login() : { ok: false, reason: 'failed' }), { ok: false, reason: 'failed' }),
    loginCancel: () => safely(() => bridge.loginCancel?.(), undefined),
    // The key goes to main once and is never kept here (the caller clears its field)
    setKey: (provider, key) => safely(() => (keys?.set ? keys.set(provider, key) : { ok: false, error: 'failed' }), { ok: false, error: 'failed' }),
    removeKey: (provider) => safely(() => (keys?.remove ? keys.remove(provider) : { ok: false, error: 'failed' }), { ok: false, error: 'failed' }),
    // Main opens only the addresses of its fixed list (electron/serviceCatalog.js LINKS)
    openLink: (url) => safely(() => (links?.open ? links.open(String(url)) : { ok: false }), { ok: false }),
  };
}
