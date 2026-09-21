# AutoRuta · Alquiler de vehículos

Sitio web de alquiler de vehículos (estilo buscador de autos de viajes) con API REST propia.
Proyecto académico: los vehículos, precios y reservas son ficticios.

- **Sitio en vivo:** https://alquiler-vehiculos-ijx3.onrender.com
- **Swagger:** https://alquiler-vehiculos-ijx3.onrender.com/swagger

(Plan gratuito de Render: si lleva un rato sin uso, la primera carga puede tardar hasta un minuto.)

- **Frontend:** HTML + CSS + JavaScript sin librerías (`public/`), servido por el mismo servidor.
- **Backend:** NestJS + TypeScript, validación con DTOs (`class-validator`), documentación con Swagger.
- **Base de datos:** PostgreSQL con TypeORM (tablas `sucursales`, `vehiculos`, `reservas`; datos iniciales automáticos).
- **Despliegue:** Render (`render.yaml`). **CI:** GitHub Actions con un Postgres efímero.

## Qué hace

1. Eliges sucursal de recogida, fechas y horas (y, si quieres, otra sucursal de devolución).
2. Ves solo los vehículos **disponibles** en esas fechas, con filtros (categoría, transmisión, pasajeros, precio) y orden.
3. Reservas con tus datos y recibes un **código** (`AR-XXXXXX`).
4. En "Mis reservas" consultas por correo o código y puedes cancelar (el vehículo vuelve a estar disponible).

## Endpoints (`/swagger` para probarlos)

| Recurso | Operaciones |
|---|---|
| `/api/v1/sucursales` | `GET` lista (`?ciudad=`), `GET :id`, `POST` (201 + `Location`), `PUT :id` (204), `DELETE :id` (204/409) |
| `/api/v1/vehiculos` | `GET` con filtros (`sucursalId`, `ciudad`, `categoria`, `transmision`, `pasajeros`, `precioMax`, `desde`+`hasta`, `orden`), `GET :id`, `POST`, `PUT :id`, `PATCH :id` (precio), `DELETE :id` |
| `/api/v1/reservas` | `GET` (`?email=` o `?codigo=`), `GET :id`, `POST` (201, 409 si hay solape), `PATCH :id/cancelar`, `DELETE :id` |

Códigos usados: 200, 201, 204, 400 (datos inválidos), 404 (no existe), 409 (vehículo no disponible / registro con dependencias).

## Estructura

```
public/            página web (index.html, styles.css, app.js)
src/main.ts        arranque, validación global, Swagger y archivos estáticos
src/app.module.ts  conexión a la base (DATABASE_URL) y módulos
src/sucursales/    entidad, DTO, servicio y controlador
src/vehiculos/     idem + búsqueda con disponibilidad
src/reservas/      idem + transacción que evita reservas solapadas
src/seed/          datos iniciales (6 sucursales, 22 vehículos)
test/              pruebas e2e (se ejecutan en GitHub Actions)
render.yaml        despliegue en Render
```

## Variables de entorno

Copia `.env.example` a `.env`. Solo hace falta `DATABASE_URL` (cualquier PostgreSQL). En producción `NODE_ENV=production`.

## Comandos

```bash
npm install
npm run build          # compila a dist/
npm run start:prod     # arranca en http://localhost:3000
npm test               # pruebas unitarias
npm run test:e2e       # pruebas e2e (requieren DATABASE_URL)
```
