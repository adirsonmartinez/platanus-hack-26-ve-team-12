# Editor de archivos

Al hacer clic en un archivo del mapa (o al abrirlo desde un enlace del chat) se abre una ventana flotante con el archivo, como en un IDE.

## Cómo se usa

- **Pestañas:** cada archivo abierto es una pestaña con su semáforo. Un clic en otro archivo agrega una pestaña; si ya estaba abierto, solo la activa. La × (o el clic central) cierra la pestaña; si tiene cambios sin guardar, primero pregunta.
- **Editar y guardar:** el código se ve con colores de sintaxis (CodeMirror) según el tipo de archivo: JS/TS/JSX/TSX, JSON, CSS, HTML/SVG, Markdown, Python, SQL, YAML, TOML, shell y `.env`/ini. Un punto en la pestaña marca los cambios sin guardar. ⌘S / Ctrl+S o el botón **Guardar** guardan. Tab indenta, ⌘F busca y reemplaza, ⌘Z deshace (cada pestaña con su propio historial), y los bloques se pliegan desde el margen.
- **Ventana:** se arrastra por la barra de título (doble clic: vuelve a su lugar) y se redimensiona desde la esquina. Por defecto queda a la derecha y deja sitio al chat. Mientras se escribe, las teclas no mueven el mapa.
- **Cambios en el disco:** si el archivo cambia por fuera (el agente, otro editor, git), una pestaña sin cambios se recarga sola. Si tiene cambios, aparece un aviso con **Recargar del disco**.

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
- `electron/main.js` (`editor:open`, `editor:save`), `electron/preload.js` (`openFile`, `saveFile`) y los textos en `electron/strings.js` y `renderer/i18n/es.js` (`editor`).
- Demo web: `demoFileContent()` en `renderer/models/demoProject.js`. Los guardados quedan en memoria.

## Pruebas

`tests/renderer/editorViewModel.test.mjs` y `tests/renderer/fileLanguage.test.mjs` (`npm test`).
