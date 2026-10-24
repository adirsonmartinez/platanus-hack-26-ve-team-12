# Video del producto (Remotion)

Video de unos 55 segundos que muestra Platanus.

1. **Intro 3D**: las pantallas de la app sobre una mesa cálida. El robot de Platanus salta entre ellas y la cámara entra en la del centro.
2. **La app real**: el recorrido de un proyecto desconocido, paso a paso.
3. **El agente trabajando**: revisa un archivo y el mapa reacciona.
4. **Cierre 3D**: el robot saluda y aparece el nombre.

## Cómo se hace

```sh
cd video
npm install
npm run take      # graba la app (ver scripts/demo/README.md: la app debe estar abierta en modo grabación)
npm run studio    # revisar y ajustar en el navegador
npm run render    # out/platanus.mp4 (1920×1080, 30 fps, H.264)
```

## Piezas

| Pieza | Archivo |
|---|---|
| Duración de cada parte (según los momentos de la grabación) y textos | `src/timing.js` |
| Composición y transiciones | `src/PlatanusLaunch.jsx` |
| Intro y cierre 3D (`@remotion/three`, desenfoque de movimiento) | `src/scenes/Intro.jsx`, `src/scenes/Outro.jsx` |
| Mesa, pantallas y robot (el de la app, `renderer/views/scene/builders/robotBuilder.js`) | `src/three/` |
| La app grabada, con zoom que sigue al cursor y se acerca en cada clic | `src/scenes/AppShot.jsx` |
| Grabación y codificación | `../scripts/demo/recordTour.mjs`, `scripts/encode.mjs` |

## Notas

- Remotion es gratis para equipos de hasta 3 personas.
- `three` se resuelve siempre a la copia de este paquete (0.160, la misma de la app); la configuración está en `remotion.config.js`.
- Las grabaciones (`public/takes/`) y los renders (`out/`) no se suben a git: se rehacen con `npm run take`.
- Blender queda para una toma hero más adelante.
