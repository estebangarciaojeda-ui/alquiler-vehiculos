import { describe, expect, it } from 'vitest';
import {
  bloqueadoOperativamente,
  calcularTarifa,
  categoriaContrato,
  categoriasInternas,
  claveModelo,
  COOLDOWN_MINUTOS,
  esFechaValida,
  estadoEfectivo,
  fechaYSlotLocal,
  generarPnr,
  idPublico,
  normalizarSolicitudBusqueda,
  normalizarSolicitudReserva,
  parsearIdPublico,
  resolverSucursales,
  segundosRestantesCooldown,
  slotDeHora,
  slotId,
} from './booking.util.js';

const HOY = '2026-11-01';
const conductor = { full_name: 'Carlos Zambrano', email: 'Carlos@Example.com', phone: '+593987654321', license_number: '1710034065', age: 28 };
const base = { vehicle_id: 'auto-007', pickup_date: '2026-11-15', dropoff_date: '2026-11-18', driver: conductor };

describe('identificadores y slots', () => {
  it('convierte ids públicos en ambos sentidos', () => {
    expect(idPublico(7)).toBe('auto-007');
    expect(parsearIdPublico('auto-007')).toBe(7);
    expect(parsearIdPublico('7')).toBe(7);
    expect(parsearIdPublico(12)).toBe(12);
    expect(parsearIdPublico('auto-spark-01')).toBeNull();
    expect(parsearIdPublico('auto-000')).toBeNull();
  });

  it('el PNR tiene 8 caracteres y empieza con CAR', () => {
    expect(generarPnr()).toMatch(/^CAR[A-Z2-9]{5}$/);
  });

  it('construye el slot_id canónico slot-YYYYMMDD-HHMM con franjas de 30 minutos', () => {
    expect(slotDeHora('10:17')).toBe('10:00');
    expect(slotDeHora('10:45')).toBe('10:30');
    expect(slotId('2026-11-15', '10:00')).toBe('slot-20261115-1000');
    expect(fechaYSlotLocal(new Date('2026-11-15T15:20:00Z'))).toEqual({ fecha: '2026-11-15', slot: '10:00' });
  });

  it('valida fechas reales', () => {
    expect(esFechaValida('2026-02-29')).toBe(false);
    expect(esFechaValida('2026-11-15')).toBe(true);
  });

  it('mapea categorías del catálogo al contrato', () => {
    expect(categoriaContrato('LUJO')).toBe('PREMIUM');
    expect(categoriaContrato('CAMIONETA')).toBe('SUV');
    expect(categoriasInternas('COMPACTO')).toEqual(['COMPACTO', 'INTERMEDIO']);
  });

  it('usa el mismo slug de foto que el sitio público', () => {
    expect(claveModelo('Toyota', 'Land Cruiser Prado')).toBe('toyota-land-cruiser-prado');
  });
});

describe('máquina de estados y cooldown de 2 horas', () => {
  const ahora = new Date('2026-11-15T15:00:00Z');
  const libre = { estadoOperativo: 'DISPONIBLE', disponibleDesde: null };

  it('el cooldown dura 120 minutos', () => {
    expect(COOLDOWN_MINUTOS).toBe(120);
  });

  it('EN_LIMPIEZA con tiempo pendiente bloquea y cuenta los segundos restantes', () => {
    const v = { estadoOperativo: 'EN_LIMPIEZA', disponibleDesde: new Date(ahora.getTime() + 90 * 60_000) };
    expect(bloqueadoOperativamente(v, ahora)).toBe(true);
    expect(segundosRestantesCooldown(v, ahora)).toBe(5400);
    expect(estadoEfectivo(v, [], ahora)).toBe('EN_LIMPIEZA');
  });

  it('terminado el cooldown el auto vuelve a estar disponible sin intervención', () => {
    const v = { estadoOperativo: 'EN_LIMPIEZA', disponibleDesde: new Date(ahora.getTime() - 1000) };
    expect(bloqueadoOperativamente(v, ahora)).toBe(false);
    expect(estadoEfectivo(v, [], ahora)).toBe('DISPONIBLE');
  });

  it('EN_MANTENIMIENTO siempre bloquea', () => {
    expect(estadoEfectivo({ estadoOperativo: 'EN_MANTENIMIENTO', disponibleDesde: null }, [], ahora)).toBe('EN_MANTENIMIENTO');
  });

  it('deriva RESERVADO, LISTO_PARA_ENTREGAR y ENTREGADO desde las reservas', () => {
    const r = { estado: 'CONFIRMADA', fechaRecogida: '2026-11-15', fechaDevolucion: '2026-11-18', checkinEn: null, entregadaEn: null, devueltaEn: null };
    expect(estadoEfectivo(libre, [r], ahora)).toBe('RESERVADO');
    expect(estadoEfectivo(libre, [{ ...r, checkinEn: ahora }], ahora)).toBe('LISTO_PARA_ENTREGAR');
    expect(estadoEfectivo(libre, [{ ...r, entregadaEn: ahora }], ahora)).toBe('ENTREGADO');
    expect(estadoEfectivo(libre, [{ ...r, estado: 'CANCELADA' }], ahora)).toBe('DISPONIBLE');
    expect(estadoEfectivo(libre, [{ ...r, fechaRecogida: '2026-12-01', fechaDevolucion: '2026-12-03' }], ahora)).toBe('DISPONIBLE');
  });
});

describe('tarifas', () => {
  it('cobertura básica sin recargo para 30 años', () => {
    expect(calcularTarifa(35, 3, 'BASICA', 30)).toEqual({ days: 3, base: 105, coverage: 0, surcharge: 0, total: 105 });
  });

  it('cobertura total suma el costo diario', () => {
    expect(calcularTarifa(35.5, 3, 'TOTAL', 30).total).toBe(160.5);
  });

  it('aplica recargo a menores de 25 y mayores de 70', () => {
    expect(calcularTarifa(100, 2, 'BASICA', 22).surcharge).toBe(20);
    expect(calcularTarifa(100, 2, 'BASICA', 72).surcharge).toBe(20);
    expect(calcularTarifa(100, 2, 'BASICA', 25).surcharge).toBe(0);
  });
});

describe('resolverSucursales', () => {
  const s = [
    { id: 1, nombre: 'Aeropuerto Mariscal Sucre', ciudad: 'Quito', esAeropuerto: true },
    { id: 2, nombre: 'Quito La Carolina', ciudad: 'Quito', esAeropuerto: false },
    { id: 3, nombre: 'Guayaquil Centro', ciudad: 'Guayaquil', esAeropuerto: false },
    { id: 4, nombre: 'Aeropuerto José Joaquín de Olmedo', ciudad: 'Guayaquil', esAeropuerto: true },
  ];

  it('reconoce el texto del contrato por nombre de sucursal', () => {
    expect(resolverSucursales('Aeropuerto Mariscal Sucre (UIO), Quito', s)).toEqual([1]);
  });
  it('reconoce códigos IATA y ciudades', () => {
    expect(resolverSucursales('GYE', s)).toEqual([4]);
    expect(resolverSucursales('Quito', s)).toEqual([1, 2]);
  });
  it('devuelve null si no reconoce el lugar', () => {
    expect(resolverSucursales('Marte', s)).toBeNull();
    expect(resolverSucursales(undefined, s)).toBeNull();
  });
});

describe('normalizarSolicitudReserva', () => {
  it('acepta el payload canónico en inglés', () => {
    const r = normalizarSolicitudReserva({ ...base, coverage_type: 'BASIC', pickup_time: '10:00' }, HOY);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valor.vehiculoId).toBe(7);
      expect(r.valor.cobertura).toBe('BASICA');
      expect(r.valor.conductor.email).toBe('carlos@example.com');
    }
  });

  it('tolera los alias en español (Ley de Postel)', () => {
    const r = normalizarSolicitudReserva(
      {
        auto_id: 'auto-003',
        fecha_recogida: '2026-11-15',
        fecha_devolucion: '2026-11-17',
        cobertura: 'TOTAL',
        conductor: { nombre: 'Ana', correo: 'ana@x.com', telefono: '099', licencia_conducir: 'L1', edad: 30 },
      },
      HOY,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.cobertura).toBe('TOTAL');
  });

  it('menor de 18 años => DRIVER_UNDERAGE', () => {
    const r = normalizarSolicitudReserva({ ...base, driver: { ...conductor, age: 17 } }, HOY);
    expect(r).toMatchObject({ ok: false, codigo: 'DRIVER_UNDERAGE' });
  });

  it('fechas en el pasado o invertidas => INVALID_DATES', () => {
    expect(normalizarSolicitudReserva({ ...base, pickup_date: '2026-10-01' }, HOY)).toMatchObject({ ok: false, codigo: 'INVALID_DATES' });
    expect(normalizarSolicitudReserva({ ...base, dropoff_date: '2026-11-15' }, HOY)).toMatchObject({ ok: false, codigo: 'INVALID_DATES' });
  });

  it('faltan campos o el cuerpo no es un objeto => INVALID_PAYLOAD', () => {
    expect(normalizarSolicitudReserva({ ...base, driver: undefined }, HOY)).toMatchObject({ ok: false, codigo: 'INVALID_PAYLOAD' });
    expect(normalizarSolicitudReserva({ ...base, vehicle_id: 'otro-01' }, HOY)).toMatchObject({ ok: false, codigo: 'INVALID_PAYLOAD' });
    expect(normalizarSolicitudReserva(null, HOY)).toMatchObject({ ok: false, codigo: 'INVALID_PAYLOAD' });
  });
});

describe('normalizarSolicitudBusqueda', () => {
  const ok = { pickup_location: 'UIO', pickup_date: '2026-11-15', pickup_time: '10:00', dropoff_date: '2026-11-18', dropoff_time: '10:00' };

  it('usa 30 años y ALL por defecto', () => {
    const r = normalizarSolicitudBusqueda(ok, HOY);
    expect(r.ok && r.valor.edad).toBe(30);
    expect(r.ok && r.valor.categoria).toBe('ALL');
  });
  it('rechaza menores de 18 con DRIVER_UNDERAGE', () => {
    expect(normalizarSolicitudBusqueda({ ...ok, driver_age: 16 }, HOY)).toMatchObject({ ok: false, codigo: 'DRIVER_UNDERAGE' });
  });
  it('exige los campos obligatorios', () => {
    expect(normalizarSolicitudBusqueda({ pickup_date: '2026-11-15' }, HOY)).toMatchObject({ ok: false, codigo: 'INVALID_PAYLOAD' });
  });
});
