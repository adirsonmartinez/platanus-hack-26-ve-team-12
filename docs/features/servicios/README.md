# Servicios del proyecto: detectar, avisar y conectar (2026-10-24)

Al abrir, importar o crear un proyecto, Qubbot detecta qué **servicios externos** usa: Supabase, Vercel, GitHub, Stripe, Firebase, Render, Netlify, OpenAI, Anthropic, ElevenLabs, Resend, Sentry, Clerk, PostHog, Neon o Prisma, y MongoDB. Para cada uno dice si **el agente de la persona puede trabajar con él** (conectado) o si está **fuera de conexión**. Si falta conectar alguno, Qubi lo dice y ofrece conectarlo. «Conectar» abre un modal que explica, en palabras simples, las dos formas de hacerlo:
- **con su CLI**: el comando para copiar y la guía oficial;
- **con su MCP**, para el agente que la persona usa: el comando para Claude Code, Codex, Grok u OpenCode y la página oficial del MCP.

Nunca se leen los valores de las claves del proyecto: `.env` y los secretos siguen bloqueados.

## Main

### `electron/serviceCatalog.js` (nuevo, CommonJS, datos puros)
```js
SERVICES = {
  supabase: {
    name: 'Supabase',
    detect: { deps: ['@supabase/'], files: ['supabase/config.toml'], dirs: ['supabase'], envNames: ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'] },
    cli: { bin: 'supabase', install: 'npm i -g supabase', login: 'supabase login', whoami: null, docs: 'https://supabase.com/docs/guides/local-development/cli/getting-started' },
    mcp: { name: 'supabase', docs: 'https://supabase.com/docs/guides/getting-started/mcp', claude: 'claude mcp add --transport http supabase https://mcp.supabase.com/mcp', codex: '…', url: 'https://mcp.supabase.com/mcp' },
    dashboard: 'https://supabase.com/dashboard',
  },
  …
}
```
- Cada servicio: `name`, `detect` (`deps` como prefijos de `package.json`, `files`, `dirs` y `envNames`, que son **nombres** de `.env.example` y nunca valores ni `.env`), `cli` (`bin`, `install`, `login`, `whoami` como `[cmd, ...args]` o `null`, y `docs`), `mcp` (`name` con el que suele registrarse, `docs`, comandos por agente si existen y `url` si es remoto) y `dashboard`.
- **Solo URL oficiales y verificadas.** El agente que lo escriba revisa cada URL y comando en la documentación oficial; si no puede verificar un MCP, pone `mcp: null` y deja solo la CLI.
- `LINKS` es el conjunto de todas las URL del catálogo más las de voz (`elevenlabs.io/app/settings/api-keys`, `console.x.ai`). `links:open` solo abre esas.

### `electron/serviceStatus.js` (nuevo, con pruebas)
- `detect(root, { readFile, exists })` devuelve `[{ key, evidence: ['package.json: @supabase/supabase-js'] }]`.
  - Lee solo `package.json` (raíz y `apps/*`, `packages/*`, 1 nivel), `.env.example`, `.env.sample` y la existencia de archivos y carpetas.
  - **Nunca** abre `.env` ni `.env.local`.
- `status(keys, { home, root, run })` devuelve `{ [key]: { state: 'connected' | 'disconnected' | 'unknown', via: ['mcp:claude', 'cli'] } }`:
  - **MCP configurado:**
    - `~/.claude.json` (`mcpServers` global y del proyecto) y `<root>/.mcp.json`;
    - `~/.codex/config.toml` (`[mcp_servers.<name>]`);
    - la configuración global de OpenCode;
    - la de Grok, si existe un archivo conocido.
    - Se busca el `mcp.name` del servicio o su `url`. Solo se leen los **nombres** de los servidores y sus URL, nunca tokens ni encabezados.
  - **CLI con sesión:** si `cli.whoami` existe y el binario está, se corre con un tope de 3 s, sin shell y con el `PATH` del sistema. Código 0 → `cli`.
  - `connected` si hay al menos un `via`; `disconnected` si no; `unknown` si algo falló.
- **Caché** de 60 s por proyecto. `services:refresh` la vacía.
- **IPC:**
  - `services:detect` → detección más estado del proyecto abierto (el `root` lo pone main);
  - `services:catalog` → la parte visible del catálogo (sin `detect`);
  - `links:open(url)` → solo si `LINKS.has(url)`; usa `shell.openExternal`.

## Ventana

- **`projectModel`:** `#detectIntegrations` usa `window.platanus.services.detect()` si existe. Si no, en la web, se queda con lo de ahora.
  - `integrations` = las claves detectadas, en el orden del catálogo;
  - `integrationStatus[key]` = `connected` o `disconnected` (`unknown` se muestra como `disconnected`, con otro texto);
  - `DEMO_INTEGRATIONS` sigue igual.
- **`renderer/viewmodels/servicesViewModel.js` (nuevo, con pruebas):**
  - **Store:** `{ services: [{ key, name, state, via, evidence }], open: null | key, catalog }`.
  - **Métodos:** `refresh()`, `openConnect(key)`, `close()`, `copy(text)` y `openLink(url)`.
  - **Al abrir un proyecto (`projectOpened`):** si hay servicios `disconnected`, pide a `chatViewModel` una tarjeta `kind: 'services'`, solo una por proyecto y por sesión, y le da al robot compañero un globo corto: «Este proyecto usa Stripe y está fuera de conexión. ¿Lo conectamos?», con el botón «Conectar».
- **`renderer/views/ui/serviceConnectView.js` (nuevo): modal «Fuera de conexión: Stripe».**
  - **Encabezado:** el logo, si existe en `renderer/icons/brands.js`; si no, la inicial. Debajo, el estado y una explicación de una línea: «Tu agente todavía no puede trabajar con Stripe. Conéctalo de una de estas formas».
  - **Pestaña «Con su CLI»:** pasos numerados (instalar, iniciar sesión), cada comando con el botón «Copiar» y «Abrir la guía».
  - **Pestaña «Con MCP para tu agente»:** el comando para el agente elegido en el chat (Claude Code, Codex, Grok u OpenCode, si existe), con «Copiar» y «Abrir la página del MCP».
  - **Pie:** «Ya lo conecté» (`refresh`) y «Ahora no».
  - Accesible: foco atrapado, Escape cierra, `aria-modal`.
  - Estilo: vidrio, `--lg-*`.
- **En el mapa:** los nodos de la banda de integraciones se ven apagados cuando están `disconnected`. Al pulsar un nodo se abre su modal: `mapView` emite el clic y `main.js` lo conecta.
- **En el chat:** la tarjeta `services` lista los servicios con una píldora de estado («Conectado» o «Fuera de conexión») y el botón «Conectar» en los que falta.
- **ElevenLabs como servicio del proyecto** (cuando el proyecto lo usa) abre su modal normal. La conexión de la **llamada de Qubi** es otra cosa: es el modal de voz de `VOZ.md`.

## Textos
`strings.services` en `renderer/i18n/es.js`, y en `electron/strings.js` lo que diga main.

## Pruebas
- **`serviceStatus`:**
  - detecta por dependencias, archivos y `.env.example`, y **nunca** lee `.env`;
  - lee los MCP de cada agente con archivos falsos en un `HOME` temporal;
  - con un `whoami` falso: 0 → conectado, error o tiempo agotado → `unknown`;
  - la caché funciona.
- **Catálogo:** todas las URL son `https://` y ninguna tiene parámetros con tokens.
- **`servicesViewModel`:** pone una tarjeta por proyecto, abre y cierra el modal, y `refresh` cambia el estado.

## Cómo quedó (2026-10-24, sin probar todavía en la app real)

- **Main:** `serviceCatalog.js` (17 servicios, `LINKS`, `publicCatalog()`), `serviceStatus.js` (caché de 60 s, `whoami` solo de `gh`, `vercel` y `atlas`, sin shell, 3 s) e IPC `services:detect`, `services:catalog`, `services:refresh` (solo vacía la caché; después hay que volver a detectar) y `links:open`.
  - Sin comando para copiar: GitHub y MongoDB (piden token), Render (MCP sin confirmar) y OpenCode (no tiene comando de una línea).
  - Sin confirmar en la documentación oficial: el MCP de Render y si `vercel whoami` y `atlas auth whoami` salen con error cuando no hay sesión.
- **Ventana:**
  - `ProjectModel(workspace, { services })` usa `window.platanus.services.detect()`; guarda `services` en su store; `integrations` sigue el orden de main.
  - `ServicesViewModel` (`renderer/viewmodels/servicesViewModel.js`) se crea en `renderer/main.js` después del chat, así la tarjeta queda debajo del saludo del proyecto. Escucha `projectOpened` por su cuenta (no hace falta llamar a `refresh` al abrir: `projectModel` ya detecta).
  - **Globo del robot:** `say(text, actions)` → `robotViewModel.say` (nuevo): un globo corto con botones mientras el robot espera; se va al pulsar un botón o a los 20 s.
  - `chatViewModel.upsertServicesCard(card, { add, id })`: la tarjeta `services` con «Conectar».
  - `createServiceConnectView({ servicesViewModel })`: el modal «Fuera de conexión: X» (CLI, MCP por agente, Copiar, guías, «Ya lo conecté» / «Ahora no»).
  - **Mapa:** `createMapView({ nameOf, onIntegration })` y `handle: (pick) => mapView.handlePick(pick) || mapViewModel.handlePick(pick)`. Los nodos desconectados se ven apagados. Supabase sigue abriendo su esquema (lo dibuja `supabaseView`).
  - `services.css` va enlazado en `renderer/index.html`.
