# Feria Online

Tienda en línea para que los productores de la feria vendan sus frutas, verduras y quesos.

## Cómo empezar

1. Instala las dependencias con `pnpm install`.
2. Copia `.env.example` a `.env` y completa los valores.
3. Arranca todo con `pnpm dev`: la tienda queda en http://localhost:3000 y la API en http://localhost:4000.

## Partes del proyecto

- `apps/web`: la tienda que ve la gente (Next.js).
- `apps/api`: la API que guarda pedidos y productos (Express).
- `packages/ui`: botones y tarjetas que comparten las apps.

## Pruebas

`pnpm test` corre las pruebas de la API y el recorrido de compra.
