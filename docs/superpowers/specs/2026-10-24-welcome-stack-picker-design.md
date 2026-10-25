# Bienvenida con elección de tecnologías (proyecto A)

Fecha: 2026-10-24. Estado: construido (el usuario pidió hacerlo directamente).

## Por qué

Hoy, al crear un proyecto nuevo, el robot de bienvenida entrevista a la persona sobre su idea («vender algo», «un juego»…) y le recomienda una tecnología. Para la demo de la hackatón queremos algo más corto y más directo, que termine con un proyecto real y moderno listo para conectar a servicios de verdad:

- El mentor pidió que primero se pregunte **la experiencia** de la persona.
- La persona tipo es **un emprendedor sin experiencia** que quiere su app funcionando y publicada, poniendo solo lo que nadie más puede poner por él: sus cuentas.

Este es el **proyecto A**. El **proyecto B** («Conectar mi cuenta» por MCP: iniciar sesión en Vercel o Supabase, que el agente cree el proyecto allí y guarde las claves) viene después y tiene su propio diseño. A deja todo listo para que B se enchufe.

## Objetivos

1. Primera pregunta: experiencia.
   - «Estoy empezando» → sigue la bienvenida guiada.
   - «Ya programo» → el robot se despide, desaparece y se abre el chat.
2. Segunda pregunta: «¿Con qué quieres empezar tu proyecto?», con **tarjetas con logo**: Next.js, Vercel y Supabase, cada una con una frase simple.
3. «¡Empecemos!» → el agente arma el proyecto base con las tecnologías elegidas, configurado para que solo falten las cuentas.
4. En el mapa, las integraciones elegidas (Vercel, Supabase) aparecen en la banda de integraciones con un **estado nuevo, «Por conectar»**, neutro.
5. Las tecnologías salen de **un catálogo en datos** con reglas, para sumar después React Native/Expo, Clerk, AWS, etc.

## No objetivos (por ahora)

- La conexión real de cuentas por MCP, OAuth y guardar claves: es el proyecto B.
- Preguntas sobre la idea, la plataforma (móvil o escritorio), el inicio de sesión o la base de datos: se quitan.
- Más tarjetas que Next.js, Vercel y Supabase.
- Cambiar el modo guía (consejos y riesgos después de crear archivos): queda igual.

## Anti-objetivos (sería un fracaso aunque funcione)

- Que el principiante vea jerga sin explicar. Cada tarjeta dice en una frase qué hace por él.
- Usar ámbar o rojo para «Por conectar»: esos colores son solo para riesgos de seguridad.
- Que el agente lea, escriba o muestre secretos (`.env*`). El proyecto base trae `.env.example` con las variables vacías, nunca un `.env` con valores.
- Aflojar los permisos de los agentes. El agente sigue actuando solo con las herramientas MCP de Platanus, y cada escritura pide confirmación según el modo de permisos actual.

## Lo que decidió el usuario

- **Experiencia primero.** «Ya programo» → el robot se esfuma y se abre el chat.
- **Tarjetas con logo** en lugar de preguntas sobre la idea. Para la demo: Next.js, Vercel y Supabase.
- **Catálogo extensible con restricciones** a futuro (React Native, Clerk, AWS…).
- **Estado «Por conectar» neutro** (la opción B de los bocetos): pieza a medio armar, con contorno punteado y punto hueco en la etiqueta. Al conectarse se pone verde, como hoy.
- **Primero A, después B.**

## Flujo

### Paso 1: experiencia

Globo del robot (mismo globo, `welcome.css`):

- Título: «¡Hola! Soy tu guía 👋»
- Pregunta: «¿Cuánta experiencia tienes programando?»
- Botones: «🌱 Estoy empezando» y «💻 Ya programo».
- Barra de pasos: 1 de 3.

**«Ya programo»:**
1. El robot dice una frase corta de despedida (por ejemplo «¡Genial! Te dejo el chat para que pidas lo que quieras.») durante un momento.
2. El diálogo se apaga (`phase: 'off'`) y el robot desaparece del mapa.
3. Se abre el chat (acción `openChat`).
4. La app pasa al **modo Dev** (`modeModel`). *Decisión mía, ver «Decisiones del constructor».*

**«Estoy empezando»:** sigue al paso 2.

### Paso 2: elegir tecnologías

- Título: «¿Con qué quieres empezar tu proyecto?»
- Texto corto: «Ya elegí lo más usado para empezar. Puedes quitar lo que no quieras.»
- **Tres tarjetas**, en una columna o en una cuadrícula que quepa en el globo. Cada una con logo, nombre y frase:
  - **Next.js** — «Tu app: las pantallas que ve la gente.» Siempre incluida: marcada y bloqueada, con un candado o «Base» en lugar del check.
  - **Vercel** — «La publica en internet con su propia dirección.» Marcada por defecto.
  - **Supabase** — «Guarda tus datos: usuarios, productos, pedidos.» Marcada por defecto.
- Tocar una tarjeta la marca o desmarca; se ve con un check o un borde más claro, nunca morado.
- Botones: «✨ ¡Empecemos!» (primario, pastilla blanca), «Atrás» (cabecera) y «Lo exploro yo» (ghost: minimiza, como hoy).
- Barra de pasos: 2 de 3.

### Paso 3: el agente arma el proyecto

Al tocar «¡Empecemos!»:

1. Se arma un pedido para el agente (`W.scaffoldPrompt(selection)` en `es.js`) que dice qué tecnologías elegidas y qué entregar:
   - una app Next.js mínima (App Router) con una página de inicio amable;
   - `package.json` con los scripts `dev`, `build` y `start`;
   - `README.md` en español sencillo: qué es, cómo verlo funcionando y qué falta conectar;
   - `.gitignore` (incluye `.env*` salvo `.env.example`);
   - **con Supabase:** el cliente (`lib/supabase.ts`) leyendo `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`, y `.env.example` con esas variables vacías;
   - **con Vercel:** `vercel.json` mínimo;
   - nada de claves reales.
2. Se envía con `actions.askAgent` (con el pedido en espera si no hay agente, como hoy).
3. El robot pasa a la fase guía (`coach`), como hoy. «Construyendo en vivo» ya lleva cada archivo al mapa.
4. Barra de pasos: 3 de 3 durante el mensaje de «¡Manos a la obra!».

### Paso 4: «Por conectar» en el mapa

- Cuando aparecen los archivos, la detección de integraciones (`ProjectModel.#detectIntegrations`) encuentra Supabase (`@supabase/` en `package.json`) y Vercel (`vercel.json`).
- Para **los proyectos creados con esta bienvenida**, esas integraciones toman el estado nuevo **`pending`** en `integrationStatus`, en lugar de `connected`, hasta que B las conecte.
- **Cómo se recuerda**, decisión mía: el modelo de la bienvenida guarda por proyecto (en `localStorage`, como `repairHistoryModel`) la lista de integraciones que preparó y cuáles ya se conectaron. `ProjectModel` la consulta al detectar. Los proyectos existentes no cambian: siguen como `connected`.
- **Cómo se ve `pending`:**
  - **En 3D** (`integrationBuilder.js`): la plataforma y el emblema más apagados (opacidad o material `slab`), el emblema quieto y la luz apagada. Un contorno punteado alrededor de la plataforma (líneas discontinuas con el color neutro de marcador que ya usan los anillos del mapa). Nunca brilla (no pasa el umbral del bloom).
  - **Sin línea encendida** hacia las carpetas (como `disconnected`).
  - **Etiqueta:** el nombre con un punto hueco blanco y una línea gris debajo: «Por conectar».
- **Al hacer clic** en una integración `pending`: ver «Preguntas abiertas».

## Catálogo de tecnologías

Un modelo nuevo, `renderer/models/stackCatalog.js`, puro y con pruebas:

```js
// id, logo (nombre en BRAND_NAMES), integración del mapa que crea (o null), reglas
{ id: 'nextjs',   logo: 'nextjs',   integration: null,       base: true }
{ id: 'vercel',   logo: 'vercel',   integration: 'vercel',   requires: ['nextjs'] }
{ id: 'supabase', logo: 'supabase', integration: 'supabase' }
```

- Los textos (nombre visible, frase) viven en `es.js` → `map.welcome.catalog.<id>`.
- Funciones:
  - `defaultSelection()`: las marcadas al empezar;
  - `toggle(selection, id)`: respeta `base` (no se desmarca), `requires` (marcar una suma lo que necesita; desmarcar una necesaria desmarca a quien la necesita) y `excludes` (para el futuro: React Native excluye a Next.js);
  - `integrationsOf(selection)`.
- Con tres tarjetas solo se usan `base` y `requires`, pero `excludes` queda con pruebas para que sumar React Native sea solo agregar datos.

## Logos

- Hoy los logos de marcas salen de `@lobehub/icons-static-svg` (`npm run icons`, `BRAND_NAMES`). Ese paquete trae Vercel, pero no Next.js ni Supabase.
- Se suma **Simple Icons** (`simple-icons`, CC0) como dependencia de desarrollo, y el generador de íconos aprende a leer logos de ahí. Trae Next.js, Supabase, Vercel y los del futuro (Clerk, Expo, React, AWS).
- Los logos se ven monocromos blancos sobre el vidrio, para seguir neutros como el resto de la UI. *Decisión mía.*

## Dónde cae cada cosa (MVVM)

| Pieza | Archivo |
|---|---|
| Catálogo y reglas | `renderer/models/stackCatalog.js` (nuevo) + `tests/renderer/stackCatalog.test.mjs` |
| Pasos, selección, despedida de «Ya programo», pedido al agente | `renderer/viewmodels/robotDialogViewModel.js` (se reemplazan `steps`, `stacks`, `recommend`, la analogía y `talkPrompt`) + su test |
| Integraciones preparadas por proyecto | modelo pequeño nuevo (p. ej. `renderer/models/setupModel.js`) en `localStorage`, consultado por `ProjectModel` |
| Estado `pending` | `projectModel.js`, `mapViewModel.js` (`statusOf`, sin línea), `integrationBuilder.js` (`LIGHT`, contorno, quieto), etiquetas de integración en `mapView.js` / CSS |
| Tarjetas en el globo | `welcomeRobotView.js` (`bubbleHtml`: nuevo tipo `kind: 'stack'`) + `welcome.css` |
| Textos | `renderer/i18n/es.js` → `map.welcome` |
| Logos | `renderer/icons/iconNames.js`, `scripts` del generador de íconos, `package.json` |
| Modo Dev al elegir «Ya programo» | acción en `renderer/main.js` que usa `modeModel` |

La vista sigue delgada: solo dibuja `bubble` y llama `press(id)`. Los ids nuevos son `exp:beginner`, `exp:dev`, `pick:<id>` y `start`.

## Pruebas

- **`stackCatalog`:** selección por defecto; `base` no se desmarca; `requires` en las dos direcciones; `excludes`; `integrationsOf`.
- **`robotDialogViewModel`:**
  - el primer globo es la experiencia;
  - «Ya programo» apaga el diálogo y llama `openChat` y el cambio a Dev;
  - «Estoy empezando» muestra las tarjetas con la selección por defecto;
  - `pick:` cambia la selección según las reglas;
  - «¡Empecemos!» llama `askAgent` con un pedido que nombra solo lo elegido y nunca pide claves;
  - «Atrás» vuelve a la pregunta de experiencia;
  - el modo guía sigue igual (pruebas actuales).
- **Detección:** un proyecto marcado por la bienvenida da `pending` para lo que preparó; uno sin marca sigue en `connected`.
- **`mapViewModel`:** `pending` no genera línea encendida.
- `npm test` completo y revisión en la app real (proyecto nuevo, los dos caminos de experiencia, el mapa con «Por conectar»).

## Documentación a actualizar

- `docs/features/welcome-robot/README.md`: la entrevista nueva, el catálogo y «Por conectar».
- `CLAUDE.md`: los estados de integración (suma `pending`) y los módulos nuevos.
- `docs/INTERFAZ.md`: el estado «Por conectar».
- `MEMORY.md`.

## Decisiones del constructor (no las pidió el usuario)

- «Ya programo» también cambia al modo Dev.
- Lo que preparó la bienvenida se guarda por proyecto en `localStorage`, no en un archivo dentro del proyecto.
- Logos monocromos blancos.
- La barra de pasos tiene 3 pasos: experiencia, tecnologías y «manos a la obra».

## Preguntas del revisor, resueltas por el constructor

- **Supabase por conectar:** no se dibuja el nodo vivo (tablas de ejemplo y vulnerabilidad de demostración); va en la fila como las demás (`usesSupabase` es falso mientras está `pending`).
- **Clic en una integración por conectar:** abre el chat con un mensaje de que solo falta conectar la cuenta. Nada en A la pasa a conectada; B llamará `setupModel.markConnected`.
- **Cuándo aparece:** cuando sus archivos ya están y la bienvenida la registró (lo detectado + lo registrado).
- **Clave del registro:** la ruta completa de la carpeta, no el nombre.
- **Barra de pasos:** 2 pasos (experiencia y tecnologías); el «manos a la obra» es el consejo de espera de siempre.
- **Después de la despedida o ×**, el robot no vuelve en ese proyecto (antes cualquier cambio del mapa lo reabría).
