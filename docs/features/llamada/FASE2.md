# Llamada con Qubi — fase 2 (equipo de trabajadores) y fase 3 (memoria del proyecto)

Qubi deja de delegar todo en un solo agente y pasa a **orquestar un equipo**. Cuando el pedido tiene varias partes, lo reparte en 2 o 3 tareas, cada una en **su propia carpeta**. Cada tarea la hace un **trabajador**: otra corrida del agente que la persona eligió, en paralelo y con su sesión propia. En el mapa, de Qubi salen mini robots que caminan a su carpeta y meten sus hojas.

Cuando un trabajador termina, Qubi **audita**:
1. Primero corren los verificadores fijos: nada fuera de su carpeta, ningún secreto, el semáforo de cada archivo.
2. Después, si se pide, una revisión de solo lectura del agente.

**El plano decide.** Una revisión del modelo nunca convierte en aprobado lo que un verificador marcó.

La fase 3 agrega **memoria del proyecto**. Al colgar, Qubbot guarda un resumen fijo, sin modelo: pedidos, archivos hechos, auditorías y lo aprendido del proyecto. En la llamada siguiente, Qubi y los trabajadores empiezan con ese contexto.

## Main

### `electron/agents.js`
- Sesiones válidas: `chat | repair | refine | tour | review | worker-1 … worker-3`. La clave sigue siendo `${agent}:${session}`, así que trabajadores distintos corren a la vez.
- Archivos de configuración **por sesión**, nunca compartidos entre corridas simultáneas:
  - Claude: `mcp-<session>.json`;
  - OpenCode: carpeta de configuración por sesión.
- Grok configura su MCP de forma global (`grok mcp add`), así que sus trabajadores no pueden correr a la vez. Para Grok, `run` los pone **en fila**: una corrida `worker-*` de Grok espera a que termine la anterior. Lo mismo para cualquier agente marcado `parallel: false`.
- `run(id, { ..., worker, scope })` pasa `mcpUrl` = la ruta del trabajador.

### `electron/mcpServer.js`
- Ruta nueva: `/mcp/<token>/w/<workerId>`. `workerId` cumple `^w[1-3]-[a-z0-9]{4,12}$`.
- `scopeFor(workerId)` devuelve `{ folders: ['apps/web'] }` o `null`. Sin alcance, la ruta no existe (404).
- En esa ruta, `platanus_write_file` **rechaza** cualquier ruta fuera de sus carpetas, con un mensaje claro para el agente. Lectura y el resto de herramientas siguen como en la ruta completa. Los secretos siguen bloqueados.
- Las llamadas de herramientas de esa ruta llevan `worker` en su contexto, para que `agent:awaiting` y `agent:changed` digan qué trabajador fue.

### `electron/main.js`
- `agents:run` acepta:
  - `session: 'worker-N'`;
  - `worker` (id válido);
  - `scope` (1 a 2 carpetas relativas, sin `..`, que existen o se pueden crear, nunca secretos).
- Registra el alcance mientras dura la corrida y lo borra al terminar.
- `review` usa la ruta de solo lectura.
- Los eventos `agent:awaiting` y `agent:changed` incluyen `worker` cuando aplica.
- Diálogos de aprobación **en fila**: nunca dos `showMessageBox` a la vez.
- Memoria: IPC `memory:read` (`root`) → objeto, `memory:append` (`root`, `entry`) y `memory:forget` (`root`).

### `electron/projectMemory.js` (nuevo, con `electron/projectMemory.test.js`, registrar en `package.json` `test`)
```js
createProjectMemory({ dir }) → {
  read(root) → { calls: [{ at, pedidos: [string], built: [path], audits: [{ folder, status }], notes: string }], learned: [string] },
  append(root, entry) → memory,   // guarda como mucho 20 llamadas, las más nuevas
  learn(root, facts: [string]) → memory, // sin repetidos, como mucho 12
  forget(root),
}
```
- Un JSON por proyecto en `userData/memory/<sha256(root) 16>.json`, con permisos 0600.
- Textos recortados (pedido ≤ 300, notas ≤ 300, rutas ≤ 200).
- Se limpian de cualquier cosa que parezca una clave: los mismos patrones del escáner de `tests/secrets.test.mjs` (`sk-…`, `AKIA…`, `ghp_…`, `xox…`, JWT, `-----BEGIN`), reemplazados por `[oculto]`.

### Voz (`electron/voiceCall.js` + `electron/strings.js`)
Dos herramientas de cliente más, con prompt y descripciones en español:

| Nombre | Parámetros | Devuelve |
|---|---|---|
| `repartir` | `tareas`: arreglo de 2 a 3 objetos `{ titulo, pedido, carpeta }` (todos string) | `{ ok, trabajadores: [{ id, titulo, carpeta }] }` o `{ ok: false, motivo }` |
| `ver_equipo` | — | `{ fase, trabajadores: [{ titulo, carpeta, estado, archivos, auditoria }] }` |

- El prompt explica cuándo repartir: el pedido tiene partes independientes, en carpetas distintas. Si es una sola cosa, usa `construir`. Antes de repartir confirma el plan en una frase.
- Cuando llega `[aviso de Qubbot]` sobre el equipo, lo cuenta.
- `{{project_memory}}` es una variable dinámica nueva: «Lo que recuerdo de este proyecto».

## Ventana

### `renderer/models/agentConnectionModel.js`
- La fila es por `agente + sesión`, no solo por agente. Así los trabajadores no esperan al chat ni entre ellos; main decide si Grok los pone en fila.
- `ask(..., { session, worker, scope, readOnly })` pasa `worker` y `scope` a `service.run`. Hay que comprobar que `agentService` y el preload los dejen pasar.

### `renderer/viewmodels/teamViewModel.js` (nuevo)
```js
new TeamViewModel({ connection, projectModel, mapViewModel, securityModel = null, memory = null, bus, timing, review = true })
store: {
  phase: 'idle' | 'working' | 'auditing' | 'done',
  workers: [{
    id, n, title, pedido, folder,
    status: 'queued' | 'working' | 'waiting' | 'done' | 'failed' | 'cancelled',
    created: [path], changed: [path], steps: number, text: string,   // text: lo último que dijo, corto
    audit: null | { status: 'checking' | 'approved' | 'flagged', notes: [string] },
    place: { kind, x, z, stand: { x, z } },                          // placesFor(...) como buildViewModel
    startedAt, endedAt,
  }],
  guide: null | { from, to, center, walkMs, stepId, title, text, pose },  // lo que hace Qubi (como buildViewModel)
  drops: [{ id, worker, folder, path, x, z }],                         // hojas nuevas que la vista anima (las últimas 20)
}
start(tasks) → { ok: true, workers: [{ id, title, folder }] } | { ok: false, motivo: 'ocupado' | 'sin-proyecto' | 'sin-agente' | 'carpetas-repetidas' | 'carpeta-invalida' | 'muchas-tareas' }
cancel()
summary() → string corto en español para la voz
```
- Cada trabajador: `connection.ask(promptFor(task, memory), '', { session: 'worker-' + n, worker: id, scope: [folder], voice: { purpose: 'worker' }, onEvent, signal })`.
  - El prompt lleva el pedido, la regla «solo escribe dentro de `<folder>/`» y el contexto de memoria.
  - Las herramientas de escritura llegan por `agent:changed` con `worker`: el viewmodel escucha `EVENTS.agentChanged` y filtra por `worker`. Cada archivo nuevo agrega un `drop`.
  - Si espera permiso (`agentAwaiting` con `worker`), su estado pasa a `waiting`.
- Auditoría de cada trabajador que terminó, en orden:
  - **Fija:** cada archivo creado o cambiado está dentro de su carpeta; ningún `isSecretFile`; el nivel del semáforo de esos archivos (si `securityModel` lo da) no es rojo; la corrida terminó bien. Si algo falla → `flagged` con notas en español.
  - **Revisión (opcional):** `connection.ask(…, { session: 'review', readOnly: true })` con la lista de archivos. Sus palabras se guardan como una nota recortada, pero **no cambian** el veredicto fijo.
  - `guide` hace que Qubi camine a cada carpeta auditada (`pose 'scan'`) y diga el veredicto.
- Al terminar todo, `phase: 'done'`. A los 8 s, `idle`: los mini robots se van.
- Al empezar el recorrido o cerrar el proyecto: `cancel()`.

### `renderer/viewmodels/buildViewModel.js`
Ignora las tarjetas cuyo `run.worker` existe y los cambios con `worker`. Los trabajadores tienen su propia animación.

### `renderer/viewmodels/chatViewModel.js`
- `upsertTeamCard(card)` crea o actualiza `{ role: 'bot', card: { kind: 'team', phase, workers: [...] } }`.
- `#writingCard` y el manejo de `agentChanged` y `agentAwaiting` **ignoran** los eventos con `worker`. No son del chat.

### `renderer/viewmodels/callViewModel.js`
- Herramientas `repartir` y `ver_equipo`, que llaman a `teamViewModel.start` y `summary`. `repartir` exige que la persona haya hablado, la misma regla que `construir`.
- El avance del equipo va a `sendContext`; al terminar la auditoría, `notify` una vez.
- Memoria:
  - Al empezar, `memory.read(root)` y `memoryText(memory)` (≤ 800 caracteres) van en `dynamicVariables.project_memory` y al final del contexto.
  - Al colgar, `memory.append(root, { at, pedidos, built, audits, notes })` con lo que pasó en la llamada.
  - `memory.learn(root, facts)` con hechos fijos del proyecto: el stack y la arquitectura de `projectAnalyzer` si se puede usar barato, o los nombres de las carpetas principales.

### `renderer/models/projectMemoryModel.js` (nuevo)
- `createProjectMemory(bridge = window.platanus?.memory)` → `{ available, read(root), append(root, entry), learn(root, facts), forget(root) }`. En la web vive solo en memoria.
- `memoryText(memory)` es puro y ≤ 800 caracteres: «Llamadas anteriores: …; ya existe: …; aprendido: …».

### Vistas
- **`renderer/views/scene/teamView.js` (nuevo):**
  - un mini robot por trabajador: `buildRobot()` escalado a 0,55, con un número o color propio en el anillo;
  - nace en la posición de Qubi con un salto (escala 0 → 1);
  - camina a `place.stand`, mira la carpeta y se balancea en pose de cargar mientras trabaja;
  - por cada `drop`, vuela una hoja de sus manos a la carpeta: la carpeta fantasma sube como en `buildSiteView`, y se reutiliza `buildGlassFolder`;
  - en `waiting` mira a la cámara y su globo dice «Espera tu permiso»;
  - en `approved` saluda con un brillo verde; en `flagged` aparece un anillo rojo;
  - al final vuelven a Qubi y desaparecen.
  - Globos cortos: título del trabajador y su estado.
- **`guideRobot.js`:** pose `scan`. Cabeza hacia abajo, gira despacio de lado a lado; un brazo extendido como si escaneara.
- **`robotView.js`:** job `team` entre `build` y `call`, usando `teamViewModel.store.state.guide`. Al repartir, Qubi hace `point` hacia cada carpeta mientras nace su trabajador.
- **`chatCardsView.js`:** tarjeta `kind: 'team'` con una fila por trabajador. Cada fila muestra número, título, carpeta, estado con orbe, archivos (nuevos y cambiados), auditoría (✓ aprobado, ⚠ revisar) y notas cortas.
- **Estilos:** en `renderer/styles/call.css`, tokens `--lg-*`.

### Textos
`strings.team` (estados, auditoría, tarjeta, globos, avisos para la voz) y `strings.memory`, en `renderer/i18n/es.js`.

## Pruebas
- **Main:** `agents.js`:
  - dos sesiones `worker-*` del mismo agente corren a la vez;
  - Grok, en fila;
  - configuración por sesión.

  `mcpServer`:
  - la ruta de trabajador rechaza escribir fuera de su carpeta y acepta dentro;
  - `..` y secretos siguen bloqueados;
  - id inválido → 404.

  `projectMemory`: guarda, recorta, limita a 20, limpia claves y no repite lo aprendido.
- **Ventana:** `teamViewModel`, con `connection` falsa:
  - arranca N en paralelo;
  - rechaza carpetas repetidas o inválidas;
  - los `agentChanged` con `worker` van al trabajador correcto;
  - una auditoría fija marca un archivo fuera de alcance o secreto aunque la revisión diga «aprobado»;
  - cancelar aborta todo;
  - `summary()` sale en español.

  `callViewModel`: `repartir` exige que la persona haya hablado; la memoria entra al contexto y se guarda al colgar. `projectMemoryModel.memoryText` respeta el límite.

## Cómo quedó (2026-10-24)

Construido por seis agentes en paralelo y unido en `renderer/main.js`. Pasan todas las pruebas (`npm test` 547, `node --test electron/*.test.js` 137) y el bundle de esbuild. **Todavía no se ha visto en la app real**: ni el equipo en el mapa, ni la tarjeta del chat, ni una llamada con memoria.

Lo que cambió respecto al diseño:

- **Alcance con `root`.** `scopeFor` devuelve `{ folders, root }`, no solo `{ folders }`. Con `root`, `mcpServer.js` mira a dónde llega de verdad la ruta: un enlace dentro de la carpeta del trabajador que apunte afuera queda rechazado, incluso para archivos nuevos. Main vuelve a comprobarlo en `platanus_write_file`, y un trabajador que ya terminó no puede escribir.
- **Fila de Grok.** Cualquier agente con `parallel: false` (hoy Grok) pone en fila **todas** sus corridas, no solo los trabajadores. Cada sesión usa otra dirección (el chat y la reparación, la completa; el recorrido y la revisión, la de solo lectura; cada trabajador, la suya), y el `grok mcp add` de una pisaría la de otra: una revisión podría quedar con permiso de escribir. Una corrida en espera se puede cancelar sin que llegue a empezar.
- **Configuración por sesión.** Claude usa `mcp-<sesión>.json`; el Simulador, `mcp-sim-<sesión>.json`. OpenCode usa una carpeta por sesión.
- **`memory:learn` existe.** El diseño solo nombraba `read`, `append` y `forget`. Main y el preload tienen además `learn(root, hechos)`. Las respuestas son el objeto mismo, sin `{ ok, data }`.
- **Diálogos en fila.** Todos los diálogos nativos de main esperan su turno, no solo los de aprobación. El permiso de un trabajador dice «El trabajador N de Qubi quiere cambiar…».
- **De 1 a 3 tareas.** `teamViewModel.start` acepta también una sola tarea. El SDK de voz no tiene `minItems`/`maxItems`, así que «2 o 3» solo está en la descripción de `repartir`; la app rechaza 0 o más de 3 (`muchas-tareas`).
- **La fila de la ventana.** Cada trabajador tiene su propia fila (`agente:worker-N`). El chat, la reparación, el recorrido y la revisión de un mismo agente siguen en una sola fila, como en la fase 1: nunca hablan a la vez, y una reparación solo ve sus propios cambios. La reparación además ignora los cambios que traen `worker`.
- **`ProjectModel` guarda `root`.** Antes lo descartaba, y la memoria quedaba guardada con el nombre de la carpeta. Main solo acepta la ruta del proyecto abierto o de uno reciente, así que con el nombre la memoria siempre salía vacía.
- **Memoria para los trabajadores.** `renderer/main.js` guarda el texto de la memoria del proyecto abierto. Lo lee al abrir el proyecto y lo vuelve a leer cada vez que la llamada guarda o aprende algo. Se lo pasa a `teamViewModel` como función. Una memoria vacía no se manda al prompt.
- **Tarjeta del equipo en el chat.** `main.js` solo la actualiza cuando cambian la fase o los trabajadores. Las caminatas de Qubi y las hojas no la tocan. Si el equipo se cancela a medias, queda en `idle` sin trabajadores; entonces la tarjeta se cierra con las últimas filas que tenía.
- **Robot de bienvenida.** Se aparta mientras el equipo no está en `idle` (`welcomeRobotView.js` recibe `teamViewModel`). El equipo puede seguir trabajando después de colgar, y así nunca hay dos robots en el mapa.
- **Qubi durante la auditoría.** Sigue en el trabajo `team` también en la fase `auditing`, para no volver a casa entre dos revisiones.
- **Auditoría fija con la regla fija.** El rojo del semáforo se mira con la regla de nombres (`demoScore`) y el nivel actual, el peor de los dos: un agente que pone su archivo en verde no lo aprueba. En la ruta de un trabajador, `platanus_set_file_score` no existe. Las rutas se limpian (`./a/b` es `a/b`) antes de comparar con la carpeta, y una con `..` nunca está dentro.
- **Permisos en fila que ya no aplican.** Cuando le toca su turno, un diálogo de escritura se salta si el trabajador ya terminó o fue cancelado, o si se abrió otro proyecto. Después de aprobar se vuelve a comprobar todo antes de escribir.
- **Qubi en el mapa.** Al repartir señala desde donde está, sin saltar a la esquina de la plaza. Los mini robots se paran a un lado del punto de la carpeta, que queda libre para Qubi. Al terminar vuelven a donde Qubi va, no a donde estaba. La carpeta fantasma de un trabajador sigue a su carpeta cuando el mapa se reacomoda, y desaparece si la carpeta ya se dibuja como edificio.
- **Tarjeta del equipo.** Un segundo «terminó» mientras el equipo sigue en el mapa actualiza la misma tarjeta; no agrega otra.
- **Revisión con tiempo límite.** La revisión de solo lectura se corta a los 90 s y solo agrega una nota de hasta 160 caracteres. El veredicto lo deciden solo los verificadores fijos.
- **Textos sin usar.** `strings.team.notices.started` y `workerDone` todavía no se usan. Un fallo de un trabajador se avisa con `strings.call.notices.failed`. Tampoco se usa `strings.team.errors`: el `motivo` va como código a la voz, y el prompt de Qubi explica cada uno.

Pendiente:
- Probarlo en la app real, con el Simulador y después con Claude y con Grok.
- Más pruebas de `teamView.js` (hoy `tests/renderer/teamView.test.mjs` cubre los puestos y las carpetas fantasma).
