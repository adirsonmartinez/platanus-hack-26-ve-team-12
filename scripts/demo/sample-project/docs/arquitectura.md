# Arquitectura de Feria Online

## Cómo viaja un pedido

La tienda (`apps/web`) llama a la API (`apps/api`). La API valida el pedido, cobra con el proveedor de pagos y lo guarda en la base de datos.

## Decisiones

- Un solo repositorio para la tienda, la API y los componentes compartidos.
- La base de datos es PostgreSQL; los cambios de tablas viven en `db/migrations`.
