# Conectar mi cuenta (Supabase)

Cuando la bienvenida arma un proyecto con Supabase, la integración aparece en el mapa como **«por conectar»**. Un clic abre **«Conecta Supabase»**: la persona inicia sesión con su cuenta y Platanus crea (o elige) el proyecto en Supabase y guarda las claves en el proyecto, sin mostrarlas. Al terminar, Supabase se pone verde en el mapa.

## Cómo se usa

1. Clic en **Supabase · por conectar** en la banda de integraciones.
2. **Iniciar sesión con Supabase:** se abre el navegador; la persona entra y autoriza a Platanus. Supabase devuelve un código a una dirección local (`http://127.0.0.1:45789/supabase/callback`) que solo escucha mientras espera.
3. **Elegir:** la organización (si tiene más de una) y
   - **Crear un proyecto nuevo** con el nombre de la carpeta (en minúsculas y con guiones), región São Paulo, gratis en el plan Free; o
   - **Usar un proyecto que ya tengo** (solo los activos de esa organización). Sirve cuando el plan gratis ya tiene sus 2 proyectos.
4. **Confirmar** en un diálogo del sistema: «¿Crear el proyecto “mi-tienda” en Supabase?», con el **costo** que dice Supabase (`get_cost`: «gratis» o «US$X al mes»), o «¿Conectar este proyecto con “x”?». Solo si la persona acepta, Platanus confirma el costo (`confirm_cost`) y crea el proyecto con ese comprobante (`confirm_cost_id`).
5. **Esperar:** un proyecto nuevo tarda uno o dos minutos en estar listo; el modal dice qué pasa («Creando…», «Supabase está preparando tu base de datos…», «Guardando las claves…»).
6. **Listo:** Platanus escribe `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` en `.env.local` (si ya existía, cambia solo esas dos líneas) y, si el `.gitignore` no lo cubre, le suma `.env*.local`. El chat lo cuenta, `.env.local` queda en verde y Supabase pasa a conectado.

## El panel de Supabase

Un clic en el nodo de Supabase del mapa (conectado) abre el panel lateral **Supabase**:
- el proyecto con su estado (conectado, preparándose o en pausa), región, versión de Postgres y plan;
- **tablas**, **filas** (estimación de Postgres) y **tamaño** de la base, con una barra contra lo que incluye el plan (Free: 500 MB; Pro y Team: 8 GB; se pone ámbar sobre el 90 %);
- las tablas más grandes, con sus filas y su tamaño;
- «Ver tablas en el mapa» (el esquema 3D de antes), «Abrir en Supabase» y «Actualizar».

Los números salen de dos consultas **fijas y de solo lectura** que ejecuta el proceso principal (`STATS_SQL` en `supabaseLink.js`), más `get_project` y `get_organization`; la ventana solo nombra el proyecto enlazado (un ref de 20 letras, comprobado en main). Qué proyecto está enlazado a cada carpeta lo recuerda `setupModel.linkOf` (se guarda al conectar). Si no hay enlace guardado (un proyecto conectado antes, o configurado a mano), el proceso principal lee la línea `…SUPABASE_URL` de `.env.local` o `.env` y devuelve **solo** el identificador del proyecto (IPC `supabase:linked`; la clave nunca sale de main). Sin nada de eso, el panel ofrece «Conectar mi cuenta»; con la sesión cerrada, volver a conectarla. El proyecto demo muestra datos de ejemplo, marcados como tales.

Archivos: `renderer/viewmodels/databaseViewModel.js` (+ test), `renderShell` → `renderSupabase` en `views/ui/shellView.js`, `renderer/styles/database.css`, IPC `supabase:stats` y `supabase:dashboard`.

## Por qué lo hace Platanus y no el agente

- Los agentes solo actúan con las herramientas MCP de Platanus y nunca tocan secretos; darles el MCP de Supabase obligaría a aflojar sus permisos.
- Un flujo fijo es predecible: el modelo no decide nada aquí.
- El MCP de Vercel solo acepta clientes aprobados por Vercel (Claude Code, Codex, Cursor…), así que Vercel irá por otro camino (su CLI) y por ahora sigue con el mensaje de «pronto».

## Seguridad

- **OAuth con PKCE y registro dinámico** contra `https://mcp.supabase.com/mcp` (SDK oficial `@modelcontextprotocol/sdk`). Sin secreto de cliente (`token_endpoint_auth_method: none`), con `state` comprobado en el retorno.
- **Credenciales cifradas** con el llavero del sistema (`safeStorage`) en `userData/connections.json` (0600). Nunca llegan a la ventana.
- **La ventana solo elige:** manda el id de la organización o del proyecto; el proceso principal lo compara con lo que Supabase listó y pregunta en un diálogo nativo antes de crear o conectar.
- **Las claves** van directo del proceso principal a `.env.local` (0600). Solo se usa la clave pública (publishable o anon); nunca la `service_role`.
- El proceso principal registra cada paso en la auditoría (`supabase:signin`, `supabase:create`, `supabase:connect`).

## Estados y textos

- Pasos del modal: `intro` → `signing` → `choose` → `working` (`creating` / `starting` / `keys`) → `done` o `error`.
- Sin organización: «Tu cuenta de Supabase todavía no tiene una organización…».
- Textos: `renderer/i18n/es.js` → `accounts.supabase`; diálogos nativos: `electron/strings.js` → `supabase`.

## Archivos

| Pieza | Archivo |
|---|---|
| Cliente MCP + OAuth (llamadas fijas) | `electron/supabaseConnect.js` |
| Partes puras (leer respuestas, elegir la clave, `.env.local`, `.gitignore`, nombre) | `electron/supabaseLink.js` + `supabaseLink.test.js` |
| Almacén cifrado | `electron/secretStore.js` + `secretStore.test.js` |
| IPC (`supabase:start`, `supabase:connect`, `supabase:signOut`, evento `supabase:progress`) | `electron/main.js`, `electron/preload.js` |
| Puente | `renderer/services/integrationService.js` |
| Estado del modal | `renderer/viewmodels/connectViewModel.js` + `tests/renderer/connectViewModel.test.mjs` |
| Modal | `renderer/views/ui/connectModalView.js`, `renderer/styles/connect.css` |
| Al conectar (verde, chat, `setupModel.markConnected`) | `renderer/main.js` |

Un Supabase conectado de verdad no muestra la vulnerabilidad inventada de la demo (`projectModel.demo`, `supabaseViewModel`). Sus tablas siguen siendo las de ejemplo: mostrar las reales (`list_tables`) es el siguiente paso.

## Probado

De punta a punta con una cuenta real (2026-10-24): inicio de sesión, organizaciones (Supabase envuelve las listas: `{ organizations: [...] }`), costo confirmado, proyecto creado y claves en `.env.local`.

## Pendiente

- Que la regla de seguridad entienda el `.gitignore`: hoy `.env.local` queda en verde solo durante la sesión en que se conectó.
- Mostrar las tablas reales del proyecto en el esquema 3D (el panel ya muestra las reales).
- Vercel: `vercel login`, `vercel link`, `vercel env add` y `vercel deploy` ejecutados por el proceso principal.
- Desconectar la cuenta desde la app (`supabase:signOut` ya existe en el proceso principal).
