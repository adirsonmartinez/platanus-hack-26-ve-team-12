# Voz de Qubi: proveedores, claves y conexión (2026-10-24)

La persona puede llamar a Qubi con **ElevenLabs** (por defecto) o con **Grok Voice** (API de voz de xAI). Si no tiene ninguna conexión, aparece un **modal «Qubi está fuera de conexión»** con estas opciones:
- iniciar sesión con ElevenLabs;
- pegar una clave de ElevenLabs;
- pegar una clave de xAI;
- usar la llamada simulada.

**Ninguna clave llega a la ventana después de pegarse, ni a git, ni a los agentes.** Queda cifrada en el llavero del sistema y solo sirve para pedir una credencial temporal en cada llamada.

## Claves (`electron/keyStore.js`)
- **Proveedores nuevos:** `elevenlabs` (`ELEVENLABS_API_KEY`, forma `^sk_[A-Za-z0-9]{20,}$` o el formato que tengan las claves actuales; revisar la clave de `.env.local` sin imprimirla, solo su forma). xAI ya existe como `grok` (`XAI_API_KEY`).
- **Cifrado:** usa la API asíncrona de `safeStorage` (`isAsyncEncryptionAvailable`, `encryptStringAsync`, `decryptStringAsync`), porque la síncrona está obsoleta en Electron 45. Tiene que seguir leyendo lo que ya se guardó con la API síncrona. Si `decryptStringAsync` dice `shouldReEncrypt`, se vuelve a cifrar.
- **Linux:** si el backend es `basic_text`, la clave se guarda solo en memoria mientras dure la sesión y se avisa con `reason: 'weak-keychain'`.
- **Para la voz**, `keyFor(provider)` busca primero en el llavero, después en `process.env` y después en `.env.local`, este último solo en desarrollo (`devEnv` privado, como ahora).

## Iniciar sesión con ElevenLabs (`electron/elevenlabsLogin.js`, nuevo)
- `login({ dir, spawn })` corre `npx -y @elevenlabs/cli@latest onboard connect --env-path <dir>/elevenlabs-login.env --via platanus/1.0 --format json`.
  - Usa una carpeta temporal propia (`fs.mkdtemp` en `userData`, permisos 0700).
  - La CLI abre el navegador. La persona entra o crea su cuenta y pulsa **Authorize**.
- **Al terminar:**
  1. lee `ELEVENLABS_API_KEY` de ese archivo con `util.parseEnv`;
  2. la guarda en el llavero (`keyStore.set('elevenlabs', key)`);
  3. **borra el archivo y la carpeta**, también si algo falla (`finally`).
  - Devuelve `{ ok: true, last4 }` o `{ ok: false, reason: 'cancelled' | 'timeout' | 'no-node' | 'failed' }`.
- **Tiempo máximo:** 5 min. Se puede cancelar.
- **Registro:** nunca se registra la salida completa, solo `key_status` y `next`.
- **Pruebas:** con un `spawn` falso que escribe el archivo, verificar que se guarda la clave y que el archivo se borra; y que el archivo se borra aunque falle.

## Proveedores en main (`electron/voiceCall.js`)
`start({ projectName, context, builder, memory, provider, voice })` devuelve:
- **ElevenLabs:** `{ ok, provider: 'elevenlabs', signedUrl, dynamicVariables, voiceMode, voiceId }`. Es lo de ahora, más la voz elegida: la asegura en la cuenta con `voices.share` si da 404.
- **Grok:** `{ ok, provider: 'grok', token, expiresAt, model: 'grok-voice-latest', session: { instructions, voice, tools, language: 'es-MX', firstMessage } }`.
  - `token` sale de `POST https://api.x.ai/v1/realtime/client_secrets` con `{ expires_after: { seconds: 300 } }`. La respuesta se lee con cuidado (`value`, `client_secret.value` o `token`).
  - `instructions` es el mismo prompt de Qubi, con las variables ya puestas (`project_name`, `project_context`, `project_memory`, `builder_name`).
  - `tools` son las mismas herramientas de cliente, en el formato `{ type: 'function', name, description, parameters }`.
- `provider: 'auto'` (por defecto) usa ElevenLabs si hay clave, si no Grok si hay clave de xAI, si no `{ ok: false, reason: 'no-key' }`.
- **Validación:** `voice:start` acepta los campos nuevos `provider` (`auto | elevenlabs | grok`), `voice` (clave de la lista de voces, nunca un id libre) y `memory` (≤ 800).
- **IPC nuevos:**
  - `voice:providers` → `{ elevenlabs: { ready, last4? }, grok: { ready, last4? } }`;
  - `voice:login` / `voice:loginCancel`;
  - `keys:set` y `keys:remove`, que ya existen y ahora aceptan `elevenlabs`.

## Grok Voice en la ventana (`renderer/models/grokSession.js`, nuevo)
Implementa la misma interfaz `Session` que `callSession.js`: `end`, `setMuted`, `sendContext`, `notify`, `type`, `levels` y `simulated: false`.
- **Conexión:** `new WebSocket('wss://api.x.ai/v1/realtime?model=grok-voice-latest', ['xai-client-secret.' + token])`. Al abrirse:
  - envía `session.update` con `instructions`, `voice`, `tools`, `turn_detection: { type: 'server_vad' }`, el audio en `audio/pcm` a la frecuencia de muestreo del `AudioContext` y `transcription.language_hint: 'es-MX'`;
  - después dice el primer mensaje con un `force_message`, o con un ítem más `response.create` si no lo acepta.
- **Micrófono:** `getUserMedia` con cancelación de eco. Un AudioWorklet propio (`renderer/audio/pcmCapture.worklet.js`) junta bloques de ~100 ms en PCM16 y los manda como `input_audio_buffer.append` en base64.
- **Reproducción:** cola de `AudioBuffer` con `nextTime`.
  - Al llegar `input_audio_buffer.speech_started` o un `response.created` nuevo, corta lo que suena (la persona interrumpió).
  - Si ese evento no llega, la corta un umbral de energía del micrófono mientras Qubi habla.
- **Herramientas:** al llegar `response.function_call_arguments.done`:
  1. ejecuta el `clientTools[name](args)`;
  2. manda `conversation.item.create` con `{ type: 'function_call_output', call_id, output: JSON }`;
  3. manda `response.create`, una vez que llegaron todas las salidas.
- **Equivalencias:**
  - `sendContext`: un ítem de texto de sistema, sin `response.create`;
  - `notify`: un ítem con `[aviso de Qubbot]` y después `response.create`;
  - `type`: un ítem de la persona y después `response.create`.
- **Transcripción:** las líneas de Qubi y de la persona salen de los eventos de transcripción. Si no hay, solo se muestran las de Qubi (`response.output_audio_transcript.*`).
- **Niveles:** dos `AnalyserNode`, uno de entrada y otro de salida.
- **CSP:** agregar `connect-src wss://api.x.ai`.
- **Pruebas:** con un WebSocket falso, comprobar:
  - qué manda `session.update`;
  - el ciclo de herramientas (salida y después `response.create`);
  - que `notify` no se muestra como frase de la persona;
  - que `end` cierra todo.

## Modal de conexión (`renderer/views/ui/voiceConnectView.js`, nuevo)
- **Cuándo se abre:**
  - al pulsar «Hablar en vivo» sin ningún proveedor listo;
  - desde Ajustes de la llamada → «Conexión de voz»;
  - desde la banda de integraciones (ElevenLabs).
- **Título:** «Qubi está fuera de conexión». Se explica en una línea: «Para hablar con Qubi en vivo, conecta un servicio de voz. Tu clave queda guardada y cifrada solo en este computador».
- **Las opciones son tarjetas:**
  1. **«Iniciar sesión con ElevenLabs»** (recomendada): llama a `voice:login`. Muestra «Abriendo tu navegador… autoriza y vuelve» con un orbe y el botón «Cancelar».
  2. **«Pegar clave de ElevenLabs»**: un campo `type=password` con `autocomplete=off` y `spellcheck=false`.
     - El campo se vacía al guardar y nunca se vuelve a mostrar la clave, solo «•••• 171e».
     - Enlace «¿Dónde la consigo?» a `https://elevenlabs.io/app/settings/api-keys`.
     - Nota: «Si te la pasó tu equipo, pégala aquí».
  3. **«Usar Grok Voice (xAI)»**: un campo igual para la clave de xAI y el enlace `https://console.x.ai`.
     - Nota honesta: «Necesita una clave de la API de xAI; la suscripción de Grok no sirve para esto».
  4. **«Probar sin voz»**: la llamada simulada.
- **Estado:** cada proveedor muestra «Conectado •••• 1234» con el botón «Quitar», o «Sin conectar».
- Los enlaces se abren con `links:open`, que solo acepta las URL de una lista fija en main.

## Ajustes de la llamada
- «Voz de Qubi»: Juan, Julio, José Manuel o Maggie para ElevenLabs; Rex, Eve o Ara para Grok.
- «Servicio de voz»: Automático, ElevenLabs o Grok.
- «Conexión de voz…», que abre el modal.
- Se guarda en `localStorage` (preferencia de la persona, no un secreto).

## Cómo quedó (2026-10-24, sin probar todavía en la app real)

- **Main:** `voiceCall.js` (ElevenLabs y Grok, voces en `VOICES`, `PROVIDERS` incluye `auto`), `keyStore.js` (proveedor `elevenlabs`, `safeStorage` asíncrono, `keyFor(provider)`), `elevenlabsLogin.js` (inicio de sesión con la CLI, archivo temporal borrado siempre). Una clave solo se usa con su proveedor (`sk_` ElevenLabs, `xai-` Grok).
- **IPC:** `voice:status`, `voice:start`, `voice:providers`, `voice:login`, `voice:loginCancel`, `keys:*` y `links:open` (lista fija de `serviceCatalog.js`). El micrófono se habilita 60 s después de cualquier `voice:start` correcto, Grok incluido.
- **Ventana:** `renderer/main.js` crea **un solo** `voiceService` y lo comparte entre `CallViewModel` y `createVoiceConnectView` (`#voice-connect`). El modal se abre solo cuando la llamada termina en `offline`, y desde Ajustes → «Conexión de voz…».
- **Ajustes** en `localStorage` `platanus.call.v1` (`{ provider, voice }`). Con `auto`, primero el servicio de la voz elegida, después ElevenLabs y después Grok.
- **Grok** (`grokSession.js` + `audio/pcmCapture.worklet.js`): hecho con fakes. Sin verificar contra xAI: el saludo con `force_message` (si falla o no responde en 2,5 s se usa un ítem de sistema + `response.create`) y los nombres de voz `Rex`, `Eve`, `Ara`.
- **CSP:** `connect-src` incluye `wss://api.x.ai`.
