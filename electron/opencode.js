// OpenCode as a Qubbot agent, locked to the Qubbot tools (research and checks: docs/INTERFAZ.md).
// - config: an agent "platanus" whose permissions deny everything but `platanus_*` (last match wins),
//   repeated at the top level; OpenCode's own agents are turned off. Checked with `opencode debug agent
//   platanus` (1.19.4): bash, read, glob, grep, edit, write, task, webfetch, websearch, skill… all false.
// - environment: inherited OPENCODE_* settings are removed (OPENCODE_PERMISSION could re-allow tools) and
//   the global config folder is isolated, so the person's own opencode.json cannot reorder the rules.
// - a fallback to OpenCode's default agent is fatal (FALLBACK_LINE on stderr).
// Pure; tested in opencode.test.js.

function opencodeConfig({ mcpUrl, systemPrompt }) {
  const lock = { '*': 'deny', 'platanus_*': 'allow' };
  return {
    $schema: 'https://opencode.ai/config.json',
    autoupdate: false,
    instructions: [],
    plugin: [],
    mcp: { platanus: { type: 'remote', url: mcpUrl, enabled: true, oauth: false, timeout: 30000 } },
    permission: { ...lock },
    tools: { '*': false, 'platanus_*': true },
    agent: {
      platanus: { mode: 'primary', prompt: systemPrompt, permission: { ...lock } },
      build: { disable: true },
      plan: { disable: true },
      general: { disable: true },
      explore: { disable: true },
    },
    default_agent: 'platanus',
  };
}

function opencodeEnv(base, { configFile, configHome }) {
  const env = Object.fromEntries(Object.entries(base).filter(([key]) => !key.startsWith('OPENCODE_')));
  return {
    ...env,
    OPENCODE_CONFIG: configFile,
    XDG_CONFIG_HOME: configHome,
    OPENCODE_DISABLE_PROJECT_CONFIG: '1',
    OPENCODE_DISABLE_CLAUDE_CODE: '1',
    OPENCODE_DISABLE_EXTERNAL_SKILLS: '1',
    OPENCODE_DISABLE_AUTOUPDATE: '1',
    OPENCODE_PURE: '1',
  };
}

// Never --auto (or its aliases --yolo / --dangerously-skip-permissions) and never --attach. Values are
// glued to their option and the message goes after "--", so text starting with "-" is never an option.
function opencodeArgs({ prompt, workdir, model, resume }) {
  return [
    'run', '--pure', '--format', 'json', '--agent', 'platanus', `--dir=${workdir}`,
    ...(model ? [`--model=${model}`] : []),
    ...(resume ? [`--session=${resume}`] : []),
    '--', prompt,
  ];
}

const FALLBACK_LINE = /agent "platanus" not found|Falling back to default agent/i;

module.exports = { opencodeConfig, opencodeEnv, opencodeArgs, FALLBACK_LINE };
