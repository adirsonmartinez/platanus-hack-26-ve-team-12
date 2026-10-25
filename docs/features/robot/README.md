# El robot del mapa

Con un proyecto abierto, el robot espera en la plaza.

## Cómo se usa

- **Agarrarlo:** al pasar el cursor por encima, el cursor cambia a una mano y el globo dice «Arrástrame o lánzame a una carpeta».
- **Arrastrarlo:** se levanta con los brazos arriba y el globo dice sobre qué carpeta caería («Suéltame aquí: src/»).
- **Soltarlo o lanzarlo:**
  - si lo sueltas despacio, cae donde está;
  - si lo lanzas, sigue en esa dirección y vuela en arco;
  - cae junto a la carpeta más cercana, o en la plaza si es el proyecto entero;
  - si no hay nada cerca, lo dice.
- **Al llegar:** señala la carpeta y pregunta «¿Te explico qué hay aquí o quieres cambiar algo?». En el chat aparece una tarjeta con título claro:
  - arriba, «El robot está aquí» y el nombre del lugar en palabras simples («Base de datos»);
  - debajo, la ruta y cuántos archivos tiene, qué vive ahí y su estado («1 por revisar» o «Sin problemas»).

  La tarjeta ofrece:
  - «Explícame qué hay aquí»;
  - «Quiero cambiar algo aquí»: deja escrito «En «carpeta/» quiero …» en el cuadro para que lo termines;
  - «Ver sus riesgos», si la carpeta tiene problemas;
  - en la plaza, «Recorrido desde aquí».
- **Mientras el agente trabaja:** el globo muestra el mismo orbe y las mismas palabras que la tarjeta del chat (leyendo, escribiendo, esperando tu permiso…).
- **Avisos de la app:** `robotViewModel.say(texto, acciones)` pone un globo corto con botones mientras el robot espera (por ejemplo «Este proyecto usa Stripe… ¿Lo conectamos?» con «Conectar», de `servicesViewModel`). Se va al pulsar un botón o a los 20 s; nunca tapa la pregunta de donde aterrizó.

Es el mismo robot de la bienvenida de un proyecto nuevo y del recorrido. Mientras esos están activos, no se puede agarrar.

## Construyendo en vivo

Mientras un agente (en el chat o en una reparación) guarda archivos, el robot **lleva cada archivo como una hoja de papel a su carpeta**:
- **La carpeta:** si el mapa no la muestra, porque es nueva o no tiene problemas, se levanta del suelo como obra.
- **Si hay que aprobar:** si el cambio espera tu permiso, el robot espera con la hoja en las manos y lo dice.
- **Al guardar:** mete la hoja en la carpeta, que gana una hoja más. Si el archivo ya existía, lo señala; si no se guardó, lo dice.
- **Varios archivos:** van de a uno y en orden. Los de la raíz van a la plaza («Archivos sueltos»).
- **La cámara lo sigue:** al empezar la obra se aleja (nunca se acerca) y en cada viaje va hacia la carpeta a la que camina el robot, para que no se pierda de vista. Si mueves la cámara tú (arrastrar, rueda, girar, botones), deja de seguirlo y queda donde la dejaste. Si no la tocaste, al terminar vuelve a la vista inicial para mostrar el proyecto completo. La cámara cuenta los movimientos de la persona en `CameraViewModel.manual`.
- **Al terminar:** saluda con «Obra terminada · Listo: N archivos nuevos». Las obras temporales se van a los pocos segundos y el robot vuelve a la plaza.
- **En el chat:** un archivo nuevo se cuenta como «Creé index.js» y el resumen como «Creé 4 archivos», no como arreglo.

Probarlo: escenario `obra` del Simulador, con permisos en Auto (`[sim:obra] …`).

## Llamada

Durante una llamada con Qubi (`docs/features/llamada/README.md`), el robot **es Qubi hablando contigo**:
- **Dónde:** se queda donde está (o aparece en la plaza) y te mira. Está en el mapa desde que suena el timbre.
- **Cuando Qubi habla:** asiente y rebota un poco al ritmo de su voz (pose `talk`).
- **Cuando te escucha:** inclina la cabeza hacia un lado, mira hacia ti, respira despacio y deja los brazos sueltos (pose `listen`).
- **Su cara está viva** (`liveFace`, MEJORAS §4):
  - la boca se abre con su voz, suavizada, sin parpadeo;
  - parpadea solo, cada 2 a 5 s (a veces dos veces seguidas);
  - los ojos brillan más mientras habla;
  - mientras escucha, los ojos te miran con pequeños saltos;
  - cuando terminas de hablar y él empieza a responder, asiente una vez;
  - el corazón late más rápido en la llamada, y más aún mientras habla.

  En una llamada simulada no hay sonido que medir, así que la boca sigue un ritmo parecido al habla mientras Qubi «habla».
- **Su globo no se dibuja:** el panel de la llamada cuelga sobre su cabeza (`head()`) y ya dice lo que dice Qubi. Los globos del recorrido y de la construcción sí se ven.
- **«Ve a…» (`ir_a`):** con la guía de la llamada (`callViewModel.store.guide`):
  1. Qubi va a la carpeta. Si queda lejos, salta por encima de las otras.
  2. Al llegar, mira a la cámara y saluda un momento.
  3. Después señala la carpeta.

  Con `volver` regresa a su lugar. Nunca se para dentro de una carpeta.
- **Si Qubi pide construir algo:** el robot va a construir en vivo (eso va primero) y, al terminar, vuelve a la llamada. El recorrido también va antes que la llamada.
- **Llamar desde el robot:** su globo tiene el botón «Hablar» (al pasar el cursor o cuando pregunta algo), solo si no hay una llamada en curso.
- **Agarrarlo:** también se puede agarrar y lanzar durante la llamada o el trabajo del equipo. Al caer vuelve a lo que hacía.
- El robot de bienvenida se aparta mientras dura la llamada, para que nunca haya dos robots.

## Equipo de Qubi

Cuando Qubi reparte un pedido entre varios trabajadores (`docs/features/llamada/FASE2.md`), el mapa lo cuenta así:
- **Nacen de Qubi:** cada trabajador es un robot pequeño (el mismo robot, a menos de la mitad del tamaño) con su propio color en el corazón, el anillo de luz y la antena: azul, rosa y turquesa. Salen de Qubi uno tras otro, con un saltito.
- **Van a su carpeta:** caminan hasta su lugar y miran la carpeta.
  - Cada uno tiene su lugar, en arco alrededor de la carpeta, del lado de la plaza, a unas 2,2 unidades del borde de su base.
  - Entre robots siempre queda 1,6 o más, también cuando dos carpetas quedan en el mismo edificio (`apps/web` y `apps/api` → `apps/`).
  - Nunca se paran dentro de una carpeta.
- **Señalarlos:** al pasar el cursor por un trabajador, su globo se agranda, se pone encima y muestra su tarea completa y su estado. No se arrastran.
- **Trabajando:** sostienen una hoja y se balancean un poco. Cada archivo que guardan vuela de sus manos a la carpeta, que gana una hoja. Si el mapa no muestra esa carpeta, se levanta del suelo como obra, con su nombre y cuántos archivos hizo el equipo ahí.
- **Si esperan tu permiso:** se giran hacia ti y su globo dice «Espera tu permiso».
- **La revisión de Qubi:** Qubi camina a cada carpeta y se para del lado de la cámara, sin pisar a nadie. La mira de cerca moviendo la cabeza de lado a lado con la mano extendida, como si la escaneara (pose `scan`), y dice el veredicto.
  - **Aprobado:** el trabajador saluda y brilla en verde bajo sus pies.
  - **Revisar:** queda un anillo rojo bajo sus pies, pone cara de preocupado y su globo dice qué pasó.
- **Mientras trabajan:** Qubi se queda donde está y señala la carpeta que recibió la última hoja. Si hay llamada, su globo sigue mostrando lo que dice.
- **Al final:** vuelven caminando a Qubi, se encogen y desaparecen, y las obras se hunden en el suelo.
- **Globos:** cortos, una línea cada uno: «Trabajador 2 · título corto» y su estado (o lo último que dijo).
  - **Si se tocan en pantalla**, los de los trabajadores pasan a una píldora de una línea («2 · Ruta de contacto ✓»; `!` si hay que revisar, `?` si espera tu permiso).
  - El globo de Qubi no cambia y queda encima.
  - El globo que choca sube hasta quedar libre.
  - Una píldora vuelve a abrirse cuando lleva medio segundo sin tocar a nadie.

Si la persona prefiere menos movimiento (`prefers-reduced-motion`), todo pasa sin animación.

Prioridad del robot: recorrido > construcción > equipo > llamada > bienvenida > compañero.

Conexión (`renderer/main.js`):
- `createRobotView({ …, callViewModel, startCall })` y `createWelcomeRobotView({ …, callViewModel })`. `startCall` es opcional; por defecto es `callViewModel.start()`.
- De la llamada se usan `store` (`status`, `mode`, `simulated` y `guide`), `levels()` y `start()`.
- `createRobotView` devuelve:
  - `head()`: el punto del mundo sobre la cabeza de Qubi, para el panel de la llamada; `null` si no está en el mapa o si el recorrido lo tiene;
  - `bubble()`: el globo de Qubi mientras se ve, o `null`.

Equipo:
- `createRobotView({ …, teamViewModel })` devuelve también `qubi()`: dónde está Qubi o, si camina, a dónde va (`guideRobot.destination`). `qubi.bubble` es su globo.
- `createTeamView({ sceneView, labels, teamViewModel, origin: robotView.qubi, cameraViewModel, qubiBubble? })` dibuja a los trabajadores. `qubiBubble` es opcional; por defecto es `origin.bubble`. Devuelve `{ pointer, dispose() }`.
- Del equipo solo se usa `store` (`phase`, `workers`, `guide`, `drops`). Cada `worker.place` trae `spot`: dónde se para ese trabajador.

Selección (`inputController`):
- `grabber()` puede devolver un robot o una lista, en orden: `[robotView.grabber, teamView.pointer]`.
- Los robots se prueban antes que el mapa, con un radio generoso en pantalla (`guideRobot.screenDistance`).
- Mientras el cursor está sobre un robot, la carpeta de atrás no muestra su tarjeta y un clic no la elige.
- Un robot sin `start` (los trabajadores) solo se señala: arrastrar ahí sigue moviendo el mapa.

`createGuideRobot` acepta:
- `scale`: Qubi 1,25; trabajadores 0,55;
- `accent`: color propio, en copias de sus materiales;
- `pop: false`: quien lo usa anima el tamaño con `grow(k)`.

También tiene:
- `mood({ worried })` y `dispose()`;
- `liveFace({ on, speaking })`: la cara durante la llamada;
- `compact(texto)`: el globo como píldora de una línea; `null` lo devuelve a su texto;
- `screenDistance(x, y)`: qué tan lejos está el cursor del robot en pantalla, para elegirlo;
- `top`: el punto sobre su cabeza;
- `moveTo(…, { arc, tumble: false })`: un salto suave por encima de las carpetas, sin dar vueltas.

## Archivos

| Pieza | Archivo |
|---|---|
| Dónde está, agarrar, soltar o lanzar, dónde cae (puro, con pruebas) | `renderer/viewmodels/robotViewModel.js` |
| El robot en 3D: poses (también `talk` y `listen` con `speak(nivel)`, y `scan`), vuelo en arco, globo con orbe | `renderer/views/scene/guideRobot.js`, `robotView.js` |
| Los trabajadores del equipo, sus hojas, sus obras y sus globos (píldora y orden en pantalla) | `renderer/views/scene/teamView.js` (`lookOf`, `pillOf`, `standsFor` y `clip` son puros) |
| Dónde se para cada robot y cómo se acomodan los globos (puro, con pruebas) | `renderer/viewmodels/teamViewModel.js`: `workerSpots`, `auditSpot`, `clearOfFolders`, `foldersOf` y `stackBubbles` |
| El arrastre sobre el mapa (el robot en vez del mapa) y los robots antes que las carpetas | `renderer/views/scene/inputController.js` (`grabber`) |
| Lo que dice en el chat (tarjeta `place`) | `chatViewModel.js` (evento `robot:landed`), `placeCard` en `chatCardsView.js`, `strings.robot` en `es.js` |
| Escribir en el cuadro | `actions.draft` en `renderer/main.js` |
| Construyendo en vivo (cola, obras, robot) | `renderer/viewmodels/buildViewModel.js`, `views/scene/buildSiteView.js` |

Pruebas: `tests/renderer/robotViewModel.test.mjs`, `chatViewModel.test.mjs`, `teamViewModel.test.mjs` (lugares y globos) y `teamView.test.mjs`.
