# Interfaz de Platanus

Guía de cómo está armada la interfaz y dónde vive cada cosa en el código. Para arrancar la app, ver el
[README](../README.md); para las reglas del código (MVVM, textos, git flow), ver [CLAUDE.md](../CLAUDE.md).

## La pantalla

El **mapa ocupa toda la ventana**. Todo lo demás flota encima y se puede plegar, mover o fijar.

| Pieza | Dónde está | Qué hace |
|---|---|---|
| Barra de íconos | Arriba, centrada en el mapa (no se mueve al abrir el panel o el chat) | Paneles (Explorador, Riesgos, Reparaciones, Conecta tu agente) y vistas (Mapa, Git). Solo íconos: el nombre y la descripción salen al pasar el mouse. **Se ordena arrastrando** (o Alt+← / Alt+→) y el orden se recuerda. |
| Botón del panel | Arriba a la izquierda del mapa | Abre o cierra el panel lateral del ícono marcado. |
| Ruta | Al lado del botón del panel | El proyecto y la carpeta abierta (`team-12 / src`; tocar el proyecto o Esc la cierra) y sus archivos por semáforo: en riesgo, por revisar, seguros. |
| Panel lateral | Flota a la izquierda | Explorador (Vibe: guía con nombres sencillos; Dev: árbol completo con búsqueda), Riesgos (la única lista de riesgos), Reparaciones (historial de Remi y del agente), Conecta tu agente. Queda fijo junto al dock; el "–" de su encabezado lo cierra, como el del chat. |
| Chat | Fijo abajo a la derecha (no se arrastra) | **Pin** 📌: lo fija como columna y el mapa le deja su espacio. **Borde izquierdo**: cambia el ancho (300–720 px, doble clic lo resetea). Minimizado o cerrado, queda el botón flotante del agente (abajo a la derecha) con su menú. |
| Tarjeta de seguridad | Fija arriba a la izquierda del mapa, en una fila compacta (reemplaza al antiguo semáforo) | Puntaje, archivos, en riesgo, por revisar, commits. Sus números de riesgo abren la lista de Riesgos. No se mueve ni se minimiza. |
| Menú de arriba (macOS) | Barra del sistema | Solo Platanus, Edición y Ventana: los menús de la app (Archivo, Ver, Agente…) están dentro de la ventana. |

Cada cosa aparece **una sola vez**: la lista de riesgos está en el panel, los totales en la tarjeta de
seguridad y la ruta solo cuenta la carpeta actual.

## El chat y los agentes

- **Quién responde:** el agente de demostración (sin IA) o tu suscripción de Claude Code, Grok o Codex.
  Se elige en el selector de abajo del chat ("● Opus 5.5 · Rápido ⌄") o en **Conecta tu agente**.
- **Modelos:** verificados contra cada CLI instalada (Claude: Fable 5.1, Opus 5.5, Sonnet 5.5, Haiku 5.5;
  Grok 4.7 / 4.7 Fast / 4.6; Codex GPT-6.1 Sol / 6 Sol / 6 Luna). **Cuánto piensa** es una barra: de
  Rápido a Máximo (más esfuerzo, más tiempo y más gasto del plan).
- **Respuestas en vivo:** cada respuesta es una tarjeta del agente.
  - En **Vibe** cuenta lo que hace con frases simples: arriba qué está haciendo ahora ("Leyendo
    `login.js`…"), luego cada paso ("Leí `login.js`", "Marqué `db.js` en rojo" con su punto de color;
    al tocar el nombre se abre el archivo en el chat) y, al terminar, la lista se pliega en un resumen ("Leí 3 archivos · 1 en
    rojo") y dice cuánto tardó. Sin modelo, razonamiento ni tokens (`renderer/models/runStory.js`).
  - En **Dev** muestra el modelo, un cronómetro, los pasos técnicos (herramientas de Platanus con el
    archivo que tocan; subagentes con sus pasos anidados), el razonamiento plegado y al final tiempo,
    turnos y tokens. Cambiar de modo redibuja las tarjetas que ya están.
- **Comparar respuestas:** la misma pregunta a dos agentes a la vez (selector del chat o el panel).
- **Botón "+":** nueva conversación, reparar lo más grave, historial, conectar
  tu agente o tu editor (MCP), Vibe/Dev.
- **Cómo te habla (Vibe / Dev):** el interruptor del chat (💬 / `</>`, junto al selector; al pasar el mouse dice qué hace cada uno) o el de arriba
  a la derecha. **Vibe**: palabras simples, comparaciones de la vida diaria, sin código. **Dev**: rutas,
  causa técnica y fragmentos cortos. El agente además **se adapta a cómo escribes**: si escribes corto
  responde corto, si usas términos técnicos los nombra, si dices "no entiendo" lo explica más simple.
  Todo eso se configura en `agent/` (ver abajo), no en el código.
- **Mejorar mi mensaje (lápiz con chispas, junto al "+"):** ordena lo que escribiste como una
  especificación con la prueba primero, con la forma de los documentos ODD de gentle-shell:
  - Vibe usa "Qué quiero", "Por qué", "Dónde", "Qué no tocar", "Pasos" (T1, T2… con "Listo cuando")
    y "Primero la prueba".
  - Dev usa "Objetivo", "Alcance", "Restricciones", "Tareas" y "TDD" (RED → GREEN → REFACTOR).
  - La escribe tu agente con su propia sesión, sin tocar la conversación (`agent/voice.json` → `refine`).
    Sin agente se arma en la app.
  - "Deshacer" devuelve tu texto.
  - Al enviarla, el chat la muestra con formato y el agente trabaja tarea por tarea.
  - Archivos: `renderer/models/promptSpec.js` y `renderer/viewmodels/composerViewModel.js`.
- **Ayuda mientras escribes:**
  - Escribe `@` o el comienzo de un nombre para ver los archivos del proyecto. Se elige con ↑ ↓ y
    Tab/Enter, y Esc cierra la lista.
  - Avisos: "Cuéntame un poco más", "¿Te refieres a login.js?" (al tocarlo lo agrega) y "Parece una
    clave: no la pegues aquí".
  - Los archivos con secretos nunca se ofrecen (`renderer/models/promptAssist.js`).
- **Permisos del agente (menú del agente, debajo de "Quién responde"):**
  - **Manual:** pregunta antes de cada cambio.
  - **Auto:** guarda solo los cambios simples. Sigue preguntando por dependencias, publicación/CI,
    migraciones, scripts o borrar más de la mitad de un archivo.
  - **Sin preguntar:** guarda todo. Pide confirmación al activarlo y vuelve a Manual al abrir la app.
  - En los tres modos se guarda copia para deshacer y las claves se bloquean siempre.
  - Si no está en Manual, la barra de abajo dice "Cambios: Auto" o "Cambios: Sin preguntar".
  - Reglas en `electron/approval.js`.
- **Respuestas interactivas:** el agente arma su respuesta con **tarjetas** (⚠ riesgo, ✓ está bien,
  💡 idea, ☑ tu siguiente paso, ⓘ nota). Al final propone **próximos pasos** como botones: preguntas,
  "Reparar x", "Auditar x", "Ver x en el mapa" y "Abrir x".
- **Abrir archivos desde el chat:** tocar un nombre de archivo (o "Abrir x") abre su tarjeta en el chat,
  y una carpeta va al mapa.
  - La tarjeta muestra las primeras 30 líneas numeradas y su semáforo. "Sin evaluar" significa que
    nadie lo revisó; antes la regla de ejemplo decía "Seguro".
  - Botones:
    - **Abrir en el navegador**, solo para páginas, imágenes y PDF: nunca ejecuta un script o un programa.
    - **Mostrar en la carpeta**.
    - **Ver en el mapa**, solo si está en rojo o amarillo, porque el radar oculta lo demás.
    - **¿Qué es este archivo?** y **Revisar este archivo**.
  - Los archivos con claves nunca se muestran ni se abren.
  - Los archivos que cambian en disco llegan como una tarjeta con "Abrir x" por archivo.
  - Archivos: `renderer/models/fileOpen.js`, `electron/fileOpen.js` y `fs:open` / `fs:kind` en
    `electron/main.js`.
- **Mapa → chat como tarjetas:** abrir una carpeta muestra su semáforo como barra (rojo/amarillo/verde)
  con "Ver los riesgos", "Reparar lo más grave" y "Explícame esta carpeta"; tocar un archivo muestra su
  nivel, el motivo y "¿Qué es este archivo?", "Reparar con Remi", "Auditar en el chat".
- **Mientras trabaja** (efectos de [libraries.dev](https://libraries.dev)):
  - **Orbe:** aparece desde el primer momento, en lugar de los tres puntos, en el avatar, en
    "Pensando…" y en cada paso del agente o de Remi ("Leyendo un archivo…"). Su forma dice qué hace:
    buscar, leer, escribir o coordinar ayudantes.
  - Hay un solo orbe por actividad: el paso en curso. Si no hay ninguno, lo lleva la cabecera de la
    tarjeta, la fila "Pensando…" o el avatar. Los pasos anteriores quedan con su ícono y un check.
  - Los nueve estados de la librería tienen su tarea en Platanus (`STEP_ORB`):

    | Estado | Tarea |
    |---|---|
    | `breathing` | pensar |
    | `searching` | mirar el proyecto, revisar riesgos, buscar en el mapa |
    | `working` | leer un archivo |
    | `composing` | guardar un arreglo, escribir la respuesta |
    | `solving` | semáforo y reparación |
    | `weaving` | ayudantes |
    | `connecting` | probar un agente |
    | `shaping` | "Mejorar mi mensaje" |
    | `listening` | esperar tu aprobación para guardar un cambio |

  - Mientras trabaja, la tarjeta muestra una **píldora** con el orbe vivo y lo que hace ("Leyendo
    vercel.json…"), como en libraries.dev. El avatar de la tarjeta es el orbe quieto.
  - Los orbes que quedan fuera de la vista no se dibujan, y con "reducir movimiento" quedan quietos
    (`views/ui/thinkingOrb.js`).
  - **Luz en el borde:** si tarda más de 3 s, recorre el borde de la caja de texto por dentro. El margen
    de la caja está en su contenedor, así que el recuadro de la luz mide lo mismo que la caja.
  - **Metal líquido** (metal-fx): en el botón de enviar, con reflejo en el selector de modelo. Sin
    WebGL2 queda el botón normal.
  - Con "reducir movimiento" del sistema, los efectos quedan quietos.
- **Diseño del chat:** vidrio claro con refracción ("liquid glass") y la paleta y tipografía de
  libraries.dev (`renderer/styles/chat-glass.css`, cargada después de `chat.css`).
  - El panel desenfoca, satura y dobla un poco la luz de lo que tiene detrás, con el filtro SVG
    `#liquid-glass` de `index.html` (Chromium lo acepta en `backdrop-filter`). Lleva un borde con
    reflejo arriba y una sombra suave.
  - Las tarjetas, las píldoras y la caja de texto son capas de vidrio más claras dentro del panel.
  - Paleta de libraries.dev en oscuro: texto blanco, gris para lo secundario, píldoras neutras y
    código sin color. El color queda solo para los efectos y el semáforo.
  - Letra **Inter**, y **Roboto Mono** para el código. Las sirve la propia app (`renderer/vendor/fonts`,
    copiadas por `npm run vendor`; licencia OFL).
  - Si el sistema pide "reducir transparencia", el panel queda sólido.
  - Las tarjetas del agente dicen **"Agente"**. Su avatar es el **orbe**: animado mientras trabaja,
    quieto al terminar. En Dev, la línea de abajo dice el agente, el modelo y el esfuerzo. Al comparar
    agentes, cada tarjeta muestra su nombre.
- **Cambios en vivo:** cuando el agente guarda un archivo, su paso muestra la diferencia línea por línea,
  con lo agregado en verde, lo quitado en rojo y los números de línea (`electron/lineDiff.js`).
  - Mientras espera tu aprobación (modo Manual) muestra el **cambio propuesto**, así ves qué apruebas.
    Al guardarse muestra el **cambio aplicado**, y si lo rechazas, "No aprobado".
  - En Dev viene abierto. En Vibe va plegado ("Ver lo que cambió · 2 líneas nuevas · 1 quitada").
  - Funciona igual en las reparaciones de Remi.
- **Encabezado del chat:** el logo y el nombre del agente conectado, y cómo está conectado ("Con tu
  suscripción" o "Con clave de API ··1234"). El modelo y el esfuerzo están en el botón de la caja de texto.
- **Menú del agente** (botón de la caja de texto: logo, modelo y barras de esfuerzo):
  - **Agente:** Claude, ChatGPT · Codex y Grok, cada uno con su logo y cómo está conectado; un check
    marca el que responde. Uno sin conectar tiene **"Conectar"**, que permite iniciar sesión con tu cuenta
    o **pegar una clave de API**.
  - **Permisos:** Manual, Auto o Sin preguntar.
  - **Más opciones**, plegado: modelo, cuánto piensa y comparar respuestas.
  - La primera vez, la app elige sola el mejor agente conectado (Claude, ChatGPT · Codex, Grok).
- **Más agentes** (investigados en la documentación oficial y el código fuente de cada uno, y verificados):
  - **OpenCode** responde dentro del chat, encerrado en las herramientas de Platanus (`electron/opencode.js`):
    - Lleva su propia configuración, con un agente `platanus` que niega todo salvo `platanus_*`, y
      apaga los agentes de OpenCode.
    - Corre en un entorno sin variables `OPENCODE_*` heredadas, con la configuración global aislada y
      con `--pure`.
    - Si OpenCode intenta usar su agente por defecto, se detiene.
    - Comprobado con `opencode debug agent platanus`: todas sus herramientas propias quedan apagadas.
    - Usa los proveedores en los que OpenCode tenga sesión, o las claves guardadas aquí.
  - **Cursor, Gemini y Qwen** no permiten quitarles su terminal ni el acceso a archivos, así que no se
    ejecutan dentro del chat. Aparecen en **"Otros agentes"** con la configuración MCP lista para copiar
    y su comando de instalación (`renderer/models/mcpSnippets.js`).
  - **Kimi** también aparece en "Otros agentes". Kimi Code tiene una lista de herramientas permitidas
    que lo haría seguro dentro del chat, pero hay que comprobarlo con el programa instalado antes de
    activarlo.
- **Claves de API** (`electron/keyStore.js`):
  - Se guardan cifradas con el llavero del sistema, en `~/.platanus/keys.json` (permisos 600).
  - Nunca vuelven a la ventana: solo se ve que existe y sus últimos 4 caracteres.
  - El programa de cada IA las recibe como variable de entorno solo en esa ejecución:
    `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` o `XAI_API_KEY`.
  - Una clave con formato equivocado no se guarda, y si el sistema no puede cifrar, tampoco.

- **Una reparación = una tarjeta:** Remi y el agente, con lo que hacen ahora ("Leí secrets.test.mjs",
  "Marqué secrets.test.mjs en verde"), la explicación del agente y el resultado al pie.
  - Al terminar, los pasos se pliegan en un resumen ("Leí 1 archivo · 1 en verde").
  - Mientras dura, el mapa no publica tarjetas de carpeta o archivo, aunque Remi lo mueva.
  - Una pregunta que espera a que el agente termine otra cosa dice "Esperando turno…" con un orbe lento.
  - El texto que el agente escribe después de usar una herramienta empieza un párrafo nuevo.
- **Conecta tu agente:** tarjetas por agente (sesión, versión, uso, último error, Usar / Entrar / Probar),
  el servidor MCP local con sus herramientas y su actividad en vivo, y los textos para Claude Code,
  Cursor, Codex y Gemini. La dirección del servidor lleva una llave privada: en pantalla sale tapada y
  "Copiar" la incluye.

## El robot del mapa

Arrástralo o lánzalo a una carpeta: vuela hasta ella y pregunta si te explica qué hay o si quieres cambiar algo. Mientras el agente trabaja, su globo muestra el mismo orbe que el chat. Detalle: `docs/features/robot/README.md`.

Los agentes se muestran con sus logos reales (`renderer/icons/brands.js`, de `@lobehub/icons-static-svg`, MIT; `npm run icons`).

## Recorrido del proyecto

Para quien llega a un proyecto que no conoce: «Recorrido del proyecto» (chip al abrir un proyecto, o «+» → Recorrido).
- El robot guía camina por el mapa, parada por parada: cómo está armado, la documentación, las partes, dónde arranca, las pruebas, un caso de uso y por dónde empezar.
- El chat lleva una sola tarjeta con Anterior / Siguiente / Salir.
- Los hechos los decide un analizador fijo; el agente solo los narra, en modo de solo lectura.

Detalle: `docs/features/recorrido/README.md`. Grabación para el video del producto: `scripts/demo/README.md` y `video/README.md`.

## La voz del agente (`agent/`)

| Archivo | Para qué |
|---|---|
| `agent/voice.json` | Reglas base, el formato de respuesta (tarjetas, enlaces, bloque de sugerencias), largo máximo por modo y las pistas para adaptarse a cómo escribe la persona. |
| `agent/skills/modo-vibe/SKILL.md` | Cómo hablar a quien no programa (con ejemplo). |
| `agent/skills/modo-dev/SKILL.md` | Cómo hablar a quien programa. |
| `electron/agentVoice.js` | Arma el prompt en cada respuesta (no hace falta reiniciar para probar cambios). Probado en `agentVoice.test.js`. |

Las palabras de la persona nunca se copian al prompt: solo se usan para elegir pistas del JSON.

## Reparaciones (Remi)

"Reparar" (en Riesgos, en el chat o "Reparar lo más grave") hace que Remi salte al mapa y camine a la
carpeta. Si hay un agente conectado, el agente lee el archivo y puede proponer un arreglo con
`platanus_write_file`: **cada cambio pide permiso en un cuadro de diálogo** y guarda una copia para
deshacerlo. El chat explica qué encontró, qué cambió y qué falta. Sin agente, Remi deja un plan.
Cada trabajo queda en **Reparaciones** con su estado: trabajando, plan listo, por verificar, verificado,
falló. Desde ahí se marca como verificado, se deshace un cambio o se reintenta.

## Dónde vive cada cosa (renderer)

| Archivo | Para qué |
|---|---|
| `views/ui/shellView.js` | Menús, barra de íconos (contenido y descripciones), panel lateral (explorador, riesgos, reparaciones), barra de estado. |
| `views/ui/iconBarView.js` | Ordenar los íconos arrastrando o con Alt+flechas; recuerda el orden. |
| `views/ui/draggable.js` | Arrastrar el editor de archivos por su encabezado. |
| `views/ui/chatDockView.js` | Pin del chat (columna a la derecha + zona de información arriba) y su ancho. |
| `views/ui/chatView.js`, `runCardView.js`, `markdown.js` | Mensajes, tarjetas de respuesta en vivo, Markdown seguro (escapa todo antes) con tarjetas y enlaces a archivos, interruptor Vibe/Dev. |
| `views/ui/chatCardsView.js` | Tarjetas de carpeta y archivo en el chat, botones de acción. |
| `icons/iconNames.js`, `views/icons.js` | Íconos [Hugeicons](https://hugeicons.com) (gratis, MIT): se nombran en `iconNames.js` y `npm run icons` copia solo esos. `views/ui/icons.js` los da como elementos para el chat. |
| `views/ui/thinkingOrb.js` | Orbes de libraries.dev con el motor del paquete (sin React). |
| `vendor/react-ui.js` | Generado por `scripts/vendor-ui.js` (border-beam y metal-fx con un solo React). Se sube a git para que la app no dependa de las librerías de desarrollo. |
| `models/answerFormat.js` | Lee el bloque de sugerencias de la respuesta (preguntas, reparar, auditar, ver). |
| `views/ui/agentPickerView.js`, `effortSlider.js`, `chatMenuView.js` | Selector de agente/modelo/esfuerzo/comparar, barra de esfuerzo, menú "+" y del botón flotante. |
| `views/ui/agentConnectView.js` | Panel "Conecta tu agente". |
| `views/ui/devTreeView.js` | Explorador en modo Dev (búsqueda, filtros, teclado). |
| `views/ui/repairPanelView.js`, `remiJump.js`, `views/scene/remiView.js` | Remi: tarjeta, salto por la interfaz y personaje 3D en el mapa. |
| `views/ui/hudView.js`, `panelsView.js` | Tarjeta de seguridad, ruta, esquema de Supabase y resumen de Git. |
| `models/agentConnectionModel.js` | Qué agente, modelo y esfuerzo; una pregunta a la vez por agente; estadísticas; actividad MCP. |
| `viewmodels/chatViewModel.js` | Conversación, tarjetas de respuesta (pasos, subagentes, resultado), sugerencias. |
| `viewmodels/repairViewModel.js`, `models/repairHistoryModel.js` | Trabajo de Remi y su historial. |
| `electron/agentEvents.js` | Traduce la salida de cada CLI (Claude/Grok/Codex) a eventos del chat. Probado aparte. |

Estilos: `styles/main.css` (mapa y escena), `shell.css` (la interfaz de vidrio, al final están las
capas flotantes, pin y barra de íconos), `sidebar.css` (animaciones del panel), `devtree.css`, `agents.css`,
`chat.css` (tarjetas, chips, orbes, borde de luz, interruptor Vibe/Dev).

## Lo que se recuerda (en esta computadora)

Se guarda en `localStorage` de la ventana; Electron guarda la carpeta de datos en
`~/Library/Application Support/platanus-ide` (macOS). Cerrar la app normalmente (o con una señal del
sistema) asegura que se escriba.

| Clave | Qué guarda |
|---|---|
| `platanus.agent.choice.v1` / `platanus.agent.stats.v1` | Agente, modelo y esfuerzo elegidos / uso por agente. |
| `platanus.mode.v1` | Vibe o Dev. |
| `platanus.repairs.v1:<proyecto>` | Historial de reparaciones de cada proyecto. |
| `platanus.iconbar.order.v1` | Orden de la barra de íconos. |
| `platanus.drag.v1:editor` | Posición del editor de archivos movido a mano. |
| `platanus.chat.dock.v1` | Chat fijado y su ancho. |

En la carpeta de datos de Electron: `recent.json` (proyectos recientes) y `mcp-token` (llave del servidor
MCP, solo legible por tu usuario). Las copias de los cambios del agente van a `~/.platanus/backups/`.

## Puntaje de seguridad (anillo del mapa)

- Parte de 100 y resta 15 por cada archivo en rojo y 5 por cada uno en amarillo, sin bajar de 0
  (`securityScore` en `renderer/models/securityModel.js`). Así cada reparación se nota en el número;
  antes era "archivos en verde ÷ total" y en un proyecto grande casi no se movía.
- El color del anillo y del número es el peor semáforo abierto: rojo, amarillo o verde.
- Reparaciones: si el agente revisa un archivo, no cambia nada y lo marca en verde, es una **falsa
  alarma**. Queda en verde con el estado "Falsa alarma", en lugar de quedar en amarillo como un plan
  pendiente.

## Seguridad (resumen)

- El agente solo actúa con las herramientas de Platanus (MCP local); Claude con `--tools ""`, Grok y Codex
  sin terminal ni edición propia. No aflojar esas opciones.
- Secretos (`.env*`, llaves, `.git/`, `.ssh/`, `.npmrc`, `credentials.json`…) nunca se leen ni se
  escriben, tampoco a través de enlaces simbólicos.
- El servidor MCP escucha solo en 127.0.0.1, rechaza navegadores y exige su llave privada.
- `npm test` revisa cada archivo del repo y falla si alguien intenta subir una credencial.
