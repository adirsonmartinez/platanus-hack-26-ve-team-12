# Robot guía de proyectos nuevos

Cuando alguien crea un proyecto nuevo y vacío, un robot aparece en la plaza del mapa y lo acompaña. Primero pregunta cuánta experiencia tiene la persona (lo pidió el mentor). A quien está empezando le muestra con qué tecnologías arrancar, le pasa el pedido al agente y después sigue dando consejos mientras el proyecto crece. Está pensado para personas que no saben programar: que se sientan cómodas y capaces.

## Cómo se usa

### 1. Entrevista (2 pasos)

1. **¿Cuánta experiencia tienes programando?**
   - **💻 Ya programo:** el robot se despide («Te dejo el chat…»), desaparece del mapa, se abre el chat y la app pasa al modo Dev. No vuelve en ese proyecto.
   - **🌱 Estoy empezando:** sigue al paso 2.
   - **Saltar:** pasa directo al modo guía.
2. **¿Con qué quieres empezar tu proyecto?** Una tarjeta por tecnología, con su logo, su nombre y una frase simple. Todas vienen elegidas:
   - **Next.js** («Tu app: las pantallas que ve la gente»): la base, siempre incluida (etiqueta «Base»).
   - **Vercel** («La publica en internet con su propia dirección»).
   - **Supabase** («Guarda tus datos: usuarios, productos, pedidos»).

   Tocar una tarjeta la quita o la vuelve a poner. Botones:
   - **✨ ¡Empecemos!** El agente arma el proyecto base (Next.js con README, `.gitignore` y, según lo elegido, el cliente de Supabase con `.env.example` vacío o `vercel.json`), sin claves reales. Al final explica sin jerga qué hizo y qué falta conectar.
   - **Lo exploro yo.** El globo se minimiza.

**Mientras el agente arranca:** después de «¡Empecemos!», hasta que aparece el primer archivo, el globo dice «Preparando tu proyecto…» con una barra que se mueve y un solo botón, «Ver lo que hace» (abre el chat). Si todavía no hay agente conectado, el pedido espera y el globo muestra el aviso de siempre, con «Cambiar mi elección».

**Deshacer:** **Atrás** (o el chip «Estoy empezando») vuelve a la pregunta de experiencia. Después de «¡Empecemos!», mientras todavía no hay archivos, **↩️ Cambiar mi elección** vuelve a las tarjetas.

**El catálogo** vive en `renderer/models/stackCatalog.js`: cada tecnología tiene su logo, la integración del mapa que prepara y sus reglas (`base`: no se quita; `requires`: Vercel necesita Next.js; `excludes`: para el futuro, por ejemplo React Native en lugar de Next.js). Sumar React Native, Clerk o AWS es agregar una fila, sus textos en `es.js` (`map.welcome.catalog`) y su logo (`STACK_LOGOS` en `renderer/icons/iconNames.js`, de Simple Icons, CC0; luego `npm run icons`).

### «Por conectar» en el mapa

Las integraciones que eligió la persona (Vercel, Supabase) aparecen en la banda de integraciones cuando sus archivos ya están en el proyecto (`vercel.json`, `@supabase/` en `package.json`), con un estado nuevo y neutro, **«por conectar»**: emblema translúcido y quieto, luz apagada, contorno punteado alrededor de la plataforma, punto hueco en la etiqueta y ninguna línea encendida. Nunca brilla; el ámbar y el rojo siguen reservados para los riesgos. Mientras Supabase está por conectar, se dibuja en la fila como las demás, sin tablas de ejemplo ni la vulnerabilidad de demostración.

Lo que preparó la bienvenida se recuerda por carpeta (la ruta completa) en este computador (`renderer/models/setupModel.js`, `localStorage`). Los proyectos que no pasaron por la bienvenida no cambian.

Un clic en una integración por conectar abre el chat con un mensaje: ya está lista y solo falta conectar la cuenta. En Supabase, el clic abre **«Conectar mi cuenta»** (`docs/features/connect-accounts/README.md`): Platanus inicia sesión, crea o elige el proyecto y guarda las claves; al terminar llama a `setupModel.markConnected`. Vercel sigue con el mensaje en el chat hasta tener su conexión.

### 2. Modo guía

El robot se queda y reacciona al proyecto real. En orden de prioridad:

1. **Un archivo en rojo o amarillo** (por ejemplo un `.env`): el globo se abre aunque esté minimizado, en ámbar o rojo, y ofrece **Arréglalo con Qubi** o **Muéstramelo**. Si el riesgo se arregla, el aviso desaparece.
2. **Tu proyecto ya existe 🎉** con el primer archivo.
3. **Protejamos tus contraseñas**: falta `.gitignore` (el agente lo crea en un clic).
4. **Preséntale tu proyecto al mundo**: falta README.
5. **Guarda una foto de tu avance 📸**: hace un commit llamado "Primera versión".
6. **¡Lo estás haciendo increíble!** Se despide.

### El robot

- Un robot flotante y redondeado, sin aristas: cabeza grande de perla con una cara de vidrio oscuro donde se encienden dos ojos de cápsula y una sonrisa, orejas con anillos de luz, antena curva con un orbe, cuerpo de huevo con un corazón de luz, manos flotantes y un propulsor con un anillo de luz en el suelo.
- Tiene expresiones: sonríe y saluda; ante un riesgo pone cara de preocupación (ojos inclinados y boca de "¡oh!"); mueve la boca y mira su globo mientras "habla"; parpadea; el corazón late y el anillo respira con el vaivén.
- Está abajo a la izquierda de la etiqueta del proyecto, lejos del árbol de carpetas (que crece hacia abajo a la derecha). Escala `SCALE = 1.6` en `welcomeRobotView.js`.

### El globo

- Un solo globo a la derecha del robot, con la colita en su cabeza. Si no cabe, se desliza en vertical para quedar siempre entero en pantalla, sin tapar al robot. Cada mensaje nuevo entra con un salto: unos puntitos de "pensando", el texto se escribe solo (un clic lo muestra completo) y los botones entran uno por uno.
- Tiene el mismo vidrio neutro del chat: barras de pasos blancas, botones como los chips del chat y la opción principal como la pastilla blanca. El verde marca los logros; solo un riesgo pinta el borde con un brillo que gira, en ámbar o rojo.
- El robot salta con cada mensaje, mueve la cabeza diciendo "no" ante un riesgo y su antena parpadea mientras "habla".
- **Minimizar** lo deja como una pastilla "Guía" que late cuando llega un consejo nuevo. **×** cierra la guía.
- Con "reducir movimiento" activado en el sistema, todo aparece sin animaciones.

## Bienvenida por voz (Qubi)

Apenas se crea el proyecto, si hay un servicio de voz conectado (ElevenLabs o Grok, ver `docs/features/llamada/VOZ.md`), Qubi llama solo y hace la misma entrevista hablando. La burbuja sigue igual, con sus botones, para quien no puede o no quiere hablar o escuchar.

1. **Saludo (corto, la demo dura 3 minutos):** «¡Epa, pana! Soy Qubi. Te escucho, o usa los botones. ¿Ya programas o estás empezando?» (`electron/strings.js` → `voice.welcome.greetings`, uno por estilo).
2. **Entrevista por voz:** Qubi responde por la persona con las mismas acciones de los botones (`press(id, { by: 'voice' })`). Herramientas nuevas de la llamada: `elegir_experiencia` (empezando / programo), `marcar_tecnologia` (nextjs, vercel, supabase; si / no) y `empezar_proyecto` (necesita que la persona lo haya dicho, como `construir`). Cada una responde el paso de la burbuja (`voiceState()`): manda lo que haya en pantalla. **Rápido:** con «estoy empezando», Qubi no pregunta por las tecnologías: llama a `elegir_experiencia` y a `empezar_proyecto` en el mismo turno (vale como confirmación porque la persona acaba de hablar) y dice «¡Dale! Arranco con Next.js, Vercel y Supabase». Si en esa respuesta pidió quitar una, primero `marcar_tecnologia`. Mientras se construye se queda callado salvo que le pregunten.
3. **Manual:** si la persona toca una respuesta de la burbuja, o le dice a Qubi que prefiere los botones (`seguir_manual`), la llamada cuelga y todo sigue como siempre. Plegar o desplegar la burbuja no cuenta.
4. **Construcción:** el pedido del proyecto base pasa por la llamada (`callViewModel.buildForWelcome`), así Qubi cuenta el avance con los avisos de siempre.
5. **Listo:** Qubi arranca el proyecto con `ejecutar_app` (pide permiso; como el proyecto es nuevo, primero se instalan sus dependencias con `npm install`). Con el puerto, el panel de la llamada muestra «Ver tu proyecto · localhost:3000» y el chat un botón «Abrir en el navegador»; en la bienvenida el navegador no se abre solo.
6. **Sin voz:** sin clave, sin red o sin créditos no aparece ningún error ni tarjeta: queda la bienvenida con botones.

Mientras dura la entrevista se queda el robot de bienvenida (sus botones) aunque haya llamada; el robot de la llamada aparece cuando empieza la obra. El panel de la llamada se pone encima de la burbuja, nunca sobre sus botones.

Archivos: `renderer/viewmodels/callViewModel.js` (herramientas de bienvenida, `welcomeCall`, `manual()`, `link`), `robotDialogViewModel.js` (`voiceState`, `press(id, { by })`, `actions.welcomeTouched`), `electron/voiceCall.js` (`welcome` en `start`, variable `{{welcome_mode}}`), `renderer/main.js` (arranque automático, `askAgent`, link), `callBarView.js` (botón del link). Pruebas: `tests/renderer/callWelcome.test.mjs`, `robotDialogViewModel.test.mjs`, `electron/voiceCall.test.js`.

## Cambios de apoyo (fuera del robot)

### El agente en Windows y detrás de un proxy o VPN

- **Detección en Windows:** `electron/agents.js` buscaba los CLI con `/bin/sh`, que no existe en Windows, así que nunca encontraba a Claude, Codex, Grok ni OpenCode. Ahora recorre el `PATH` sin shell y lanza cada CLI por su ruta absoluta. En Windows solo cuenta un `.exe` (el instalador oficial): un `claude.cmd` instalado con npm no se detecta, porque Node no puede lanzarlo sin shell.
- **Proxy del sistema:** los CLI solo leen `HTTPS_PROXY`/`HTTP_PROXY`, no el proxy que configuran apps como Psiphon, y fallaban con `API Error: Connection refused (ECONNREFUSED)`. En cada ejecución, `electron/main.js` le pregunta a Electron el proxy del sistema (`session.resolveProxy`) y se lo pasa al CLI, nunca para el servidor MCP local (`NO_PROXY`). Un proxy ya definido en el entorno tiene prioridad. Se consulta cada vez porque Psiphon cambia de puerto al reiniciarse.
- **Voz del agente:** `electron/agentVoice.js` no quitaba el encabezado YAML de las skills con saltos de línea de Windows (CRLF).

### Git en proyectos nuevos y desde el chat

- **Cada proyecto nuevo nace con su propio repositorio git en `main`** (`gitInit` en `electron/git.js`), aunque la carpeta esté dentro de otro repositorio. Sin git instalado, el proyecto se abre igual.
- **Comandos de git con un agente conectado:** antes, con un agente elegido, todo el mensaje iba al agente, que no tiene herramientas de git. Ahora un comando **corto y explícito** se ejecuta en la app (`isGitCommand` en `renderer/models/agentModel.js`): como mucho 14 palabras, y que nombre git ("commit", "rama", "revert", "reset", "checkout") o pida guardar avances. Ejemplos: "haz un commit que se llame primera versión", "deshaz el último commit". Pedidos como "deshaz el último cambio del CSS" o mensajes largos siguen yendo al agente. Git sigue pidiendo confirmación antes de escribir.

### Pedidos del robot sin agente conectado

Si el robot le pasa un pedido al agente y no hay ningún agente conectado, se abre el panel de agentes, el chat explica que hay que elegir uno, y el pedido se envía solo cuando se elige (una sola vez).

## Notas para el equipo

- **Elección automática del agente:** `develop` elige solo el primer agente con sesión iniciada (Claude → Codex → Grok → OpenCode). Esta rama **la mantiene tal cual**. El aviso de "elige un asistente" solo aparece cuando no hay ninguno con sesión.
- **Mapa en árbol:** con el mapa nuevo de `develop`, los archivos ya no están en la plaza, así que el robot se queda fijo en su esquina (`SPOT`).
- **`labels.css`:** sus reglas generales `#map-labels .map-label strong` / `span` también alcanzaban al globo (el globo es una etiqueta del mapa). Las reglas del globo que tocan esos elementos llevan el prefijo `#map-labels .map-label.robot-speech` para mantener su tipografía; `labels.css` no se modificó.
- **Tests que fallan en Windows (también en `develop`):** `symlinks…` (`electron/mcpServer.test.js`) necesita permisos para crear enlaces simbólicos, y `a key is saved encrypted…` (`electron/keyStore.test.js`) espera permisos `0600`, que Windows no tiene. No los causa esta rama.
- **Toda la lógica nueva tiene tests** y no cambia los flags de seguridad de los agentes.

## Archivos

- `renderer/viewmodels/robotDialogViewModel.js`: las dos fases (entrevista y guía), la despedida de «Ya programo», las tarjetas, los consejos y deshacer. No toca el DOM.
- `renderer/models/stackCatalog.js` (tecnologías y reglas) y `renderer/models/setupModel.js` (qué quedó por conectar).
- `renderer/views/scene/builders/robotBuilder.js`: la forma del robot (y `setFace` para su expresión). Sus materiales (`robotShell`, `robotTrim`, `robotFace`, `robotGlow`, `glowLines.accent`) están en `renderer/views/scene/materials.js`.
- `renderer/views/scene/welcomeRobotView.js`: la animación del robot, el globo, la escritura animada y la pastilla. Se aparta mientras corre el recorrido o una construcción (el robot de `robotView.js` usa el mapa), y ese otro robot se aparta mientras el diálogo de bienvenida está abierto: nunca hay dos robots a la vez. Estilos en `renderer/styles/welcome.css` (clases `rb-*`, sobre los tokens `--lg-*` del chat).
- `renderer/i18n/es.js` → `map.welcome`: preguntas (`experience`, `stack`), despedida, tarjetas (`catalog`), consejos (`tips`) y el pedido al agente (`scaffoldPrompt`); `integrations.status.pending` y `integrations.pendingInfo`. **Para cambiar lo que dice el robot, se edita solo este archivo.**
- `renderer/main.js`: acciones `openChat`, `askAgent` (con el pedido en espera), `saveProgress`, `devMode` y `prepareSetup`; el clic en una integración por conectar (`EVENTS.integrationPicked`).
- «Por conectar»: `projectModel.js` (`pending`), `mapViewModel.js` (en la fila, sin línea, clic), `integrationBuilder.js` (aspecto y emblema de Supabase), `labels.css` (punto hueco).
- `renderer/models/agentModel.js`: `isGitCommand`.
- `electron/agents.js` (`which`, `proxyEnvFor`, rutas absolutas), `electron/main.js` (proxy por ejecución, `gitInit` al crear un proyecto), `electron/git.js` (`gitInit`), `electron/agentVoice.js` (CRLF).

## Pruebas

- `tests/renderer/robotDialogViewModel.test.mjs`: experiencia, despedida, tarjetas, deshacer, el pedido al agente, guía, riesgos, guardar avance.
- `tests/renderer/stackCatalog.test.mjs`, `tests/renderer/setupModel.test.mjs`; «por conectar» en `projectModel.test.mjs` y `mapViewModel.test.mjs`.
- `tests/renderer/agentModel.test.mjs`: qué va a git y qué va al agente (incluye que los pedidos del robot nunca se confundan con git).
- `electron/agents.test.js`: proxy del sistema. `electron/git.test.js`: `gitInit`.

`npm test`. Para probarlo a mano: `npm start` → **Proyecto → Nuevo**, elige un agente en el panel y sigue al robot. Para ver un aviso de riesgo, pide "crea un archivo `.env` de prueba".
