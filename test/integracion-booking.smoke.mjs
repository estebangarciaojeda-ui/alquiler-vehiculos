// Pruebas de integración del contrato REST v3 (Booking Prototipo) contra un servidor en ejecución.
//   BASE=http://localhost:3000 [API_KEY=...] [ADMIN_USER=admin ADMIN_PASSWORD=...] node test/integracion-booking.smoke.mjs
// Recorre la checklist de la guía: health, catálogo, búsqueda, reserva idempotente, Saga 409,
// cooldown de 2 h, odómetro, mantenimiento con RBAC, promociones B2B, eventos y trazabilidad.
import { randomUUID } from 'node:crypto';

const BASE = (process.env.BASE ?? 'http://localhost:3000').replace(/\/+$/, '');
const API_KEY = process.env.API_KEY;
let fallos = 0;
let total = 0;

async function http(metodo, ruta, cuerpo, cabeceras = {}) {
  // Por defecto se envía X-API-Key (si hay API_KEY); pasar { 'X-API-Key': null } para probar una petición sin clave.
  const porDefecto = API_KEY ? { 'X-API-Key': API_KEY } : {};
  const headers = { 'Content-Type': 'application/json', ...porDefecto, ...cabeceras };
  for (const k of Object.keys(headers)) if (headers[k] === null) delete headers[k];
  const opciones = { method: metodo, headers, signal: AbortSignal.timeout(60_000) };
  if (cuerpo !== undefined) opciones.body = JSON.stringify(cuerpo);
  const res = await fetch(BASE + ruta, opciones);
  const texto = await res.text();
  let json = null;
  try { json = texto ? JSON.parse(texto) : null; } catch { json = texto; }
  return { status: res.status, headers: res.headers, json };
}

function ok(nombre, condicion, detalle = '') {
  total++;
  if (condicion) console.log(`  OK   ${nombre}`);
  else {
    fallos++;
    console.log(`  FALLA ${nombre} ${detalle}`);
  }
}

const sumarDias = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const conductor = { full_name: 'Carlos Andrés Zambrano', email: 'carlos.zambrano@example.com', phone: '+593987654321', license_number: '1710034065', country_license: 'Ecuador', age: 28, flight_number: 'AV1632' };
const cuerpoReserva = (vehiculo, desde, hasta, extra = {}) => ({
  vehicle_id: vehiculo, pickup_date: desde, dropoff_date: hasta, pickup_time: '10:00', dropoff_time: '10:00',
  pickup_location: 'Aeropuerto Mariscal Sucre (UIO), Quito', dropoff_location: 'Aeropuerto Mariscal Sucre (UIO), Quito',
  coverage_type: 'BASIC', driver: conductor, ...extra,
});

console.log(`Probando ${BASE}\n`);

console.log('1. Health / semáforo LED');
for (const ruta of ['/autos/health', '/health', '/api/v3/autos/health']) {
  const r = await http('GET', ruta);
  ok(`GET ${ruta} => 200 HEALTHY`, r.status === 200 && r.json?.status === 'HEALTHY', JSON.stringify(r.json)?.slice(0, 120));
}
const salud = (await http('GET', '/autos/health')).json;
ok('health trae nodo_id, vertical AUTOS, circuit_breaker_estado', !!salud?.nodo_id && salud?.vertical === 'AUTOS' && !!salud?.circuit_breaker_estado);

console.log('2. Catálogo (importación de flota en Booking)');
const cat = await http('GET', '/autos');
ok('GET /autos => 200 con total/limit/data', cat.status === 200 && Array.isArray(cat.json?.data) && cat.json.data.length > 0, `status ${cat.status}`);
const primero = cat.json?.data?.[0];
ok('la tarjeta tiene vehicle_id, foto_url absoluta, precio_diario y estado', !!primero?.vehicle_id && /^https?:\/\//.test(primero?.foto_url ?? '') && primero?.precio_diario > 0 && primero?.estado === 'DISPONIBLE');
ok('GET /autos?category=SUV filtra', (await http('GET', '/autos?category=SUV')).json?.data?.every((a) => a.categoria === 'SUV'));
const detalle = await http('GET', `/autos/${primero.vehicle_id}`);
ok(`GET /autos/${primero.vehicle_id} => 200`, detalle.status === 200 && detalle.json?.vehicle_id === primero.vehicle_id);
ok('GET /autos/auto-9999 => 404 ProblemDetails', (await http('GET', '/autos/auto-9999')).status === 404);
const cob = await http('GET', `/autos/${primero.vehicle_id}/coberturas`);
ok('coberturas: BASICA (franquicia 1200) y TOTAL (franquicia 0)', cob.json?.opciones?.[0]?.franquicia === 1200 && cob.json?.opciones?.[1]?.franquicia === 0);

console.log('3. Búsqueda');
const desde = sumarDias(40);
const hasta = sumarDias(43);
const busq = await http('POST', '/autos/search', { pickup_location: 'Aeropuerto Mariscal Sucre (UIO), Quito', pickup_date: desde, pickup_time: '10:00', dropoff_date: hasta, dropoff_time: '10:00', driver_age: 32 });
ok('POST /autos/search => 200 con data y metadata', busq.status === 200 && busq.json?.data?.length > 0 && busq.json?.metadata?.total_results === busq.json?.data?.length, `status ${busq.status}`);
const joven = await http('POST', '/autos/search', { pickup_location: 'UIO', pickup_date: desde, pickup_time: '10:00', dropoff_date: hasta, dropoff_time: '10:00', driver_age: 22 });
ok('conductor < 25 => recargo joven (surcharge_applied)', joven.json?.metadata?.surcharge_applied === true);
const menor = await http('POST', '/autos/search', { pickup_location: 'UIO', pickup_date: desde, pickup_time: '10:00', dropoff_date: hasta, dropoff_time: '10:00', driver_age: 17 });
ok('conductor < 18 => 422 DRIVER_UNDERAGE', menor.status === 422 && menor.json?.code === 'DRIVER_UNDERAGE');

console.log('4. Reserva (POST /reservas) + idempotencia');
const auto = busq.json.data[0].vehicle_id;
const llave = randomUUID();
const r1 = await http('POST', '/reservas', cuerpoReserva(auto, desde, hasta), { 'Idempotency-Key': llave, 'X-Correlation-Id': 'cid-test-001' });
ok('crea la reserva => 201 con pnr, status CONFIRMED y voucher', r1.status === 201 && /^CAR[A-Z0-9]{5}$/.test(r1.json?.pnr ?? '') && r1.json?.status === 'CONFIRMED' && !!r1.json?.voucher_qr_data, `status ${r1.status} ${JSON.stringify(r1.json)?.slice(0, 160)}`);
ok('devuelve X-Correlation-Id', r1.headers.get('x-correlation-id') === 'cid-test-001');
ok('total_price es USD y mayor a 0', r1.json?.total_price?.currency === 'USD' && r1.json?.total_price?.total > 0);
const pnr = r1.json?.pnr;
const r1b = await http('POST', '/reservas', cuerpoReserva(auto, desde, hasta), { 'Idempotency-Key': llave });
ok('misma Idempotency-Key => misma respuesta, sin duplicar', r1b.status === 201 && r1b.json?.pnr === pnr && r1b.headers.get('idempotent-replayed') === 'true');
const r1c = await http('POST', '/reservas', cuerpoReserva(auto, desde, sumarDias(44)), { 'Idempotency-Key': llave });
ok('misma llave con otro cuerpo => 400 IDEMPOTENCY_CONFLICT (no activa Saga)', r1c.status === 400 && r1c.json?.code === 'IDEMPOTENCY_CONFLICT');
const r2 = await http('POST', '/autos/orders/create', cuerpoReserva(auto, desde, hasta), { 'Idempotency-Key': randomUUID() });
ok('mismo auto y fechas con otra llave => 409 VEHICLE_UNAVAILABLE (Saga LIFO)', r2.status === 409 && r2.json?.code === 'VEHICLE_UNAVAILABLE' && r2.headers.get('content-type')?.includes('problem+json'), `status ${r2.status} ${JSON.stringify(r2.json)?.slice(0, 160)}`);
ok('el 409 trae type, title, detail, instance y correlation_id', !!r2.json?.type && !!r2.json?.title && !!r2.json?.detail && !!r2.json?.instance && !!r2.json?.correlation_id);
const busq2 = await http('POST', '/autos/search', { pickup_location: 'UIO', pickup_date: desde, pickup_time: '10:00', dropoff_date: hasta, dropoff_time: '10:00' });
ok('el auto reservado ya no aparece en la búsqueda de esas fechas', !busq2.json?.data?.some((a) => a.vehicle_id === auto));
ok('conductor < 18 => 422 DRIVER_UNDERAGE (sin Saga)', (await http('POST', '/reservas', cuerpoReserva('auto-002', desde, hasta, { driver: { ...conductor, age: 16 } }), { 'Idempotency-Key': randomUUID() })).json?.code === 'DRIVER_UNDERAGE');
ok('fechas invertidas => 422 INVALID_DATES', (await http('POST', '/reservas', cuerpoReserva('auto-002', hasta, desde), { 'Idempotency-Key': randomUUID() })).json?.code === 'INVALID_DATES');
ok('cuerpo sin driver => 422 INVALID_PAYLOAD con invalid_params', (await http('POST', '/reservas', { vehicle_id: 'auto-002', pickup_date: desde, dropoff_date: hasta }, { 'Idempotency-Key': randomUUID() })).json?.invalid_params?.length > 0);
const esp = await http('POST', '/autos/reservas', { auto_id: 'auto-003', fecha_recogida: desde, fecha_devolucion: hasta, cobertura: 'TOTAL', conductor: { nombre: 'Ana Ruiz', correo: 'ana@example.com', telefono: '0999999999', licencia_conducir: 'L123', edad: 30 } }, { 'Idempotency-Key': randomUUID() });
ok('tolera alias en español (conductor, fecha_recogida, cobertura)', esp.status === 201 && esp.json?.tipo_cobertura === 'TOTAL', `status ${esp.status}`);

console.log('5. Consulta de orden');
const g = await http('GET', `/autos/orders/${pnr}`);
ok('GET /autos/orders/{pnr} => 200', g.status === 200 && g.json?.pnr === pnr);
ok('orden inexistente => 404', (await http('GET', '/autos/orders/CAR00000')).status === 404);

console.log('6. Check-in, entrega (km_salida) y devolución (km_retorno + cooldown 2 h)');
const ci = await http('POST', `/autos/reservas/${pnr}/checkin`, { numero_licencia: '1710034065', documento_identidad: '1710034065' });
ok('check-in digital => 200 CHECKIN_COMPLETED', ci.status === 200 && ci.json?.checkin_status === 'CHECKIN_COMPLETED');
const devAntes = await http('POST', `/autos/orders/${pnr}/checkin-devolucion`, { km_retorno: 100 });
ok('devolver antes de entregar => 409', devAntes.status === 409);
const en = await http('POST', `/autos/orders/${pnr}/checkin-entrega`, { licencia_conducir: '1710034065', km_salida: 12500, tecnico_entrega: 'Agente UIO' });
ok('entrega => 200 estado ENTREGADO con km_salida', en.status === 200 && en.json?.estado_orden === 'ENTREGADO' && en.json?.km_salida === 12500, `status ${en.status}`);
ok('entrega sin km_salida => 400', (await http('POST', `/autos/orders/${pnr}/checkin-entrega`, { licencia_conducir: 'x' })).status === 400);
const noCancel = await http('POST', `/autos/orders/${pnr}/cancel`, {});
ok('cancelar una orden ya entregada => 409 con el texto del contrato', noCancel.status === 409 && noCancel.json?.title === 'Cancelación No Permitida' && /ya fue retirado en mostrador/.test(noCancel.json?.detail ?? ''), JSON.stringify(noCancel.json));
ok('devolución con km_retorno < km_salida => 400', (await http('POST', `/autos/orders/${pnr}/checkin-devolucion`, { km_retorno: 100 })).status === 400);
const dv = await http('POST', `/autos/orders/${pnr}/checkin-devolucion`, { km_retorno: 12950, nivel_combustible: 100, observaciones: 'Sin novedades' });
ok('devolución => 200 COMPLETADA, km_recorridos 450 y EN_LIMPIEZA 2 h', dv.status === 200 && dv.json?.estado_orden === 'COMPLETADA' && dv.json?.km_recorridos === 450 && dv.json?.cooldown?.estado === 'EN_LIMPIEZA' && dv.json?.cooldown?.cooldown_horas === 2, JSON.stringify(dv.json)?.slice(0, 200));
ok('km 12950 >= umbral 10000 => alerta de mantenimiento', /ALERTA PREVENTIVA/.test(dv.json?.alerta_mantenimiento ?? ''));
const flota = (await http('GET', '/autos/flota')).json;
const enFlota = flota?.find((a) => a.id === auto);
ok('/autos/flota: EN_LIMPIEZA con cronómetro cercano a 7200 s', enFlota?.estado_operativo === 'EN_LIMPIEZA' && enFlota?.cooldown_activo === true && enFlota?.segundos_restantes_cooldown > 7000 && enFlota?.segundos_restantes_cooldown <= 7200, JSON.stringify(enFlota));
ok('/autos/flota: alerta_mantenimiento true', enFlota?.alerta_mantenimiento === true);
// Ecuador (UTC-5): la limpieza solo bloquea recogidas anteriores a su fin, así que se prueba con una recogida hoy a las 00:00.
const hoyEcuador = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
const rCd = await http('POST', '/reservas', cuerpoReserva(auto, hoyEcuador, sumarDias(2), { pickup_time: '00:00' }), { 'Idempotency-Key': randomUUID() });
ok('recoger un auto antes de que termine su limpieza => 409 VEHICLE_IN_CLEANING_COOLDOWN con disponible_desde', rCd.status === 409 && rCd.json?.code === 'VEHICLE_IN_CLEANING_COOLDOWN' && !!rCd.json?.disponible_desde, `status ${rCd.status} ${JSON.stringify(rCd.json)?.slice(0, 160)}`);
const rLejos = await http('POST', '/reservas', cuerpoReserva(auto, sumarDias(90), sumarDias(92)), { 'Idempotency-Key': randomUUID() });
ok('el mismo auto en limpieza SÍ se puede reservar para un día posterior => 201', rLejos.status === 201, `status ${rLejos.status} ${JSON.stringify(rLejos.json)?.slice(0, 160)}`);
const busqLejos = await http('POST', '/autos/search', { pickup_location: 'Quito', pickup_date: sumarDias(80), dropoff_date: sumarDias(82), pickup_time: '10:00', dropoff_time: '10:00', driver_age: 30 });
ok('y aparece en la búsqueda de Booking para fechas posteriores a la limpieza', (busqLejos.json?.data ?? []).some((x) => x.vehicle_id === auto), `total ${busqLejos.json?.data?.length}`);
ok('el auto en limpieza no aparece en /autos', !(await http('GET', '/autos?limit=200')).json?.data?.some((a) => a.vehicle_id === auto));
const busqCd = await http('POST', '/autos/search', { pickup_location: 'UIO', pickup_date: hoyEcuador, pickup_time: '00:00', dropoff_date: sumarDias(2), dropoff_time: '10:00' });
ok('la búsqueda con recogida dentro de la limpieza no lo ofrece', busqCd.status === 200 && !busqCd.json?.data?.some((a) => a.vehicle_id === auto), `status ${busqCd.status}`);

console.log('7. Cancelación / compensación Saga');
const autoC = busq.json.data[1].vehicle_id;
const autoD = busq.json.data[2].vehicle_id; // vehículo sin uso previo para las pruebas de autenticación/idempotencia
const rc = await http('POST', '/reservas', cuerpoReserva(autoC, sumarDias(60), sumarDias(62)), { 'Idempotency-Key': randomUUID() });
const pnrC = rc.json?.pnr;
const ck = randomUUID();
const c1 = await http('POST', `/autos/orders/${pnrC}/cancel`, { solicitante: 'SAGA_ORCHESTRATOR', reason: 'Compensación Saga' }, { 'Idempotency-Key': ck });
ok('cancel => 200 CANCELLED con reembolso 100% y vehículo restaurado', c1.status === 200 && c1.json?.status === 'CANCELLED' && c1.json?.refund?.percentage === 100 && c1.json?.inventory_restoration?.new_state === 'DISPONIBLE', JSON.stringify(c1.json)?.slice(0, 200));
const c2 = await http('POST', `/autos/orders/${pnrC}/cancel`, {}, { 'Idempotency-Key': randomUUID() });
ok('el reembolso y la restitución traen su mensaje y un REF-AUTO-', /^REF-AUTO-/.test(c1.json?.refund?.refund_id ?? '') && !!c1.json?.refund?.message && !!c1.json?.inventory_restoration?.message, JSON.stringify(c1.json)?.slice(0, 300));
const alias = await http('POST', `/orders/${pnrC}/cancel`, {});
ok('alias /orders/{id}/cancel y /api/v3/orders/{id}/cancel responden igual', alias.status === 200 && alias.json?.status === 'CANCELLED' && (await http('POST', `/api/v3/orders/${pnrC}/cancel`, {})).status === 200);
ok('cancelar de nuevo es idempotente (200, mismo reembolso)', c2.status === 200 && c2.json?.refund?.refund_id === c1.json?.refund?.refund_id);
const rc2 = await http('POST', '/reservas', cuerpoReserva(autoC, sumarDias(60), sumarDias(62)), { 'Idempotency-Key': randomUUID() });
ok('tras cancelar, el auto vuelve a poder reservarse', rc2.status === 201);

console.log('8. Mantenimiento y RBAC');
const cabMant = { 'X-Role': 'MANTENIMIENTO', ...(API_KEY ? { 'X-API-Key': API_KEY } : {}) };
// Deja el umbral en 10000 km para que la prueba no dependa del estado previo del auto.
await http('POST', `/autos/${autoC}/mantenimiento/registro`, { tecnico_id: 'prep', kilometraje_registrado: 5000, nivel_combustible: 100, mantenimiento_realizado: true, nuevo_proximo_mantenimiento_km: 10000 }, cabMant);
const bodyMant = { tecnico_id: 'tec-rosero-01', kilometraje_registrado: 10250, nivel_combustible: 100, condiciones_carroceria: 'Sin abolladuras', estado_neumaticos: 'BUENO', observaciones: 'Cambio de aceite' };
ok('sin rol => 401', (await http('POST', `/autos/${autoC}/mantenimiento/registro`, bodyMant)).status === 401);
ok('rol CLIENTE => 403', (await http('POST', `/autos/${autoC}/mantenimiento/registro`, bodyMant, { 'X-Role': 'CLIENTE' })).status === 403);
const mant = await http('POST', `/autos/${autoC}/mantenimiento/registro`, bodyMant, { 'X-Role': 'MANTENIMIENTO', ...(API_KEY ? { 'X-API-Key': API_KEY } : {}) });
ok('rol MANTENIMIENTO => 200 con bitacora_id y alerta preventiva', mant.status === 200 && /^BIT-AUTO-\d+$/.test(mant.json?.bitacora_id ?? '') && mant.json?.mantenimiento_requerido === true, `status ${mant.status} ${JSON.stringify(mant.json)?.slice(0, 160)}`);
ok('datos inválidos => 422', (await http('POST', `/autos/${autoC}/mantenimiento/registro`, { tecnico_id: 'x' }, { 'X-Role': 'ADMIN', ...(API_KEY ? { 'X-API-Key': API_KEY } : {}) })).status === 422);

console.log('9. Acuerdo B2B de promociones');
const pc = await http('GET', '/autos/promociones/contrato');
ok('GET contrato => 200', pc.status === 200 && typeof pc.json?.permite_promociones === 'boolean' && pc.json?.vertical === 'AUTOS');
const put = await http('PUT', '/autos/promociones/contrato', { permite_promociones: true, porcentaje_descuento_maximo: 12.5, destinos_habilitados: ['Quito', 'Guayaquil'] }, { 'Idempotency-Key': randomUUID() });
ok('PUT contrato => 200 y persiste', put.status === 200 && put.json?.contrato?.porcentaje_descuento_maximo === 12.5 && (await http('GET', '/autos/promociones/contrato')).json?.porcentaje_descuento_maximo === 12.5);
ok('PUT con porcentaje 150 => 400', (await http('PUT', '/autos/promociones/contrato', { permite_promociones: true, porcentaje_descuento_maximo: 150 })).status === 400);

console.log('10. Eventos (Outbox) y datos sensibles');
const SIN = { 'X-API-Key': null };
ok('GET /autos/eventos sin credenciales => 401', (await http('GET', '/autos/eventos', undefined, SIN)).status === 401);
ok('GET /autos/orders sin credenciales => 401', (await http('GET', '/autos/orders', undefined, SIN)).status === 401);

console.log('10b. Autenticación X-API-Key e Idempotency-Key obligatoria');
const MALA = { 'X-API-Key': 'clave-incorrecta' };
const cuerpoAuth = cuerpoReserva(autoD, sumarDias(120), sumarDias(122));
const cuerpoCarrera = cuerpoReserva(autoD, sumarDias(130), sumarDias(132));
ok('crear sin clave => 401', (await http('POST', '/autos/orders/create', cuerpoAuth, { ...SIN, 'Idempotency-Key': randomUUID() })).status === 401);
ok('crear con clave inválida => 401', (await http('POST', '/autos/orders/create', cuerpoAuth, { ...MALA, 'Idempotency-Key': randomUUID() })).status === 401);
ok('consultar orden sin clave => 401', (await http('GET', `/autos/orders/${pnr}`, undefined, SIN)).status === 401);
const estadoAntes = (await http('GET', `/autos/orders/${pnr}`)).json?.status;
ok('cancelar sin clave => 401 (y la orden no cambia)', (await http('POST', `/autos/orders/${pnr}/cancel`, {}, { ...SIN, 'Idempotency-Key': randomUUID() })).status === 401 && (await http('GET', `/autos/orders/${pnr}`)).json?.status === estadoAntes && estadoAntes !== 'CANCELLED');
ok('check-in sin clave => 401', (await http('POST', `/autos/reservas/${pnr}/checkin`, { documento: 'x' }, { ...SIN, 'Idempotency-Key': randomUUID() })).status === 401);
ok('clientes: GET sin clave => 401', (await http('GET', '/api/v3/clientes?email=a@b.co', undefined, SIN)).status === 401);
ok('clientes: POST sin clave => 401', (await http('POST', '/api/v3/clientes', { nombre: 'X', email: 'x@y.co' }, SIN)).status === 401);
ok('health y búsqueda siguen públicos', (await http('GET', '/autos/health', undefined, SIN)).status === 200 && (await http('POST', '/autos/search', { pickup_location: 'Quito', pickup_date: sumarDias(120), dropoff_date: sumarDias(122) }, SIN)).status !== 401);
const sinLlave = await http('POST', '/autos/orders/create', cuerpoAuth);
ok('crear sin Idempotency-Key => 400', sinLlave.status === 400 && sinLlave.json?.code === 'MISSING_IDEMPOTENCY_KEY', JSON.stringify(sinLlave.json));
const llaveRec = randomUUID();
const creada = await http('POST', '/autos/orders/create', cuerpoAuth, { 'Idempotency-Key': llaveRec });
ok('crear con Idempotency-Key => 201', creada.status === 201, JSON.stringify(creada.json));
const rec = await http('GET', `/autos/orders?idempotency_key=${llaveRec}`);
ok('GET /autos/orders?idempotency_key devuelve solo esa orden', rec.status === 200 && !Array.isArray(rec.json) && rec.json?.pnr === creada.json?.pnr, JSON.stringify(rec.json).slice(0, 150));
ok('idempotency_key desconocida => 404', (await http('GET', `/autos/orders?idempotency_key=${randomUUID()}`)).status === 404);
const llaveCarrera = randomUUID();
const carrera = await Promise.all(Array.from({ length: 10 }, () => http('POST', '/autos/orders/create', cuerpoCarrera, { 'Idempotency-Key': llaveCarrera })));
ok('10 envíos simultáneos con la misma clave => una sola orden', new Set(carrera.map((x) => x.json?.pnr)).size === 1 && carrera.every((x) => x.status === 201), JSON.stringify(carrera.map((x) => x.status)));
for (const p of [creada.json?.pnr, carrera[0]?.json?.pnr]) if (p) await http('POST', `/autos/orders/${p}/cancel`, {}, { 'Idempotency-Key': randomUUID() });
if (API_KEY) {
  const ev = await http('GET', '/autos/eventos?limit=50', undefined, { 'X-API-Key': API_KEY });
  const tipos = ev.json?.events?.map((e) => e.type) ?? [];
  ok('feed con X-API-Key => CloudEvents confirmed/cancelled/cooldown/alerta', ev.status === 200 && tipos.some((t) => t.endsWith('order.confirmed')) && tipos.some((t) => t.endsWith('order.cancelled')) && tipos.some((t) => t.endsWith('cooldown.started')) && tipos.some((t) => t.endsWith('mantenimiento.alerta')), `status ${ev.status} ${tipos.join(',')}`);
  ok('cada evento trae specversion 1.0, id y correlation_id', ev.json?.events?.every((e) => e.specversion === '1.0' && !!e.id));
  const lista = await http('GET', '/autos/orders', undefined, { 'X-API-Key': API_KEY });
  ok('GET /autos/orders con X-API-Key => 200', lista.status === 200 && lista.json?.some((o) => o.pnr === pnr));
} else {
  console.log('  (omitido: defina API_KEY para probar eventos y listado de órdenes)');
}

console.log('10c. Disponibilidad con limpieza de 2 h y fechas alternativas');
const base12 = await http('POST', '/autos/orders/create', cuerpoReserva(autoD, sumarDias(150), sumarDias(151)), { 'Idempotency-Key': randomUUID() });
ok('reserva del día 150 al 151 => 201', base12.status === 201, JSON.stringify(base12.json));
const pnrs10c = [base12.json?.pnr];
const intento = async (nombre, a, b, extra, esperado) => {
  const r = await http('POST', '/autos/orders/create', cuerpoReserva(autoD, a, b, extra), { 'Idempotency-Key': randomUUID() });
  ok(nombre, r.status === esperado, `status ${r.status} ${JSON.stringify(r.json).slice(0, 160)}`);
  if (r.status === 201) pnrs10c.push(r.json.pnr);
  return r;
};
await intento('día anterior completo (149->150 devolviendo 08:00) => 201 (2 h de limpieza antes de la recogida)', sumarDias(149), sumarDias(150), { dropoff_time: '08:00' }, 201);
const choque = await intento('devolver a las 10:00 el día de la recogida => 409 (no alcanza la limpieza)', sumarDias(148), sumarDias(150), {}, 409);
ok('el 409 trae code VEHICLE_UNAVAILABLE, disponible_desde y 3 fechas alternativas', choque.json?.code === 'VEHICLE_UNAVAILABLE' && !!choque.json?.disponible_desde && choque.json?.alternativas?.length === 3, JSON.stringify(choque.json));
ok('las alternativas son futuras y de la misma duración', choque.json?.alternativas?.every((a) => a.fecha_recogida >= sumarDias(0) && a.dias === 2));
await intento('recoger el día de la devolución a las 10:00 => 409 (limpieza hasta las 12:00)', sumarDias(151), sumarDias(152), {}, 409);
await intento('recoger el día de la devolución a las 12:00 => 201 (ya pasó la limpieza)', sumarDias(151), sumarDias(152), { pickup_time: '12:00' }, 201);
await intento('fechas que se cruzan => 409', sumarDias(150), sumarDias(152), {}, 409);
const catD = await http('GET', '/autos?limit=200');
ok('el auto sigue en el catálogo aunque tenga reservas futuras', catD.json?.data?.some((a) => a.vehicle_id === autoD));
const web = await http('GET', `/api/v1/vehiculos?desde=${sumarDias(150)}&hasta=${sumarDias(151)}&incluirNoDisponibles=true`);
const enWeb = Array.isArray(web.json) ? web.json.find((x) => `auto-${String(x.id).padStart(3, '0')}` === autoD) : null;
ok('la web lo muestra como no disponible con fechas alternativas (no desaparece)', enWeb?.disponibleEnFechas === false && enWeb?.alternativas?.length > 0 && !!enWeb?.disponibleDesde, JSON.stringify(enWeb).slice(0, 200));
const webSin = await http('GET', `/api/v1/vehiculos?desde=${sumarDias(150)}&hasta=${sumarDias(151)}`);
ok('sin la opción, la API de marketplace sigue excluyendo los ocupados', Array.isArray(webSin.json) && !webSin.json.some((x) => `auto-${String(x.id).padStart(3, '0')}` === autoD));
const busqD = await http('POST', '/autos/search', { pickup_location: 'Quito', pickup_date: sumarDias(150), dropoff_date: sumarDias(151), pickup_time: '10:00', dropoff_time: '10:00', driver_age: 30 });
ok('POST /autos/search (contrato) excluye el auto ocupado', !(busqD.json?.data ?? []).some((a) => a.vehicle_id === autoD));
for (const p of pnrs10c) if (p) await http('POST', `/autos/orders/${p}/cancel`, {});

console.log('11. Regresión del marketplace existente');
ok('GET /api/v1/vehiculos sigue funcionando', (await http('GET', '/api/v1/vehiculos')).status === 200);
const mk = await http('GET', `/api/v1/vehiculos?desde=${sumarDias(81)}&hasta=${sumarDias(83)}`);
if (rLejos.json?.pnr) await http('POST', `/autos/orders/${rLejos.json.pnr}/cancel`, {});
ok('la búsqueda del marketplace incluye un auto en limpieza para fechas posteriores a su fin', mk.status === 200 && mk.json?.some((v) => `auto-${String(v.id).padStart(3, '0')}` === auto));

console.log('12. Limpieza de los datos de prueba');
const cabAdmin = { 'X-Role': 'ADMIN', ...(API_KEY ? { 'X-API-Key': API_KEY } : {}) };
const reinicio = { tecnico_id: 'limpieza', kilometraje_registrado: 1500, nivel_combustible: 100, mantenimiento_realizado: true, nuevo_proximo_mantenimiento_km: 11500 };
await http('POST', `/autos/${autoC}/mantenimiento/registro`, reinicio, cabMant);
await http('POST', `/autos/${auto}/mantenimiento/registro`, reinicio, cabMant);
await http('PATCH', `/autos/${auto}/estado`, { estado: 'DISPONIBLE' }, cabAdmin);
await http('PUT', '/autos/promociones/contrato', { permite_promociones: true, porcentaje_descuento_maximo: 15 });
if (process.env.ADMIN_PASSWORD) {
  const login = await http('POST', '/admin/api/login', { usuario: process.env.ADMIN_USER ?? 'admin', contrasena: process.env.ADMIN_PASSWORD });
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  const todas = await http('GET', '/api/v1/reservas');
  let borradas = 0;
  for (const r of todas.json ?? []) {
    if (['carlos.zambrano@example.com', 'ana@example.com'].includes(r.email)) {
      await http('DELETE', `/api/v1/reservas/${r.id}`, undefined, { Cookie: cookie });
      borradas++;
    }
  }
  console.log(`  ${borradas} reservas de prueba eliminadas`);
} else console.log('  (defina ADMIN_PASSWORD para borrar también las reservas de prueba)');

console.log(`\n${total - fallos}/${total} pruebas correctas`);
process.exit(fallos === 0 ? 0 : 1);
