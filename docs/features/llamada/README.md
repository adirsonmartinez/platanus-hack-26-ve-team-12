# Llamada con Qubi (ElevenLabs) — fase 1

> **Actualizado el 2026-10-24:** lo que cambió después de la primera prueba está en `MEJORAS.md` y `VOZ.md` («Cómo quedó»). Lo más importante: el panel va encima de Qubi, también hay Grok Voice, y sin servicio de voz la llamada **no** se simula sola (se abre el modal de conexión). Los contratos de main de abajo son los de la fase 1.

La persona pulsa **Llamar a Qubi** y conversa por voz con el robot del mapa. Qubi tiene voz (ElevenLabs Agents) pero **no programa**: cuando la persona pide construir o cambiar algo, Qubi se lo delega al agente que la persona eligió en el chat (Claude Code, Grok, Codex u OpenCode, con su suscripción) a través del chat de siempre. Así todo lo que se construye pasa por las herramientas MCP de Qubbot (permisos, secretos bloqueados, copias, deshacer) y se ve en vivo en el mapa (robot que lleva hojas a las carpetas, `buildViewModel`).

Principio: **la voz conversa, el agente de la persona construye, Qubbot decide.** El agente de voz nunca recibe archivos ni claves; solo resúmenes que arma la app.

Fases: 1) llamada + voz + delegar en un agente (este documento); 2) trabajadores en paralelo con mini robots y auditoría; 3) memoria del proyecto entre llamadas.

## Flujo

1. Botón con icono de teléfono en el encabezado del chat (`#chat-call`, entre `.chat-title` y `#chat-pin`) y en el globo del robot compañero.
2. `callViewModel.start()` → `voiceService.start({ projectName, context, builder })` → IPC `voice:start` (main).
3. Main (`electron/voiceCall.js`): toma la clave `ELEVENLABS_API_KEY` (de `process.env`; en desarrollo `.env.local` se carga al arrancar con `process.loadEnvFile`), se asegura de que exista el agente "Qubi" en la cuenta (lo crea o lo actualiza si cambió su configuración; el id queda en `userData/voice-agent.json`), pide una **URL firmada** (`conversationalAi.conversations.getSignedUrl`) y devuelve `{ ok: true, signedUrl, dynamicVariables }`. **La clave nunca sale de main.**
4. Ventana (`renderer/models/callSession.js`): `Conversation.startSession({ signedUrl, connectionType: 'websocket', dynamicVariables, clientTools, workletPaths })` con el SDK vendorizado en `renderer/vendor/elevenlabs.js` y los worklets copiados en `renderer/vendor/elevenlabs/` (así la CSP no necesita `blob:`).
5. Barra de llamada flotante (abajo al centro del mapa): logo de Qubi, onda de voz, Ajustes, Chat, Micrófono, Colgar (rojo).
6. La transcripción entra **solo** al chat (el panel flotante no la muestra) como **una tarjeta de llamada** que se actualiza en su sitio. Lo que Qubi delega aparece como una tarjeta de trabajo normal (la de siempre, con pasos y cambios) y el robot construye en vivo.
7. **Qubi habla corto:** una o dos frases por turno (sección `# Brevedad` del prompt y saludos cortos en `electron/strings.js` → `voice`). Para cambiar cómo habla, se edita ese archivo.
8. Mientras el agente trabaja, la app le cuenta el avance a la voz (`sendContextualUpdate`) y, cuando termina o necesita permiso, le pide que lo diga (`sendUserMessage` con un aviso marcado `[aviso de Qubbot]`, que la tarjeta no muestra como frase de la persona).

Sin clave, sin red o en la versión web: **llamada simulada** (mismo adaptador, sin audio ni micrófono, guion fijo y texto escrito) para la demo y las pruebas.

## Contratos

### Main — `electron/voiceCall.js` (CommonJS, como el resto de `electron/`)

```js
// Puro: el cuerpo de creación del agente para el SDK (camelCase del SDK @elevenlabs/elevenlabs-js)
agentConfig({ voiceId, llm }) → { name, conversationConfig, platformSettings }
configHash(config) → string            // para saber si hay que actualizar el agente

createVoiceCall({ getKey, file, makeClient }) → {
  status() → { ready: boolean, reason?: 'no-key' },
  start({ projectName, context, builder }) → Promise<
    { ok: true, signedUrl, dynamicVariables: { project_name, project_context, builder_name } }
  | { ok: false, reason: 'no-key' | 'auth' | 'quota' | 'network' | 'failed' }>
}
```

- `getKey()` devuelve la clave o `null` (main: `process.env.ELEVENLABS_API_KEY`).
- `makeClient(key)` → `new ElevenLabsClient({ apiKey: key })` (inyectable para las pruebas).
- `file`: ruta de `voice-agent.json` (`{ agentId, hash }`).
- Si el agente guardado ya no existe (404) se crea de nuevo. 401 → `auth`; 429 o cuota → `quota`; sin red → `network`.
- `dynamicVariables.project_context` se recorta a 2500 caracteres; los textos llegan de la ventana y se limpian (sin saltos de control).

Configuración del agente:
- Nombre `Qubi · Qubbot`; idioma `es`; LLM rápido (`gemini-2.5-flash` por defecto); TTS `eleven_v4_turbo` (o `eleven_flash_v2_5` si la latencia molesta); voz configurable (por defecto una voz multilingüe).
- `platformSettings.auth.enableAuth: true` (agente privado: solo con URL firmada).
- `firstMessage`: `{{greeting}}`. Cada llamada empieza con un saludo distinto: `voiceCall.js` elige uno de `voice.greetings[estilo]` (`electron/strings.js`), sin repetir el de la llamada anterior, y lo manda ya con el nombre del proyecto. El estilo pana tiene 9 saludos venezolanos («¡Épale! ¿Qué más, pana?», «¡Naguará, qué fino que llamaste!», «¿Qué hubo, chamo?»…); neutral, formal y divertido tienen 3 cada uno. El prompt recibe el mismo `{{greeting}}` para que Qubi no lo repita.
- `prompt` en español con secciones `# Personalidad`, `# Entorno`, `# Tono`, `# Objetivo`, `# Herramientas`, `# Reglas`. Usa `{{project_context}}` y `{{builder_name}}`. Frases cortas, sin jerga, una pregunta a la vez; antes de construir confirma en una frase qué va a pedir; nunca inventa archivos; nunca pide ni repite claves; si algo es peligroso, lo dice.
- `builtInTools: { endCall: {} }`.
- Herramientas de cliente (`type: 'client'`, `expectsResponse: true`, `responseTimeoutSecs` 10–15):

| Nombre | Parámetros | Qué hace en la app | Devuelve |
|---|---|---|---|
| `ver_proyecto` | — | Resumen actual: carpetas, archivos, semáforo, riesgos principales | `{ resumen }` |
| `construir` | `pedido` (string, el pedido completo en español) | Envía el pedido al chat como cambio (`chatViewModel.send(pedido, { intent: 'change' })`) sin esperar a que termine. Solo si la persona habló (o escribió) hace menos de 30 s y después del último aviso o avance que la app le pasó a la voz | `{ ok: true, estado: 'empezó', agente }` o `{ ok: false, motivo: 'ocupado' \| 'sin-proyecto' \| 'sin-agente' \| 'sin-confirmar' }` |
| `preguntar` | `pregunta` (string) | Igual, pero de solo lectura (`intent: 'explain'`) | igual |
| `ver_avance` | — | Estado del trabajo delegado: pasos, archivos creados o cambiados, si espera permiso, resumen final (frases que arma la app; la respuesta del agente se queda en el chat) | `{ estado, archivos, esperando, resumen }` |
| `mostrar_carpeta` | `ruta` (string) | Lleva la cámara y al robot a esa carpeta del mapa (solo visual) | `{ ok }` |

IPC (`electron/main.js` + `electron/preload.js`): `voice:status` → `status()`; `voice:start` (payload validado: strings, tamaños máximos) → `start(...)`. Preload: `window.platanus.voice = { status(), start(req) }`.

Permisos: `allowPermission` acepta `media` de audio **solo** para la página propia; en macOS pide `askForMediaAccess('microphone')`. `NSMicrophoneUsageDescription` ya está en `package.json`. La cámara sigue igual.

### Ventana

`renderer/services/voiceService.js`
```js
createVoiceService(bridge = window.platanus?.voice) → {
  available: boolean,              // false en la web
  status() → Promise<{ ready, reason? }>,
  start(req) → Promise<{ ok, signedUrl?, dynamicVariables?, reason? }>
}
```

`renderer/models/callSession.js` — un adaptador igual para la llamada real y la simulada:
```js
openSession({ signedUrl, dynamicVariables, clientTools, on, sdk }) → Promise<Session>
openSimulatedSession({ dynamicVariables, clientTools, on, timing }) → Promise<Session>

Session = {
  end(), setMuted(bool), sendContext(text), notify(text), type(text),
  levels() → { input: 0..1, output: 0..1 },
  simulated: boolean
}
on = { status(s), mode('speaking'|'listening'), line({ who: 'qubi'|'person', text, final }), error(reason), ended(reason) }
```
- `sdk` es inyectable (pruebas). La real importa `../vendor/elevenlabs.js` con `import()` dinámico y pasa `workletPaths: { rawAudioProcessor: './vendor/elevenlabs/rawAudioProcessor.js', audioConcatProcessor: './vendor/elevenlabs/audioConcatProcessor.js' }`.
- `notify(text)` = `sendUserMessage('[aviso de Qubbot] ' + text)`; `type(text)` = `sendUserMessage(text)` (la persona escribe en vez de hablar).
- Los mensajes cuyo texto empieza por `[aviso de Qubbot]` nunca se emiten como `line` de la persona.
- La simulada: saluda con el primer mensaje, "escucha"; `type(texto)` con un verbo de construir (crea, haz, agrega, cambia, arregla…) → llama `clientTools.construir({ pedido: texto })` y responde con una frase fija; con "¿qué hay…?" → `ver_proyecto`; `notify()` → Qubi lee el aviso. Niveles de audio falsos (seno) mientras "habla".

`renderer/viewmodels/callViewModel.js`
```js
new CallViewModel({ voiceService, openSession, openSimulatedSession, chatViewModel, projectModel, mapViewModel, connection, actions, bus, simulate = false, timing })
store: {
  status: 'idle' | 'connecting' | 'live' | 'ending' | 'error',
  mode: 'listening' | 'speaking',
  muted: false,
  simulated: false,
  error: null | 'no-key' | 'mic' | 'auth' | 'quota' | 'network' | 'failed',
  lines: [{ id, who: 'qubi' | 'person', text }],    // las últimas 40
  task: null | { messageId, kind: 'build' | 'ask', pedido, status: 'running' | 'waiting' | 'done' | 'error', created: [path], changed: [path] },
  cardId: null | id                                  // la tarjeta de la llamada en el chat
}
start(), hangUp(), toggleMute(), type(text), levels()
export function contextFor({ project, map, security, builder }) → string   // puro, ≤ 2500 caracteres
```
- `start()`: si no hay proyecto abierto → `error: 'failed'` con el aviso del caso. Pide la URL; si `reason === 'no-key'` (o la web) y `simulate` está activo o no hay clave, abre la simulada (`simulated: true`). Error de micrófono → `error: 'mic'`.
- `clientTools` implementa la tabla de arriba con lo que ya existe (`chatViewModel.send`, `mapViewModel`/`actions` para mostrar carpeta, `projectModel` y `securityModel` para el resumen). Ninguna herramienta devuelve contenido de archivos ni claves.
- **La respuesta del agente nunca va a la voz** (puede citar código o una clave escrita en un archivo): al terminar una pregunta, Qubi solo oye «ya respondió, la tienes en el chat».
- **`construir` lo decide la app, no el modelo de voz**: la voz lee textos que no controla (avisos, nombres de archivos), así que un cambio necesita una frase de la persona reciente y posterior al último `sendContext`/`notify`; si no, `motivo: 'sin-confirmar'` (el prompt le dice a Qubi que vuelva a pedir el sí). `preguntar` es de solo lectura y no lo necesita.
- La llamada cuelga si el proyecto se cierra **o se abre otro** (cambia `session`).
- `projectName` y `builder` se recortan a los límites de main (120 y 40) antes de pedir la URL.
- `canUseVoice`: `false` en la web (siempre simulada; la casilla de Ajustes queda desactivada).
- Avance: se suscribe a `chatViewModel.store`; identifica la tarjeta del trabajo delegado (el primer mensaje con `run` creado después de `construir`; sin agente, la respuesta del guion cuando ya está en el chat, no la primera pausa de «escribiendo…»), y cuando cambia (archivo nuevo, espera permiso, termina, falla) llama `sendContext` y, al terminar o al esperar permiso, `notify` una vez.
- Tarjeta en el chat: `chatViewModel.upsertCallCard({ status, lines, simulated, task })` (método nuevo) crea o actualiza un mensaje `{ role: 'bot', card: { kind: 'call', status, lines, simulated, task } }`.
- Al colgar: `end()`, `status: 'idle'`, la tarjeta queda con `status: 'ended'` y sus líneas.

`renderer/core/eventBus.js`: `callStarted`, `callEnded`.

### Vista
- `renderer/views/ui/callBarView.js` + `renderer/styles/call.css` (tokens `--lg-*` de `chat-glass.css`, vidrio líquido, neutra). Barra en `#call-bar` dentro del escenario, abajo al centro del espacio libre entre los controles del mapa y el chat flotante (si no cabe, sube sobre los controles; encima de la tarjeta de reparación, así «Colgar» nunca queda tapado); la onda se dibuja con `levels()` en cada cuadro (barras, más altas al hablar). Estados: Conectando… / Qubi te escucha / Qubi está hablando / Micrófono apagado / Llamada simulada. Botones con `title` y `aria-label`; Escape cuelga solo si el foco está en la barra. Un error lleva el foco a «Reintentar» solo si ya estaba en la barra o en el teléfono; al ocultarse la barra, el foco vuelve al teléfono. El teléfono del encabezado no es un interruptor: durante la llamada dice «Ir a la llamada».
- Ajustes: un menú pequeño con «Qué agente construye» (lee `connection`) y «Usar llamada simulada».
- Chat: abre el chat y fija la tarjeta de la llamada; ahí se puede escribir a Qubi (`type`). Durante la llamada la caja dice «Escríbele a Qubi…», el botón de enviar funciona aunque el agente trabaje y, al enviar, la tarjeta de la llamada se trae a la vista.
- `chatCardsView.js`: `kind: 'call'` → encabezado con estado y duración (sigue contando cada segundo, `.call-time[data-live]`), las últimas líneas (Qubi / Tú), y el trabajo delegado con su resultado (construyendo / buscando la respuesta / respondió / no pudo terminar / archivos). La tarjeta tiene `aria-live="off"`: no se relee entera en cada frase.
- Robot (`robotView.js` + `guideRobot.js`): durante la llamada y sin trabajo de construcción ni recorrido, el robot está en casa mirando a la cámara (vuelve caminando al terminar una construcción o un recorrido); su globo muestra las palabras de Qubi (con salto de línea) o, mientras el agente trabaja y Qubi calla, una cápsula corta con el orbe; poses nuevas `talk` (cabeza y cuerpo marcan el ritmo de `levels().output`) y `listen` (cabeza inclinada, respiración lenta). La construcción en vivo y el recorrido siguen teniendo prioridad.

### Textos
Todo el texto visible en `renderer/i18n/es.js` → `strings.call`; los de main en `electron/strings.js`. Español sencillo.

## Pruebas
- `electron/voiceCall.test.js`: sin clave → `no-key` sin llamar a la red; crea el agente una vez y reutiliza el id; lo actualiza si cambia el hash; lo recrea si da 404; nunca devuelve la clave; la configuración tiene `language: 'es'`, `enableAuth: true` y las cinco herramientas.
- `tests/renderer/callViewModel.test.mjs`: con sesión y servicio falsos: estados, simulada sin clave, `construir` llama a `chat.send` con `intent: 'change'` y no espera, ocupado → `motivo: 'ocupado'`, sin frase reciente de la persona → `sin-confirmar`, avisos de avance una sola vez, la respuesta del agente (código, claves) nunca llega a `sendContext` ni a `ver_avance`, la respuesta del guion se espera, abrir otro proyecto cuelga, nombre largo recortado, `contextFor` no incluye contenido de archivos ni rutas secretas y respeta el límite, colgar limpia.
- `tests/renderer/callSession.test.mjs`: la simulada llama a `construir` con un verbo de construir; los avisos `[aviso de Qubbot]` no aparecen como frases de la persona.

## Cómo quedó (fase 1, 2026-10-24)

- **Voz a voz (Realtime).** El agente usa un modelo Realtime de ElevenLabs (`eleven_realtime_v1_mini`): oye y contesta en audio, sin pasar por texto. Así se siente como el modo voz de Grok.
  - El SDK 2.74 todavía no trae `realtime_model`, así que se envía como campo extra en su propio PATCH (`additionalBodyParameters`).
  - Si la cuenta no tiene acceso («Realtime models are not available for this workspace»), el agente queda en modo clásico: `gemini-2.5-flash` más TTS `eleven_v4_turbo`. La barra muestra «Voz a voz» solo cuando es Realtime.
  - `PLATANUS_VOICE_REALTIME=max` usa el modelo que razona más; `off` usa la voz clásica.
  - `voice-agent.json` guarda `{ agentId, hash, voiceMode }`.
- **La clave.** En desarrollo, `.env.local` se lee con `util.parseEnv` en un objeto privado de main, nunca en `process.env`. Así los agentes y servidores que lanza Qubbot no la heredan.
  - El chequeo de `npx @elevenlabs/cli onboard check` dice que «nada carga .env.local»: es falso. Solo busca `dotenv` o `--env-file`.
- **Micrófono.** Solo se permite para la página propia y solo en los 60 s siguientes a un `voice:start` que salió bien. En macOS se pide `askForMediaAccess('microphone')`.
- **`end_call`.** El SDK exige `{ name: 'end_call', params: { systemToolType: 'end_call' } }`.
- **Seguridad de las herramientas.**
  - `construir` solo procede si la persona habló o escribió después del último aviso de la app, y hace menos de 30 s. Si no, responde `motivo: 'sin-confirmar'`: evita que un texto inyectado haga escribir sin que la persona lo pida.
  - La respuesta del agente de código **no** se manda a ElevenLabs. Qubi solo recibe «ya respondió».
- **Chat durante la llamada.** Lo que la persona escribe va a Qubi (`callViewModel.type`) y el cuadro dice «Escríbele a Qubi…».
- **Errores.** Entre ellos `noProject` (no hay proyecto abierto).
- **Fin de la llamada.** Se cuelga al cerrar el proyecto o al abrir otro.
