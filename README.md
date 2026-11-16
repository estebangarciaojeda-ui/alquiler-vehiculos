# AutoSpot · Alquiler de vehículos

Aplicación web de alquiler de vehículos con arquitectura cliente-servidor: API REST en NestJS, base de datos PostgreSQL, un marketplace público, un panel administrativo y un frontend en **React** con autenticación **JWT**. Además es la tienda de **Autos** del ecosistema "Booking Prototipo" (curso Integración de Sistemas): cumple el contrato B2B v3 y se integra con Booking Central.

Proyecto académico: los vehículos, precios, pagos y reservas son ficticios.

- **Sitio (storefront):** https://alquiler-vehiculos-ijx3.onrender.com
- **Panel admin (React, JWT):** https://alquiler-vehiculos-ijx3.onrender.com/app
- **Panel admin clásico (cookie):** https://alquiler-vehiculos-ijx3.onrender.com/admin
- **Swagger (acceso restringido):** https://alquiler-vehiculos-ijx3.onrender.com/swagger

(Plan gratuito de Render: si lleva un rato sin uso, la primera carga puede tardar hasta un minuto.)

## 1. Arquitectura

Backend monolito modular en NestJS (TypeScript) + PostgreSQL (TypeORM). Dos frontends sobre la misma API:

- `public/` — marketplace y panel admin clásico (HTML/CSS/JS sin framework, con sesión por cookie firmada).
- `frontend-react/` — **frontend en React** (Vite + React Router + Axios), con **login JWT**, rutas protegidas y las pantallas de Vehículos, Sucursales, Reservas, **Mostrador** (búsqueda por código o cédula, entrega y devolución) y Clientes. Se compila en el build y se sirve desde el mismo backend en `/app`.

Ambos paneles admin comparten la identidad visual de AutoSpot (logo y paleta navy/cian tomada de `public/styles.css`).

```
Cliente (navegador)
   │
   ├─► /app/*        → React (JWT en Authorization: Bearer)
   ├─► / , /admin     → HTML/JS clásico (cookie firmada)
   ├─► /api/v1/*      → API REST (NestJS, controladores → servicios → TypeORM) → PostgreSQL
   └─► /autos, /api/v3/* → contrato B2B con Booking (X-API-Key)  ⇄  Booking Central (stock y check-in)
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
| **Autorización por roles** | `AdminAuthGuard` acepta la cookie del administrador principal o un JWT de una cuenta cuyo rol actual sea `admin`. El login del panel clásico (`/admin`) también acepta cuentas con rol `admin` (correo y contraseña), igual que el panel React. El rol se comprueba en base de datos para que una revocación sea inmediata. `ClienteAuthGuard` exige sesión de cliente para reservar. |
| **Hash de contraseñas** | `scrypt` + sal aleatoria (`src/cuentas/password.util.ts`), nunca texto plano. |
| **Validación y sanitización de entradas** | `class-validator` + `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` en todos los DTOs: rechaza campos no declarados y tipos inválidos. |
| **Inyección SQL** | Mitigada por diseño: TypeORM parametriza todas las consultas; no hay concatenación de SQL con datos del usuario. |
| **XSS** | El frontend clásico escapa toda salida dinámica (`esc()` en `app.js`); React escapa por defecto (JSX). |
| **Secretos fuera del código** | Contraseñas y claves de firma como variables de entorno (`SWAGGER_*`, `ADMIN_*`, `JWT_SECRET`/`ADMIN_SESSION_SECRET`), nunca en el repositorio. |
| **Documentación restringida** | `/swagger` exige Basic Auth. |
| **Autenticación B2B** | Las rutas de escritura del contrato (crear, consultar y cancelar órdenes, check-in, clientes) exigen `X-API-Key` (401 si falta o es inválida; comparación con `timingSafeEqual`). Salud, catálogo y búsqueda son públicos. |
| **Idempotencia** | `Idempotency-Key` obligatoria al crear una orden (400 si falta); repetir la misma clave devuelve la misma orden sin duplicarla. |
| **Rate limiting** | `@nestjs/throttler`: 100 peticiones/min por IP en toda la API; 10/min en los endpoints de login y de registro de clientes, para dificultar fuerza bruta sin bloquear reintentos legítimos. |

**Riesgos OWASP Top 10 identificados y cómo se mitigan aquí:**

1. **Broken Access Control (A01)** — mitigado con guards por rol (`AdminAuthGuard`, `ClienteAuthGuard`) en cada endpoint de escritura; sin guard, cualquiera podría crear/borrar sucursales o vehículos.
2. **Cryptographic Failures (A02)** — contraseñas con `scrypt`+sal (no reversibles) y JWT firmado con HMAC-SHA256; sin esto, una fuga de base de datos expondría contraseñas en texto plano y cualquiera podría falsificar sesiones.
3. **Injection (A03)** — TypeORM parametriza las consultas; concatenar SQL manualmente con datos del usuario permitiría inyección SQL.
4. **Identification and Authentication Failures (A07)** — tokens con expiración (8 h), comparación de contraseñas en tiempo constante (`timingSafeEqual`) para evitar timing attacks, y rate limiting (10 intentos/min) en los endpoints de login para dificultar fuerza bruta.

## 3. Pruebas, depuración y optimización

- **Pruebas unitarias** (Vitest, 84 pruebas en 9 archivos): reglas de disponibilidad por fechas y limpieza de 2 h (`disponibilidad.util.spec.ts`), utilidades del contrato B2B (`booking.util.spec.ts`), envío de stock con reintentos (`stock-sync.service.spec.ts`), disponibilidad de reservas y pagos, registro de cuentas y las tres piezas de seguridad — JWT (`jwt.util.spec.ts`), hash de contraseñas con scrypt (`password.util.spec.ts`) y cookies de sesión firmadas (`sesion-firmada.util.spec.ts`): casos de token/cookie manipulados, secreto incorrecto y expiración.
- **Pruebas E2E** (Vitest + supertest, 8 pruebas en `test/app.e2e-spec.ts`): API completa contra PostgreSQL (`npm run test:e2e`).
- **Prueba de integración con Booking** (`test/integracion-booking.smoke.mjs`, 102 comprobaciones): recorre el contrato contra un servidor real (clave, idempotencia, Saga 409, limpieza, disponibilidad por fechas, cancelación, check-in y devolución).
- **Integración continua**: GitHub Actions (`.github/workflows/tests.yml`) levanta PostgreSQL 16, compila, y corre las pruebas unitarias y E2E en cada push y pull request.
- **Análisis estático**: `oxlint` en el backend (`npm run lint`), `eslint` en el frontend React (`frontend-react/npm run lint`).
- **Depuración**: Network/Console del navegador para verificar peticiones JWT (`Authorization: Bearer`) y respuestas de la API; logs del servidor en Render.
- **Optimización**: build de producción de Vite (minificado + tree-shaking, ver `frontend-react/dist`); `Cache-Control` en endpoints de catálogo poco cambiantes del contrato B2B.

## 4. Qué hace la aplicación

1. **Storefront**: buscar vehículos disponibles por sucursal/fechas, reservar con pago simulado, consultar/cancelar reservas.
2. **Panel admin clásico** (`/admin`, cookie): CRUD de sucursales, vehículos y reservas; listado, edición y gestión de roles de clientes.
3. **Panel admin en React** (`/app`, JWT): vehículos (con estado y botón Disponible), sucursales, reservas (con las que requieren acción primero), mostrador y clientes, consumiendo la misma API.
4. **Contrato B2B/GDS** (`/api/v1/search`, `/orders/*`, `/webhooks`, ver Swagger): integración con sistemas externos de distribución.
5. **Mostrador** (`/app/mostrador`): el operador busca una reserva por código, cédula o correo, confirma la entrega de llaves (con la cédula del conductor), registra la devolución, cancela o deja un auto disponible sin esperar el fin de la limpieza.

## 4.1 Integración con Booking Prototipo (RDA 2)

Cumple `contracts/autos-openapi-v3.yaml` (REST) e `contracts/inventory.proto` (gRPC de stock). Resumen de lo que hace:

- **Autenticación y errores:** `X-API-Key` en las rutas de escritura, `Idempotency-Key` obligatoria al crear órdenes y errores en formato RFC 7807 con `code` y `correlation_id`.
- **Reservas y Saga:** `409` (`VEHICLE_UNAVAILABLE`, `VEHICLE_IN_CLEANING_COOLDOWN`) cuando el auto no está libre, con fechas alternativas en la respuesta.
- **Disponibilidad por fechas:** una reserva activa ocupa el auto **desde su recogida hasta que se registra la devolución** (más 2 h de limpieza); las fechas anteriores siguen libres. Al cancelar, el auto se libera de inmediato.
- **Cancelación:** solo con 24 h de anticipación para el cliente (la Saga y el administrador están exentos) y no si el auto ya se entregó; reembolso del 100 % idempotente.
- **Entrega y devolución en el mostrador:** odómetro, alertas de mantenimiento y aviso a Booking (`POST /reservas/{codigo}/checkin` y `POST /autos/orders/{codigo}/checkin-entrega|checkin-devolucion`) con plazo de 25 s, verificación del estado final y reintento automático si Booking no lo acepta.
- **Stock hacia Booking:** gRPC con respaldo REST, reintentos, cola de pendientes y circuit breaker; se envía en cada reserva, cancelación, limpieza o auto nuevo.
- **Clientes:** una sola cuenta por cédula o correo; la cédula que envía Booking se vincula a la reserva y se confirma en la entrega.
- **Otros:** promociones B2B, health para el semáforo LED, feed de eventos (CloudEvents) y foto de respaldo cuando un auto no tiene foto.

Detalle, variables y checklist en [`docs/INTEGRACION_BOOKING.md`](docs/INTEGRACION_BOOKING.md).

## 4.2 Eventos y comunicación entre sistemas

AutoSpot no usa un broker de mensajes (no hay RabbitMQ ni Kafka). Los eventos y avisos salen por cuatro caminos:

```
 Cambio en AutoSpot (reserva, cancelación, limpieza, mantenimiento, auto nuevo)
        |
        +--> [1] Outbox de eventos (CloudEvents) ---> Booking los lee: GET /autos/eventos
        |
        +--> [2] Stock ---> gRPC PushStockUpdate (respaldo REST) ---> Booking Central
        |
        +--> [3] Check-in (entrega y devolución) ---> POST a Booking (con reintento automático)
        |
        +--> [4] Webhooks (contrato GDS) ---> POST a las URL suscritas (best-effort)
```

| # | Camino | Quién inicia | Detalle |
|---|---|---|---|
| 1 | **Outbox de eventos** | Booking (consulta) | Cada hecho se guarda en la base como CloudEvents 1.0 y se publica con `GET /autos/eventos` (`limit` y `after` para continuar desde el último). Tipos: `order.confirmed`, `order.cancelled`, `cooldown.started` y `mantenimiento.alerta`. Requiere `X-API-Key` o sesión de administrador. |
| 2 | **Stock** | AutoSpot | `PushStockUpdate` por gRPC (`inventory.proto`) con respaldo REST, reintentos, cola de pendientes y circuit breaker. Se envía al reservar, cancelar, entrar o salir de limpieza y crear un auto. |
| 3 | **Check-in** | AutoSpot | Al confirmar la entrega o la devolución en el mostrador se avisa a Booking (ver sección 4.1). Plazo de 25 s, verificación del estado y reintento automático cada 45 s si no lo acepta. |
| 4 | **Webhooks** | AutoSpot | Eventos `CAR_ORDER_CONFIRMED` y `CAR_ORDER_CANCELLED` del contrato GDS, enviados por HTTP POST a las URL suscritas (`/api/v1/webhooks`) con 5 s de plazo. Es *best-effort*: si el suscriptor falla se registra una advertencia y no hay reintentos. El `secret` se guarda al suscribir, pero hoy no se usa para firmar el mensaje. |

Cada petición y cada evento llevan un `correlation_id` (cabecera `X-Correlation-Id`) para seguir un mismo hecho en los logs.

## 4.3 Service Mesh y Enterprise Service Bus

- **Service Mesh: no hay.** AutoSpot es un solo servicio y todo su tráfico es "norte-sur" (Booking y navegadores hacia la API). Un mesh sirve para el tráfico entre muchos servicios internos; se evaluaría antes de llegar a unos 10 o 15 servicios.
- **Enterprise Service Bus: no hay dentro de este repositorio.** Hoy AutoSpot se comunica punto a punto con Booking Central (REST, gRPC y avisos HTTP). El papel de bus o agregador del ecosistema lo cumple Booking Central, que expone, por ejemplo, la agregación de reservas de todas las tiendas.
- **Lo que sí cumple funciones parecidas a un ESB**, a pequeña escala: el adaptador `booking.util.ts` traduce los formatos de Booking al modelo propio; los alias de rutas (`/autos`, `/api/v3/autos`) enrutan el mismo contrato; el Outbox y los webhooks publican eventos; y la autenticación se resuelve con guards (`X-API-Key`, JWT y cookie firmada).

Diseño de referencia (esquema de la materia). Lo punteado no existe todavía:

```
  UI (marketplace, panel clásico, panel React)
                    |
                    v
     ( ESB / API Gateway: enruta, transforma, autentica )      <- diseño, no implementado
                    |
        +-----------+-----------+
        v           v           v
     [Autos]   (Alojamientos) (Vuelos) ...     <- Autos = AutoSpot (existe)
        \___________|___________/
              ( Event Bus )                                    <- hoy: Outbox y webhooks
```

## 5. Endpoints principales (`/swagger` para probarlos todos)

| Recurso | Operaciones |
|---|---|
| `/api/v1/auth/login` | `POST` — login JWT (admin o cliente) |
| `/api/v1/sucursales` | `GET` lista (`?ciudad=`), `GET :id`, `POST` (201), `PUT :id` (204), `DELETE :id` (204/409) — escritura requiere sesión admin (cookie o JWT) |
| `/api/v1/vehiculos` | `GET /marcas`, `GET` con filtros, `GET :id`, `POST`, `PUT :id`, `PATCH :id` (precio), `DELETE :id` — escritura requiere sesión admin |
| `/api/v1/reservas` | `GET` (`?email=` o `?codigo=`), `GET :id`, `POST` (requiere sesión de cliente + pago simulado), `PATCH :id/cancelar`, `DELETE :id` (admin) |
| `/api/v1/cuentas/*` | registro/login/logout/yo (cuenta de cliente y sesión por cookie) |
| `/autos`, `/autos/search` | `GET` catálogo y `POST` búsqueda con fechas (públicos) |
| `/api/v3/autos/orders/*` | `POST orders/create` (con `Idempotency-Key`), `GET orders`, `GET orders/:id`, `POST orders/:id/cancel`, `POST orders/:id/checkin-entrega` y `checkin-devolucion` — requieren `X-API-Key` |
| `/api/v3/autos/health`, `/api/v3/clientes` | salud del nodo (público) y consulta/alta de clientes (requiere `X-API-Key`) |
| `/admin/api/*` | panel: `reservas/buscar`, `reservas/:id/entrega`, `devolucion`, `cancelar`, `disponible`, `reenviar-booking`, `vehiculos/:id/disponible`, `cuentas` — requieren sesión admin |

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
src/pagos/          simulación de pago con tarjeta (longitud, vencimiento)
src/sucursales/     entidad, DTO, servicio y controlador
src/vehiculos/      idem + búsqueda con disponibilidad
src/reservas/       idem + transacción que evita reservas solapadas
src/gds-autos/      contrato B2B/GDS (search, hold, órdenes, webhooks)
src/integracion-booking/ contrato v3 con Booking: órdenes, disponibilidad, check-in, cancelación, stock, clientes y eventos
src/proto/          copia de inventory.proto (gRPC de stock)
src/common/         sesión firmada, errores y utilidades compartidas
src/seed/           datos iniciales (sucursales, 42 vehículos, cuentas demo)
contracts/          contratos oficiales de la cátedra (OpenAPI y .proto)
test/               pruebas E2E y script de integración con Booking
base-de-datos/      respaldo SQL
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
| `TIENDA_AUTOS_API_KEY` / `BOOKING_API_KEY` | Claves `X-API-Key` válidas para el contrato B2B (`BOOKING_API_KEY` también se envía a Booking) |
| `BOOKING_BASE_URL` | Base del REST de Booking para los avisos de check-in (por defecto `https://booking-core-api.azurewebsites.net/api/v3`) |
| `BOOKING_REST_STOCK_URL` | URL del REST de stock de Booking (respaldo del gRPC) |
| `BOOKING_GRPC_HOST` | `host:puerto` gRPC de Booking para el stock |
| `B2B_REQUIRE_API_KEY` | `false` desactiva la clave solo en desarrollo |
| `NODE_ID` / `PUBLIC_BASE_URL` / `LOG_DIR` | Identificador del nodo, base de las URL de fotos y carpeta del log JSON |

Detalle de las variables de Booking en [`docs/INTEGRACION_BOOKING.md`](docs/INTEGRACION_BOOKING.md).

## 8. Comandos

```bash
npm install
npm run build              # compila el backend a dist/
npm run start:prod         # arranca el backend en http://localhost:3000
npm test                   # pruebas unitarias del backend (84)
npm run test:e2e           # pruebas E2E (requieren PostgreSQL)
BASE=https://<host> API_KEY=<clave> node test/integracion-booking.smoke.mjs   # integración con Booking
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
