# Robot guía de proyectos nuevos

Cuando alguien crea un proyecto nuevo y vacío, un robot aparece en la plaza del mapa y lo acompaña: primero le pregunta por su idea (nunca por tecnología), le recomienda con qué construirla en palabras simples, le pasa el pedido al agente y después sigue dando consejos mientras el proyecto crece. Está pensado para personas que no saben programar: que se sientan cómodas y capaces.

## Cómo se usa

### 1. Entrevista (3 pasos)

1. **¿Qué te gustaría crear?** Vender algo, una página para mostrar algo, algo para organizarme, un juego o "tengo una idea, ayúdame". Debajo, una frase tranquiliza: no hay respuestas incorrectas.
2. **Una pregunta cotidiana sobre la idea**, con un título que celebra la respuesta anterior (por ejemplo: "¿Cómo te imaginas que la gente te compre?" → WhatsApp o tarjeta).
3. **La recomendación:** el nombre en palabras simples, tres beneficios con ✓ y la tecnología real en letra pequeña ("Por dentro usa `Next.js + Stripe`"). Botones:
   - **✨ ¡Me encanta, empecemos!** El agente crea lo mínimo (con README y `.gitignore`) y explica sin jerga qué hizo y cómo verlo funcionando.
   - **🤔 ¿Qué significa eso?** El robot lo explica con una analogía ("Phaser es como una caja de LEGO para juegos").
   - **💬 Prefiero conversarlo primero.** El agente hace hasta 3 preguntas simples, una a la vez.
   - **Lo exploro yo.** El globo se minimiza.

| Idea | Recomendación | Por dentro |
|---|---|---|
| Vender por WhatsApp | Tienda-catálogo | HTML + CSS + enlace a WhatsApp |
| Vender con tarjeta | Tienda online con pagos | Next.js + Stripe |
| Página informativa | Página web sencilla | HTML + CSS |
| Cuentas para varias personas | App web con cuentas | Next.js + Supabase |
| Solo para mí | App personal en el navegador | React + Vite |
| Juego de saltar | Juego 2D en el navegador | Phaser |
| Juego de preguntas | Juego de preguntas | HTML + CSS + JavaScript |

**Deshacer:** el botón **Atrás** (en la cabecera del globo) quita la última respuesta, y cada respuesta anterior aparece como un chip que se puede tocar para volver a esa pregunta. Después de "¡Me encanta, empecemos!", mientras todavía no hay archivos, **↩️ Cambiar mis respuestas** vuelve a la recomendación.

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
- El borde tiene un brillo que gira con el color del tono: morado (preguntas y consejos), verde (logros), ámbar o rojo **solo para riesgos**, como pide la guía visual.
- El robot salta con cada mensaje, mueve la cabeza diciendo "no" ante un riesgo y su antena parpadea mientras "habla".
- **Minimizar** lo deja como una pastilla "Guía" que late cuando llega un consejo nuevo. **×** cierra la guía.
- Con "reducir movimiento" activado en el sistema, todo aparece sin animaciones.

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

- `renderer/viewmodels/robotDialogViewModel.js`: las dos fases (entrevista y guía), la recomendación, los consejos y deshacer. No toca el DOM.
- `renderer/views/scene/builders/robotBuilder.js`: la forma del robot (y `setFace` para su expresión). Sus materiales (`robotShell`, `robotTrim`, `robotFace`, `robotGlow`, `glowLines.accent`) están en `renderer/views/scene/materials.js`.
- `renderer/views/scene/welcomeRobotView.js`: la animación del robot, el globo, la escritura animada y la pastilla. Se aparta mientras corre el recorrido o una construcción (el robot de `robotView.js` usa el mapa), y ese otro robot se aparta mientras el diálogo de bienvenida está abierto: nunca hay dos robots a la vez. Estilos en el bloque "Welcome robot" de `renderer/styles/main.css` (clases `rb-*`).
- `renderer/i18n/es.js` → `map.welcome`: preguntas, recomendaciones (`stacks`), analogías, consejos (`tips`) y los pedidos al agente (`scaffoldPrompt`, `talkPrompt`). **Para cambiar lo que dice el robot o qué recomienda, se edita solo este archivo.**
- `renderer/main.js`: acciones `openChat`, `askAgent` (con el pedido en espera) y `saveProgress`.
- `renderer/models/agentModel.js`: `isGitCommand`.
- `electron/agents.js` (`which`, `proxyEnvFor`, rutas absolutas), `electron/main.js` (proxy por ejecución, `gitInit` al crear un proyecto), `electron/git.js` (`gitInit`), `electron/agentVoice.js` (CRLF).

## Pruebas

- `tests/renderer/robotDialogViewModel.test.mjs`: entrevista, recomendación, analogía, deshacer, guía, riesgos, guardar avance.
- `tests/renderer/agentModel.test.mjs`: qué va a git y qué va al agente (incluye que los pedidos del robot nunca se confundan con git).
- `electron/agents.test.js`: proxy del sistema. `electron/git.test.js`: `gitInit`.

`npm test`. Para probarlo a mano: `npm start` → **Proyecto → Nuevo**, elige un agente en el panel y sigue al robot. Para ver un aviso de riesgo, pide "agrega un `.env.example` con variables vacías".
