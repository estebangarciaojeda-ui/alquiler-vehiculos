# Integración con Booking Prototipo (RDA 2)

AutoSpot es la tienda de **Autos** del ecosistema distribuido del curso. Cumple los contratos oficiales:

| Contrato | Archivo | Rol |
|---|---|---|
| REST canónico v3 (OpenAPI 3.0.3) | [`contracts/autos-openapi-v3.yaml`](../contracts/autos-openapi-v3.yaml) | Booking → AutoSpot (catálogo, búsqueda, reservas, Saga) |
| gRPC de inventario (Protocol Buffers v3) | [`contracts/inventory.proto`](../contracts/inventory.proto) (copia usada en `src/proto/`) | AutoSpot → Booking (`PushStockUpdate`, puerto 50051) |
| Guía de integración | [`contracts/GUIA_INTEGRACION_AUTOS.md`](../contracts/GUIA_INTEGRACION_AUTOS.md) | Reglas de la cátedra |

Código: `src/integracion-booking/`. Es un módulo más del monolito NestJS (misma base PostgreSQL); el REST se publica
bajo `/autos`, `/api/v3/autos` y los alias raíz `/health` y `/reservas`.

## Cómo registrar la tienda en el dashboard de Booking

Dashboard → pestaña **Nodos** → vertical **Autos**:

- **Base URL REST:** la URL pública de este despliegue (sin barra final).
- **ID del nodo / service_id gRPC:** `NODE_AUT_AUTOSPOT` (variable `NODE_ID`).
- Health: `GET {baseUrl}/autos/health` (o `/health`). Catálogo: `GET {baseUrl}/autos`.

## Checklist de la guía (§8) y dónde se cumple

| # | Requisito | Implementación |
|---|---|---|
| 1 | gRPC `PushStockUpdate` ante cada cambio de flota | `stock-sync.service.ts`: reserva/cancelación (Booking y marketplace), limpieza, mantenimiento y fin de cooldown. Timestamp estrictamente creciente, `slot_id` `slot-YYYYMMDD-HHMM`, respaldo REST `POST /api/v3/inventory/push-stock` y circuit breaker. `POST /autos/inventario/sincronizar` reenvía toda la flota. |
| 2 | `POST /reservas` (contrato v3) | `autos-b2b.controller.ts`; alias `/autos/reservas` y `/autos/orders/create`. Acepta el payload en inglés y los alias en español. |
| 3 | Saga 409 | `409` con `code: VEHICLE_UNAVAILABLE` o `VEHICLE_IN_CLEANING_COOLDOWN` (RFC 7807), con `alternativas` (fechas libres) y, cuando se conoce, `disponible_desde`. `422` (edad, fechas, payload) y `400` (idempotencia) **no** son 409. |
| 4 | Cooldown 2 h | Devolución → `EN_LIMPIEZA` 120 min: no se ofrece en `/autos` ni en las búsquedas durante ese tiempo; la limpieza se trata como una ventana de fechas, así que reservar para un día posterior sí se permite. Un temporizador lo libera y avisa a Booking, y el administrador puede dejarlo disponible antes con el botón **Disponible** del panel. |
| 5 | Odómetro | `checkin-entrega` (`km_salida`), `checkin-devolucion` (`km_retorno`, `km_recorridos`), alerta si `km >= proximo_mantenimiento_km` (bitácora + evento). |
| 6 | Promociones B2B | `GET/PUT /autos/promociones/contrato` (persistente). |
| 7 | Trazabilidad | `logs/integracion-autos.log` (JSON por línea) con `correlation_id` e `idempotency_key`; el `X-Correlation-Id` se devuelve en cada respuesta. |
| 8 | Semáforo LED | `GET /autos/health` → `HEALTHY` (503 si no hay base de datos). |

Además: máquina de 6 estados (`GET /autos/flota` con cronómetro del cooldown), check-in digital, cancelación con reembolso
100 % (idempotente), cobertura Básica/Total, recargo por conductor < 25 o > 70 años, feed Outbox de CloudEvents
(`GET /autos/eventos`) y mantenimiento con RBAC (`X-Role: MANTENIMIENTO | ADMIN`).

## Disponibilidad por fechas

Regla de negocio de AutoSpot (`disponibilidad.util.ts`), con zona horaria de Ecuador (UTC-5):

- Una reserva activa **ocupa el auto desde su recogida hasta que se registra la devolución**, más 2 h de limpieza. Mientras no haya devolución, el auto no se ofrece para fechas posteriores.
- Las fechas **anteriores** a la recogida siguen libres.
- Si la petición choca con otra reserva o con una limpieza en curso, se responde `409` con fechas alternativas. Cuando la reserva que bloquea no tiene devolución, `disponible_desde` es `null` y las alternativas son solo fechas anteriores.
- Un auto en mantenimiento no se ofrece en ninguna fecha. Al cancelar una reserva, el auto se libera de inmediato.
- El catálogo `GET /autos` muestra el estado actual del auto; `POST /autos/search` aplica las fechas pedidas.

## Cancelación

`POST /autos/orders/{id}/cancel` (alias `/api/v3/autos/orders/{id}/cancel`), con `solicitante`: `CLIENTE` (por defecto), `SAGA_ORCHESTRATOR` o `ADMIN`.

- Para `CLIENTE` solo se permite con al menos 24 h de anticipación a la recogida; si no, `409` (`CANCELLATION_NOT_ALLOWED`, "Cancelación Fuera de Plazo"). La Saga y el administrador están exentos.
- No se cancela una reserva ya entregada (`409`, "Cancelación No Permitida").
- Reembolso del 100 % con id `REF-AUTO-…`, idempotente, y `inventory_restoration` en la respuesta. Se repone el stock en Booking.

## Entrega, devolución y aviso a Booking

El operador confirma la entrega y la devolución en el panel (`/app/mostrador` o `/app/reservas`); la cédula del conductor se confirma en la entrega. Después AutoSpot avisa a Booking:

1. `POST {BOOKING_BASE_URL}/reservas/{codigo}/checkin` con `estado: CONFIRMADO_ASISTIDO`, cédula, `client_id`, `km_salida`, `tipo` (`ENTREGA` o `DEVOLUCION`) y los alias de código de reserva (`external_order_id`, `order_id`, `pnr`, `reservation_code`, `codigo_reserva`, `localizador`, `reserva_id`, `reservation_id`, `id`).
2. `POST {BOOKING_BASE_URL}/autos/orders/{codigo}/checkin-entrega` o `checkin-devolucion` (cuerpos del contrato). Va al final para que Booking registre la reserva en la vertical AUTOS.
3. `GET {BOOKING_BASE_URL}/reservas/{codigo}/estado` para comprobar el estado y la vertical que Booking guardó.

Plazo de 25 s por aviso y sin reintento inmediato tras un timeout (Booking puede estar lento y haber guardado el aviso). Si no hay respuesta pero el estado de Booking ya es `CONFIRMADO_ASISTIDO`, la entrega se da por notificada. Si Booking no lo acepta, el aviso queda en cola y se reintenta solo cada 45 s, hasta 8 veces. El botón **Reenviar a Booking** del panel repite el aviso a mano.

## Clientes

Los clientes están en la tabla `cuentas` (identificación, teléfono, licencia y origen). Se buscan primero por cédula y luego por correo para no duplicarlos. La cédula que envía Booking (en `identificacion` o en `license_number`) se guarda en la reserva y se vincula al cliente.

## Fotos

Cada auto tiene la URL `/img/autos/<marca>-<modelo>.jpg`. Si el archivo no existe, se responde una imagen de respaldo ("Foto no disponible") con código 200 en lugar de 404.

## Variables de entorno

| Variable | Uso |
|---|---|
| `NODE_ID` | `service_id` del nodo (por defecto `NODE_AUT_AUTOSPOT`). |
| `BOOKING_GRPC_HOST` | `host:puerto` gRPC de Booking (por defecto `rda1-backend-integracion-sistemas.onrender.com:50051`; puerto 443 usa TLS). |
| `BOOKING_REST_URL` | Respaldo REST si gRPC no está disponible (Render solo expone HTTP, así que el puerto 50051 público suele no estar accesible). |
| `BOOKING_API_KEY` | Clave de proveedor que Booking entregue; se envía como `X-Api-Key` en el respaldo REST. |
| `BOOKING_BASE_URL` | Base del REST de Booking para los avisos de check-in y la lectura del estado (por defecto `https://booking-core-api.azurewebsites.net/api/v3`). |
| `BOOKING_REST_STOCK_URL` | URL completa del REST de stock de Booking, si la guía entrega una distinta a la ruta por defecto. |
| `BOOKING_GRPC_TLS` | `true` fuerza TLS en el canal gRPC (también se activa si el puerto es 443). |
| `BOOKING_REST_STOCK_PATH` | Ruta REST de stock (por defecto `/api/v3/inventory/push-stock`). |
| `BOOKING_SYNC_ENABLED` | `false` desactiva el envío de stock. |
| `TIENDA_AUTOS_API_KEY` / `BOOKING_API_KEY` | Claves `X-API-Key` válidas. Se exigen en crear/consultar/cancelar órdenes, check-ins y `/api/v3/clientes` (401 si falta o es inválida). Health, catálogo y búsqueda son públicos. |
| `B2B_REQUIRE_API_KEY` | Por defecto la clave se exige; `false` la desactiva (solo para desarrollo). La `Idempotency-Key` es obligatoria al crear una orden (400 `MISSING_IDEMPOTENCY_KEY`); `GET /autos/orders?idempotency_key=<clave>` devuelve solo esa orden (404 si no existe). |
| `PUBLIC_BASE_URL` | Base de las URLs de fotos si hay un proxy distinto al host recibido. |
| `LOG_DIR` | Carpeta del log físico (por defecto `./logs`). |

## Pruebas

```bash
npm test                                   # 84 unitarias (disponibilidad, contrato B2B, stock, cuentas, seguridad)
npm run test:e2e                           # 8 pruebas E2E (requieren PostgreSQL)
BASE=https://<host> API_KEY=<clave> node test/integracion-booking.smoke.mjs   # 102 comprobaciones contra el servidor
```

El script de integración crea reservas de prueba; si se le pasan `ADMIN_USER` y `ADMIN_PASSWORD`, las borra al terminar. Si un auto queda con una reserva de prueba sin devolver, no se ofrece para fechas posteriores hasta cancelarla o devolverla.
