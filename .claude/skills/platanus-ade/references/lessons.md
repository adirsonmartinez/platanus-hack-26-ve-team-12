# Lessons learned (keep them true; delete what stops being true)

## The person and how they work
- They read only Spanish, in plain words. They review by screenshots of the real app, so check visually and do not rely only on tests.
- They often use the same app window while you test, so camera moves and clicks can come from them. Use `window.__platanus` (demo mode) for deterministic checks.
- They want everything interactive and clear about "where am I / what is the agent saying". Keep context visible (focus bar, tags on the question and the answer) rather than in scrolled-away text.

## UI traps
- A rule like `display: flex` on a class beats the browser's `[hidden]`. Add `[hidden] { display: none }` next to it.
- `:last-of-type` matches the element type, not the class. To get the newest card, use `querySelectorAll(...)` and `.at(-1)`.
- Class names are global: the agent logos first used the class `brand`, which collided with the title bar's `.brand { padding-right: 8px }` and pushed every logo off-center. They are `svg.icon.agent-logo` now. Before adding a short generic class, grep the styles.
- Buttons can inherit padding (the launcher had `1px 6px`): reset it where an icon must sit exactly in the middle.
- Logo SVGs: color logos carry their own fills. Single-color ones need `fill: currentColor` and `stroke: none` (`svg.icon.agent-logo`).
- Liquid glass on small tiles (the header's agent mark): gradient glass fill, a `::before` light on the top half, a `::after` masked gradient rim, inset depth, and a radial glow in the agent's color (`--agent-tint` on `#chat[data-agent]`).
- `#stage canvas { width: 100% !important }` (the 3D canvas rule) also stretches any canvas inside the map's labels, such as a thinking orb in the robot's bubble. Give `#stage .map-label canvas.orb` a fixed size.
- Map bubbles need to be opaque (labels behind show through glass) and compact (short button labels, full wording as a tooltip).
- thinking-orbs only has the 20, 32 and 64 px presets. The `thinkingOrb()` wrapper maps any size to the nearest one; never pass another size straight to the package.
- Chat scroll: the newest question stays anchored at the top while its answer streams, until the person scrolls (`anchorId` in `chatView.js`).

## Map interaction
- A lifted object drawn under the cursor: shift its ground spot toward the camera by `offset/offset.y * height`, keep the grip offset from where it was grabbed, and decide the drop target from the visual spot. Mark the target with a ring while dragging.
- Fake mouse checks with CDP: locate things with `__platanus.screenOf` (demo mode), not by scanning the screen; a grid scan of `evaluate` calls takes minutes.
- Review workflows on new stateful view models pay off. The building-live review found real races: steps re-keyed when OpenCode reports late, cards vanishing on a new chat, the tour starting mid-build, rejected repair writes shown as saved.

## Agents and MCP
- When the person asks to understand, keep it read-only end to end. `questionIntent` → `readOnly` → `/ro` MCP, `explainNote` in the prompt, and no repair or audit chips after. Offering repairs after an explanation feels pushy and off-topic to them.
- Real agents can take more than 25 s for a tour narration (Grok took about 40 s with 3 reads). The script plays first and the timeout is 120 s.
- In `agentLabel`, "(tu suscripción)" is part of the label. Use `.split(' (')[0]` before showing it as a name.
- A tour run uses `/mcp/<token>/ro`, and the window also cancels it on a write tool event.
- `opencode run`: put options before `--` and glue their values (`--model=…`), otherwise a message starting with `-` is read as an option.
- `grok mcp add` writes Grok's MCP address globally. Two Grok runs at once would point at each other's route, so `agents.js` queues **every** run of any agent with `parallel: false` (not only workers: a review on `/ro` next to a chat on the full address would get write tools). Claude and OpenCode get one config file or folder per session instead.
- A folder check on MCP writes needs the project root: with only the path as written, a symlink inside the folder can lead outside it. `isInScope` resolves the real path.

## Parallel agents (one feature split across several agents)
- Put in the contract every store field one module reads from another. `ProjectModel` dropped `root`, so the memory was keyed by the folder name. Main accepts only the open or a recent root, so the memory silently came back empty. Tests with fakes passed, because each fake had `root`.
- A deterministic check must not read a value an agent can set: `scoreOf` returns the agent's override first, so the team audit uses the worst of `demoScore` and the current light. Worker MCP routes do not offer `platanus_set_file_score`.
- Anything that waits in a line (approval dialogs) must check again when its turn comes: the worker may be cancelled or the project changed meanwhile.
- Keep one vocabulary for a tool's answers in three places: the window's tool (`callViewModel`), its description (`electron/strings.js` `voice.tools`) and the prompt. `abrir_en_navegador` answered `sin-servidor` while its description said `no-existe`, so the voice would not know what to say.
- An `Observable` calls its listeners on every `set()`. A chat card fed from a view model store should update only when the fields it shows change (compare `phase` and `workers` by identity), not on every guide step or drop.

## ElevenLabs (llamada con Qubi)
- Never swap the real feature for a fake one silently. The call fell back to the simulated one with no key, and `main.js` also turned it on when the Simulator agent showed up, so the person saw «Llamada simulada» when they wanted to talk to Qubi. Show the missing piece instead (the voice-connect modal) and make the simulated call an explicit choice.
- The SDK `@elevenlabs/elevenlabs-js` 2.74 strips unknown body keys (`unrecognizedObjectKeys: "strip"`) and has no `realtimeModel` yet. Send new fields with `requestOptions.additionalBodyParameters`. It merges shallowly, so use a separate update with only `{ conversation_config: { realtime_model } }`.
- `@elevenlabs/client` is vendored (`npm run vendor`) for the browser condition. Pass `workletPaths` to the self-hosted worklets in `renderer/vendor/elevenlabs/`, so the CSP needs no `blob:`. For WebSocket mode, CSP needs `connect-src wss://api.elevenlabs.io`.
- `sendContextualUpdate` does not make the agent speak. To get a spoken notice, use `sendUserMessage('[aviso de Qubbot] …')` and hide those lines from the person's transcript.
- Never send the coding agent's raw answer to the voice agent: it can carry file contents or keys.
- A tool description that promises a visible effect must have it. `mostrar_carpeta` said «lleva la cámara y al robot» but only moved the camera, so the voice used it and Qubi never walked. Route every "go there" tool through the same walk (`#walk`).
- A security light judged by file name disagrees with any agent that reads the file (every .sql was "a revisar", a real SQL injection in a .ts was green). Lights and the score come from the content audit in main (`securityAudit.js`); agents may only raise a light, and a repair is verified by auditing again, never by the agent's word.
- Anything that should face the camera must read the azimuth every frame (`face({ yaw: () => azimuth })`); a yaw captured once leaves the robot with its back turned after the person rotates the map.

## Video toolchain
- Remotion's bundled ffmpeg (`npx remotion ffmpeg`) is minimal: there is no `fps` filter. Use `-fps_mode cfr -r 30 -pix_fmt yuv420p`.
- `@remotion/three`: load textures before mounting `ThreeCanvas` (`useTextures`). A texture set later is not drawn.
- Pin `three` to the app's version (0.160) and alias it in `remotion.config.js`, so the app's `robotBuilder.js` works.
- The app UI is dark: on a light 3D table, tilt the screens toward the camera and frame them closer so they read.
- CDP screencast frames arrive only when the screen changes. Write them with their real durations (ffconcat) and encode at a constant frame rate.
- ElevenLabs answers an unknown voice with **400 `voice_not_found`**, not 404. The key made by `onboard connect` has no `voices_write`, so library voices cannot be added by the app. The agent falls back to a premade voice (`FALLBACK_VOICE_ID`) so a call never fails over the voice.
- WebGL effects (metal-fx) do not work inside map labels that move every frame: the canvas lands in the wrong place. Use plain CSS there.
- Never leave the app in `PLATANUS_DEMO` after measuring or recording: the person keeps using that window, and the fake cursor makes clicks feel wrong (it happened twice).

- Verify every number on screen against an independent computation on disk (audit in node, git rev-list, the CLI itself), not only unit tests. A capped scan (3000 files) silently covered half a project.
- A demo path that keys off something real (a folder name, "no agent connected", a timer after opening) leaks fake data into the desktop app. Gate every demo on "web version" (no desktop bridge), never on names or timers.
- An agent's command allowlist must be adversarially tested: "read-only" git and tools still wrote files (--output, -o, --outDir), read secrets (git show HEAD:.env, --no-index) or changed remotes. Reject absolute/.. arguments and output/cwd/config flags; treat anything that loads project code (tests, linters) as a change.
- After each change, restart the real app and read its console: an empty-list case crashed the renderer (schemaBuilder) while all 761 tests passed.
- Voice start latency (2026-10-25): `require('@elevenlabs/elevenlabs-js')` blocks main ~1.7 s the first time; a free ElevenLabs plan refuses library voices (`paid_plan_required`), so cache refusals or every call pays two failing requests. Measure with a CDP MutationObserver on `#call-bar` data attributes rather than guessing.
