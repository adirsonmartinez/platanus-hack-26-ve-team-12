// Access to the user's own agent and the local MCP server. Inside Electron it goes through
// window.platanus (preload); in a plain browser nothing is available (agents need the desktop app).
export function createAgentService(bridge = window.platanus) {
  if (!bridge?.agents) {
    return {
      isDesktop: false,
      detect: async () => ({ ok: true, data: [] }),
      login: async () => ({ ok: false }),
      run: async () => ({ ok: false, error: 'desktop-only' }),
      cancel: async () => {},
      onEvent: () => () => {},
      mcpInfo: async () => ({ ok: true, data: { url: null, running: false } }),
      onMcpStatus: () => () => {},
      onMcpRequest: () => () => {},
      replyMcp: async () => {},
      onScore: () => () => {},
      onChanged: () => () => {},
      onAwaiting: () => () => {},
      undo: async () => ({ ok: false }),
      setApproval: async () => ({ ok: false, error: 'desktop-only' }),
      listKeys: async () => ({ ok: true, data: {} }),
      saveKey: async () => ({ ok: false, error: 'desktop-only' }),
      removeKey: async () => ({ ok: false, error: 'desktop-only' }),
      auditLog: async () => ({ ok: true, data: [] }),
      onAudit: () => () => {},
    };
  }
  return {
    isDesktop: true,
    detect: () => bridge.agents.detect(),
    login: (id) => bridge.agents.login(id),
    run: (req) => bridge.agents.run(req), // the whole request: a worker's id and folders (worker, scope) too
    cancel: (runId) => bridge.agents.cancel(runId),
    onEvent: (cb) => bridge.agents.onEvent(cb),
    mcpInfo: () => bridge.mcp.info(),
    onMcpStatus: (cb) => bridge.mcp.onStatus(cb),
    onMcpRequest: (cb) => bridge.mcp.onRequest(cb),
    replyMcp: (payload) => bridge.mcp.reply(payload),
    onScore: (cb) => bridge.mcp.onScore(cb),
    onChanged: (cb) => bridge.mcp.onChanged(cb),
    onAwaiting: (cb) => bridge.mcp.onAwaiting(cb),
    auditLog: () => bridge.auditLog(),
    onAudit: (cb) => bridge.onAudit(cb),
    undo: (change) => bridge.mcp.undo(change),
    setApproval: (mode) => bridge.mcp.setApproval(mode),
    listKeys: () => bridge.keys.list(),
    saveKey: (provider, value) => bridge.keys.set(provider, value),
    removeKey: (provider) => bridge.keys.remove(provider),
  };
}
