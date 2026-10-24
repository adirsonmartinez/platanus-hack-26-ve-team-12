# Workflows

## Checks before saying "done"

```sh
npm test
npx esbuild renderer/main.js --bundle --outfile=/dev/null --log-level=error '--external:*.css' '--external:*.task'
node --check electron/main.js
```

## The real app

```sh
npx electron . --remote-debugging-port=9223 --open=<project>              # normal
PLATANUS_SIM=1 npx electron . --remote-debugging-port=9223 --open=<p>     # + "Simulador" agent
PLATANUS_DEMO=1 ...                                                       # + visible cursor, window.__platanus
PLATANUS_SIM_DEFAULT=feria ...                                            # Simulador answers untagged messages with "feria"
```

- Drive the app with `scripts/demo/cdp.mjs` (`connect`, `call`, `evaluate`, `on`). Screenshots: `Page.captureScreenshot` with a `clip` of `#chat` or of the stage.
- In demo mode, `window.__platanus` exposes `robotViewModel`, `tourViewModel` and `mapViewModel`, so you can drive features directly. Prefer this to fake mouse paths, since the person may be using the same window.
- Agent selection persists in `localStorage['platanus.agent.choice.v1']`. Save it and restore it after a test.
- The simulator scenarios play every chat case end to end: `node scripts/sim/run.mjs 9223 <outDir> <project>` (screenshots plus `report.json`).
- When you are done, leave the app running in normal mode with the user's project (`--open=/Users/jesus/orca/projects/team-12`).

## Product video

```sh
# 1. app in recording mode on the sample project
PLATANUS_DEMO=1 PLATANUS_SIM=1 PLATANUS_SIM_DEFAULT=feria npx electron . --remote-debugging-port=9223 --open=scripts/demo/sample-project
# 2. record + encode (public/takes/: tour.mp4, stills, cursor-path.json, markers.json)
cd video && npm run take
# 3. review and render
npm run studio
npm run render        # out/platanus.mp4
```

- The recorder's steps and selectors are in `scripts/demo/timeline.mjs` (one place to change when the UI changes).
- Durations and captions come from `video/src/timing.js` and the recording markers.

## Icons and logos

- Add Hugeicons to `ICON_NAMES` and agent logos to `BRAND_NAMES` (a file in `@lobehub/icons-static-svg/icons`), then run `npm run icons`.
- No hand-drawn SVG.
