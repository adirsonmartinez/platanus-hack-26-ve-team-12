# Recorrido del proyecto

Alguien llega a un proyecto que no conoce (por ejemplo, el primer día en una empresa nueva), lo abre en Platanus y pide un **recorrido**. Platanus le muestra cómo está armado y le dice **por dónde empezar**, paso a paso, en el mapa y en el chat.

## Cómo se usa

1. Abre un proyecto. En el chat aparece «Recorrido del proyecto» (también en el menú «+» como «Recorrido»).
2. El robot guía camina hasta cada parada y la cámara lo sigue. El chat muestra una sola tarjeta con «Paso n de N», lo que es esa parte y los botones Anterior, Siguiente y Salir.
3. Las paradas, siempre en este orden:
   - **Así está armado**: una sola aplicación, un monorepo (varias partes en un mismo lugar), varios servicios o una librería.
   - **La documentación**: el README y una guía, si la hay.
   - **Las partes**: hasta 3 (lo que ve la gente, la lógica, los datos o el servidor).
   - **Dónde arranca todo**: el archivo de entrada.
   - **Las pruebas**.
   - **Un caso de uso**: por qué archivos pasa, que se pueden abrir desde la tarjeta.
   - **Por dónde empezar**: abrir el README, ver una carpeta o hacer una pregunta.
4. Las carpetas sin problemas no son edificios en el mapa, porque el mapa es un radar de seguridad. Mientras dura el recorrido aparecen como placas «fantasma» plateadas, con borde punteado y la etiqueta «Sin problemas». No brillan, no se pueden pulsar y se van al terminar.

## Quién decide qué (el LLM propone, el plano decide)

- **El analizador decide** (`renderer/models/projectAnalyzer.js`). Es puro y siempre da el mismo resultado:
  - lee el árbol de archivos y hasta 12 archivos chicos (manifiestos, README, documentación), nunca secretos;
  - de ahí saca los hechos: arquitectura con su evidencia, stack, partes, documentación, entradas, pruebas, infraestructura y casos de uso posibles;
  - con esos hechos arma las paradas (`planSteps`, máximo 8).
- **El agente solo narra** (`agent/voice.json → tour`, sesión `tour`):
  - recibe los hechos (sin el contenido de los archivos) y devuelve un JSON con los textos;
  - `renderer/models/tourSpec.js` solo acepta ids de paradas que existen y rutas reales que no son secretos;
  - limpia el texto: sin HTML, Markdown ni enlaces, y recortado;
  - nunca cambia la arquitectura, las paradas ni su orden.
- **Sin agente** (o si responde mal, tarde o intenta cambiar algo) el recorrido usa el guion de `strings.tour.script`, en Vibe o Dev. El guion empieza a sonar enseguida y los textos del agente reemplazan las paradas cuando llegan.

## Seguridad

- El recorrido solo lee. Su agente recibe la dirección MCP de solo lectura (`/mcp/<token>/ro`), que solo ofrece `get_project`, `list_risks` y `read_file`. Las demás herramientas se rechazan y quedan en el registro de auditoría.
- Segunda guardia en la ventana: si el agente intenta `write_file` o `set_file_score`, se corta y se usa el guion.
- Las instrucciones que traiga un archivo del proyecto son datos, no órdenes (lo dice el prompt). Además, el agente no recibe el contenido de los archivos en el prompt, y los textos que devuelve se validan y se muestran como texto plano.

## Archivos

| Pieza | Archivo |
|---|---|
| Hechos y paradas | `renderer/models/projectAnalyzer.js` |
| Guion, validación del agente, mezcla | `renderer/models/tourSpec.js` |
| Dónde queda cada parada (plaza, edificio o fantasma) | `renderer/viewmodels/tourPlaces.js`, `ghostSlots` en `layout.js` |
| Estado y acciones (empezar, siguiente, salir, narración) | `renderer/viewmodels/tourViewModel.js` |
| Robot guía (API: mover, girar, poses, globo) | `renderer/views/scene/guideRobot.js`, `robotView.js` |
| Placas fantasma y anillo | `renderer/views/scene/tourView.js` |
| Tarjeta del chat | `renderer/views/ui/tourCardView.js`, `chatViewModel.js` (eventos `tour:*`) |
| Prompt del agente | `agent/voice.json → tour`, `composeTourPrompt` en `electron/agentVoice.js` |
| MCP de solo lectura | `electron/mcpServer.js` (`readOnly`), `electron/main.js` (sesión `tour`) |
| Textos | `renderer/i18n/es.js → tour` |

Pruebas: `projectAnalyzer`, `tourSpec`, `tourPlaces`, `tourViewModel`, `chatViewModel` y `chatMenu` en `tests/renderer/`, más `electron/mcpServer.test.js`, `electron/agentVoice.test.js` y `scripts/sim/fakeAgent.test.js` (el escenario del proyecto de ejemplo).

## Probarlo

- Sin agente: `npm start`, abrir `scripts/demo/sample-project` y pulsar «Recorrido del proyecto».
- Con el simulador: `PLATANUS_SIM=1 npx electron . --open=scripts/demo/sample-project`, elegir «Simulador» y pedir el recorrido. Lo narra el escenario `tour` de `scripts/sim/scenarios.js`.
