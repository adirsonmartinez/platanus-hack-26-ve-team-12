// Answers the local MCP server with what only the window knows (traffic lights, the map), and applies
// the traffic light an agent sets. The tools themselves are declared in electron/mcpServer.js.
export function connectMcpBridge({ agentService, securityModel, shellViewModel }) {
  const tools = {
    // with the audit: what each rule found and on which line, so the agent looks at exactly that
    list_risks: () =>
      shellViewModel.store.state.risks.map(({ path, level, reason, reasonKey, findings = [] }) => ({
        path, level, reason: reason || reasonKey || '', ...(findings.length ? { findings: findings.map(({ rule, line }) => ({ rule, line })) } : {}),
      })),
    show_folder: ({ path }) => {
      shellViewModel.showFolder(path ?? '');
      return path ? `Showing ${path}/ on the map.` : 'Showing the whole map.';
    },
  };

  agentService.onMcpRequest(async ({ id, tool, args }) => {
    try {
      if (!tools[tool]) throw new Error(`Unknown tool: ${tool}`);
      agentService.replyMcp({ id, ok: true, data: await tools[tool](args ?? {}) });
    } catch (err) {
      agentService.replyMcp({ id, ok: false, error: err.message });
    }
  });

  // Same effect as the public 'file:score' hook
  agentService.onScore(({ path, level, reason }) => securityModel.setScore(path, level, reason));
}
