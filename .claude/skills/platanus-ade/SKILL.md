---
name: platanus-ade
description: How to work on Platanus (this repo), the visual ADE with a 3D security map and an agentic chat for non-developers. Use at the start of any task in this repo (read MEMORY.md first), when adding or changing a feature (chat, run cards, tour/"Recorrido", the map robot, agents and MCP tools, icons/logos), when checking a change in the real Electron app (CDP, simulator, demo mode), when recording or rendering the product video (scripts/demo, video/), and at the end of every task to update MEMORY.md and this skill with what was learned.
---

# Platanus ADE

`CLAUDE.md` has the stable rules (MVVM, strings in `es.js`, security). This skill covers how to work here and keeps the hard-won lessons. `MEMORY.md` (repo root) is the live state: branches, features, pending work.

## Every task

1. **Read `MEMORY.md`** before anything else, then the feature doc it points to (`docs/features/*/README.md`). Do not reread the whole repo.
2. **Tests first.** Put pure logic in `models/` or `viewmodels/` with `node --test` tests, and keep the views thin. Add new test files to `package.json` `test` unless they are `tests/renderer/*.test.mjs` (that glob is already included).
3. **Check in the real app** for anything visible ([references/workflows.md](references/workflows.md)).
4. **Update the docs:**
   - the feature's `docs/features/<x>/README.md` (Spanish, plain);
   - `CLAUDE.md` if a module or rule changed;
   - `docs/INTERFAZ.md` if the person sees something new.
5. **Update `MEMORY.md` before you finish:**
   - what changed and where;
   - the branch state;
   - pending work;
   - one line for each lesson worth keeping.

   Move stable lessons into [references/lessons.md](references/lessons.md). Keep `MEMORY.md` under about 120 lines: trim what is done or obsolete.
6. **Commit or push only when the user asks.** Use git flow (`feature/*` → PR to `develop`) and the attribution lines the session gives.

## Where things are

| Need | Look at |
|---|---|
| Chat state and cards | `renderer/viewmodels/chatViewModel.js`, `views/ui/chatView.js`, `chatCardsView.js`, `runCardView.js` |
| Agent runs, sessions, keys | `models/agentConnectionModel.js`, `electron/agents.js`, `electron/main.js` (`SESSIONS`, `agents:run`) |
| MCP tools (agents act only through them) | `electron/mcpServer.js` (full and `/ro` read-only), handlers in `electron/main.js`, `services/mcpBridge.js` |
| Agent voice and prompts | `agent/voice.json` (`base`, `refine`, `tour`), `electron/agentVoice.js` |
| Tour ("Recorrido") | `models/projectAnalyzer.js`, `models/tourSpec.js`, `viewmodels/tourViewModel.js`, `tourPlaces.js`, `views/scene/tourView.js` |
| Map robot | `viewmodels/robotViewModel.js`, `views/scene/guideRobot.js`, `robotView.js`, `inputController.js` (`grabber`) |
| Thinking orbs by activity | `views/ui/thinkingOrb.js` (`STEP_ORB`), `runCardView.js` (`orbKeyOf`, `orbStateOf`) |
| Icons and agent logos | `renderer/icons/iconNames.js` (`ICON_NAMES`, `BRAND_NAMES`), then `npm run icons` |
| Simulator scenarios | `scripts/sim/scenarios.js` (`[sim:name]` tag or `PLATANUS_SIM_DEFAULT`) |
| Product video | `scripts/demo/` (recording), `video/` (Remotion) |

## Keep this skill alive

When a task teaches something non-obvious (a tool quirk, a selector trap, a library limit, a user preference), add it:
- to `MEMORY.md` → «Aprendizajes» right away;
- to [references/lessons.md](references/lessons.md) once it is stable.

When a workflow changes (a new flag, script or check), update [references/workflows.md](references/workflows.md). Remove what is no longer true: stale advice is worse than none.
