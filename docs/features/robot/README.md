# El robot del mapa

Con un proyecto abierto, el robot espera en la plaza.

## Cómo se usa

- **Agarrarlo:** al pasar el cursor por encima, el cursor cambia a una mano y el globo dice «Arrástrame o lánzame a una carpeta».
- **Arrastrarlo:** se levanta con los brazos arriba y el globo dice sobre qué carpeta caería («Suéltame aquí: src/»).
- **Soltarlo o lanzarlo:**
  - si lo sueltas despacio, cae donde está;
  - si lo lanzas, sigue en esa dirección y vuela en arco;
  - cae junto a la carpeta más cercana, o en la plaza si es el proyecto entero;
  - si no hay nada cerca, lo dice.
- **Al llegar:** señala la carpeta y pregunta «¿Te explico qué hay aquí o quieres cambiar algo?». En el chat aparece una tarjeta con título claro:
  - arriba, «El robot está aquí» y el nombre del lugar en palabras simples («Base de datos»);
  - debajo, la ruta y cuántos archivos tiene, qué vive ahí y su estado («1 por revisar» o «Sin problemas»).

  La tarjeta ofrece:
  - «Explícame qué hay aquí»;
  - «Quiero cambiar algo aquí»: deja escrito «En «carpeta/» quiero …» en el cuadro para que lo termines;
  - «Ver sus riesgos», si la carpeta tiene problemas;
  - en la plaza, «Recorrido desde aquí».
- **Mientras el agente trabaja:** el globo muestra el mismo orbe y las mismas palabras que la tarjeta del chat (leyendo, escribiendo, esperando tu permiso…).

Es el mismo robot de la bienvenida de un proyecto nuevo y del recorrido. Mientras esos están activos, no se puede agarrar.

## Construyendo en vivo

Mientras un agente (en el chat o en una reparación) guarda archivos, el robot **lleva cada archivo como una hoja de papel a su carpeta**:
- **La carpeta:** si el mapa no la muestra, porque es nueva o no tiene problemas, se levanta del suelo como obra.
- **Si hay que aprobar:** si el cambio espera tu permiso, el robot espera con la hoja en las manos y lo dice.
- **Al guardar:** mete la hoja en la carpeta, que gana una hoja más. Si el archivo ya existía, lo señala; si no se guardó, lo dice.
- **Varios archivos:** van de a uno y en orden. Los de la raíz van a la plaza («Archivos sueltos»).
- **Al terminar:** saluda con «Obra terminada · Listo: N archivos nuevos». Las obras temporales se van a los pocos segundos y el robot vuelve a la plaza.
- **En el chat:** un archivo nuevo se cuenta como «Creé index.js» y el resumen como «Creé 4 archivos», no como arreglo.

Probarlo: escenario `obra` del Simulador, con permisos en Auto (`[sim:obra] …`).

## Archivos

| Pieza | Archivo |
|---|---|
| Dónde está, agarrar, soltar o lanzar, dónde cae (puro, con pruebas) | `renderer/viewmodels/robotViewModel.js` |
| El robot en 3D: poses, vuelo en arco, globo con orbe | `renderer/views/scene/guideRobot.js`, `robotView.js` |
| El arrastre sobre el mapa (el robot en vez del mapa) | `renderer/views/scene/inputController.js` (`grabber`) |
| Lo que dice en el chat (tarjeta `place`) | `chatViewModel.js` (evento `robot:landed`), `placeCard` en `chatCardsView.js`, `strings.robot` en `es.js` |
| Escribir en el cuadro | `actions.draft` en `renderer/main.js` |
| Construyendo en vivo (cola, obras, robot) | `renderer/viewmodels/buildViewModel.js`, `views/scene/buildSiteView.js` |

Pruebas: `tests/renderer/robotViewModel.test.mjs` y `chatViewModel.test.mjs`.
