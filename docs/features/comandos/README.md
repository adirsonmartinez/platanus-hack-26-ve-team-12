# Comandos y borrados del agente

Los agentes siguen actuando **solo con herramientas de Qubbot**: no se les da terminal ni se aflojan sus
flags. Para que puedan instalar, probar, compilar o limpiar, Qubbot ofrece dos herramientas MCP con límites fijos.

## `platanus_run_command` (`electron/commandRun.js`)

- **Un solo comando, sin shell:** se rechazan `;`, `&&`, `|`, `>`, `$( )`, comillas invertidas y saltos de línea. Se ejecuta con `spawn(..., { shell: false })` dentro del proyecto (`workspace.resolve`, con los enlaces resueltos).
- **Lista permitida:**
  - `npm`, `pnpm`, `yarn` y `bun` (install, add, remove, run, test, audit…);
  - `npx <paquete>`;
  - `node` o `python` con un archivo del proyecto (nunca un secreto);
  - `tsc`, `eslint`, `prettier`, `vitest`, `jest` y `playwright` del proyecto, vía `npx --no-install`, que nunca descarga;
  - `git` solo para mirar (status, diff, log, show…).
- **Nunca:**
  - instalaciones globales (`-g`, `--global`, `--prefix`): el agente debe usar `npx`;
  - otros programas (`rm`, `curl`, `sh`, `sudo`…);
  - git que cambie historial, `node -e` ni `npm publish`.
- **Permiso** (según el modo del chat):
  - Manual pregunta siempre;
  - Automático pregunta solo si el comando puede cambiar algo, porque los de solo lectura (test, lint, audit, git status) corren solos;
  - Sin preguntar no pregunta.
  - El diálogo muestra el comando exacto, el motivo y la carpeta.
- **Ejecución:**
  - tiempo máximo de 5 min;
  - la salida se recorta a 12,000 caracteres (el final);
  - se tapan las claves con forma conocida y los colores ANSI;
  - el entorno se limpia de variables con KEY, TOKEN, SECRET o PASSWORD.
- **Equipo y recorrido:** los trabajadores del equipo no ejecutan comandos, y el recorrido es de solo lectura.

## `platanus_delete_file`

- Borra un archivo del proyecto. Las carpetas y los secretos no se borran.
- Un trabajador solo puede borrar dentro de su carpeta.
- Antes de borrar guarda una copia: «Deshacer» lo devuelve.
- Pregunta siempre, salvo en modo Sin preguntar.
- Llega al chat como un cambio con su diff.

## En el chat

`run_command` aparece como el paso «Ejecutando «npm install zod»…» y `delete_file` como «Borré old.js (hay copia)».
