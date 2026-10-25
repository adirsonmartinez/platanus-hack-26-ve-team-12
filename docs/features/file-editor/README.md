# Editor de archivos

Al hacer clic en un archivo del mapa (o al abrirlo desde un enlace del chat) se abre una ventana flotante con el archivo, como en un IDE.

## Cómo se usa

- **Pestañas:** cada archivo abierto es una pestaña con su semáforo. Un clic en otro archivo agrega una pestaña; si ya estaba abierto, solo la activa. La × (o el clic central) cierra la pestaña; si tiene cambios sin guardar, primero pregunta.
- **Editar y guardar:** el código se ve con colores de sintaxis (CodeMirror) según el tipo de archivo: JS/TS/JSX/TSX, JSON, CSS, HTML/SVG, Markdown, Python, SQL, YAML, TOML, shell y `.env`/ini. Un punto en la pestaña marca los cambios sin guardar. ⌘S / Ctrl+S o el botón **Guardar** guardan. Tab indenta, ⌘F busca y reemplaza, ⌘Z deshace (cada pestaña con su propio historial), y los bloques se pliegan desde el margen.
- **Ventana:** se arrastra por la barra de título (doble clic: vuelve a su lugar) y se redimensiona desde la esquina. Por defecto queda a la derecha y deja sitio al chat. Mientras se escribe, las teclas no mueven el mapa.
- **Cambios en el disco:** si el archivo cambia por fuera (el agente, otro editor, git), una pestaña sin cambios se recarga sola. Si tiene cambios, aparece un aviso con **Recargar del disco**.

## Vista previa (2026-10-25, solo escritorio)

- Una página (`.html`, `.htm`, `.svg`) abre directo en **Vista previa**, con su CSS, sus scripts y sus imágenes. El botón **Código / Vista previa** cambia entre las dos. Las imágenes (`.png`, `.jpg`, `.gif`, `.webp`…) solo tienen vista previa.
- Cualquier cambio en el disco (el agente guarda un CSS, un script…) recarga sola la página en vista previa. ⟳ recarga a mano y ↗ la abre en el navegador de la persona.
- **El proyecto corriendo** (`localhost`): «Ver tu proyecto», el botón del chat y `abrir_en_navegador` de Qubi abren una pestaña `localhost:3000` en el editor en vez de Chrome. Solo se aceptan `http://localhost:<puerto>` y `http://127.0.0.1:<puerto>`.
- **Cómo se protege:**
  - main sirve los archivos en `qubbot-preview://project/<ruta>` (`electron/preview.js`): solo GET, solo el proyecto abierto (enlaces resueltos), nunca un secreto (la misma lista que el MCP, en la ruta pedida y en la real) y como mucho 25 MB;
  - la página va en un iframe con `sandbox` (scripts, formularios y alertas sí; ventanas emergentes y navegar la app no) y con un origen distinto al de la app, así que no llega a `window.platanus` (probado: `SecurityError`);
  - la CSP de `index.html` solo deja enmarcar `qubbot-preview:` y `localhost`, y los permisos (cámara, micrófono) se niegan a todo lo que no sea la app;
  - mientras hay vista previa, el editor no usa el filtro de vidrio (`backdrop-filter` con SVG), porque desenfocaba el iframe.

## Seguridad

- Los archivos secretos (`.env`, llaves, credenciales…) **sí se abren** con la etiqueta **Secreto**, porque es la persona quien los mira. Guardar uno pide confirmación nativa.
- El agente sigue sin poder leerlos: el editor usa sus propios canales (`editor:open` y `editor:save`), no las herramientas MCP, que siguen bloqueando los secretos.
- Cada guardado respalda la versión anterior en `~/.platanus/backups/`, igual que los cambios del agente.
- Un guardado lleva el `mtime` con que se leyó el archivo. Si el archivo cambió en el disco mientras tanto, el guardado se rechaza para no pisar el otro cambio.
- No abre archivos binarios ni archivos de más de 2 MB. Las rutas siguen confinadas al proyecto (`workspace.resolve`).

## Archivos

- `renderer/viewmodels/editorViewModel.js`: pestañas, edición, guardado, conflictos.
- `renderer/views/ui/editorView.js` y los estilos al final de `renderer/styles/shell.css`. Los colores de sintaxis son tokens `--syntax-*` en `renderer/styles/main.css`: tonos fríos alrededor del morado, porque el ámbar, el rojo y el verde quedan para seguridad.
- `renderer/models/fileLanguage.js`: qué lenguaje corresponde a cada archivo. `renderer/vendor/codemirror.js` (generado con `npm run vendor` desde `scripts/vendor/codemirror.entry.js`).
- `electron/preview.js` (protocolo `qubbot-preview`, con pruebas en `electron/preview.test.js`).
- `electron/main.js` (`editor:open`, `editor:save`, registro del protocolo), `electron/preload.js` (`openFile`, `saveFile`) y los textos en `electron/strings.js` y `renderer/i18n/es.js` (`editor`).
- Demo web: `demoFileContent()` en `renderer/models/demoProject.js`. Los guardados quedan en memoria.

## Pruebas

`tests/renderer/editorViewModel.test.mjs` y `tests/renderer/fileLanguage.test.mjs` (`npm test`).
