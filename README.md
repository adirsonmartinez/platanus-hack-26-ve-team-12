# team-12 Platanus Hack 26: Caracas ft. Yummy Project

<img src="./project-logo.png" alt="Project Logo" width="200" />

Track: 🧊 3D

team-12

- Rafael Alejandro Oviedo Rojas ([@raor00](https://github.com/raor00))
- Hendry Desire Varela Pérez ([@sirevarr](https://github.com/sirevarr))
- Génesis Angelina Zapata López ([@zagenesis19](https://github.com/zagenesis19))

## Qubbot

IDE visual: tu proyecto se ve como un mapa isométrico. La carpeta raíz es el edificio principal, cada carpeta un edificio, y al abrir uno ves sus archivos por piso como cubitos con un semáforo de seguridad. Un agente de IA crea y corrige el código, y lo peligroso (borrar, sobrescribir) necesita tu aprobación.

## Probar Qubbot

- **Landing:** https://qubbot-tka9.onrender.com (carpeta `landing/`, publicada en Render con `render.yaml`).
- **Descargar la app (Mac o Windows):** [última versión](https://github.com/adirsonmartinez/platanus-hack-26-ve-team-12/releases/latest).

## Arrancar

```bash
npm install
npm start        # abre la app
npm run dev      # igual, con DevTools abiertas
```

Requiere Node 20 o más nuevo. `npm install` también baja el programa de Electron (`postinstall`): con npm 11 la instalación de dependencias ya no lo hace sola. Si la app no abre, corre `npm run postinstall`.

Si abres `renderer/index.html` en el navegador, verás un proyecto de demo (sin acceso al disco).
`npx electron . --open=/ruta/al/proyecto` abre esa carpeta al arrancar; las últimas abiertas quedan en *Archivo → Abrir reciente*.

En la app (guía completa en [`docs/INTERFAZ.md`](docs/INTERFAZ.md)):
- **El mapa ocupa toda la ventana** y todo lo demás flota encima: la barra de íconos (arriba), el panel lateral (izquierda) y el chat (derecha). Se pliegan, se arrastran por su encabezado y vuelven a su lugar con doble clic.
- **Chat interactivo**: el agente responde con tarjetas (riesgo, está bien, idea, tu siguiente paso), los nombres de archivo llevan al mapa y al final propone próximos pasos como botones. **Vibe / Dev** cambia cómo te habla (se configura en [`agent/`](agent/README.md)) y además se adapta a cómo escribes. Mientras trabaja, un orbe dice qué hace y una luz recorre la caja de texto.
- **Barra de íconos**: paneles (Explorador, Riesgos, Reparaciones, Conecta tu agente) y vistas (Mapa, Git, Proyecto, Grafo). Al pasar el mouse dice qué es cada uno; se ordena arrastrando los íconos.
- **Chat**: el pin 📌 lo fija como columna a la derecha (el mapa le deja espacio y arriba va la tarjeta de seguridad); su borde izquierdo cambia el ancho. Minimizado, queda un botón flotante con su menú.
- **Tarjeta de seguridad**: puntaje y totales. Se mueve, se minimiza y se ancla sobre el chat fijado; sus números de riesgo abren la lista de Riesgos.
- **Mover el mapa**: arrastrar con clic izquierdo rota e inclina; clic derecho o Shift + arrastrar mueve; rueda acerca; flechas o WASD desplazan; Q / E giran 90°. La ruta de arriba a la izquierda dice en qué carpeta estás.
- **Vibe / Dev** (arriba a la derecha y en el explorador): Vibe es una guía con nombres sencillos; Dev muestra todas las carpetas, rutas y reglas.
- **Qubi y las reparaciones**: "Reparar" hace que Qubi camine al edificio mientras tu agente revisa el archivo; cada cambio pide tu permiso y se puede deshacer. Todo queda en el historial de Reparaciones.
- **Conecta tu agente**: usa tu suscripción de Claude Code, Grok o Codex (modelo y esfuerzo ajustables, o dos agentes a la vez para comparar), o conecta tu editor al servidor MCP local (la dirección, con su llave privada, se copia desde ese panel).

En el chat:
- `abrir carpeta`: elige la carpeta del proyecto. El agente no puede salir de ella.
- `crea carpeta src` / `crea archivo src/app.js con console.log("hola")`
- `listar archivos`, `borra src/app.js` (pide confirmación)
- `simular ataque` / `corregir`: demo de Supabase con RLS desactivado

## Despliegue

- **Demo web (Vercel)**: `npm run build:web` genera `dist/` con el mapa y el proyecto de demo. Vercel lo construye solo con `vercel.json`, desde el repo personal (las plataformas de deploy no pueden conectarse al repo de la organización).
- **App de escritorio**: `npm run dist:mac` / `npm run dist:win` generan los instaladores en `dist-electron/`. Al subir un tag `vX.Y.Z` (lo crea `git flow release finish`), GitHub Actions construye el `.dmg` y el `.exe` y los publica en *Releases*.
- **Remotos**: `origin` empuja a la vez al repo del equipo y al personal (`git remote -v`), así un solo `git push` actualiza los dos.

## Reglas del código

- **Todo el código en inglés**: variables, comentarios, nombres de archivo y commits.
- **Los textos que ve el usuario, en español**, y solo en `renderer/i18n/es.js` y `electron/strings.js`.
- **MVVM** en el renderer. Los detalles están en [`CLAUDE.md`](CLAUDE.md), que también leen los agentes de IA.

## Ramas (git flow)

| Rama | Para qué |
|---|---|
| `main` | Versión lista para la demo. Solo recibe `release/*` y `hotfix/*`, con tag `vX.Y.Z` |
| `develop` | Integración: aquí se juntan las features |
| `feature/<nombre>` | Una tarea. Sale de `develop` y vuelve a `develop` |
| `release/<versión>` | Congelar y pulir (el corte de la hora 26) |
| `hotfix/<versión>` | Arreglo urgente sobre `main` durante la demo |

```bash
git flow feature start chat-approvals    # empezar una tarea
git flow feature finish chat-approvals   # terminarla (vuelve a develop)
git flow release start 0.2.0             # congelar para la demo
git flow release finish 0.2.0            # pasa a main con tag v0.2.0
```

Nunca se hace commit directo en `main`. Los mensajes de commit van en inglés.

## Estructura

```
electron/            proceso principal: ventana, IPC, confirmaciones, límites del workspace,
                     proyectos recientes, servidor MCP local (mcpServer.js) y agentes CLI (agents.js)
renderer/
  main.js            arma Models -> ViewModels -> Views
  models/            datos y reglas (proyecto, semáforo, Supabase, agente, etiquetas, modo Vibe/Dev)
  viewmodels/        estado de pantalla y acciones (mapa, edificio abierto, cámara, chat, shell, grafo, Qubi)
  views/scene/       three.js (mapa, edificio, grietas, Qubi 3D, Supabase, mouse y teclado)
  views/ui/          HTML (shell, chat, selector de agente, grafo, mapa del proyecto, tarjeta de Qubi)
  services/          puente con Electron (disco, agentes, MCP)
  styles/            main.css (mapa) + shell.css (IDE de vidrio) + chat.css (tarjetas, orbes, borde de luz)
  vendor/            efectos de libraries.dev ya preparados (orbes, borde de luz); `npm run vendor`
  i18n/es.js         todos los textos en español
agent/               cómo habla el agente del chat: voice.json + skills modo-vibe y modo-dev
```

## Equipo

| Rol | Carpetas | Primer objetivo |
|---|---|---|
| **Mapa 3D** | `renderer/views/scene/` | Pulir edificios y animaciones; más niveles de carpetas |
| **Electron y archivos** | `electron/` | Pasar las confirmaciones nativas a aprobaciones dentro del chat; comandos de terminal con aprobación |
| **Agente de IA** | `renderer/models/agentModel.js`, `securityModel.js` | Claude Agent SDK con herramientas limitadas al workspace; puntuar archivos con `setScore()` |
| **Supabase y pitch** | `renderer/models/supabaseModel.js`, slides | Leer tablas reales y hallazgos de seguridad en vez de los datos de demo |

Congelar funciones en la hora 26. Desde ahí, solo arreglar errores y ensayar la demo.

## Antes de entregar

- [ ] Completar `platanus-hack-project.jsonc` (nombre, oneliner, descripción y URL de descarga de la app)
- [ ] Reemplazar `project-description.md` con la descripción del proyecto
- [ ] Logo PNG de 1000x1000, máximo 500 KB (`project-logo.png`)

## Chat con comandos git (rama feature/chat-git-commands)

El chat de la guia entiende git en lenguaje natural (commit, rollback, reset, ramas) y lo refleja en el mapa. Detalles, ejemplos y como extenderlo: [docs/GIT-CHAT.md](docs/GIT-CHAT.md).
