# landing

Página de presentación de Qubbot. Un solo archivo estático, sin build.

| Archivo | Qué es |
|---|---|
| `index.html` | La página. Estilos, imágenes (base64) y la animación de la llamada van adentro; solo las fuentes vienen de Google Fonts. |
| `project-logo.png` | Ícono de la pestaña e imagen al compartir el link. |

- **Deploy:** Render, con el Blueprint `render.yaml` en la raíz (sitio estático, publica esta carpeta desde `main`). Se vuelve a publicar solo cuando cambia algo de `landing/`.
- **Descargas:** los botones «Descargar» apuntan a `releases/latest` de GitHub, así que siempre llevan a la última versión sin tocar la página.
- **Probar en local:** `npx serve landing` o `python3 -m http.server -d landing`.
