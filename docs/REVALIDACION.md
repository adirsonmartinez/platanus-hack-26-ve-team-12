# Revalidación: datos reales y en vivo (2026-10-25)

Cada número de la pantalla se comparó con un cálculo independiente sobre el disco. Cuatro agentes revisaron en
paralelo el chat, los servicios, la llamada y el código de seguridad nuevo (este último en modo adversario,
intentando romperlo). Este documento recoge lo que se refutó y cómo quedó.

## Contrastado con la app real (team-12)

| Dato en pantalla | Cálculo independiente | Resultado |
|---|---|---|
| Seguridad 20 %, 1 en riesgo, 13 por revisar | `auditProject` en node: 1 rojo, 13 amarillos, 20 % | Igual |
| 163 commits | `git rev-list --all --count` = 163 (`HEAD` solo, 162) | Igual: cuenta todas las ramas |
| GitHub · con acceso | `gh auth status` → código 0 | Igual |
| Vercel · sin acceso | CLI de Vercel no instalada | Igual |
| En vivo | Un archivo con `eval` → 15 % en unos 4 s; arreglado → 20 %; queda en el historial guardado | Correcto |

## Refutado y corregido

- **La auditoría no cubría todo:** el tope de 3,000 archivos cortaba team-12, que tiene 6,845. Ahora el tope es 20,000.
- **Falsos positivos de la auditoría:**
  - el texto de las reglas, regex y comentarios;
  - `innerHTML` de iconos o texto escapado;
  - pruebas con patrones malos a propósito.
- **Falsos negativos que encontró el revisor:**
  - un ternario con una variable;
  - código después de `/* */` o de `--n`;
  - una división tras `++`;
  - `outerHTML`, `insertAdjacentHTML`, `document.write`, `window.eval` y `setTimeout('…' + x)`;
  - un `.env` que se subió y luego se sacó con `git rm --cached`. Ahora sale rojo con `secretInHistory`, porque la clave sigue en el historial.
- **Ejecutor de comandos (seguridad, ALTA)**, todo bloqueado y con pruebas:
  - leía claves fuera del proyecto o del historial (`git diff --no-index`, `git show HEAD:.env`);
  - escribía fuera (`--output`, `--outDir`, `-o`);
  - cambiaba el remoto de git;
  - `bun -e` y `pnpm -C` se saltaban los límites;
  - tests y linters ejecutaban código sin permiso en modo Automático: ahora piden permiso.
  - Se tapan más formas de clave (AWS, JWT, `NOMBRE_SECRET=…` y cualquier `usuario:clave@` en una URL), y `cleanEnv` ya no rompe git ni ssh.
- **Deshacer un borrado** corrompía las imágenes: ahora se restaura byte a byte.
- **Datos inventados en escritorio** (ahora solo en la versión web):
  - alerta falsa «Vulnerabilidad detectada en Supabase» a los 5 s, con tablas de ejemplo;
  - «Supabase · conectado» fijo y una latencia al azar;
  - respuestas guionizadas sin agente («Filas expuestas: 1.284…»). Ahora el chat dice que no hay IA conectada y ofrece conectarla;
  - integraciones de demostración para carpetas llamadas «platanus» o «qubbot».
- **Estados de servicios:**
  - la etiqueta dice «con acceso / sin acceso / sin comprobar»;
  - «no pude comprobar» ya no se muestra como desconectado ni ilumina el camino;
  - ElevenLabs cuenta la clave de voz de Qubbot;
  - se vuelve a comprobar al volver a la ventana, como mucho cada 30 s.
- **Llamada con Qubi:**
  - el resumen del proyecto se actualiza durante la llamada cuando hay una auditoría o cambios (contexto, no lo lee en voz alta);
  - ninguna herramienta de una llamada ya colgada actúa;
  - las reparaciones pendientes se vacían al empezar.
- **Falla al arrancar:** con el esquema de Supabase sin tablas, la ventana se rompía (`schemaBuilder.js`). Se detectó al reiniciar la app real y está corregida.

## Lo que queda «por revisar» en team-12, y por qué es correcto

- `scripts/demo/sample-project`: la inyección SQL (rojo) y el Dockerfile como root. Es el proyecto de ejemplo del video, vulnerable a propósito.
- Claves de prueba en los tests (`secretInTest`): son falsas, pero una real ahí se filtraría igual. Se pueden «Marcar como revisado».
- `innerHTML` que recibe HTML desde una variable (`chatView`, `labelLayer`, `welcomeRobotView`…). Desde el código no se puede demostrar que sea seguro.

## Pendiente (no es dato falso, pero conviene)

- El contexto inicial de la llamada usa las reglas por nombre si todavía no hay auditoría. Se avisa poco de que es una estimación.
- El estado de un servicio cuenta el MCP de cualquier agente, no solo el elegido en el chat.
- `gh auth status` mira la sesión global de GitHub, no el acceso a este repositorio.
