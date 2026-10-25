# Llamada con Qubi: mejoras de la primera prueba (2026-10-24)

Lo que pidió la persona después de probar la llamada:

1. El panel de la llamada va **encima de Qubi**, no abajo al centro.
2. Qubi **pide permiso** antes de abrir o ejecutar cualquier cosa.
3. Se le puede **dirigir por voz** («ve a apps», «vente», «allá voy»). Camina hasta allí y hace gestos.
4. Sus **ojos y su boca** se mueven mientras conversa: se tiene que notar que está hablando contigo.
5. **Qubi habla de una** (cambiado el 2026-10-25): sin timbre ni «¡Aló!»; mientras conecta el panel dice «Conectando…» y Qubi empieza con un saludo corto.
6. Qubi habla **coloquial venezolano, pana**, con una voz venezolana.

## 1. Panel encima de Qubi

`callBarView` deja de estar fijo abajo. Durante la llamada, el panel es una etiqueta del mapa anclada sobre la cabeza del robot, con `labels.add`, como el globo. Sigue al robot en cada cuadro, también cuando camina o construye.

- **Contenido:**
  - la cara de Qubi y «En vivo · 0:42», o «Conectando…» mientras se abre;
  - la onda de voz;
  - los botones Ajustes, Chat, Micrófono y Colgar (rojo).
- **Pedido de permiso:** si hay uno pendiente, el panel lo muestra arriba de la onda con «Permitir» y «No».
- **El panel no muestra el texto de la conversación** (2026-10-25): tapaba el mapa y las ventanas de la bienvenida. Lo dicho queda en la tarjeta de llamada del chat (botón Chat).
- **El globo de Qubi no se dibuja** durante la llamada (job `call`).
- **Si el robot no se ve** (oculto, o con el recorrido en marcha), el panel vuelve abajo al centro, como ahora.
- **Tamaño:** compacto, como mucho 340 px de ancho. Vidrio con `--lg-*`, opaco: las etiquetas de atrás no deben transparentarse (`lessons.md`).
- **Posición:** se aplica `transform` en cada cuadro, sin `top`/`left`, para no forzar el layout.

## 2. Permisos de Qubi

Qubi actúa en el proyecto solo con permiso de la persona.

| Herramienta de cliente | Qué hace | Permiso |
|---|---|---|
| `ir_a({ ruta })` | Qubi camina hasta la carpeta o el archivo, la cámara lo sigue, señala y dice dónde está | No (solo mueve el mapa) |
| `volver()` | Qubi vuelve a su lugar | No |
| `abrir_archivo({ ruta })` | Abre el archivo en el editor flotante (`editorViewModel.open`) | **Sí** |
| `ejecutar_app()` | Arranca el proyecto con su script `dev` o `start` del `package.json` (nunca otro comando) y abre la vista previa en el navegador cuando aparece el puerto | **Sí**, y además main muestra su propio diálogo nativo |
| `abrir_en_navegador()` | Abre en el navegador un servidor del proyecto que ya está corriendo | **Sí** |

**Cómo se pide permiso** (`callViewModel.ask(action)`):
- **El aviso:**
  - aparece un pedido en el panel: «Qubi quiere abrir `page.tsx`», con «Permitir» y «No»;
  - en la tarjeta de la llamada queda una línea de sistema;
  - la herramienta espera la respuesta: `responseTimeoutSecs` 60.
- **Cómo responde la persona:**
  - con un botón;
  - **con la voz**: si la próxima frase de la persona empieza por sí, dale, ok, claro, hazlo, de una o va, se permite; si empieza por no, espera o para, se niega.
- **Duración:** el permiso vale para esa acción y ese objetivo. «Siempre en esta llamada» se puede marcar para `abrir_archivo`, nunca para `ejecutar_app`.
- **Respuesta de la herramienta:** `{ ok: true }` o `{ ok: false, motivo: 'sin-permiso' | 'no-existe' | 'secreto' | 'sin-script' }`. Los secretos nunca se abren.

**`ejecutar_app` en main** (`electron/projectRun.js`, nuevo, con pruebas):
- `scriptsFor(root)`: busca un script `dev` o `start` en el `package.json` de la raíz y de `apps/*`, como mucho 1 nivel. Devuelve `[{ cwd, script, command: 'npm run dev' }]`.
- `run(choice)` usa los servidores administrados (`createManagedServers` de `servers.js`) con `npm run <script>` en esa carpeta.
- **Antes**, `dialog.showMessageBox` dice «Qubi quiere ejecutar `npm run dev` en `apps/web`. ¿Permitir?» y ofrece Permitir / Cancelar.
- **Dependencias (2026-10-25):** si falta `node_modules` (un proyecto recién creado), `installFor` decide dónde instalar (la raíz si es un monorepo) y con qué (`npm`, o `pnpm` / `yarn` / `bun` según el lockfile). El mismo diálogo lo avisa («Antes instalo lo que necesita…») y la instalación corre con el login shell del usuario, sin secretos en el entorno, máximo 5 min. Si falla, no se arranca: `installFailed` → Qubi recibe `sin-instalar` y pide revisar internet.
- **Después**, el puerto nuevo se detecta con la lista de servidores y se abre con `servers:open`.
- IPC `run:scripts` y `run:start` (con el índice de un script de la lista, nunca texto libre).

## 3. Dirigir a Qubi

- `ir_a` usa `placesFor` (como `buildViewModel`) para ubicar la carpeta o el archivo:
  - el robot camina (`moveTo` con arco), la cámara vuela (`mapViewModel.show`) y Qubi hace `point`;
  - al llegar mira a la cámara y saluda (`wave` corto).
- El viewmodel publica un `guide` de llamada `{ to, center, stepId, pose }`. `robotView` lo usa en el job `call`.
- El prompt le dice a Qubi que use `ir_a` cuando la persona diga «ve a…», «muéstrame…», «vamos a…», y que responda en una frase corta y coloquial, distinta cada vez («¡Voy pa' allá!», «Ya voy», «¡Dale, te llevo!»).
- Qubi camina también con `mostrar_carpeta` (antes solo se movía la cámara), con `revisar_archivo` (va al archivo mientras el agente lo lee) y con `abrir_archivo` (va al archivo mientras pide permiso). La línea del panel rota entre frases: `strings.call.guide.going`, `reviewing` y `opening`.
- Al girar el mapa, Qubi (y sus trabajadores) siguen mirando a la cámara: `face({ yaw })` acepta una función que se lee en cada cuadro.

### Órdenes directas y modo Vibe/Dev

- **Una orden clara se ejecuta ya.** Su orden es la confirmación: Qubi no pregunta, no repite el plan y responde en una frase. Solo pregunta si falta un dato o la orden es peligrosa (prompt «# Órdenes directas»).
- **Permisos:** si la persona habló hace menos de 30 s (`CONFIRM_MS`) y después no llegó ningún aviso, `#permit` no vuelve a preguntar. Lo deja anotado como «…: lo pediste tú».
  - Una respuesta a un permiso solo sirve para ese permiso (`#answer` la consume).
  - Una acción que Qubi propone por su cuenta sigue preguntando.
  - El diálogo nativo de main para ejecutar scripts y la aprobación de escrituras del agente no cambian.
- **Rutas:** Qubi nunca dice rutas en voz alta; dice qué es el archivo.
- **Vibe/Dev:** van ligados al nivel técnico de Qubi (`callViewModel.syncMode`, `actions.setMode`).
  - Dev equivale a técnico y Vibe a básico; intermedio deja el modo como está.
  - «Modo dev» y «modo vibe» por voz cambian también la app.

### Gestos y expresiones

- `models/gestures.js`: nombres y duración. `views/scene/robotGestures.js` (puro, con pruebas): cómo se mueve cada gesto y cada cara.
- Gestos: saludar, celebrar, pensar, sorpresa, encoger, asentir, negar, bailar, aplaudir. Se mezclan con la pose (entran y salen suaves).
- Caras: feliz, sorprendido, pensativo, apenado, normal.
- `callViewModel.store.gesture` `{ name, id }`. Gestos automáticos:
  - saluda al contestar y al colgar;
  - piensa al pasar un pedido al agente;
  - celebra si construyó, asiente si respondió y se encoge de hombros si falló;
  - asiente con un permiso concedido y se encoge con un no.
- Herramienta de voz `gesto({ gesto })`: Qubi acompaña lo que dice. El prompt le pide no anunciarlo y no repetir los gestos automáticos.
- `robotView`:
  - cara feliz con el cursor encima, pensativa mientras un agente trabaja, sorprendida en la mano;
  - los ojos y la cabeza siguen al cursor (en compañía y en llamada);
  - un toque rápido sobre Qubi le saca una reacción distinta cada vez.
- Movimiento reducido: los gestos solo cambian la cara.

## 4. Cara viva

`guideRobot.speak(level)` ya mueve la cabeza. Se agrega `face(update)` en cada cuadro, durante la llamada:
- **boca** (`robot.mouth`): se abre con el nivel de la voz. Escala y de 0,6 a 1,6 y escala x de 1 a 0,85, suavizado, sin parpadeo;
- **ojos** (`robot.eyes`):
  - parpadeo natural cada 2 a 5 s, con `scale.y` a 0,1 durante 120 ms;
  - al hablar, brillo un poco mayor;
  - al escuchar, los ojos miran a la cámara con pequeños movimientos;
- **asentir**: cuando la persona termina de hablar (de escuchar a hablar), un movimiento de cabeza;
- **corazón** (`robot.heart`): late más rápido mientras habla;
- con `prefers-reduced-motion`: sin parpadeo animado, solo la boca, mínima.

## 5. Se siente como una llamada

- **Botón:** el teléfono del chat se llama «Hablar en vivo». En el globo del robot dice «Hablar».
- **Sin timbre** (2026-10-25): se quitó `ringTone.js`; no debe sonar a llamada de teléfono.
- **Primer mensaje:** cambia en cada llamada; sale de `voice.greetings` según la forma de hablar (en `electron/strings.js`), por ejemplo «¡Aló! ¿Quién habla? … ¡Epa, pana! Aquí Qubi, viendo {{project_name}}. ¿Qué vamos a construir hoy?».

## 6. Qubi venezolano

- **Prompt:**
  - personalidad de pana venezolano, cálido y echador de broma, pero claro;
  - expresiones naturales sin exagerar: «¡Epa!», «pana», «chévere», «de pana», «dale», «vale», «¿qué más?», «tranquilo, que yo te ayudo», «¡listo el pollo!»;
  - frases cortas y una pregunta a la vez;
  - nada de jerga técnica con quien no programa;
  - nunca groserías.
- **Voz:** de la biblioteca de ElevenLabs, acento venezolano.
  - Por defecto: «Juan — Natural and spontaneous» (`GRGd9ooJazPy9jV7czfS`, dueño `ef2f1a10…c7f4031`).
  - Opciones en Ajustes → «Voz de Qubi»:
    - Juan;
    - Julio (`iR9Trc8OO7UjgvidHn45`, animación);
    - José Manuel (`nYm4p0R8BhHFRBH8wGHm`);
    - Maggie (`bfzeMrk4OVi07v1gHaGo`, voz femenina).
- **Agregar la voz a la cuenta:** `voiceCall` se asegura de que la voz esté en la cuenta. Si `voices.get(id)` da 404, llama a `voices.share(publicOwnerId, voiceId, { newName: 'Qubi · <nombre>' })`. Así se usa 1 de las 10 ranuras del plan Starter.
- **Cambiar de voz:** la elección viaja en `voice:start` como un campo `voice` (clave de la lista, nunca un id libre). Main la convierte en el id, se asegura de que esté en la cuenta y la devuelve. La ventana la pasa como `overrides.tts.voiceId`, y el agente tiene habilitado ese override (`platformSettings.overrides.conversationConfigOverride.tts.voiceId: true`).

## 7. Equipo en el mapa: lugar, selección y globos (segunda prueba)

- **Cuándo nace el equipo:** solo cuando Qubi decide repartir (la herramienta `repartir` en la llamada, que exige un turno de la persona) o cuando la persona se lo pide. Nunca de forma automática.
- **Dónde se paran los robots:** nunca dentro de la huella de una carpeta (`FOLDER.platform`) ni encima de otro robot.
  - **Trabajadores:** cada uno tiene un lugar propio alrededor de su destino, repartidos en arco: a 2,2 unidades del borde de la base y separados entre sí 1,6 o más. También cuando dos trabajadores van a subcarpetas del mismo edificio (`apps/web` y `apps/api` → `apps/`).
  - **Qubi:** al auditar se queda del lado de la cámara, sin pisar a nadie.
- **Seleccionar:** el robot gana sobre la carpeta.
  - `inputController` prueba primero a los robots (Qubi y los mini robots), con un radio de toque generoso, y solo después al mapa. El hover de la carpeta no aparece si el puntero está sobre un robot.
  - **Qubi** se puede agarrar y lanzar siempre, también durante una llamada o un equipo. Al soltarlo vuelve a su tarea.
  - **Los mini robots** se pueden señalar: muestran su tarea y su estado. No se arrastran.
- **Globos:** nunca más de uno grande por zona.
  - Si los globos de varios robots se tocan en pantalla, los de los trabajadores pasan a una píldora de una línea («2 · Ruta de contacto ✓») y el de Qubi queda encima.
  - Se acomodan en pantalla según las cajas de los globos: el que choca sube.

## Cómo quedó (2026-10-24, sin probar todavía en la app real)

- **Panel encima de Qubi:** `callBarView` recibe `sceneView`, `anchor` (`robotView.head()`, el punto sobre la cabeza) y se mueve con `transform` en cada cuadro de `sceneView.onFrame`, después de que Qubi se movió. No usa `labels.add`: es el mismo `#call-bar`, colocado por `placePanel` (dentro del escenario y a la izquierda del chat flotante si lo taparía). En la vista Git, o si Qubi está oculto (recorrido), vuelve abajo al centro.
- **«Llamada simulada» ya no aparece sola:** sin servicio de voz conectado, la llamada termina en error `offline` y se abre el modal de voz (`VOZ.md`). Además se quitó de `renderer/main.js` el arranque automático en simulada cuando aparece el agente «Simulador» (`PLATANUS_SIM=1`). La simulada solo se usa si la persona la elige (Ajustes o «Probar sin voz») o en la versión web.
- **Empezar:** `ringing` (sin espera: `RING_MS` = 0) → `connecting` → `live`; Qubi habla en cuanto la sesión abre.
- **Venezolano:** el prompt, el primer mensaje y la voz por defecto (Juan) están en `electron/strings.js` y `electron/voiceCall.js`. Como cambió la configuración, el agente guardado en la cuenta de ElevenLabs **se actualiza solo en la próxima llamada real** (`configHash`). Ojo: si `.env.local` tiene `PLATANUS_VOICE_ID`, esa voz fija gana sobre la venezolana.
- **Permisos:** `store.permission` con Permitir / No / «Siempre en esta llamada» (solo `abrir_archivo`, y vale para cualquier archivo no secreto de esa llamada). La herramienta responde `ok`, `sin-permiso`, `no-existe`, `secreto`, `sin-script`, `sin-servidor`, `ocupado` o `falló`; el prompt explica todos.
- **Cableado (`renderer/main.js`):**
  - `abrir_archivo` → `editorViewModel.open`;
  - `ejecutar_app` → `runService` (IPC `run:start`, diálogo nativo en main); cuando main devuelve el puerto, la ventana abre la vista previa con `serversModel.open(port)`;
  - `abrir_en_navegador` → solo servidores que Qubbot arrancó (`managed`) o que Qubi arrancó en esta ventana; nunca otro puerto del computador.
- **Dirigir a Qubi:** `store.guide` → `robotView` (camina, salta carpetas lejanas, saluda y señala). La cámara la mueve `showFolder`.
- **Cara viva:** `guideRobot.liveFace({ on, speaking })`; en la simulada la boca sigue un ritmo de habla.
- **Equipo:** lugares en arco (`teamViewModel.workerSpots`), los mini robots se señalan (`teamView.pointer` en `inputController`), globos que chocan pasan a píldora.
- **Pendiente de main:** un proyecto que arrancó Qubi, si se cae antes de mostrar su puerto, no pasa a «Detenidos» (`servers.js`). `ejecutar_app` solo funciona en macOS.
