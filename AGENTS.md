# AGENTS.md — Platanus (team-12)

> Before working, read `MEMORY.md` (the project's live state) and the skill `.claude/skills/platanus-ade/`. At the end of every task, update `MEMORY.md` with what changed and what you learned.

Instructions for AI coding agents working on this repo (Claude Code, Codex, Cursor, Pi…).
The full conventions are in [`CLAUDE.md`](CLAUDE.md); read it first. Key points:

- **Code in English, user-facing text in simple Spanish**, only in `renderer/i18n/es.js` and
  `electron/strings.js`. The people using Platanus are not developers: no jargon.
- **MVVM** in the renderer (models → view models → views); tests first in `tests/renderer/`; `npm test`.
- **Security rules for the agents are not negotiable** (see CLAUDE.md → "Agents and repairs").
- **Git flow**: work on a `feature/*` branch, merge into `develop` with `--no-ff`. Releases only when asked.

## The chat agent's voice (Vibe / Dev)

How the in-app agent talks lives in [`agent/`](agent/README.md), not in code:

- `agent/voice.json`: base rules, the answer format (cards, file links, `sugerencias` block), per-mode
  length, and how it adapts to the way the person writes.
- `agent/skills/modo-vibe/SKILL.md`: talking to people who do not code. **Also use this skill when you
  write any Spanish text for the app** (es.js): same tone, same rules.
- `agent/skills/modo-dev/SKILL.md`: technical mode.

## UI libraries

- Icons: [Hugeicons](https://hugeicons.com) free set. Add a name in `renderer/icons/iconNames.js`, then
  `npm run icons`. Use `icon('name')` (views/icons.js, an svg string), `<i data-icon="name">` in HTML,
  or the DOM helper in `views/ui/icons.js` for the chat views.
- Effects: [libraries.dev](https://libraries.dev). The skill is in `.claude/skills/libraries-dev/`
  (read it before using an effect; follow its placement rules: orbs only for waits over 2 s, border
  beam over 3 s, never two effects on the same element). The renderer has no React: thinking orbs use
  the package engine (`views/ui/thinkingOrb.js`); border beam is bundled with React by
  `scripts/vendor-ui.js` into `renderer/vendor/react-ui.js` (with metal-fx, the liquid metal of the send button; one React for both).
- `renderer/vendor/` (and `renderer/icons/hugeicons.js`) are generated **and committed** (`npm run vendor`,
  `npm run icons`): clones, the web demo and the installers need no build step. The source packages are
  devDependencies.

## Delegating (gentle-shell + Pi)

Bounded, parallel tasks can go to Pi: `gentle-shell -- --model nan/qwen3.6 --thinking high --no-session -p "<task>"`
(or `nan/mimo-v2.6-flash` for volume work). One task per call, exact file paths, a clear "done" criterion,
never two agents on the same file, and review every result (`npm test`, read the diff) before keeping it.
