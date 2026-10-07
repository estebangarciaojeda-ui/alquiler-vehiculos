# AutoSpot · Documentación técnica

Prototipo de plataforma de alquiler de vehículos (Proyecto Integrador: Booking Prototipo).

- Sitio público: https://alquiler-vehiculos-ijx3.onrender.com
- Panel administrativo: https://alquiler-vehiculos-ijx3.onrender.com/admin
- Documentación interactiva (Swagger, con acceso restringido): https://alquiler-vehiculos-ijx3.onrender.com/swagger
- Repositorio: https://github.com/estebangarciaojeda-ui/alquiler-vehiculos

## 1. Arquitectura

Monolito modular en NestJS (TypeScript) con PostgreSQL y TypeORM. Un solo servicio sirve tres cosas: la API REST, el marketplace web estático (HTML, CSS y JavaScript sin frameworks) y el panel administrativo.

```
            ┌──────────────────────┐        ┌────────────────────────┐
  Cliente → │ Marketplace (public/)│ ─────► │                        │
  Admin   → │ Panel admin (/admin) │ ─────► │   API NestJS            │ ─► PostgreSQL
  B2B/API → │ Contrato Autos (GDS) │ ─────► │   (módulos por dominio) │    (Render)
            └──────────────────────┘        │                        │
                                            └──────────┬─────────────┘
                                                       │ webhooks (HTTP POST, best-effort)
                                                       ▼
                                              sistemas suscritos (B2B)
```

### Módulos

| Módulo | Responsabilidad |
|---|---|
| `sucursales` | Puntos de recogida y devolución. |
| `vehiculos` | Flota, precios por día, búsqueda con filtros. |
| `reservas` | Reserva de vehículos para clientes: disponibilidad, pago simulado y consulta. |
| `cuentas` | Registro de clientes, login y sesión por cookie firmada. |
| `pagos` | Simulación de cobro con tarjeta (validación de formato, sin cobro real). |
| `admin` | Login del administrador, guard de sesión y vistas de órdenes y webhooks. |
| `gds-autos` | Implementación del contrato B2B `contracts/autos-openapi.yaml` (búsqueda, hold, preview, órdenes y webhooks). |
| `seed` | Datos iniciales al arrancar: sucursales, flota de 42 vehículos y cuentas de demostración. |
| `common` | Utilidades compartidas: sesión firmada, errores en formato ProblemDetails, guard de idempotencia. |

### Decisiones de diseño relevantes

- **Consistencia de disponibilidad**: al reservar, la transacción bloquea la fila del vehículo (`SELECT … FOR UPDATE`) y comprueba que no existan reservas confirmadas que se solapen en fechas. Dos clientes que intenten el mismo vehículo en las mismas fechas no pueden ambos completar la reserva: el segundo recibe **409**.
- **Pago simulado dentro de la transacción**: si la tarjeta es rechazada o inválida, la reserva no se guarda. El número de tarjeta nunca se persiste; solo se guardan la referencia del pago y los últimos 4 dígitos.
- **Idempotencia en el contrato B2B**: las operaciones de escritura (`create`, `modify`, `cancel`) guardan la respuesta asociada a un `Idempotency-Key`; repetir la misma clave devuelve la misma respuesta sin duplicar la orden.
- **Contrato primero (API-first)**: el contrato B2B se implementa tal como lo define `contracts/autos-openapi.yaml` (nombres de campo en snake_case, códigos de estado y formato de error del contrato).
- **Seguridad básica**: Swagger exige Basic Auth; el panel admin y las escrituras de sucursales y vehículos exigen una cookie de sesión firmada con HMAC; las contraseñas de cliente se guardan con `scrypt` y sal aleatoria.

## 2. Modelo de datos

```
sucursales 1 ──< vehiculos 1 ──< reservas >── 1 cuentas
    │                               │
    └──────────────< reservas (sucursalRecogida / sucursalDevolucion)

gds_holds ──< gds_previews ──< gds_orders
gds_webhooks            gds_idempotencia (clave → respuesta)
```

| Tabla | Campos principales |
|---|---|
| `sucursales` | id, nombre, ciudad, direccion, esAeropuerto |
| `vehiculos` | id, marca, modelo, anio, categoria, transmision, pasajeros, maletas, puertas, combustible, aireAcondicionado, precioPorDia, sucursalId |
| `reservas` | id, codigo (único), vehiculoId, sucursalRecogidaId, sucursalDevolucionId, fechaRecogida, horaRecogida, fechaDevolucion, horaDevolucion, nombreCliente, email, telefono, dias, total, estado (`CONFIRMADA`/`CANCELADA`), cuentaId, pagoReferencia, tarjetaUltimos4, creadaEn |
| `cuentas` | id, email (único), nombre, passwordHash, rol (`cliente`/`admin`), creadaEn |
| `gds_holds` | id, vehiculoId, searchToken, fechas, expiresAt |
| `gds_previews` | id, vehiculoId, holdId, extras, fechas, ruta, moneda, precioTotal, desglose, consumida |
| `gds_orders` | id, locator (único), estado, vehiculoId, vehiculoSnapshot, fechas, ruta, extras, precioTotal, moneda, driverDetails, paymentReference |
| `gds_webhooks` | id, url, events, secret |
| `gds_idempotencia` | clave (PK), respuesta (JSON), creadoEn |

La base de datos se crea y actualiza sola al arrancar (TypeORM `synchronize`), y el seed inserta los datos iniciales. El respaldo SQL se incluye en `base-de-datos/autospot.sql`.

## 3. APIs

Todas las rutas están bajo `/api/v1`, salvo las del panel. La documentación interactiva está en `/swagger`.

### 3.1 Storefront público (17 endpoints)

| Método | Ruta | Acceso |
|---|---|---|
| GET | `/sucursales` (`?ciudad=`) | Público |
| GET | `/sucursales/{id}` | Público |
| POST / PUT / DELETE | `/sucursales`, `/sucursales/{id}` | Admin |
| GET | `/vehiculos` (filtros: sucursalId, ciudad, marca, categoria, transmision, pasajeros, precioMax, desde, hasta, orden) | Público |
| GET | `/vehiculos/marcas` | Público |
| GET | `/vehiculos/{id}` | Público |
| POST / PUT / PATCH / DELETE | `/vehiculos`, `/vehiculos/{id}` | Admin |
| GET | `/reservas` (`?email=` o `?codigo=`) | Público |
| GET | `/reservas/{id}` | Público |
| POST | `/reservas` | Cliente con sesión (incluye pago simulado) |
| PATCH | `/reservas/{id}/cancelar` | Público |
| DELETE | `/reservas/{id}` | Admin |

### 3.2 Cuentas de cliente (4 endpoints)

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/cuentas/registro` | Crea una cuenta con contraseña cifrada, rechaza correos duplicados e inicia la sesión. |
| POST | `/cuentas/login` | Recibe `email` y `contrasena`; devuelve los datos de la cuenta y una cookie `cliente_session`. |
| POST | `/cuentas/logout` | Cierra la sesión. |
| GET | `/cuentas/yo` | Datos de la cuenta con sesión iniciada (401 si no hay sesión). |

El panel clásico expone, solo para administradores autenticados, `GET /admin/api/cuentas`
y `PATCH /admin/api/cuentas/:id/rol`. La promoción permite usar la cuenta en el
panel React; la revocación se comprueba contra la base de datos y bloquea de
inmediato los JWT administrativos emitidos para esa cuenta.

### 3.3 Contrato B2B Autos (15 endpoints)

Implementa `contracts/autos-openapi.yaml` (repositorio de la plantilla de la materia). Todas las rutas requieren la cabecera `X-Affiliate-Id` en las consultas.

| Grupo | Endpoints |
|---|---|
| Búsqueda y catálogo | `POST /search`, `POST /details`, `POST /depots`, `POST /depots/reviews/scores`, `POST /suppliers`, `POST /constants` |
| Órdenes | `POST /orders/hold`, `POST /orders/preview`, `POST /orders/create`, `GET /orders/{orderId}`, `POST /orders/{orderId}/modify`, `POST /orders/{orderId}/cancel` |
| Webhooks | `GET /webhooks`, `POST /webhooks`, `DELETE /webhooks/{id}` |

El flujo es **search → hold → preview → create**. Las operaciones de escritura exigen `Idempotency-Key` (UUID).

### 3.4 Panel administrativo (5 endpoints)

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/admin/api/login` | Inicio de sesión del administrador. |
| POST | `/admin/api/logout` | Cierre de sesión. |
| GET | `/admin/api/whoami` | Verifica la sesión. |
| GET | `/admin/api/gds-orders` | Órdenes creadas por el contrato B2B. |
| GET | `/admin/api/gds-webhooks` | Suscripciones de webhooks. |

La página `/admin` contiene la interfaz para gestionar sucursales, vehículos, reservas y ver órdenes y webhooks.

### 3.5 Errores

Los endpoints del contrato B2B responden errores en formato **ProblemDetails** (`application/problem+json`). El resto de la API responde con el formato estándar de NestJS (`statusCode`, `message`).

| Código | Uso |
|---|---|
| 400 | Datos inválidos o pago rechazado. |
| 401 | Falta sesión (cliente o admin) o credenciales incorrectas. |
| 404 | El recurso no existe. |
| 409 | Vehículo no disponible en esas fechas, u orden ya cancelada. |

## 4. Diseño de eventos e integración futura (SOA / EDA)

Diseño preliminar, pensado para integrarse con otros servicios de la materia.

- **Catálogo de eventos** (`WebhookSubscriptionDto.events`): `CAR_ORDER_CONFIRMED`, `CAR_ORDER_CANCELLED` y `DEPOT_UPDATE`.
  - `CAR_ORDER_CONFIRMED` y `CAR_ORDER_CANCELLED` se disparan al confirmar o cancelar una orden del contrato B2B.
  - `DEPOT_UPDATE` está definido en el contrato, pero aún no se emite desde el código.
- **Formato del evento**: `{ eventId, eventType, timestamp, resourceId, data }`.
- **Entrega**: HTTP POST a la URL suscrita, con 5 segundos de tiempo límite. La entrega es *best-effort*: si el suscriptor falla, la operación principal no se ve afectada. No hay reintentos ni cola de mensajes; esa sería la siguiente evolución hacia una arquitectura orientada a eventos completa.
- **Reservas del marketplace**: hoy no emiten eventos; su integración equivaldría a publicar `CAR_ORDER_CONFIRMED` al reservar.

## 5. Cuentas de prueba

| Usuario | Contraseña | Uso sugerido |
|---|---|---|
| `cliente1@correo.com` | `cliente1` | Cliente A |
| `cliente2@correo.com` | `cliente2` | Cliente B |
| `cliente3@correo.com` | `cliente3` | Cliente C |

Tarjetas de prueba para el pago simulado (no realizan cobros reales):

| Número | Resultado |
|---|---|
| `4111 1111 1111 1111` | Aprobada |
| `4000 0000 0000 0002` | Rechazada por el banco |

Cualquier fecha de vencimiento futura (MM/AA) y cualquier CVV de 3 o 4 dígitos.

## 6. Escenario de prueba recomendado

1. Iniciar sesión como `cliente1` y reservar un vehículo para unas fechas. Resultado: reserva confirmada con código y referencia de pago.
2. Cerrar sesión, iniciar como `cliente2` e intentar reservar **el mismo vehículo en las mismas fechas**. Resultado: rechazo con el mensaje de no disponible (409).
3. Intentar pagar con la tarjeta rechazada. Resultado: la reserva no se crea.
4. Iniciar sesión en `/admin` y verificar la reserva. Intentar crear un vehículo sin sesión de admin. Resultado: 401.
5. Abrir `/swagger` sin credenciales. Resultado: 401. Con las credenciales de Swagger, probar los endpoints.

## 7. Ejecución local

Requisitos: Node.js 22 o superior, PostgreSQL 16.

```bash
npm install
cp .env.example .env   # completar DATABASE_URL y las variables de sesión
npm run start:dev      # http://localhost:3000
npm test               # pruebas unitarias
```

Variables de entorno:

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Cadena de conexión a PostgreSQL. |
| `PORT` | Puerto del servidor. |
| `SWAGGER_USER`, `SWAGGER_PASSWORD` | Credenciales de Basic Auth para `/swagger`. |
| `ADMIN_USER`, `ADMIN_PASSWORD` | Credenciales del panel admin. |
| `ADMIN_SESSION_SECRET` | Secreto para firmar las cookies de sesión (admin y cliente). |

## 8. Despliegue

- Render (plan gratuito): servicio web `alquiler-vehiculos` con despliegue automático al hacer push a `main`, y base de datos PostgreSQL `productos-db`. Las variables de entorno se configuran en el panel de Render.
- El plan gratuito pone el servicio en reposo tras un rato sin uso; la primera carga puede tardar hasta un minuto.

## 9. Limitaciones conocidas

- Los pagos son simulados: solo validan formato, vencimiento y un caso de rechazo. No hay pasarela real.
- Las cuentas de demostración tienen contraseñas sencillas a propósito, para facilitar las pruebas. No deben usarse en producción real.
- La autenticación del contrato B2B está documentada (OAuth2 en Swagger), pero el servidor no valida tokens; es una decisión de prototipo.
- Los eventos se entregan por HTTP sin reintentos.
