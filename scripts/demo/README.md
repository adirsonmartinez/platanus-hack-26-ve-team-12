# Grabación para el video del producto

Graba la app de verdad (el recorrido y el agente trabajando) con el cursor visible, para el video de `video/`.

## Pasos

1. Inicia la app en modo grabación, con el simulador y el proyecto de ejemplo:

   ```sh
   PLATANUS_DEMO=1 PLATANUS_SIM=1 PLATANUS_SIM_DEFAULT=feria \
     npx electron . --remote-debugging-port=9223 --open=scripts/demo/sample-project
   ```

   - `PLATANUS_DEMO=1` (solo sin empaquetar) dibuja el cursor dentro de la página y oculta el del sistema (`renderer/views/ui/demoCursorView.js`).
   - `PLATANUS_SIM_DEFAULT=feria` hace que el Simulador responda la pregunta del video con el escenario `feria`.

2. Graba (desde `video/`, para que quede donde el video la busca):

   ```sh
   cd video && npm run take
   ```

   Esto corre `recordTour.mjs`, que:
   - fija la ventana a 1920×1080;
   - elige el Simulador y el modo Vibe;
   - sigue `timeline.mjs` con el ratón real (camino suave de `path.mjs`), clics y tecleo;
   - graba con el screencast de DevTools.

   Al final devuelve el agente que estaba elegido y escribe:
   - `frames/` y `frames.ffconcat`: la pantalla, con lo que dura cada cuadro;
   - `cursor-path.json`: dónde estuvo y dónde hizo clic el cursor (el video lo usa para el zoom);
   - `markers.json`: los momentos clave (`tourStart`, `step:n`, `tourEnd`, `ask`, `agentDone`, `end`), que el video usa para los textos.

   Después `npm run encode` arma `public/takes/tour.mp4` a 30 fps y tres imágenes fijas para las pantallas 3D.

## Proyecto de ejemplo

`sample-project/` («Feria Online»):
- un monorepo pnpm con `apps/web` (Next.js), `apps/api` (Express) y `packages/ui`;
- README, documentación, migraciones, pruebas y un Dockerfile;
- `apps/api/src/routes/orders.ts` arma la consulta SQL pegando el pedido, así que el agente del video tiene algo real que encontrar.

No tiene claves. `.env.example` solo trae valores de muestra.
