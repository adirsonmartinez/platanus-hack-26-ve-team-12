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

## Video toolchain
- Remotion's bundled ffmpeg (`npx remotion ffmpeg`) is minimal: there is no `fps` filter. Use `-fps_mode cfr -r 30 -pix_fmt yuv420p`.
- `@remotion/three`: load textures before mounting `ThreeCanvas` (`useTextures`). A texture set later is not drawn.
- Pin `three` to the app's version (0.160) and alias it in `remotion.config.js`, so the app's `robotBuilder.js` works.
- The app UI is dark: on a light 3D table, tilt the screens toward the camera and frame them closer so they read.
- CDP screencast frames arrive only when the screen changes. Write them with their real durations (ffconcat) and encode at a constant frame rate.
