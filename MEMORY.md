# MEMORY — estado vivo de Platanus

Léelo **antes** de trabajar y actualízalo **al terminar** cada tarea. El protocolo está en `.claude/skills/platanus-ade/SKILL.md`. Se escribe corto: lo que cambia rápido va aquí; lo estable va en `CLAUDE.md` y `docs/`.

Última actualización: 2026-10-24.

## Qué es
ADE de escritorio (Electron) para personas no técnicas: el proyecto se ve como un mapa 3D (radar de seguridad), con un chat agéntico en español sencillo. Los agentes (Claude, Codex, Grok, OpenCode, Simulador) actúan **solo** con las herramientas MCP de Platanus.

## Ramas
| Rama | Estado |
|---|---|
| `develop` | Tiene todo: chat natural, recorrido, robot, video, editor de archivos y la UI nueva. `feature/chat-natural`, `feature/recorrido` y `feature/robot-speech-bubbles` (Desire: robot de bienvenida con entrevista, agente en Windows) ya están fusionadas (2026-10-24). |

- Adirson trabaja directo en `develop` (sin ramas `feature/*`) y sube a su mirror: `git push personal develop`. `origin` (repo de la organización) le responde 403: alguien con permisos tiene que subir `develop` allí.

`vercel.json` está modificado por una reparación aprobada: **no se sube** hasta que el usuario decida.

## Funciones y dónde viven
- **Chat natural** (`renderer/viewmodels/chatViewModel.js`, `views/ui/runCardView.js`, `styles/chat-glass.css`): una tarjeta por ejecución, orbes por actividad, diffs en vivo, modos Vibe/Dev, «Mejorar mi mensaje» (`models/promptSpec.js`), permisos manual/auto/sin preguntar (`electron/approval.js`).
- **Recorrido** (`docs/features/recorrido/README.md`): el analizador decide los hechos y las paradas, el agente solo narra; usa la ruta MCP de solo lectura `/mcp/<token>/ro`.
- **Robot del mapa** (`docs/features/robot/README.md`):
  - se arrastra o se lanza a una carpeta; al llegar aparece la tarjeta `place` en el chat;
  - queda una barra fija con el lugar (`ChatViewModel.focus`), la pregunta lleva su etiqueta y la respuesta dice «Sobre …»;
  - el agente recibe `contextNote` con el lugar.
- **Preguntas para entender** (`models/questionIntent.js`, determinista):
  - si la persona pide una explicación, el agente corre con el MCP de solo lectura (`readOnly` → `/mcp/<token>/ro`) y recibe `explainNote`;
  - después no se ofrecen «Reparar» ni «Auditar»;
  - si intenta un cambio, el paso queda «skipped» («No cambié nada…: solo me pediste entender»), no como error. Probado en vivo con el Simulador el 2026-10-24;
  - en Vibe, los cambios hechos por otros programas no se publican en el chat (`isTech`).
- **Construyendo en vivo** (`viewmodels/buildViewModel.js`, `views/scene/buildSiteView.js`):
  - el robot lleva cada archivo que guarda el agente como una hoja a su carpeta;
  - las obras temporales se levantan del suelo y la carpeta gana una hoja por archivo nuevo;
  - al final saluda con «Obra terminada»;
  - prioridad del robot: recorrido > construcción > bienvenida > compañero;
  - escenario `obra` del Simulador.
- **Robot, precisión y opciones:**
  - al llevarlo queda bajo el cursor (`grip` y `liftShift` en `robotView.js`) y un anillo marca la carpeta destino (`overAt`), incluidas las de la rama abierta;
  - al llegar, su globo (compacto, opaco, con colita) tiene botones cortos (`robot.short`, `chatViewModel.placeActions`);
  - mientras el agente trabaja, el globo muestra una cápsula con el orbe a 20 px.
- **Logos reales de los agentes**: `renderer/icons/brands.js`, generado con `npm run icons` desde `@lobehub/icons-static-svg` (MIT). La clase es `svg.icon.agent-logo`, no `brand`, porque esa choca con la barra de título. En el encabezado del chat, el logo va en un marco de vidrio líquido con el color del agente (`--agent-tint`).
- **Video del producto**: `video/` (Remotion) y `scripts/demo/` (grabación por CDP + proyecto de ejemplo «Feria Online»).
- **Editor de archivos** (`docs/features/file-editor/README.md`): clic en un archivo del mapa → ventana flotante con pestañas, CodeMirror con colores de sintaxis, guardar con ⌘S (secretos: se abren marcados, guardarlos pide confirmación; respaldo y control de `mtime`).
- **UI nueva en toda la app** (el idioma del chat: vidrio, Inter/Roboto Mono, neutra, sin morado):
  - un CSS por pieza, todos sobre los tokens `--lg-*` de `chat-glass.css`: `start.css` (inicio), `controls.css`, `dock.css`, `labels.css`, `hud.css`, `panel.css`, `editor.css`, `titlebar.css`;
  - `panel.css`, `editor.css` y `titlebar.css` redefinen dentro los tokens del shell (`--ink`, `--panel`, `--accent`…) con los del chat;
  - fijos: chat abajo a la derecha, panel lateral, tarjeta de seguridad (compacta, arriba a la izquierda; reemplazó al semáforo) y selector Mapa/Git. Solo el editor se arrastra. Se quitó `floater.js`.

## Cómo comprobar
- `npm test` (418 pruebas al 2026-10-24, con develop fusionado) y `npx esbuild renderer/main.js --bundle --outfile=/dev/null '--external:*.css' '--external:*.task'`.
- **App real:** `npx electron . --remote-debugging-port=9223 --open=<proyecto>` y scripts CDP (`scripts/demo/cdp.mjs`).
- **Banderas:**
  - `PLATANUS_SIM=1`: agente «Simulador», escenarios en `scripts/sim/scenarios.js`;
  - `PLATANUS_SIM_DEFAULT=feria`: escenario por defecto del Simulador;
  - `PLATANUS_DEMO=1`: cursor visible y `window.__platanus` con los viewmodels.
- **Video:** `cd video && npm run take && npm run render`.

## Mapa (develop, 2026-10-24)
El equipo cambió el mapa: ya no es un radar, ahora es **un árbol de todo el proyecto**.
- **Contenido:** carpetas de vidrio en filas (`buildings`), la ruta abierta en `branches` y una banda de integraciones arriba.
- **Cámara:** `CAMERA.azimuth` es 0.
- **Lo que se adaptó:**
  - `ghostSlots(points, count)` pone una fila de fantasmas debajo del árbol;
  - `placesFor` usa `buildings` y `branches`;
  - las obras usan `buildGlassFolder`.

## Decisiones vigentes
- El LLM propone, el plano decide: hechos y validaciones deterministas; el modelo solo narra o sugiere.
- Nunca aflojar los permisos de los CLIs de agentes. Los secretos nunca se leen ni se muestran.
- Texto visible solo en `renderer/i18n/es.js` y `electron/strings.js`, en español sencillo.
- Pruebas primero. Git flow: rama `feature/*` y PR a `develop`. Commit o push solo cuando el usuario lo pida.
- Delegar tareas acotadas a Pi (gentle-shell) cuando convenga, no a opencode.

## Pendiente o ideas acordadas
- Guion único del video (`video/src/guion.js`) con sonidos (clics desde `cursor-path.json`), música, `@remotion/transitions` y el lanzamiento del robot. Propuesto, falta el «sí».
- Informe del otro agente (8 funciones de seguridad, competidores, demo de 3 min): sin actuar, hay que preguntar.
- Blender para una toma hero: después.
- Commit y PR de `feature/recorrido` cuando el usuario lo pida.

## Aprendizajes (actualiza aquí; lo técnico detallado va en la skill)
- Dos robots: `welcomeRobotView.js` (entrevista de Desire) y `robotView.js` (recorrido, obra, compañero). Uno a la vez: el de bienvenida se aparta en recorrido u obra; el otro, mientras el diálogo está abierto. En `agents:run` de `electron/main.js` el módulo de Electron es `electronSession` (la variable local `session` es el tipo de sesión).
- Las etiquetas del mapa se mueven en cada cuadro: sin `backdrop-filter` (sería lento); fondo oscuro translúcido con el borde del chat (`labels.css`).
- **Siempre dejar la app en modo normal** con el proyecto del usuario al terminar una prueba. Si queda en modo grabación (`PLATANUS_DEMO`), el cursor es falso y los clics se sienten desfasados (le pasó al usuario el 2026-10-24).
- En modo demo, `__platanus.screenOf({x,y,z})` da la posición en pantalla de un punto 3D: sirve para pruebas con el ratón real. Tras recargar, esperar a que la cámara termine de volar.
- El texto del Simulador es fijo: en el escenario `feria` dice «Lo marqué en amarillo» aunque el modo solo lectura lo rechace. Un agente real ve el rechazo; no es un fallo de la app.
- El usuario usa **la misma ventana** de la app: los scripts CDP pueden chocar con sus clics. Mejor `window.__platanus` en modo demo que simular el ratón.
- No editar el repo team-12 mientras el usuario lo tiene abierto en la app: cada guardado aparecía como «Se guardaron cambios» en su chat (ahora solo en Dev).
- El robot y la tarjeta `place`: la pregunta queda anclada arriba hasta que la persona mueve el scroll (`anchorId` en `chatView.js`).
- La UI nueva llega pronto. Los selectores de la grabación viven en `scripts/demo/timeline.mjs`: si cambian, se ajustan solo ahí.
