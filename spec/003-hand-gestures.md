# 003 · Gestos para acercar, alejar y seleccionar

- **Estado:** aprobada (en implementación)
- **Autor:** Génesis Zapata
- **Revisor:** (por asignar)
- **Fecha:** 2026-10-24
- **Rama:** `feature/hand-gestures`

## Contexto

Hoy, con la cámara encendida, la persona pellizca (pulgar e índice) para agarrar el mapa y lo mueve o lo gira. Lo primero que pasa su umbral (mover o girar) queda fijo hasta soltar. El seguimiento usa `@mediapipe/tasks-vision` 1.1.1 (`HandLandmarker`, modo VIDEO, una mano, GPU con respaldo en CPU), con el modelo y el WASM locales. De cada cuadro se usan solo x e y de 6 puntos de la mano (`renderer/models/handGesture.js`).

Se quiere:
- acercar, alejar y girar el mapa con **dos manos** (cambio del 2026-10-24): una pellizca y sostiene, y la otra pellizca y se mueve. Arriba o abajo hace zoom, a los lados gira;
- un **cursor violeta** que sigue la mano;
- **seleccionar mirando fijo** (~800 ms) lo que está bajo el cursor, tanto en el mapa 3D como en los paneles. En los paneles solo se activa lo que es seguro: un gesto nunca repara, aprueba, hace commit ni confirma nada.

El análisis de la librería (Paso 0) recomienda seguir con `HandLandmarker` y reglas propias: `GestureRecognizer` no trae pellizco ni zoom, y es más lento en GPU.

## Comportamiento esperado

### Seguimiento

- **B1.** WHEN la cámara está encendida, THE SYSTEM SHALL seguir hasta dos manos por cuadro, con el mismo modelo local, la misma carga diferida y el mismo tope de ~30 análisis por segundo de hoy.
- **B2.** WHEN la app corre en modo dev (`npm run dev`), THE SYSTEM SHALL mostrar en la vista previa los cuadros analizados por segundo y si se usa GPU o CPU.
- **B3.** WHEN el análisis corre en CPU y se mantiene bajo 20 cuadros por segundo durante 3 s seguidos, THE SYSTEM SHALL desactivar el zoom con dos manos, seguir funcionando con una sola mano y decirlo en la vista previa. Con GPU, el zoom con dos manos queda activo.

### Mover con una mano

- **B4.** WHEN una sola mano pellizca, THE SYSTEM SHALL mover el mapa como hoy. Girar la mano como una perilla ya no gira el mapa: el giro pasó a ser un gesto de dos manos.

### Sostener y mover con dos manos: zoom y giro

- **B5.** WHEN las dos manos pellizcan a la vez, THE SYSTEM SHALL entrar en el gesto de dos manos ("Sostén con una mano y mueve la otra"), aunque la primera mano ya estuviera moviendo el mapa: el arrastre se detiene ahí. Mientras dure, el mapa no se desplaza.
- **B5b.** WHEN una sola mano pellizca y la otra está a la vista, THE SYSTEM SHALL esperar ~300 ms antes de mover el mapa, porque la gente pellizca con una mano un momento antes que con la otra. Con una sola mano a la vista, mueve como siempre.
- **B5c.** WHEN durante el gesto el seguimiento pierde una mano, o un pellizco se abre, por menos de ~180 ms, THE SYSTEM SHALL seguir en el gesto. MediaPipe parpadea, y eso no es soltar.
- **B5d.** WHEN MediaPipe entrega las manos en otro orden que en el cuadro anterior, o una mano desaparece un momento y vuelve, THE SYSTEM SHALL reconocer cada mano por dónde estaba su palma.
- **B6.** WHEN la mano que se mueve sube, THE SYSTEM SHALL acercar el mapa, y cuando baja, alejarlo. El cambio es proporcional a cuánto se mueve (una décima de la altura de la imagen ≈ ×1,5), suave, y nunca pasa de `zoomMin` ni de `zoomMax`.
- **B6b.** WHEN la mano que se mueve va hacia la derecha de la persona, THE SYSTEM SHALL girar el mapa hacia la derecha (en el sentido del reloj), y hacia la izquierda en sentido contrario (una décima del ancho de la imagen ≈ 17°).
- **B6c.** WHEN la mano que se mueve pasa su umbral (relativo al tamaño de la mano), THE SYSTEM SHALL fijar la dirección: vertical para zoom u horizontal para girar, hasta que una mano suelte. Un zoom no gira y un giro no hace zoom. Mueve la que más se movió: cualquiera de las dos puede sostener.
- **B7.** WHEN el zoom cambia, THE SYSTEM SHALL mantener fijo el punto del mapa que está bajo la mano que sostiene, como hoy hace la rueda del mouse con el punto bajo el cursor.
- **B8.** WHEN la mano se mueve menos que la zona muerta, o antes de pasar el umbral, THE SYSTEM SHALL no hacer zoom ni girar.
- **B9.** WHEN una de las dos manos suelta el pellizco o sale de la imagen, THE SYSTEM SHALL terminar el gesto. La mano que sigue pellizcando no arrastra el mapa hasta que suelte y vuelva a pellizcar, así el mapa no salta.

### Cursor

- **B10.** WHEN hay una mano a la vista y no está pellizcando, THE SYSTEM SHALL mostrar un cursor violeta en el punto medio entre pulgar e índice. La imagen va como espejo y se proyecta a toda la ventana: la parte central de la imagen cubre la ventana entera, así se llega a los bordes sin sacar la mano de la cámara.
- **B11.** WHEN hay dos manos abiertas a la vista, THE SYSTEM SHALL mover el cursor solo con la que ya lo tenía, aunque entre otra (D2).
- **B12.** WHEN la mano pellizca (para mover, girar o hacer zoom) o sale de la imagen, THE SYSTEM SHALL ocultar el cursor y reiniciar la selección en curso. Al soltar, el cursor vuelve.
- **B13.** WHEN el cursor tiembla menos que la zona muerta, THE SYSTEM SHALL dejarlo quieto.
- **B14.** WHEN el cursor está sobre algo seleccionable del mapa 3D, THE SYSTEM SHALL mostrar la misma tarjeta de hover que muestra el mouse.

### Seleccionar mirando fijo

- **B15.** WHEN el cursor queda quieto (dentro de la tolerancia) sobre algo seleccionable, THE SYSTEM SHALL llenar un anillo alrededor del cursor durante ~800 ms. Al completarse, lo selecciona:
  - en el mapa 3D o la vista git, hace lo mismo que un clic del mouse (`picker().handle(pick)`): abrir o cerrar una carpeta, abrir un archivo, el esquema de Supabase, una tabla o un commit;
  - en un panel, activa el elemento como un clic, salvo lo excluido en B20.
- **B16.** WHEN el cursor se mueve más allá de la tolerancia, o pasa a otro objetivo, antes de completar el anillo, THE SYSTEM SHALL reiniciarlo sin seleccionar.
- **B17.** WHEN algo se acaba de seleccionar, THE SYSTEM SHALL no volver a seleccionarlo hasta que el cursor salga de ese objetivo y vuelva a entrar.
- **B18.** WHEN el cursor está sobre algo que no es seleccionable, THE SYSTEM SHALL no mostrar el anillo.

### Seguridad en los paneles

- **B19.** WHEN el cursor está sobre un elemento de la interfaz que responde a un clic (botón, pestaña, ítem de menú, fila, chip, enlace), THE SYSTEM SHALL poder activarlo, igual que el mouse. Si hay uno dentro de otro (un botón dentro de una fila), se elige el de más adentro.
- **B20.** WHEN un elemento está marcado `data-gesture="never"`, o está dentro de uno marcado, THE SYSTEM SHALL no activarlo nunca por gesto ni mostrar el anillo sobre él. Se marcan las acciones que se disparan sin diálogo de confirmación y que cambian código o seguridad:
  - reparar (deja escribir al agente), verificar o marcar como arreglado, y deshacer un cambio del agente;
  - cambiar el modo de aprobación del agente;
  - detener, pausar, reactivar o abrir servidores (sus botones y el menú ⋯);
  - el botón de la mano: apagar la cámara mirando fijo sería un accidente.

  Commit, revert, reset, cambiar de rama y aprobar escrituras del agente piden un diálogo nativo, que el cursor no alcanza (B21).
- **B21.** WHEN hay un diálogo de confirmación abierto, THE SYSTEM SHALL no seleccionar nada por gesto. Los diálogos nativos del sistema quedan fuera del alcance del cursor, y los modales de la app se bloquean.
- **B22.** WHEN el cursor pasa sobre un campo de texto, THE SYSTEM SHALL no darle el foco ni escribir en él.

### Lo que se ve

- **B23.** WHEN cambia lo que hace la mano, THE SYSTEM SHALL decirlo en la vista previa con uno de estos estados: «Señalando», «Acercando», «Alejando», «Seleccionado: `src`», o los de hoy («Moviendo el mapa», «Girando el mapa»).
- **B24.** WHEN la persona abre el "?" de la vista previa, THE SYSTEM SHALL listar los gestos: pellizcar y mover; sostener con una mano y subir o bajar la otra para el zoom; sostener y mover la otra de lado para girar; y mirar fijo para seleccionar.
- **B25.** WHEN el sistema tiene activado "reducir movimiento", THE SYSTEM SHALL mostrar el anillo en pasos, sin transición, y el cursor sin animaciones.
- **B26.** WHEN se apaga la cámara o se cierra el proyecto, THE SYSTEM SHALL ocultar el cursor y el anillo y soltar cualquier gesto en curso.

**Ejemplo de punta a punta** (datos ficticios):

1. Ana abre el proyecto "Recetario" y enciende la cámara. La vista previa dice «Muestra tu mano a la cámara»; en modo dev agrega "28 fps · GPU".
2. Ana levanta la mano derecha abierta. Aparece el cursor violeta y la vista previa dice «Señalando». Lo lleva sobre la carpeta `src`: aparece su tarjeta de hover y el anillo empieza a llenarse.
3. A los ~800 ms la carpeta se abre, igual que con un clic, y la vista previa dice «Seleccionado: `src`». Ana deja la mano quieta y no pasa nada más.
4. Pellizca con las dos manos, deja la izquierda quieta y sube la derecha. El mapa se acerca hacia la mano que sostiene y la vista previa dice «Acercando». Suelta, vuelve a pellizcar con las dos manos y mueve la derecha hacia su derecha: el mapa gira. Suelta la izquierda y el gesto termina; la derecha, que sigue pellizcada, no mueve el mapa.
5. Lleva el cursor sobre el ícono Riesgos del dock lateral y el panel se abre, como con un clic. Lo lleva sobre "Reparar" en una tarjeta de riesgo: no aparece anillo y no pasa nada.
6. Apaga la cámara: el cursor desaparece y se suelta todo.

## Out of scope

- Zoom con una sola mano (empujar hacia la cámara): se descartó en la entrevista.
- Seleccionar con un pellizco corto ("toque en el aire"): se eligió mirar fijo.
- `GestureRecognizer` y cualquier modelo nuevo; tampoco se actualiza `@mediapipe/tasks-vision` (1.1.1 es la última).
- Más de dos manos.
- Escribir, desplazar listas o arrastrar paneles con gestos.
- Que el gesto apriete los botones excluidos en B20.
- Que la persona ajuste los umbrales y las ganancias desde la interfaz.
- Gestos en la vista previa de la cámara.

## Checklist de dominio

- [ ] La cámara sigue apagada por defecto. Es solo video, se procesa en esta computadora, y ningún cuadro ni punto de la mano se guarda ni sale a la red.
- [ ] No se toca `allowPermission` ni la CSP. No se pide ningún permiso nuevo.
- [ ] El modelo y el WASM siguen cargándose bajo demanda, la primera vez que se enciende la cámara.
- [ ] La selección por gesto en paneles elige todo lo que responde a un clic, salvo lo marcado `data-gesture="never"` (B20) y lo que está dentro.
- [ ] Un gesto nunca confirma un diálogo, nunca aprueba un cambio del agente y nunca cambia el modo de aprobación.
- [ ] Umbrales relativos al tamaño de la mano, con histéresis para no parpadear entre estados.
- [ ] MVVM como hoy: la matemática del gesto es pura y tiene tests, el paso de gesto a cámara o a selección vive en el view model, y la vista solo dibuja el cursor y el anillo. El 3D se selecciona con el mismo código que el mouse, sin duplicar el raycasting.
- [ ] Textos en `renderer/i18n/es.js`, íconos de Hugeicons y colores de los tokens. El cursor es violeta, el acento del equipo.
- [ ] Respeta "reducir movimiento".

## Plan de validación

| Comportamiento | Chequeo | Resultado esperado |
|---|---|---|
| B1 | Tests del view model con frames de una y de dos manos (el servicio usa MediaPipe y el DOM: se revisa en la app) | Con dos manos el view model las recibe juntas; con una, igual que hoy. |
| B2 | Test del view model con `mock.timers` | Calcula los cuadros por segundo y el delegate solo en modo dev. |
| B3 | Test con cuadros falsos a 15 fps en CPU durante 3 s | Zoom con dos manos desactivado y aviso en la vista previa; con GPU sigue activo. |
| B4 | `tests/renderer/handGesture.test.mjs` y el test de la perilla en `handControlViewModel.test.mjs` | Arrastrar sigue igual; girar una mano ya no gira el mapa. |
| B5–B6 | Fixtures: una mano sostiene y la otra sube o baja | `zoomGoal` sube y baja en proporción, sin desplazar ni girar. |
| B6b | Una mano sostiene y la otra va de lado | `azimuthGoal` cambia (derecha de la persona = positivo), sin zoom. |
| B6c | Sube y después va de lado | Sigue siendo zoom: no gira. Cualquiera de las dos manos puede moverse. |
| B5 (arrastre previo) | Una mano arrastra y después pellizca la otra | Pasa a zoom y el arrastre se detiene. |
| B5b | Un pellizco con la otra mano abierta a la vista | No mueve el mapa los primeros ~300 ms; después sí. |
| B5c–B5d | Se pierde una mano dos cuadros; las manos llegan en otro orden | El gesto sigue. |
| B6 (límites) | Separar las manos más allá del tope | `zoomGoal` se queda en `zoomMax` (y en `zoomMin` al juntarlas). |
| B7 | Test del view model con una cámara falsa | El punto bajo el medio de las manos queda en su lugar (como la rueda). |
| B8 | Fixture con temblor menor que la zona muerta | El zoom no cambia. |
| B9 | Fixture: una mano suelta durante el zoom | El zoom termina; la otra mano no arrastra hasta volver a pellizcar. |
| B10–B11 | Fixtures de una y dos manos abiertas | El cursor está en el punto medio, en espejo, y el centro de la imagen cubre la ventana; con dos manos sigue a una sola. |
| B12 | Fixture que pellizca y suelta | El cursor se oculta y el anillo vuelve a 0; al soltar, el cursor reaparece. |
| B13 | Fixture con temblor | El cursor no se mueve. |
| B14 | Test del view model con `pickAtScreen` falso | El hover recibe el mismo pick que daría el mouse. |
| B15 | `mock.timers`: 800 ms quieto sobre una carpeta | Se llama `handlePick` una vez con esa carpeta. |
| B16 | Moverse a los 500 ms | El anillo vuelve a 0 y no hay selección. |
| B17 | Quedarse 3 s después de seleccionar | Una sola selección; salir y volver a entrar selecciona de nuevo. |
| B18–B20 | Test con elementos falsos: botones, pestañas, filas, un botón dentro de una fila, uno marcado never y texto suelto | Se elige el clickeable de más adentro; lo marcado never, lo que está dentro y el texto no muestran anillo. |
| B21–B22 | Con un modal abierto, y sobre un campo de texto | No hay selección ni foco. |
| B23–B25 | Captura de la vista previa en cada estado, y con "reducir movimiento" | Textos correctos; anillo en pasos y sin animación. |
| B26 | Test del view model: apagar a mitad de un zoom y de un anillo | Cursor oculto, anillo en 0, gesto suelto. |

**Condición de terminado:** `npm test` termina con `# fail 0`, y en la app de escritorio, con un proyecto abierto y la cámara encendida:
- con una mano sosteniendo, subir la otra acerca y bajarla aleja, sin pasar los límites; moverla de lado gira el mapa;
- la mano abierta muestra el cursor y su tarjeta de hover;
- mirar fijo ~800 ms abre una carpeta igual que un clic;
- sobre "Reparar" no pasa nada;
- mover y girar siguen funcionando como antes;
- al apagar la cámara se suelta todo, y no se pidió ningún permiso nuevo.

## Rollout

Es una feature de `feature/hand-gestures`, que entra a `develop` con `git flow feature finish`. No hay migración: la cámara sigue apagada por defecto.

## Decisiones abiertas

Ninguna. Las dos que quedaron de la entrevista las resolvió Génesis el 2026-10-24:

- **D1 (resuelta, cambiada el 2026-10-24).** Al principio solo se elegían los elementos de navegación, con una lista permitida (`data-gesture="safe"`). Génesis pidió después que el cursor eligiera todo lo seleccionable: ahora se elige todo lo que responde a un clic, salvo lo marcado `never` (B20). Las marcas `safe` siguen en el código, sin efecto aparte de contar como clickeables. Cerrar una pestaña del editor con cambios sin guardar pregunta antes (`window.confirm`), así que no entra en la lista.
- **D2 (resuelta).** Con dos manos abiertas, el cursor sigue a la que ya lo tenía, aunque entre otra. Como MediaPipe no numera las manos entre cuadros, "la misma mano" es la que está más cerca de donde estaba la del cursor. Si las dos aparecen en el mismo cuadro, toma la primera que entrega MediaPipe.
