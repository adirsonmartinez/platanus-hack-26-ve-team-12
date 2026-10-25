// Starting the open project from the call (ejecutar_app, docs/features/llamada/MEJORAS.md §2). Main finds
// the project's own `dev` or `start` scripts and runs one only by its id in that list (never free text),
// after its own native confirm dialog. In a plain browser there is nothing to run.
// Never rejects: a broken bridge is a project that could not start.
export function createRunService(bridge = globalThis.window?.platanus?.run) {
  if (!bridge) {
    return {
      available: false,
      scripts: async () => ({ ok: false, data: [] }),
      start: async () => ({ ok: false, reason: 'failed' }),
    };
  }
  return {
    available: true,
    // -> { ok, data: [{ id, cwd, script, command }] }
    scripts: () => Promise.resolve()
      .then(() => bridge.scripts())
      .then((res) => ({ ok: Boolean(res?.ok), data: Array.isArray(res?.data) ? res.data : [] }))
      .catch(() => ({ ok: false, data: [] })),
    // -> { ok, port?, reason? }
    start: (id) => Promise.resolve().then(() => bridge.start(id)).catch(() => ({ ok: false, reason: 'failed' })),
  };
}
