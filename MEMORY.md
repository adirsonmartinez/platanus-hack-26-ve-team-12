# MEMORY — estado vivo de Qubbot

Léelo **antes** de trabajar y actualízalo **al terminar** cada tarea. El protocolo está en `.claude/skills/platanus-ade/SKILL.md`. Se escribe corto: lo que cambia rápido va aquí; lo estable va en `CLAUDE.md` y `docs/`.

Última actualización: 2026-10-25.

## Qué es
ADE de escritorio (Electron) para personas no técnicas: el proyecto se ve como un mapa 3D (radar de seguridad), con un chat agéntico en español sencillo. Los agentes (Claude, Codex, Grok, OpenCode, Simulador) actúan **solo** con las herramientas MCP de Qubbot.

## Entrega (Platanus Hack, 2026-10-25)
- Repo de jurado: `platanus-hack/platanus-hack-26-ve-team-12` (`main`), mismo historial que este. Formulario lleno en `platanus-hack-project.jsonc`, texto de votación en `project-description.md`, track 3D en el README.
- `deploy-url` = landing en Render (https://qubbot-tka9.onrender.com); sus botones bajan el release `v0.2.0` (.dmg y .exe que arma `release.yml` al subir la etiqueta).
- Landing estática en `landing/`, publicada en Render con `render.yaml` (Render no corre Electron; solo la página).

## Ramas
| Rama | Estado |
|---|---|
| `develop` | `feature/llamada-remi` de Rafa (llamada con Qubi, auditoría de seguridad por contenido, `platanus_run_command` / `platanus_delete_file`, servicios del proyecto, renombre a Qubbot / Qubi) fusionada el 2026-10-25. `feature/hand-gestures` de Genesis (zagenesis19: zoom con dos manos, cursor de mano, seleccionar quedándose quieto; `data-gesture="never"` en acciones sin confirmación) fusionada el 2026-10-24. Tiene todo: chat natural, recorrido, robot, video, editor de archivos y la UI nueva. `feature/chat-natural`, `feature/recorrido` y `feature/robot-speech-bubbles` (Desire) ya están fusionadas (2026-10-24). `feature/robot-user-level` (Desire) volvió a aparecer en `personal` tras borrarla; el usuario ya implementó su propio método. |

- Adirson trabaja directo en `develop` (sin ramas `feature/*`) y sube a su mirror: `git push personal develop`. `origin` (repo de la organización) le responde 403: alguien con permisos tiene que subir `develop` allí.

`vercel.json` está modificado por una reparación aprobada: **no se sube** hasta que el usuario decida.

## Funciones y dónde viven
- **Bienvenida con tecnologías (proyecto A, 2026-10-24)** (`docs/features/welcome-robot/README.md`, diseño en `docs/superpowers/specs/2026-10-24-welcome-stack-picker-design.md`):
  - primero la experiencia: «Ya programo» → despedida, el robot se va, chat abierto y modo Dev; «Estoy empezando» → tarjetas con logo (Next.js base, Vercel, Supabase) de `models/stackCatalog.js`;
  - «¡Empecemos!» registra lo que queda por conectar (`models/setupModel.js`, por ruta) y pide al agente el proyecto base sin claves;
  - estado de integración nuevo `pending` («por conectar»): punteado, translúcido, sin línea; clic → mensaje en el chat (`EVENTS.integrationPicked`);
  - logos de Simple Icons (CC0, `STACK_LOGOS`, `npm run icons`).
- **Conectar mi cuenta: Supabase (proyecto B, 2026-10-24)** (`docs/features/connect-accounts/README.md`): lo hace Platanus, no el agente. `electron/supabaseConnect.js` es cliente OAuth del MCP de Supabase (SDK `@modelcontextprotocol/sdk`, PKCE, registro dinámico, retorno en `127.0.0.1:45789`); modal `connectViewModel` + `connectModalView`; claves a `.env.local` desde main. **Funciona de punta a punta con la cuenta real de Adirson (2026-10-24):** inicio de sesión, organizaciones, `get_cost` → `confirm_cost` → `create_project(confirm_cost_id)`, claves en `.env.local`. Vercel: su MCP solo acepta clientes aprobados → irá por su CLI.
- **Panel de Supabase** (`databaseViewModel.js`, `renderSupabase` en `shellView.js`, `database.css`): clic en el nodo → panel lateral con estado, tablas, filas, tamaño vs plan y tablas más grandes; consultas fijas de solo lectura en main (`STATS_SQL`, IPC `supabase:stats`). El proyecto enlazado se guarda en `setupModel.link` al conectar; si no hay, main lo saca de la URL de `.env.local`/`.env` (`supabase:linked`, solo el ref). Probado con la cuenta real (2026-10-24).
- **Esquema 3D de Supabase en el estilo nuevo:** tarjetas oscuras sin brillo (`CARD` en `schemaBuilder.js`, Inter/Roboto Mono, chips neutros, cuerpo `M.slab`, líneas `M.road`); solo RLS desactivado queda rojo. La tarjeta «esquema public» en vidrio (`database.css`). Siguen siendo las tablas de ejemplo, no las reales.
- **Precisión de los gestos (2026-10-24):** filtro One Euro (`models/oneEuroFilter.js`, `HAND_FILTER`) en cursor, pellizco y dos manos; pellizco medido en 3D (`landmarks.world`, `pinchGap`); confianza del detector 0,6. Sin probar con la cámara real.
- **Girar con pulgar + medio (2026-10-24):** `pinchFinger` (índice/medio con margen 0,7 y histéresis) y `SlideTurnTracker`; las dos manos quedaron solo para zoom. Fixtures con los otros dedos extendidos (`middlePinch`).
- **Clic con pellizco rápido y cursor blanco (2026-10-24):** pellizco índice < 300 ms sin arrastrar = clic (`TAP_MS`, `#tap` en `handControlViewModel`); `DwellTimer.markFired` evita el doble clic.
- **Carpetas de confianza (como VS Code)** (`electron/trust.js`, `models/trustModel.js`): al crear o abrir un proyecto, diálogo nativo «¿Confías…?»; confiada = el agente guarda sin preguntar (`trustedNow` en `platanus_write_file`, `approvedBy: 'trusted'`), secretos bloqueados y respaldo igual. «Sí» se recuerda (`userData/trusted-folders.json`), «No» vuelve a preguntar. Menú ⋯ del chat: confiar / dejar de confiar. **Sin probar en la app real todavía.**
- **Espera de la obra inicial:** tras «¡Empecemos!» con agente, el globo muestra «Preparando tu proyecto…» con barra (`building` en `robotDialogViewModel`); `actions.askAgent` devuelve si el agente lo recibió.
- **Sin tarjeta del proyecto en el mapa** (2026-10-24): se quitó la etiqueta con el nombre y «N archivos vigilados»; el nombre ya está en la barra de título y los riesgos en la tarjeta de seguridad.
- **La cámara sigue al robot en la obra** (`buildViewModel.js`, `FOLLOW_ZOOM`): se aleja, vuela a cada carpeta, deja de seguir si la persona mueve la cámara (`camera.manual`) y al final vuelve a `mapViewModel.home()`.
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
- **Navegador y ventanas (2026-10-25):** páginas, imágenes y `localhost` en una ventana «Navegador» propia (`electron/preview.js`, iframe con sandbox; «Ver tu proyecto» ya no abre Chrome). Con el editor abierto se reparten mitad y mitad; Qubi las mueve con `acomodar_ventanas` y `abrir_archivo` muestra el juego (`vista: codigo` para el código). Probado en la app: página hostil bloqueada, zonas bien. Sin probar con voz real. Próximo: demo del snake solo con voz.
- **Editor de archivos** (`docs/features/file-editor/README.md`): clic en un archivo del mapa → ventana flotante con pestañas, CodeMirror con colores de sintaxis, guardar con ⌘S (secretos: se abren marcados, guardarlos pide confirmación; respaldo y control de `mtime`).
- **UI nueva en toda la app** (el idioma del chat: vidrio, Inter/Roboto Mono, neutra, sin morado):
  - un CSS por pieza, todos sobre los tokens `--lg-*` de `chat-glass.css`: `start.css` (inicio), `welcome.css` (globo del robot de bienvenida; salió de `main.css`), `controls.css`, `dock.css`, `labels.css`, `hud.css`, `panel.css`, `editor.css`, `titlebar.css`;
  - `panel.css`, `editor.css` y `titlebar.css` redefinen dentro los tokens del shell (`--ink`, `--panel`, `--accent`…) con los del chat;
  - fijos: chat abajo a la derecha, panel lateral, tarjeta de seguridad (compacta, arriba a la izquierda; reemplazó al semáforo) y selector Mapa/Git. Solo el editor se arrastra. Se quitó `floater.js`.

## Cómo comprobar
- `npm test` (898 pruebas al 2026-10-25) y `npx esbuild renderer/main.js --bundle --outfile=/dev/null '--external:*.css' '--external:*.task'`.
- **App real:** `npx electron . --remote-debugging-port=9223 --open=<proyecto>` y scripts CDP (`scripts/demo/cdp.mjs`).
- **Banderas:**
  - `PLATANUS_SIM=1`: agente «Simulador», escenarios en `scripts/sim/scenarios.js`;
  - `PLATANUS_SIM_DEFAULT=feria`: escenario por defecto del Simulador;
  - `PLATANUS_DEMO=1`: cursor visible y `window.__platanus` con los viewmodels.
- **Video:** `cd video && npm run take && npm run render`.
- **DMG para compartir:** `npm run dist:mac` → `dist-electron/Platanus-0.1.0-mac-universal.dmg` (universal, ~234 MB, sin firmar: quien lo abra usa clic derecho → Abrir o `xattr -cr /Applications/Platanus.app`). Último build: 2026-10-25, con los gestos sin commitear.

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
- **En stash (2026-10-25, sin terminar):** «te llamo cuando termine» (Qubi cuelga mientras el agente construye y la app vuelve a llamar con `callback`) y voz callada durante la obra (sin `#tell` por paso ni `#refreshContext` mientras trabaja). `git stash list` → «WIP callback». Prueba real: snake con three.js por voz = 6 min, 3.560 créditos (~593/min). Se descartó para mandar la demo.
- **Fusión con `personal/develop` (2026-10-25):** el equipo había subido el arreglo de instalación de Electron (PR #4) y su propia fusión de `feature/llamada-remi`; se resolvió quedándose con lo nuestro salvo la regla de demo (en escritorio nunca es demo).
- **Pulido para la demo (2026-10-25, sin commit):** el fork de hardware se dejó; se pule Qubbot y se despliega a prod. Adirson sube a `personal` y Rafa lo pasa al repo de la organización. Hecho: el panel de la llamada ya no muestra el texto (solo el chat), y Qubi habla más corto (`# Brevedad` en el prompt, saludos de ≤ 90 caracteres; pruebas en `voiceCall.test.js`). Bienvenida por voz rápida para la demo de 3 min: saludo ≤ 100, con «estoy empezando» arranca la obra de una sin preguntar por las tecnologías, callado durante la obra; textos de la burbuja más cortos. Sin timbre ni «¡Aló!»: `RING_MS` = 0, se borró `ringTone.js`, el panel dice «Conectando…» y Qubi habla de una. Carga hasta que Qubi habla (`ready`, sin botones mientras) y arranque de ~7 s a ~1,2–2,5 s: SDK precargado (`voiceCall.warm`, `warmSession`) y voz rechazada recordada 1 h. **La cuenta de ElevenLabs ahora es Starter (30k créditos/mes, ~71 min de Realtime Mini). La voz Juan se agrega pero ElevenLabs no la deja en agentes (`voice_live_moderated_not_allowed`, moderación en vivo): la app la recuerda para siempre (`voices.moderated` en `voice-agent.json`) y Qubi usa la voz de respaldo.** `ejecutar_app` instala dependencias antes de arrancar si falta `node_modules` (`projectRun.installFor`, avisado en el mismo diálogo). El agente de ElevenLabs se actualiza solo en la próxima llamada (`configHash`). Sin probar con voz real.
- **Bienvenida por voz (2026-10-25, sin commit, sin probar con voz real):** Qubi llama solo al crear un proyecto y hace la entrevista hablando; botones siguen; tocar uno cuelga; link del proyecto al final (`docs/features/welcome-robot/` → «Bienvenida por voz»). Probar con `npm start` + VPN + `ELEVENLABS_API_KEY` en `.env.local` (cuenta gratis: puede fallar la voz de biblioteca). El agente de ElevenLabs se actualiza solo (cambió `configHash`).
- **Arreglado tras la fusión:** el clic en una integración «por conectar» volvía a ir al modal de servicios de Rafa; ahora va a nuestro flujo (`onIntegration` en `main.js`).
- **Conectar mi cuenta, lo que falta:** Vercel por su CLI (`vercel login/link/env add/deploy` desde main); tablas reales de Supabase en el mapa (`list_tables`); que la regla de seguridad entienda `.gitignore` (hoy `.env.local` queda verde solo en la sesión en que se conectó).
- A futuro, más tarjetas en el catálogo (React Native/Expo, Clerk, AWS) con sus reglas.
- **Llamada con Qubi**:
  - Fase 1 hecha: barra de llamada, voz a voz Realtime, Qubi delega en el agente del chat y se ve construir.
  - Fase 2 hecha (`docs/features/llamada/FASE2.md` → «Cómo quedó»):
    - `repartir` da 1 a 3 tareas a trabajadores (`worker-1..3`), y cada uno solo puede escribir en su carpeta (ruta MCP `/w/<id>`);
    - en el mapa salen mini robots (`teamView.js`);
    - Qubi audita, y deciden los verificadores fijos;
    - el chat muestra una tarjeta del equipo;
    - todas las corridas de Grok van en fila (una dirección MCP global).
  - Fase 3 hecha: memoria del proyecto (`electron/projectMemory.js`, `models/projectMemoryModel.js`). Se guarda al colgar y entra en la voz y en los prompts de los trabajadores.
  - Mejoras de la primera prueba (`MEJORAS.md` y `VOZ.md` → «Cómo quedó»):
    - el panel flota sobre la cabeza de Qubi (`robotView.head()`);
    - (ya sin timbre) saluda cada vez distinto (`voice.greetings` por estilo, sin repetir el anterior), en tono pana venezolano y con la voz Juan;
    - pide permiso para abrir, ejecutar o abrir en el navegador; se le dirige con `ir_a` y `volver`, y camina también al mostrar una carpeta, revisar o abrir un archivo;
    - es expresivo: gestos y caras (`models/gestures.js`, `views/scene/robotGestures.js`), automáticos en la llamada y con la herramienta `gesto`; sigue el cursor con la mirada, reacciona a un toque y gira con el mapa (MEJORAS.md §3);
    - sin servicio de voz, se abre el modal «Qubi está fuera de conexión» (iniciar sesión en ElevenLabs, pegar la clave de ElevenLabs o de xAI, o probar sin voz). **Ya no se simula sola**, tampoco con el Simulador.
  - El agente de ElevenLabs guardado se actualiza solo en la próxima llamada real (`configHash`). Si `.env.local` tiene `PLATANUS_VOICE_ID`, esa voz gana sobre la venezolana.
  - **Nada de esto se ha visto en la app real.** Hay que probarlo con el Simulador, después con Claude y Grok. El instalador de ElevenLabs pide el «sí» del usuario antes de abrir la app o hablar.
- **Revalidación de datos reales** (`docs/REVALIDACION.md`, 2026-10-25): auditoría completa y precisa, ejecutor de comandos endurecido tras revisión adversaria, nada inventado en escritorio (Supabase, chat sin agente, demos), estados de servicios honestos, contexto vivo en la llamada.
- **Comandos del agente** (`docs/features/comandos/README.md`): herramientas MCP `platanus_run_command` (lista permitida, sin shell, sin -g, permiso según el modo, salida con claves tapadas) y `platanus_delete_file` (copia y deshacer). Los agentes siguen sin terminal.
- **Auditoría de seguridad** (`docs/features/seguridad/README.md`): el semáforo y el % los decide una auditoría por contenido (`electron/securityAudit.js`), no el nombre. Historial del % y aceptaciones en `userData/security/`. Reparaciones verificadas por la auditoría; Qubi tiene `auditar` y `reparar`. Probado en la app con feria-test (75 → 90 → 75 y persistencia).
- **Servicios del proyecto** (`docs/features/servicios/README.md`): main detecta 17 servicios y si el agente puede usarlos (MCP o sesión de CLI). La ventana pone una tarjeta en el chat y un globo del robot con «Conectar», y abre el modal con los comandos de la CLI y del MCP. Sin probar en la app real.
- Nombre del producto: Qubbot; el bot se llama Qubi (los ids técnicos `platanus_*` se mantienen).
- **Fusión de la rama de Rafa (2026-10-25):** «por conectar» convive con su detección de servicios (`projectModel`: lo pendiente pisa el estado de main); `demo` del proyecto solo en la web (en escritorio una carpeta llamada «Platanus» o «Qubbot» es real); un servicio `unknown` se dibuja desenchufado. Las herramientas nuevas (`run_command`, `delete_file`) siguen preguntando según el modo aunque la carpeta sea de confianza (solo `write_file` se salta el permiso).
- Guion único del video (`video/src/guion.js`) con sonidos (clics desde `cursor-path.json`), música, `@remotion/transitions` y el lanzamiento del robot. Propuesto, falta el «sí».
- Informe del otro agente (8 funciones de seguridad, competidores, demo de 3 min): sin actuar, hay que preguntar.
- Blender para una toma hero: después.
- Commit y PR de `feature/recorrido` cuando el usuario lo pida.

## Aprendizajes (actualiza aquí; lo técnico detallado va en la skill)
- **electron-builder descarta las carpetas `examples` de node_modules**: sin `node_modules/three/examples/jsm` (bloom, GLTFLoader) la app empaquetada se queda sin textos. Por eso `build.files` la copia con `{from, to}` (un patrón simple no basta). Verificar un instalador: `npx electron-builder --mac dir --arm64` y `npx @electron/asar list`.
- **ElevenLabs**:
  - La clave está en `.env.local` (puesta por `npx @elevenlabs/cli onboard`, termina en 171e).
  - Main la lee con `util.parseEnv` en un objeto privado, nunca en `process.env`, para que los agentes no la hereden.
  - `onboard check` se queja igual; es una falsa alarma.
  - El usuario quiere **voz a voz** como Grok: agente con `realtime_model`, con caída automática al modo clásico.
- Dos robots: `welcomeRobotView.js` (entrevista de Desire) y `robotView.js` (recorrido, obra, compañero). Uno a la vez: el de bienvenida se aparta en recorrido u obra; el otro, mientras el diálogo está abierto. En `agents:run` de `electron/main.js` el módulo de Electron es `electronSession` (la variable local `session` es el tipo de sesión).
- `ProjectModel` ahora guarda `root`, la ruta completa. Main solo acepta la memoria de esa ruta, la del proyecto abierto o de uno reciente; con el nombre de la carpeta, la memoria salía siempre vacía.
- Las etiquetas del mapa se mueven en cada cuadro: sin `backdrop-filter` (sería lento); fondo oscuro translúcido con el borde del chat (`labels.css`).
- **Siempre dejar la app en modo normal** con el proyecto del usuario al terminar una prueba. Si queda en modo grabación (`PLATANUS_DEMO`), el cursor es falso y los clics se sienten desfasados (le pasó al usuario el 2026-10-24).
- En modo demo, `__platanus.screenOf({x,y,z})` da la posición en pantalla de un punto 3D: sirve para pruebas con el ratón real. Tras recargar, esperar a que la cámara termine de volar.
- El texto del Simulador es fijo: en el escenario `feria` dice «Lo marqué en amarillo» aunque el modo solo lectura lo rechace. Un agente real ve el rechazo; no es un fallo de la app.
- El usuario usa **la misma ventana** de la app: los scripts CDP pueden chocar con sus clics. Mejor `window.__platanus` en modo demo que simular el ratón.
- No editar el repo team-12 mientras el usuario lo tiene abierto en la app: cada guardado aparecía como «Se guardaron cambios» en su chat (ahora solo en Dev).
- El robot y la tarjeta `place`: la pregunta queda anclada arriba hasta que la persona mueve el scroll (`anchorId` en `chatView.js`).
- Sin Chrome en esta Mac: para ver un CSS sin tocar la app abierta del usuario, una página de prueba + `npx electron capture.cjs` (`BrowserWindow` oculto y `capturePage`).
- Para ver la bienvenida sin tocar la app abierta: `renderer/index.html?demo=1` en un `BrowserWindow` oculto con `backgroundThrottling: false` (sin eso no corren los cuadros y el globo no aparece) y `__platanus.mapViewModel.createProject()` (no `projectModel.create()`: solo el primero activa `welcome`). `__platanus.projectModel` sirve para simular integraciones.
- En el globo del robot, toda regla sobre un `span` necesita el prefijo `#map-labels .map-label.robot-speech`: si no, `labels.css` le gana (le pasó al ✓ de las tarjetas).
- Para simular una obra en la demo web: un mensaje con `run: { status: 'running', steps: [{ name: 'write_file', target, status }] }` en `chatViewModel.store`; sin `diff` (un `diff` a medias rompe la tarjeta del chat: le faltan `hunks`).
- `es.js` ya tiene una clave `connect` (el panel de agentes): una clave repetida en el objeto pisa a la otra sin error. Los textos de «Conectar mi cuenta» están en `accounts`.
- El MCP de Supabase envuelve sus respuestas: `{ organizations: [...] }`, `{ projects: [...] }`, `{ url }`; los errores llegan como `{"error":{"message"}}`. Para crear un proyecto exige `get_cost` + `confirm_cost`.
- `execute_sql` del MCP de Supabase devuelve `{ result: "…<untrusted-data-ID>[filas]</untrusted-data-ID>…" }` y el aviso de antes también nombra la etiqueta: tomar la última apertura antes del cierre. `get_organization` trae `plan` (`free`, `pro`…).
- Antes de crear un archivo con `cat >`, mirar si existe (se pisó `tests/renderer/format.test.mjs`; se recuperó con `git show HEAD:`).
- Un filtro con tiempo real se congela si los cuadros llegan casi a la vez (las pruebas mandan cuadros seguidos sin `now`): `oneEuroFilter` trata separaciones < 4 ms como cuadros de cámara.
- La UI nueva llega pronto. Los selectores de la grabación viven en `scripts/demo/timeline.mjs`: si cambian, se ajustan solo ahí.
