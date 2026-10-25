# 001 · Servidores corriendo

- **Estado:** implementada en `feature/server` (falta revisión y validación en Windows)
- **Autor:** Génesis Zapata
- **Revisor:** (por asignar)
- **Fecha:** 2026-10-24
- **Rama:** `feature/server`

## Contexto

Hoy Qubbot solo conoce su propio servidor: el MCP local en `127.0.0.1:7811`, que se ve en "Conecta tu agente". No muestra qué otros procesos están escuchando en un puerto de la máquina. Quien programa con IA suele dejar servidores de desarrollo encendidos sin saber que algunos (`python3 -m http.server`, Vite con `--host`) quedan accesibles para cualquier equipo de la misma red WiFi. Se quiere una vista con todos los servidores de la máquina, que marque en amarillo los expuestos a la red, que permita abrirlos en el navegador predeterminado o en otro, y que permita detenerlos con confirmación. Tiene que funcionar en la app de Mac, en la de Windows y en la demo web (con datos de ejemplo).

## Comportamiento esperado

- **B1.** WHEN la persona abre la vista de servidores en la app de escritorio (macOS o Windows), THE SYSTEM SHALL listar cada proceso que escucha en un puerto TCP y que el sistema deja ver sin permisos de administrador, con su puerto, el nombre del proceso y si escucha solo en esta computadora o en toda la red.
- **B2.** WHEN el sistema no deja ver el nombre del proceso de un puerto, THE SYSTEM SHALL mostrar el servidor igual, con el nombre como desconocido.
- **B3.** WHEN un servidor escucha solo en localhost (`127.0.0.1` o `::1`), THE SYSTEM SHALL mostrarlo en estado tranquilo: sin color de alerta y sin brillo.
- **B4.** WHEN un servidor escucha en todas las interfaces (`0.0.0.0`, `::`, `*`) o en una IP de red, THE SYSTEM SHALL marcarlo en amarillo como "Visible en tu red". El motivo (otros equipos de la red pueden conectarse) aparece solo al pasar el mouse por esa etiqueta.
- **B5.** WHEN un servidor arranca o se detiene mientras la vista está abierta, THE SYSTEM SHALL reflejarlo en la lista en un plazo de *N* segundos (*N*: decisión abierta D2).
- **B6.** WHEN la persona toca "Abrir" en un servidor y elige "Navegador predeterminado", THE SYSTEM SHALL abrir `http://localhost:<puerto>` en el navegador predeterminado, y nada más.
- **B7.** WHEN la ventana pide abrir un puerto que no es un entero entre 1 y 65535, THE SYSTEM SHALL rechazar el pedido sin abrir nada.
- **B8.** WHEN no hay ningún servidor escuchando, THE SYSTEM SHALL mostrar un estado vacío en español.
- **B9.** WHEN el sistema operativo no entrega la lista (el comando no existe, falla o tarda demasiado), THE SYSTEM SHALL mostrar un mensaje de error en español en la vista, y el resto de la app sigue funcionando.
- **B10.** WHEN la app corre como demo web (sin Electron), THE SYSTEM SHALL mostrar servidores de ejemplo, marcados como ejemplo, con al menos uno expuesto para que se vea el semáforo, y sin los botones "Abrir" ni "Detener".
- **B11.** WHEN la persona toca el menú ⋯ de un servidor, THE SYSTEM SHALL mostrar, solo para ese servidor, bajo "Abrir con", las opciones "Navegador predeterminado", cada navegador instalado que reconoce (Safari, Chrome, Firefox, Edge, Brave, Arc, Opera, Vivaldi, Chromium) y "Elegir otra app…"; al elegir un navegador, abre la URL en ese navegador.
- **B12.** WHEN la persona elige "Elegir otra app…", THE SYSTEM SHALL abrir el diálogo del sistema para elegir una aplicación (`.app` en macOS, `.exe` en Windows) y abrir la URL con ella; si cancela, no pasa nada y no se muestra ningún aviso.
- **B13.** WHEN la persona toca el ícono ■ o "Detener…" en el menú ⋯, THE SYSTEM SHALL pedir confirmación en un diálogo del sistema que nombra el proceso y el puerto, con "Cancelar" por defecto; solo si acepta, detiene el proceso, vuelve a leer la lista y muestra "Listo: se detuvo el servidor del puerto N".
- **B14.** WHEN el servidor a detener es Qubbot o un proceso del sistema (pid 0, 1 o 4), THE SYSTEM SHALL negarse sin mostrar el diálogo y explicar por qué.
- **B15.** WHEN el servidor ya no escucha en ese puerto al confirmar, o el sistema no deja detenerlo (otro usuario o el sistema), THE SYSTEM SHALL no detener nada más y mostrar el motivo en español.
- **B16.** WHEN la persona elige "Pausar" en el menú ⋯, THE SYSTEM SHALL congelar el proceso sin diálogo (macOS `SIGSTOP`, Windows `NtSuspendProcess`), marcar la fila "En pausa" y cambiar el ícono ■ por ▶. El puerto sigue ocupado y el servidor no responde. Qubbot, los procesos del sistema y los pid 0, 1 y 4 no se pausan.
- **B17.** WHEN la persona toca ▶ o "Reanudar" en una fila en pausa, THE SYSTEM SHALL continuar el mismo proceso tal como estaba. Solo se reanudan los procesos que pausó Qubbot. Al cerrarse, Qubbot reanuda todo lo que pausó.
- **B18.** WHEN Qubbot detiene un servidor en macOS, THE SYSTEM SHALL guardar, solo en el proceso principal, su comando y su carpeta, y mostrarlo en "Detenidos desde Qubbot" con ▶. Al tocar ▶ o "Reactivar…" pide confirmación mostrando la carpeta y el comando (con los valores secretos ocultos) y, si la persona acepta, lo inicia **dentro de Qubbot**, en segundo plano y sin abrir ninguna ventana de Terminal. Si el puerto ya está ocupado, se niega sin iniciar nada. Si no se pudo leer el comando, o en Windows, la fila explica que no se puede reactivar y solo ofrece "Quitar de la lista".
- **B19.** WHEN Qubbot inicia un servidor (B18), THE SYSTEM SHALL mostrar la fila como "Iniciando…" (con ■ para cancelar) hasta que algo escuche en ese puerto. Desde ahí aparece en la lista con la etiqueta "En Qubbot" y su salida en ⋯ › "Ver salida". Si se cierra solo, vuelve a "Detenidos" como "Se cerró solo", con su código y su salida, y se puede reactivar otra vez. Si se detiene, por la persona o al cerrar Qubbot, conserva el comando con el que se inició, así que siempre se puede volver a reactivar.

**Ejemplo de punta a punta** (datos ficticios):

1. Ana tiene abierta la app de Mac. En una terminal corre `npm run dev` (Vite, escucha en `127.0.0.1:5173`) y en otra `python3 -m http.server 8000` (escucha en `0.0.0.0:8000`).
2. Abre la vista de servidores y ve tres filas:
   - `node · 5173 · solo esta computadora`, tranquilo.
   - `Electron · 7811 · solo esta computadora`, tranquilo (es el MCP de Qubbot).
   - `Python · 8000 · toda la red`, amarillo, con el motivo "Cualquier equipo de tu red WiFi puede abrir este servidor".
3. Toca "Abrir" en la fila 5173, elige "Firefox" y se abre `http://localhost:5173` en Firefox, aunque su navegador predeterminado sea Safari.
4. Toca "Detener" en la fila 8000. El sistema pregunta "¿Detener Python en el puerto 8000?". Ana acepta, la fila desaparece y la vista dice "Listo: se detuvo el servidor del puerto 8000".
5. Toca "Detener" en la fila 7811 y la app responde que ese proceso es Qubbot y no se detiene desde ahí.

## Out of scope

- Iniciar servidores nuevos. Solo se reabren los que detuvo Qubbot en esta sesión (B18), y la lista de detenidos no sobrevive a cerrar la app.
- Copiar las variables de entorno del proceso original al reactivar, porque pueden ser secretos.
- Reactivar en Windows: el sistema no expone la carpeta de trabajo de otro proceso (ver D9).
- Recordar el navegador elegido: la persona elige cada vez.
- Cambiar la dirección donde escucha un servidor o "arreglar" la exposición. Qubi no repara servidores en esta versión.
- Rojo para bases de datos expuestas (Postgres, MySQL, Redis, Mongo). Se eligió solo amarillo.
- Darle la lista al agente por MCP (no hay una herramienta nueva `platanus_*` en esta versión).
- Linux, porque no hay build de Linux.
- Procesos que solo se ven con permisos de administrador (ver D6).
- Puertos UDP: solo servidores TCP en escucha.
- Escanear otros equipos de la red o servidores remotos.
- El detalle de los contenedores Docker: solo se ve el puerto publicado en la máquina.
- Historial de servidores que estuvieron encendidos antes.
- Línea de comandos completa, variables de entorno o usuario dueño del proceso.

## Checklist de dominio

- [ ] **Listar es solo lectura.** Leer la lista nunca inicia, detiene ni modifica procesos.
- [ ] **Detener siempre pregunta.** El diálogo es del sistema (no HTML) y tiene "Cancelar" por defecto. Cada detención y cada apertura quedan en el registro de auditoría.
- [ ] **La ventana nunca envía un pid ni una ruta de programa.** El proceso principal busca el pid a partir del puerto y lo vuelve a comprobar después del diálogo. Los navegadores se eligen por id de una lista conocida, o los elige la persona en el diálogo del sistema.
- [ ] **Nunca se detiene ni se pausa Qubbot ni un proceso del sistema** (pid 0, 1 o 4).
- [ ] **Nada queda congelado.** Al cerrar Qubbot se reanudan todos los procesos que pausó.
- [ ] **El comando para reactivar nunca llega a la ventana.** La ventana solo recibe `{ id, port, process, canRestart, state, exitCode, hasOutput, at }` y devuelve el id (16 hex). El comando se ejecuta solo después del diálogo, con el shell de inicio de sesión de la persona (zsh o bash) y un script fijo, `exec "$@"`; las palabras van como argumentos, así que `$`, `;`, `|` y los backticks nunca se interpretan.
- [ ] **No quedan servidores escondidos.** Un servidor que inició Qubbot no tiene terminal, así que se detiene al cerrar Qubbot, y su salida (las últimas 300 líneas, sin colores) solo se muestra dentro de la app.
- [ ] **Sin privilegios elevados.** La app nunca pide `sudo`, permisos de administrador ni UAC para esta vista.
- [ ] **Nada de la ventana llega a una línea de comandos.** Los comandos del sistema son fijos, sin shell y con tiempo límite, igual que la vista de Git.
- [ ] **Mínimo de datos del proceso.** Solo se muestran el nombre, el puerto y la dirección. Nunca la línea de comandos, las variables de entorno ni los archivos abiertos, porque pueden contener secretos (`--password=…`, `DATABASE_URL`).
- [ ] **Abrir en el navegador está acotado.** El proceso principal arma la URL con host fijo `localhost`, esquema `http` y un puerto validado (entero entre 1 y 65535). La ventana nunca envía una URL.
- [ ] **El renderer no toca el sistema.** Todo pasa por `window.platanus.*` (preload) y el proceso principal valida cada pedido.
- [ ] **Textos al usuario en español**, solo en `renderer/i18n/es.js` y `electron/strings.js`.
- [ ] **Colores del sistema visual.** Expuesto usa el ámbar reservado para problemas de seguridad (`#ffc24a`) y lo seguro no brilla. Sin colores nuevos fuera de `materials.js`, `theme.js` y los tokens de `main.css`.
- [ ] **Los datos de ejemplo no se confunden con datos reales.** En la demo web cada fila se marca como ejemplo.
- [ ] **Tests primero** para la lógica del modelo y del view model (regla del repo).

## Plan de validación

| Comportamiento | Chequeo | Resultado esperado |
|---|---|---|
| B1 | Test unitario que lee la salida de ejemplo del comando de macOS y de Windows (fixtures guardados en el test) | Devuelve una entrada por servidor con puerto, proceso y dirección |
| B1 | Manual en Mac: con la app abierta, abrir la vista | Aparece `7811` (MCP de Qubbot) |
| B2 | Test unitario con una línea de ejemplo sin nombre de proceso | La entrada existe y el nombre es "desconocido" |
| B3 | Test unitario con `127.0.0.1:5173` y `[::1]:5173`. Manual: `python3 -m http.server 8001 --bind 127.0.0.1` | Nivel tranquilo, sin motivo de alerta |
| B4 | Test unitario con `0.0.0.0:8000`, `*:8000`, `[::]:8000` y `192.168.1.20:8000`. Manual: `python3 -m http.server 8000` | Nivel amarillo con el motivo en español; en la app, la fila 8000 se ve amarilla |
| B5 | Test del view model con `mock.timers`: el servicio falso devuelve primero `[8000]` y después `[]` | Después de *N* segundos simulados, la lista queda vacía |
| B5 | Manual: cortar el `http.server` con Ctrl+C | La fila desaparece en menos de *N* segundos |
| B6 | Test del handler del proceso principal con `shell` falso, pidiendo el puerto 5173 | Se llama una sola vez con `http://localhost:5173` |
| B7 | Test del handler con `"8000; rm -rf ~"`, `-1`, `0`, `70000`, `"javascript:alert(1)"` y `8000.5` | Responde `{ ok: false }` y el `shell` falso no se llama |
| B8 | Test del view model con un servicio falso que devuelve `[]` | El estado indica vacío; la vista muestra el texto de `es.js` |
| B9 | Test con un servicio falso que devuelve `{ ok: false }` o que vence el tiempo | El estado tiene el error y los demás stores no cambian |
| B10 | `npm run build:web`, servir con `python3 -m http.server 8080 --bind 127.0.0.1 --directory dist`, abrir `http://localhost:8080` y abrir la vista | Se ven los servidores de ejemplo, marcados como ejemplo, con al menos uno amarillo |
| B11 | Test: abrir con un id conocido; ids desconocidos o con forma de ruta (`/Applications/Evil.app`, `../chrome`) | Se lanza la ruta del navegador detectado; lo demás responde `unknownBrowser` sin lanzar nada |
| B11 | Test de detección con un `exists` falso, en macOS y en Windows | Solo aparecen los navegadores instalados; la ventana recibe `{ id, name }` sin rutas |
| B12 | Test con un selector falso que devuelve una app o `null`; test de `isAppPath` | Con app, se lanza con la URL como argumento aparte; con `null`, `cancelled` y no se lanza nada; `.sh` y `.bat` se rechazan |
| B13 | Test con diálogo falso que responde sí y no. Manual: Detener en la fila de `python3 -m http.server 8000` | Con "no", nada se detiene; con "sí", se detiene ese pid y la fila desaparece |
| B14 | Test con el pid propio y con los pid 0, 1 y 4 | `protected`, sin diálogo y sin detener nada |
| B15 | Test: el servidor desaparece mientras el diálogo está abierto; el pid cambia de puerto; `kill` falla con `EPERM` o `ESRCH` | `notRunning` o `notAllowed`, y no se detiene ningún otro proceso |
| B16 | Tests: pausa todos los pid del puerto y los recuerda; se niega con el pid propio, con 0, 1 y 4, y si la señal falla. Manual: Pausar el 8000 y `curl -m 1 localhost:8000` | El curl no responde; la fila dice "En pausa" con ▶ |
| B17 | Test: reanuda solo los pid que pausó Qubbot. Test de `terminate` con un pid en pausa. Manual: ▶ | Se envía SIGTERM y luego SIGCONT; el curl vuelve a responder |
| B18 | Tests: captura antes de detener; comando por `ps` y carpeta por `lsof`; el shell recibe las palabras como argumentos; los secretos se ocultan; el registro no expone el comando; pide confirmación; puerto ocupado, segundo clic e id desconocido no inician nada. Manual: Detener el 8000 y luego ▶ en Detenidos | No se abre ninguna ventana; la fila pasa a "Iniciando…" y después el 8000 vuelve a la lista con "En Qubbot" |
| B19 | Tests: salida con las últimas líneas y sin colores; una detención de la persona no cuenta como cierre solo; un cierre solo se informa con su código; al salir se detienen todos; la fila sale de Detenidos cuando el puerto escucha; "Ver salida" sigue al servidor; cancelar un inicio. Manual: detener y reactivar dos veces seguidas; reactivar un comando que falla | Siempre se puede volver a reactivar; el que falla aparece como "Se cerró solo · código N" y muestra su error en "Ver salida" |
| Windows (B1, B3, B4, B16) | En una máquina con Windows, instalar el `.exe` del CI, correr `py -m http.server 8000`, pausar y reanudar | Aparece `8000` en amarillo y `7811` tranquilo; la pausa y la reanudación funcionan |

**Condición de terminado:** `npm test` termina con `# fail 0` e incluye los tests de B1 a B19. Con `python3 -m http.server 8000` corriendo, la vista de servidores de la app de Mac muestra el puerto 8000 en amarillo y el 7811 tranquilo, "Abrir" ofrece el navegador predeterminado y los instalados, y "Detener" en el 8000 pide confirmación y lo cierra.

## Rollout

Se trabaja en `feature/server`, que vuelve a `develop` con `git flow feature finish server`. Llega a la demo con el próximo `release/*`. No usa feature flags.

## Decisiones abiertas

Génesis pidió implementar sin esperar estas respuestas. Para D1 a D6 se tomó la opción por defecto que figura abajo. Cada una se puede cambiar en la revisión.

- **D1. ¿Dónde vive la vista?** *Por defecto:* un ícono nuevo, "Servidores", en la barra flotante, junto a Riesgos y Reparaciones. Sigue el patrón de las otras vistas laterales. Alternativas: un contador en la barra de estado o nodos en el mapa 3D. **Decide:** Génesis, con quien lleva el shell.
- **D2. ¿Cada cuánto se actualiza la lista (*N* en B5)?** *Por defecto:* *N* = 3 segundos, solo mientras la vista está abierta; con la vista cerrada no se consulta al sistema. **Decide:** Génesis.
- **D3. ¿Se destacan los servidores del proyecto abierto?** *Por defecto:* no se destacan. El orden es primero los expuestos y después por puerto. **Decide:** Génesis.
- **D4. ¿Un mismo proceso en el mismo puerto por IPv4 e IPv6 se muestra una vez o dos?** *Por defecto:* una vez, con la exposición más amplia. **Decide:** Génesis.
- **D5. ¿"Abrir en el navegador" aparece en todos los puertos o solo en los que responden HTTP?** *Por defecto:* en todos. Abrir un puerto que no es web solo muestra un error del navegador. En la demo web no hay botón, sino la etiqueta "Ejemplo". **Decide:** Génesis.
- **D6. ¿Está bien no mostrar los procesos que solo se ven con permisos de administrador?** *Por defecto:* sí, la app nunca pide `sudo`. En macOS quedan fuera los servicios del sistema y de otros usuarios; en Windows, `netstat` sí los muestra. **Decide:** Génesis.
- **D8. ¿Detener cierra el proceso de forma normal o forzada?** *Por defecto:* normal en macOS (`SIGTERM`): el programa puede cerrar bien, pero si ignora la señal sigue en la lista. En Windows el cierre siempre es forzado. **Decide:** Génesis.
- **D9. ¿Reactivar en Windows?** *Por defecto:* no se ofrece, porque Windows no expone la carpeta de trabajo de otro proceso y reabrir el comando en otra carpeta haría que el servidor sirva otra cosa. **Decide:** Génesis.
- **D10. ¿La lista de detenidos se guarda entre sesiones?** *Por defecto:* no, vive en memoria mientras Qubbot está abierto, para no guardar comandos en disco. **Decide:** Génesis.
- **D11. ¿Un servidor que inició Qubbot sigue corriendo al cerrar la app?** *Por defecto:* no, se detiene. Sin terminal ni ventana, quedaría escuchando sin que nadie lo vea, y si está expuesto a la red eso es un riesgo. **Decide:** Génesis.
- **D7. ¿Quién valida en Windows antes del release?** Sigue abierta. La parte de Windows está cubierta con tests sobre salidas de ejemplo de `netstat` y `tasklist`, pero nadie la corrió en un Windows real. **Decide:** el equipo.
