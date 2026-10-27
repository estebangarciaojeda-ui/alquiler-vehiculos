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
| 1 | gRPC `PushStockUpdate` ante cada cambio de flota | `stock-sync.service.ts`: reserva/cancelación (Booking y marketplace), limpieza, mantenimiento y fin de cooldown. Timestamp estrictamente creciente, `slot_id` `slot-YYYYMMDD-HHMM`, respaldo REST `POST /api/v3/inventory/stock` y circuit breaker. `POST /autos/inventario/sincronizar` reenvía toda la flota. |
| 2 | `POST /reservas` (contrato v3) | `autos-b2b.controller.ts`; alias `/autos/reservas` y `/autos/orders/create`. Acepta el payload en inglés y los alias en español. |
| 3 | Saga 409 | `409` con `code: VEHICLE_UNAVAILABLE` o `VEHICLE_IN_CLEANING_COOLDOWN` (RFC 7807). `422` (edad, fechas, payload) y `400` (idempotencia) **no** son 409. |
| 4 | Cooldown 2 h | Devolución → `EN_LIMPIEZA` 120 min: excluido de `/autos`, búsquedas y reservas (también del marketplace); un temporizador lo libera y avisa a Booking. |
| 5 | Odómetro | `checkin-entrega` (`km_salida`), `checkin-devolucion` (`km_retorno`, `km_recorridos`), alerta si `km >= proximo_mantenimiento_km` (bitácora + evento). |
| 6 | Promociones B2B | `GET/PUT /autos/promociones/contrato` (persistente). |
| 7 | Trazabilidad | `logs/integracion-autos.log` (JSON por línea) con `correlation_id` e `idempotency_key`; el `X-Correlation-Id` se devuelve en cada respuesta. |
| 8 | Semáforo LED | `GET /autos/health` → `HEALTHY` (503 si no hay base de datos). |

Además: máquina de 6 estados (`GET /autos/flota` con cronómetro del cooldown), check-in digital, cancelación con reembolso
100 % (idempotente), cobertura Básica/Total, recargo por conductor < 25 o > 70 años, feed Outbox de CloudEvents
(`GET /autos/eventos`) y mantenimiento con RBAC (`X-Role: MANTENIMIENTO | ADMIN`).

## Variables de entorno

| Variable | Uso |
|---|---|
| `NODE_ID` | `service_id` del nodo (por defecto `NODE_AUT_AUTOSPOT`). |
| `BOOKING_GRPC_HOST` | `host:puerto` gRPC de Booking (por defecto `rda1-backend-integracion-sistemas.onrender.com:50051`; puerto 443 usa TLS). |
| `BOOKING_REST_URL` | Respaldo REST si gRPC no está disponible. |
| `BOOKING_SYNC_ENABLED` | `false` desactiva el envío de stock. |
| `TIENDA_AUTOS_API_KEY` | Clave `X-API-Key` para listar órdenes/eventos y, si se activa, las escrituras. |
| `B2B_REQUIRE_API_KEY` | `true` exige admin o `X-API-Key` también en crear/cancelar/check-ins (por defecto abiertas para que Booking integre sin configuración previa). |
| `PUBLIC_BASE_URL` | Base de las URLs de fotos si hay un proxy distinto al host recibido. |
| `LOG_DIR` | Carpeta del log físico (por defecto `./logs`). |

## Pruebas

```bash
npm test                                   # unitarias (reglas de negocio, estados, validación)
BASE=https://<host> API_KEY=<clave> node test/integracion-booking.smoke.mjs   # integración extremo a extremo
```
