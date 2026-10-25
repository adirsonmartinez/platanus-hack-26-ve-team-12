# Auditoría de seguridad

Principio: **el LLM propone, el plano decide**. El color de cada archivo y el porcentaje del proyecto los
decide una auditoría con reglas fijas que lee lo que dice cada archivo. El agente y Qubi pueden explicar o
reparar, pero un archivo solo se pone verde cuando la auditoría, al volver a leerlo, ya no encuentra nada.

## Antes y ahora

| Antes | Ahora |
| --- | --- |
| El semáforo miraba **solo el nombre** (`demoScore`): todo `.sql` salía «a revisar», y `orders.ts` (con inyección SQL) salía verde. | La auditoría lee el contenido. `001_init.sql` sale verde; `orders.ts` rojo, «Línea 12: consulta SQL insegura». |
| Lo que cambiaba una reparación vivía en memoria: al cerrar y abrir volvían los colores por nombre. | Al abrir se audita de nuevo desde el disco, y el historial del porcentaje se guarda por proyecto. |
| El agente podía marcar verde un archivo y Qubi decía «está bien» aunque el mapa lo marcara. | Un agente solo puede **subir** un color. Qubi y el agente reciben la regla y la línea que encontró la auditoría. |

## Piezas

- `electron/securityAudit.js`: las reglas. `scanText(rel, text)` → `[{ rule, level, line }]`, nunca el texto encontrado (podría ser una clave).
  - **Rojo:**
    - `hardcodedSecret`: claves con forma conocida o `password = "…"`;
    - `sqlInjection`, `commandInjection`, `tlsDisabled`, `jwtUnsafe`, `sqlGrantAll`;
    - por nombre: `envFile`, `privateKey`, `secretName`.
  - **Amarillo:**
    - código: `evalUse`, `htmlInjection`, `corsOpen`, `weakHash`, `insecureRandom`, `cookieInsecure`, `debugEnabled`;
    - `sqlNoAccessRules`: tabla con datos personales sin RLS;
    - `dockerRoot`, `dockerLatest`, `envTemplateValue`.
  - **Gris:** archivos de más de 256 KB, que no se leen.
  - Se saltan `node_modules`, `.git`, builds, lockfiles y enlaces simbólicos. Máximo 3000 archivos.
- `electron/securityStore.js`: `userData/security/<sha256(root)>.json` (0600). Guarda:
  - `history`: `[{ at, score, red, yellow, cause, paths }]` con `cause` open | audit | change | repair | accept, y como máximo 200 entradas;
  - `accepted`: amarillos que la persona marcó como revisados. Solo valen mientras el archivo no cambie (mismo hash); un rojo nunca se acepta.
  - No guarda hallazgos ni contenidos.
- **Puntaje:** `100 − 15·rojos − 5·amarillos`, igual que `securityScore` de la ventana.
- **IPC** (siempre sobre el proyecto abierto): `security:audit(cause)`, `security:check(paths, cause)`, `security:accept(rel)`, `security:unaccept(rel)`.
- `renderer/models/securityModel.js` → `applyAudit`, `findingsOf`, `scoreOf`. Con auditoría:
  - `by` es `audit` | `accepted` | `agent`, este último solo si sube el color;
  - `reason` es «Línea N: …».
- `renderer/viewmodels/auditViewModel.js` audita completo al abrir un proyecto. Además:
  - `check` de los archivos que cambian en disco (`fs:changed`);
  - `auditNow()` cuando se pide;
  - `accept()`.
  - Hace una auditoría a la vez y descarta las de otro proyecto.
- **Reparaciones** (`repairViewModel`):
  - el prompt del agente lleva la regla y la línea exactas;
  - al terminar se audita el proyecto entero (`auditNow('repair')`);
  - `fixed` = verificado por la auditoría; `partial` = cambió archivos, pero el hallazgo sigue;
  - «Ya lo apliqué» y «Volver a auditar» vuelven a leer el archivo antes de verificar.
- **Panel de Riesgos:**
  - porcentaje, hace cuánto se auditó y «Auditar de nuevo»;
  - «Cómo ha cambiado»: historial con causa y archivos;
  - cada hallazgo con su línea;
  - «Marcar como revisado» en los amarillos.
- **Llamada con Qubi:**
  - `ver_proyecto` trae el puntaje y «archivo (línea N: qué)»;
  - `revisar_archivo` le pasa al agente lo que encontró la auditoría y Qubi oye ambas cosas;
  - herramientas `auditar` y `reparar`; `reparar` necesita el sí de la persona y avisa del veredicto al terminar.
- **MCP:**
  - `platanus_list_risks` incluye `findings` (regla y línea);
  - `platanus_set_file_score` solo puede subir un color.

## Precisión (revalidado con team-12, 2026-10-25)

Primera pasada sobre team-12: 0 %, con 8 rojos y 18 amarillos. Casi todos eran falsos positivos y además faltaba la mitad del proyecto. Lo corregido:

- **Cobertura:** el tope de 3,000 archivos cortaba el proyecto, porque `video/` tiene miles de imágenes. Ahora el tope es 20,000 y los archivos que no son texto solo se listan. 6,845 archivos se auditan en 0.4 s.
- **Solo cuenta el código:** cada regla cuenta solo si cae en código real, no dentro de un texto entre comillas, una expresión regular o un comentario (`codeMask`). Antes se marcaban las descripciones de las reglas en `es.js` y los patrones de la propia auditoría.
- **`innerHTML`:** es seguro con un texto fijo, un icono, un mapa constante (`RISK_ICON.red`), `markdownToHtml`, texto escapado (`escapeHtml`) o los textos de la app, también dentro de un ternario. Una variable o una función que arma HTML queda «por revisar».
- **Pruebas:** en tests y fixtures no se aplican las reglas de código, porque contienen patrones malos a propósito. Una clave en un test sale «por revisar» (`secretInTest`), no en rojo.
- **Archivos de claves** (`.env*`, llaves, secretos): rojo si git los rastrea (`git ls-files`), amarillo si no están en `.gitignore` (`git check-ignore`), verde si están ignorados y nunca se subieron. Fuera de git, se lee el `.gitignore` de la raíz.
- **Resultado en team-12:** 20 %. Hay 1 rojo, la inyección SQL del proyecto de ejemplo del video, que es vulnerable a propósito. Hay 13 amarillos: claves falsas en pruebas, `innerHTML` que recibe HTML desde una variable y el Dockerfile del ejemplo.
- **En vivo:**
  - un archivo nuevo con `eval` bajó la app a 15 % en unos 4 s;
  - al arreglarlo volvió a 20 %;
  - todo quedó en el historial guardado.

## Probado en la app (feria-test, 2026-10-24)

- Al abrir: 75 %. `orders.ts` en rojo (línea 12); `Dockerfile` y `002_ingresos_feria.sql` en amarillo; `001_init.sql` en verde.
- Al arreglar la consulta con parámetros en el disco: 90 % al momento. Al cerrar y abrir la app: sigue en 90 %, con el historial.
- Al volver a la versión vulnerable: 75 % otra vez, y el historial lo registra (75 → 90 → 75).

## Límites

- Son reglas por patrones: encuentran lo común, no todo. Un archivo verde no garantiza que no tenga fallas de lógica, como cobrar antes de validar cantidades.
- La auditoría no despliega. Comprueba el código del proyecto en este equipo antes de desplegarlo.
- Sin probar todavía con voz: `auditar` y `reparar` en una llamada real.
