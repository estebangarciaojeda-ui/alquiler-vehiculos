# AutoSpot · Alquiler de vehículos

Aplicación web de alquiler de vehículos con arquitectura cliente-servidor: API REST en NestJS, base de datos PostgreSQL, un marketplace público, un panel administrativo y un frontend en **React** con autenticación **JWT**.

Proyecto académico: los vehículos, precios, pagos y reservas son ficticios.

- **Sitio (storefront):** https://alquiler-vehiculos-ijx3.onrender.com
- **Panel admin (React, JWT):** https://alquiler-vehiculos-ijx3.onrender.com/app
- **Swagger (acceso restringido):** https://alquiler-vehiculos-ijx3.onrender.com/swagger

(Plan gratuito de Render: si lleva un rato sin uso, la primera carga puede tardar hasta un minuto.)

## 1. Arquitectura

Backend monolito modular en NestJS (TypeScript) + PostgreSQL (TypeORM). Dos frontends sobre la misma API:

- `public/` — marketplace y panel admin clásico (HTML/CSS/JS sin framework, con sesión por cookie firmada).
- `frontend-react/` — **frontend en React** (Vite + React Router + Axios), con **login JWT**, rutas protegidas y CRUD de vehículos. Se compila en el build y se sirve desde el mismo backend en `/app`.

```
Cliente (navegador)
   │
   ├─► /app/*        → React (JWT en Authorization: Bearer)
   ├─► / , /admin     → HTML/JS clásico (cookie firmada)
   └─► /api/v1/*      → API REST (NestJS, controladores → servicios → TypeORM) → PostgreSQL
```

### Capas (MVC)

- **Rutas/controladores** (`*.controller.ts`): reciben la petición HTTP, validan el DTO, delegan al servicio.
- **Servicios** (`*.service.ts`): lógica de negocio (disponibilidad, pagos, JWT).
- **Modelos** (`*.entity.ts`): entidades TypeORM, mapeadas 1:1 a tablas PostgreSQL.
- **DTOs**: validación y forma de entrada/salida (`class-validator`), separados de las entidades.

## 2. Seguridad

| Mecanismo | Dónde |
|---|---|
| **JWT** (HS256, implementación propia sin dependencias) | `src/auth-jwt/`. Login en `POST /api/v1/auth/login`, admite usuario admin o cuenta de cliente, devuelve `accessToken` con rol (`admin`/`cliente`) y expiración. |
| **CORS** | `app.enableCors()` en `src/main.ts`. |
| **Autorización por roles** | `AdminAuthGuard` acepta cookie de sesión (panel clásico) **o** JWT de rol `admin` (React) — mismas rutas, dos formas de probar la identidad. `ClienteAuthGuard` exige sesión de cliente para reservar. |
| **Hash de contraseñas** | `scrypt` + sal aleatoria (`src/cuentas/password.util.ts`), nunca texto plano. |
| **Validación y sanitización de entradas** | `class-validator` + `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` en todos los DTOs: rechaza campos no declarados y tipos inválidos. |
| **Inyección SQL** | Mitigada por diseño: TypeORM parametriza todas las consultas; no hay concatenación de SQL con datos del usuario. |
| **XSS** | El frontend clásico escapa toda salida dinámica (`esc()` en `app.js`); React escapa por defecto (JSX). |
| **Secretos fuera del código** | Contraseñas y claves de firma como variables de entorno (`SWAGGER_*`, `ADMIN_*`, `JWT_SECRET`/`ADMIN_SESSION_SECRET`), nunca en el repositorio. |
| **Documentación restringida** | `/swagger` exige Basic Auth. |

**Riesgos OWASP Top 10 identificados y cómo se mitigan aquí:**

1. **Broken Access Control (A01)** — mitigado con guards por rol (`AdminAuthGuard`, `ClienteAuthGuard`) en cada endpoint de escritura; sin guard, cualquiera podría crear/borrar sucursales o vehículos.
2. **Cryptographic Failures (A02)** — contraseñas con `scrypt`+sal (no reversibles) y JWT firmado con HMAC-SHA256; sin esto, una fuga de base de datos expondría contraseñas en texto plano y cualquiera podría falsificar sesiones.
3. **Injection (A03)** — TypeORM parametriza las consultas; concatenar SQL manualmente con datos del usuario permitiría inyección SQL.
4. **Identification and Authentication Failures (A07)** — tokens con expiración (8 h) y comparación de contraseñas en tiempo constante (`timingSafeEqual`) para evitar timing attacks en el login.

## 3. Pruebas, depuración y optimización

- **Pruebas unitarias** (Vitest): `src/reservas/reservas.util.spec.ts`, `src/pagos/pagos.util.spec.ts` (validación de tarjeta: Luhn y vencimiento).
- **Análisis estático**: `oxlint` en el backend (`npm run lint`), `eslint` en el frontend React (`frontend-react/npm run lint`).
- **Depuración**: Network/Console del navegador para verificar peticiones JWT (`Authorization: Bearer`) y respuestas de la API; logs del servidor en Render.
- **Optimización**: build de producción de Vite (minificado + tree-shaking, ver `frontend-react/dist`); `Cache-Control` en endpoints de catálogo poco cambiantes del contrato B2B.

## 4. Qué hace la aplicación

1. **Storefront**: buscar vehículos disponibles por sucursal/fechas, reservar con pago simulado, consultar/cancelar reservas.
2. **Panel admin clásico** (`/admin`, cookie): CRUD de sucursales, vehículos y reservas.
3. **Panel admin en React** (`/app`, JWT): login y CRUD de vehículos consumiendo la misma API REST.
4. **Contrato B2B/GDS** (`/api/v1/search`, `/orders/*`, `/webhooks`, ver Swagger): integración con sistemas externos de distribución.

## 5. Endpoints principales (`/swagger` para probarlos todos)

| Recurso | Operaciones |
|---|---|
| `/api/v1/auth/login` | `POST` — login JWT (admin o cliente) |
| `/api/v1/sucursales` | `GET` lista (`?ciudad=`), `GET :id`, `POST` (201), `PUT :id` (204), `DELETE :id` (204/409) — escritura requiere sesión admin (cookie o JWT) |
| `/api/v1/vehiculos` | `GET /marcas`, `GET` con filtros, `GET :id`, `POST`, `PUT :id`, `PATCH :id` (precio), `DELETE :id` — escritura requiere sesión admin |
| `/api/v1/reservas` | `GET` (`?email=` o `?codigo=`), `GET :id`, `POST` (requiere sesión de cliente + pago simulado), `PATCH :id/cancelar`, `DELETE :id` (admin) |
| `/api/v1/cuentas/*` | registro/login/logout/yo (cuenta de cliente y sesión por cookie) |

Códigos usados: 200, 201, 204, 400, 401, 404, 409.

## 6. Estructura

```
public/             marketplace y panel admin clásico (HTML/CSS/JS)
frontend-react/     frontend en React (Vite), build servido en /app
src/main.ts         arranque, CORS, validación global, Swagger, estáticos
src/app.module.ts   módulos de la aplicación
src/auth-jwt/       login y verificación JWT
src/admin/          panel admin clásico (cookie) + guard que también acepta JWT
src/cuentas/        cuentas de cliente (hash de contraseña, sesión)
src/pagos/          simulación de pago con tarjeta (Luhn, vencimiento)
src/sucursales/     entidad, DTO, servicio y controlador
src/vehiculos/      idem + búsqueda con disponibilidad
src/reservas/       idem + transacción que evita reservas solapadas
src/gds-autos/      contrato B2B/GDS (search, hold, órdenes, webhooks)
src/seed/           datos iniciales (sucursales, 42 vehículos, cuentas demo)
docs/               documentación técnica ampliada
render.yaml         despliegue en Render (backend + build de React)
```

## 7. Variables de entorno

Copia `.env.example` a `.env`.

| Variable | Uso |
|---|---|
| `DATABASE_URL` | Conexión PostgreSQL |
| `SWAGGER_USER` / `SWAGGER_PASSWORD` | Basic Auth de `/swagger` |
| `ADMIN_USER` / `ADMIN_PASSWORD` | Credenciales del panel admin (cookie y JWT) |
| `ADMIN_SESSION_SECRET` | Firma de cookies y, por defecto, firma de JWT |
| `JWT_SECRET` *(opcional)* | Si se define, se usa en vez de `ADMIN_SESSION_SECRET` para firmar/verificar JWT |

## 8. Comandos

```bash
npm install
npm run build              # compila el backend a dist/
npm run start:prod         # arranca el backend en http://localhost:3000
npm test                   # pruebas unitarias del backend
npm run lint                # análisis estático del backend (oxlint)

cd frontend-react
npm install
npm run dev                 # desarrollo (http://localhost:5173, proxy a la API)
npm run build                # build de producción (dist/, servido por el backend en /app)
npm run lint                  # ESLint
```

## 9. Despliegue

Render (`render.yaml`), build automático al hacer push a `main`: compila el backend y, dentro del mismo build, instala y compila el frontend React (`frontend-react/dist`), que el backend sirve en `/app`.

## 10. Reflexión y lecciones aprendidas

- Reutilizar el mismo backend para servir dos frontends (HTML/JS clásico y React) evitó configurar CORS entre dominios distintos y duplicar infraestructura de despliegue, a costa de acoplar un poco el build.
- Diseñar `AdminAuthGuard` para aceptar **cookie o JWT** (en vez de forzar un solo mecanismo) permitió añadir JWT sin romper el panel admin clásico ya construido — una lección de diseño incremental sobre un sistema en producción.
- Implementar JWT "a mano" (HMAC-SHA256, sin librería) obligó a entender su estructura real (header.payload.firma en base64url) en vez de tratarlo como una caja negra.
