# Platanus — conventions

Visual IDE for Platanus Hack 26 (AI Security track): the project is an isometric map, files get a security traffic light, and an AI agent creates and fixes code with user approval for risky actions.

## Rules

- **Start with `MEMORY.md`** (live state: branches, features, pending, lessons) and follow the skill `.claude/skills/platanus-ade/`. **Before finishing any task, update `MEMORY.md`** (and the skill's references when you learned something stable), so the next session does not have to reread everything.

- **All code in English**: identifiers, comments, file and folder names, commit messages.
- **User-facing text in Spanish**, and only in the strings files:
  - renderer: `renderer/i18n/es.js` (static HTML uses `data-i18n`, `data-i18n-title`, `data-i18n-aria`, `data-i18n-placeholder`)
  - main process: `electron/strings.js`
- **MVVM** in the renderer (see below). Respect the direction of dependencies.
- **The renderer never touches the disk.** It calls `window.platanus.*` (preload), and `electron/main.js` validates, logs and asks for confirmation. All paths are relative to the workspace and cannot escape it.
- No bundler: native ES modules loaded by Electron from disk. three.js comes from `node_modules` via the import map;
  the libraries.dev effects (thinking orbs, border beam) come from `renderer/vendor/`, generated and committed
  by `npm run vendor` (`scripts/vendor-ui.js`). See AGENTS.md → "UI libraries".
- **The chat agent's voice lives in `agent/`** (voice.json + skills modo-vibe / modo-dev), built into its prompt by
  `electron/agentVoice.js`. Change how it talks there, not in code (see `agent/README.md`).

## Renderer architecture (MVVM)

```
renderer/
  main.js         composition root: creates Models -> ViewModels -> Views, wires them, defines app `actions`
  core/           Observable (reactive state), event bus (EVENTS), formatting helpers
  i18n/es.js      every user-facing string (also tag labels, folder names, repair texts)
  services/       bridges to Electron (no logic): workspaceService (disk), agentService (agents + MCP),
                  mcpBridge (answers the MCP tools that need the window), serverService (listening servers),
                  handTrackingService (camera -> hand landmarks with MediaPipe, local model in assets/hands/)
  models/         data and rules; no DOM, no three.js, no UI state
    projectModel (tree + detected integrations), fileTree, securityModel (traffic light), supabaseModel, demoProject,
    demoIntegrations (demo projects shown as connected to every integration)
    agentModel (chat brain: scripted demo or the user's agent), agentConnectionModel (which agent,
    model, effort; one run at a time; 'chat', 'repair', 'refine' and 'tour' sessions)
    projectAnalyzer (tour facts and stops: architecture, docs, entries, tests, use cases; pure),
    tourSpec (tour words: script, the agent's JSON checked against the facts, merge)
    folderTags (tag and folder KEYS by name; labels live in es.js), modeModel (Vibe / Dev),
    repairHistoryModel (task list of repairs, per project, in localStorage),
    answerFormat (the agent's ```sugerencias block -> next steps),
    serversModel (servers listening on this computer: exposed = yellow), demoServers (web demo),
    handGesture (pinch tracker: hand landmarks -> drag or turn)
  viewmodels/     screen state + actions; no DOM, no three.js (layout.js = world geometry)
    camera, map (the whole project; problems glow), supabase, git (branches), app (which 3D view),
    shell (sidebar, stage tabs, explorer guide/tree, risks), chat,
    repair (Remi's job: walk, agent repair, outcome, queue), servers (polls every 3 s while its side view is open),
    handControl (camera on/off, pinch and move pans the map, pinch and turn rotates it),
    tour ("Recorrido": analyze, play the stops, agent narration; tourPlaces = where each stop is),
    robot (the map's robot companion: grab, drag or throw it onto a folder, it asks what to do there),
    build (building live: the robot carries each file an agent saves to its folder),
    editor (files clicked on the map as tabs: edit, save with the read mtime, disk changes reload or mark stale)
  views/scene/    three.js: sceneView, mapView, gitView, supabaseView, remiView, robotView (tour guide, builder and
                  companion, on guideRobot), welcomeRobotView (the welcome interview's robot and bubble), tourView (tour ghost places and ring), buildSiteView
                  (folders being built), inputController,
                  builders/ (block, glassFolder, folderIcon, fileIcon, plaza, folder, git, schema, supabase, integration, remi, remiModelLoader, robot)
  views/ui/       HTML: shell, chat (+ runCard: live agent runs, markdown: safe Markdown with answer cards and
                  file links, chatCards: folder / file cards), icons (DOM helper over views/icons.js), thinkingOrb
                  (libraries.dev orbs over the package engine), agentPicker
                  (+ effortSlider), chatMenu, agentConnect, devTree, hoverCard, hud,
                  repairPanel, remiJump, editor (floating file editor with tabs, CodeMirror with syntax colors; secrets open flagged), panels (breadcrumb, schema, git), controls, handControl (hand button + camera preview), labels
                  floating layout: iconBar (reorderable icons), draggable (the file editor by
                  header), chatDock (pinned chat column),
                  floatingMenu (⋯ menus: one layer above the app, anchored to its button, flips up, keyboard)
  views/icons.js  icon('name') / <i data-icon> from icons/hugeicons.js (generated, see Visual style)
  views/remiSprite.js  Remi's pixel art (card and jump)
  assets/remi/    optional 3D model for Remi (see its README for source and license)
  styles/         main.css (scene overlays, dark tokens), shell.css (glass IDE; floating layout at the end),
                  sidebar.css (motion), devtree.css, agents.css, chat.css (answer cards, chips, orbs, beam),
                  chat-glass.css (the chat's neutral liquid glass, `--lg-*` tokens), start.css (start screen in that glass),
                  controls.css (map controls and hand preview in that glass), dock.css (side dock and view switcher in that glass), labels.css (folder, file and project labels), hud.css (security card: one compact row fixed at the top left), panel.css (side panel: redefines the shell tokens with the chat's), editor.css (floating editor, same idea), titlebar.css (title bar, same idea)
  vendor/         generated by scripts/vendor-ui.js (committed): border-beam (+React), thinking-orbs engine,
                  codemirror.js (the editor; languages per models/fileLanguage.js, colors = `--syntax-*` tokens)
electron/
  main.js         window, IPC, confirmations, recent projects, MCP handlers (read/write with approval + backup, undo),
                  editor:open / editor:save (the person's own edits: secrets allowed, saving one asks; backup; mtime check)
  workspace.js    every disk operation, caged in the open folder
  git.js          read-only git history (execFile, no shell)
  servers.js      list of listening TCP servers (lsof on macOS, netstat + tasklist on Windows; execFile, absolute
                  paths, no shell); open http://localhost:<port> in the default, an installed (by id) or a picked
                  browser; stop a server (pid found from the port, native confirmation, re-checked, never Platanus
                  or system pids); pause / resume (SIGSTOP/SIGCONT, Windows NtSuspendProcess; all resumed on quit);
                  reactivate a server it stopped inside the app (asks first; login shell runs `exec "$@"` with the
                  words as arguments; no Terminal window; output kept in main; "starting" until the port listens;
                  a crash goes back to "Detenidos"; all stopped on quit; macOS only). The page never sends a pid,
                  a URL, a command or a program path.
  mcpServer.js    local MCP server (127.0.0.1, rejects browser Origin), tool list, secret blocklist
  agents.js       the user's CLIs (Claude Code, Grok, Codex) with minimal context and only Platanus' tools
  agentEvents.js  CLI output -> chat events (text, reasoning, tools, subagents, result); tested
  agentVoice.js   the chat agent's system prompt from agent/ (Vibe / Dev, adapts to how the person writes); tested
agent/            voice.json + skills/modo-vibe, skills/modo-dev (see agent/README.md)
.claude/skills/libraries-dev/  libraries.dev skill (effects: when and how to use them)
  strings.js      main-process texts
tests/renderer/   node:test unit tests for models and view models (renderer/package.json marks ESM for Node)
tests/secrets.test.mjs  fails if any tracked file contains a credential
docs/INTERFAZ.md  the interface: layout, chat and agents, repairs, where each piece lives, what is stored
spec/             feature specs (TEMPLATE.md, 001-running-servers.md)
docs/             one README per feature (docs/features/<name>/README.md, in Spanish) and an index (docs/README.md)
```

- **Models** expose an `Observable` `store` and methods. Example: `securityModel.scoreOf(path)` -> `{ level, reason | reasonKey, by: 'demo' | 'agent' | 'remi' }`.
- **ViewModels** subscribe to models, expose their own `store` and actions (`mapViewModel.enterFolder(path)`, `gitViewModel.focusLane(name)`, `repairViewModel.start(path)`). They talk to each other through the event bus (`core/eventBus.js`, names in `EVENTS`).
- **Views** subscribe to ViewModels and draw; user input only calls ViewModel actions. Clickable 3D objects carry `userData.pick = { type, ...ids }` and `MapViewModel.handlePick()` routes them.
- Change state only through `store.set(patch)`. Bump `version` when a view has to rebuild.
- **Tests first** for model/view-model behavior: add a case in `tests/renderer/` (fakes for services, `mock.timers` for delays), then change the code. `npm test` runs everything.

## Agents and repairs (security rules)

- Git from the chat (`models/gitIntent.js` parses what the person types; never the agent's output) only runs in the desktop app. `electron/git.js` validates every revision and branch name (a value starting with `-` would be a git option) and `main.js` asks before commit (shows the files; refuses if one is a secret per the MCP blocklist), revert, reset and switch. New branches are only logged. Tests: `electron/git.test.js`.
- The agent only acts through the local MCP tools. `platanus_write_file` always opens a confirmation dialog and backs up the previous version to `~/.platanus/backups/` (undo from the repair history). Secrets (`.env*`, keys, `.git/`, `.ssh/`, `.npmrc`…) are refused on the normalized and the real path.
- A tour run (session `tour`) gets the read-only MCP address (`/mcp/<token>/ro`: only get_project, list_risks, read_file); the window also stops it if it tries to write. Its answer only narrates the analyzer's facts (`tourSpec.parseTour` keeps known stop ids and real, non-secret paths).
- Grok runs with its terminal, edit and media tools removed (`--disallowed-tools`); Claude with `--tools ""`; Codex read-only, without the user's config and with its shell, browser, computer use, plugins and subagents disabled (`CODEX_DISABLED`). Do not loosen these flags.
- The window only gets the camera (video only, never the microphone) and clipboard writes, and only for the app's page (`allowPermission` in `electron/main.js`); every other permission is denied. Hand tracking runs locally (`docs/features/hand-gestures/`).
- Remi never edits files himself; a repair ends as `planned` (plan only), `fixed` (agent changed files, yellow until the person verifies), `verified` or `failed`.

## Visual style ("digital twin", dark)

- Graphite background and ground, subtle grid. Silver, matte volumes; light roofs; dark slabs with a lighter rim.
- **One accent: the team purple `#8b83ff`** (the only other green is a connected integration's lit way, `glowLines.ok` = `--ok`) (selection, HEAD, data pulses, primary buttons), the same in the 3D scene and the shell. Amber `#ffc24a` and red `#ff5a6a` are reserved for security problems.
- **Only problems glow**: safe stays calm (silver, no glow). Glowing = emissive above the bloom threshold (`materials.*Lit`, `glowPad`); small pieces use the `*Solid` variants so they do not blob.
- Colors and materials live in `views/scene/materials.js` (`PALETTE`) and `views/theme.js` (`LEVEL_STYLE`); UI tokens in `styles/main.css` (`:root`). Do not hardcode new colors elsewhere.
- UI: dark glass panels (blur, 1px border), small purple dot in panel titles (not on map labels), mono font for paths and numbers.
- **Icons: Hugeicons only** (free, stroke rounded). Pick one at hugeicons.com, add it to `renderer/icons/iconNames.js`, run `npm run icons` (regenerates `renderer/icons/hugeicons.js` with just those icons; the package itself is a dev dependency), then use `<i data-icon="name"></i>` in `index.html` or `icon('name')` in views (`views/icons.js`). No hand-drawn SVG icons.

## Map navigation

The map shows the whole project as a tree that, from the default camera (`CAMERA.azimuth` 0, elevation 44°; the git view keeps its own diagonal angle), unfolds down and to the right (laid out in tree terms, `u` across and `v` down, with `toWorld` / `screenOf` and `treeBlock` in `layout.js`). At the top, a darker band holds the integrations (only when the project has any; with none there is no band and the trunk starts at the project's root): Supabase (its builders work along +x and are turned up the screen by `INTEGRATIONS.rotation`; its road drops straight onto the trunk) and, in a row to its right, Vercel, GitHub, Clerk and PostHog (`integrationBuilder.js`). `ProjectModel` detects them from the files (`vercel.json`, `.github/`, package.json dependencies); `models/demoIntegrations.js` gives a demo project ("Platanus") all five, as if it were connected. Each one has a state (`integrationStatus`): connected (green dot), with an incident (amber) or disconnected (red); detected ones are connected. Each live one, Supabase included, lights its way to the folders over the roads (`integrationLines`: down to the integrations' road, along it, down the trunk), green (`glowLines.ok` in materials.js: unlit, so it glows the same from every angle) when connected and amber with an incident; a shared stretch is green if any integration on it is connected. No packets or other motion on these ways. A disconnected one stays dark: no lit line, no spin, light off. Below it, the project's name (the root has no platform: one trunk runs from the integrations' road down to the first row of folders), then rows (8 per row, then wrapping) with every top-level folder (frosted glass folders, `glassFolderBuilder.js`: a dark back with its tab, white sheets peeking out, more sheets for more files, and a frosted front panel that shows them blurred), linked by comb-shaped roads, and, right after the last folder in the same rows, the root files as file icons as tall as the folders (`rootFiles`, up to 48, then "+N"). In an open branch, files likewise follow the subfolders. Safe things stay silver and calm; problems glow amber or red and come first (folders worst first, files riskiest first). Every file has a small label under its icon with its name and extension. Map labels carry no colored dot (the icon's color and the risk line say the level). Folder labels are always short: the folder's own name and its risk line. A project just created and still empty (`MapViewModel.welcome`) has no name card (`plaza.empty`) but a robot on its plaza that interviews the person about their idea, recommends a stack in plain words and then coaches them while the project grows (`robotDialogViewModel.js` + `welcomeRobotView.js`; texts in `es.js` → `map.welcome`; see `docs/features/welcome-robot/`). Clicking a folder unfolds its direct subfolders and files (the same size as the top-level row, at every depth) in a block right below it (up to 48, then "+N"); the rows of top-level folders under it move down to make room (they slide there) and the block stays right of the rows' spine; clicking one of those subfolders unfolds one more level further down. One path at a time: opening another folder folds the rest, and clicking an open folder again closes it (with everything open inside it). Esc goes up one level; the breadcrumb jumps to any level. "Centrar vista" (map controls) flies back to the initial view (`MapViewModel.home()`: default angle, integrations down to the top-level rows), leaving folders open. A fixed file turns silver and stays. `MapViewModel.path` is the open folder at any depth (`''` = none); `branches` holds one block per level of the open path (`opened` is the last one), `links` the roads and `band` the integrations band. `BUILDING_STYLE` in `mapView.js` switches the folders between frosted glass folders (`glass`, the default), cubes as tall as their file count (`blocks`), isometric folders and buildings. The robot has more jobs on the map (one robot, in this order): the tour ("Recorrido", `docs/features/recorrido/README.md`) walks it stop by stop; building live (`buildViewModel.js`, `docs/features/robot/README.md`) has it carry each file an agent saves to its folder as a sheet; while the welcome robot's dialog is on, it steps aside (and the welcome robot steps aside during a tour or a build, so there is one robot at a time); otherwise it waits as a companion that the person drags or throws onto a folder (`robotViewModel.js`; `grabber` in `inputController.js`), which makes it ask in the chat what to do there. A folder the map does not show yet (just created by the agent) gets a temporary ghost place in a row under the tree (`ghostSlots` in `layout.js`), dashed and never glowing, gone when the tour or the work ends.

## Views

Two floating docks on the map: the top one switches between the map and git; the side dock (left edge, vertical) opens the side panels (explorer, risks, repairs, servers, agent), which appear right next to it. Both use `iconBarView.js` (drag to reorder within a group).

The stage tabs (`ShellViewModel.stage`: map, git) drive `AppViewModel`, which picks the 3D view: `git` shows the branches as lanes, `map` the security map. Each 3D view draws on its own layer (`sceneView.layers.map | git`, labels with `layer: 'git'`) and keeps its own camera. Clicks, hover and Esc are routed to the active view in `main.js`; G toggles Map/Git.

The git view reads the history: `electron/git.js` runs fixed `git` commands with `execFile` (no shell) and returns commits, branches, tags and HEAD. `GitViewModel` assigns each commit to a lane (first-parent chains in git flow priority; deleted branches recovered from merge subjects) and flags commits that added red files (`.env`, keys) as risky.

## Hooks for the AI agent

- Replace the scripted brain in `models/agentModel.js`; keep the reply shape `{ text | html, tone, chips, then }`.
- Set a file's traffic light: `securityModel.setScore(path, 'green' | 'yellow' | 'red', reason)`, or from anywhere:
  `window.dispatchEvent(new CustomEvent('file:score', { detail: { path, level, reason } }))`.

## Menus

The Project menu (new, open, recent, close) is built twice from the same actions: on macOS in the system menu bar (`nativeMenu()` in `electron/main.js`, rebuilt when a project opens or closes; items send `menu:action` to the window) and the in-app menu is hidden (`html.is-mac #menu`); on Windows/Linux and the web the in-app menu in the title bar is used and the native bar stays hidden. ⌘W closes the project, ⇧⌘W the window.

## Git flow

- `main`: production / demo-ready. Only receives merges from `release/*` and `hotfix/*`, tagged `vX.Y.Z`.
- `develop`: integration branch. Every feature starts here and comes back here.
- `feature/<short-name>` from `develop` (`git flow feature start chat-approvals`), merged back with `git flow feature finish`.
- `release/<version>` from `develop` to freeze and polish (the hour-26 feature freeze is a release branch).
- `hotfix/<version>` from `main` for urgent fixes during the demo; merged into `main` and `develop`.
- Never commit directly to `main`. Commit messages in English, imperative mood ("Add git view").

## Run

```bash
npm install
npm start      # npm run dev opens DevTools
npm run watch  # live reload: renderer/ changes reload the window, electron/ changes restart the app
```

Opening `renderer/index.html` in a browser serves a demo project (no disk access).

## Deploy

- Web demo: `npm run build:web` -> `dist/` (static, three.js vendored). Vercel uses `vercel.json`; it must be connected to the personal mirror repo, not the org repo.
- Desktop: `npm run dist:mac` / `npm run dist:win` -> `dist-electron/` (electron-builder config in `package.json`, unsigned).
- Pushing a `v*` tag runs `.github/workflows/release.yml`, which builds both installers and attaches them to the GitHub Release.
- `origin` has two push URLs (org repo + personal mirror); one `git push` updates both.
