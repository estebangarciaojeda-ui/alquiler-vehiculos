import { describe, expect, it } from 'vitest';
import { alternativas, disponibleDesde, hayConflicto, minutosParaRecogida, ocupaciones, ventanaLimpieza, ventanasDeReservas, type Ventana } from './disponibilidad.util.js';

const v = (r: string, d: string, hr = '10:00', hd = '10:00'): Ventana => ({ fechaRecogida: r, horaRecogida: hr, fechaDevolucion: d, horaDevolucion: hd });
const reservado = [v('2026-12-12', '2026-12-13')];

describe('disponibilidad con limpieza de 2 h', () => {
  it('fechas que se cruzan chocan', () => {
    expect(hayConflicto(reservado, v('2026-12-12', '2026-12-14'))).toBe(true);
    expect(hayConflicto(reservado, v('2026-12-11', '2026-12-13'))).toBe(true);
  });

  it('con días de margen no chocan (el auto sigue reservable antes y después)', () => {
    expect(hayConflicto(reservado, v('2026-12-10', '2026-12-11'))).toBe(false);
    expect(hayConflicto(reservado, v('2026-12-14', '2026-12-15'))).toBe(false);
  });

  it('el mismo día exige las 2 h de limpieza entre devolución y recogida', () => {
    // existente devuelve el 13 a las 10:00; limpieza hasta las 12:00
    expect(hayConflicto(reservado, v('2026-12-13', '2026-12-14', '10:00', '10:00'))).toBe(true);
    expect(hayConflicto(reservado, v('2026-12-13', '2026-12-14', '11:59', '10:00'))).toBe(true);
    expect(hayConflicto(reservado, v('2026-12-13', '2026-12-14', '12:00', '10:00'))).toBe(false);
    // y antes: el nuevo alquiler debe devolver 2 h antes de la recogida existente (12 a las 10:00)
    expect(hayConflicto(reservado, v('2026-12-11', '2026-12-12', '10:00', '08:00'))).toBe(false);
    expect(hayConflicto(reservado, v('2026-12-11', '2026-12-12', '10:00', '08:01'))).toBe(true);
  });

  it('indica cuándo vuelve a estar libre (fin del alquiler + limpieza)', () => {
    expect(disponibleDesde(reservado, v('2026-12-12', '2026-12-14'))).toBe('2026-12-13T12:00');
    expect(disponibleDesde(reservado, v('2026-12-20', '2026-12-21'))).toBeNull();
  });

  it('propone fechas alternativas libres, la misma duración y sin pasado', () => {
    const alt = alternativas(reservado, v('2026-12-12', '2026-12-13'), '2026-12-01');
    expect(alt).toHaveLength(3);
    expect(alt.every((a) => a.dias === 1)).toBe(true);
    for (const a of alt) {
      expect(hayConflicto(reservado, v(a.fecha_recogida, a.fecha_devolucion, a.hora_recogida, a.hora_devolucion))).toBe(false);
    }
    expect(alt[0].fecha_recogida).toBe('2026-12-14');
    const sinPasado = alternativas(reservado, v('2026-12-12', '2026-12-13'), '2026-12-12');
    expect(sinPasado.every((a) => a.fecha_recogida >= '2026-12-12')).toBe(true);
  });

  it('encadena varios alquileres: salta los huecos ocupados', () => {
    const lleno = [v('2026-12-12', '2026-12-13'), v('2026-12-14', '2026-12-15'), v('2026-12-10', '2026-12-11')];
    const alt = alternativas(lleno, v('2026-12-12', '2026-12-13'), '2026-12-01');
    for (const a of alt) {
      expect(hayConflicto(lleno, v(a.fecha_recogida, a.fecha_devolucion, a.hora_recogida, a.hora_devolucion))).toBe(false);
    }
  });
});

describe('limpieza de 2 h tras una devolución: solo bloquea antes de su fin', () => {
  // Devolución a las 10:00 de Ecuador (15:00Z) => EN_LIMPIEZA hasta las 12:00 (17:00Z).
  const enLimpieza = { estadoOperativo: 'EN_LIMPIEZA', disponibleDesde: new Date('2026-11-12T17:00:00Z') };
  const ahora = new Date('2026-11-12T15:30:00Z'); // 10:30 hora local

  it('modela la limpieza como una ocupación que termina en la devolución real', () => {
    expect(ventanaLimpieza(enLimpieza, ahora)).toMatchObject({ fechaDevolucion: '2026-11-12', horaDevolucion: '10:00' });
  });

  it('sin limpieza activa (otro estado o ya terminó) no ocupa nada', () => {
    expect(ventanaLimpieza({ estadoOperativo: 'DISPONIBLE', disponibleDesde: null }, ahora)).toBeNull();
    expect(ventanaLimpieza(enLimpieza, new Date('2026-11-12T17:00:01Z'))).toBeNull();
    expect(ocupaciones({ estadoOperativo: 'DISPONIBLE', disponibleDesde: null }, [], ahora)).toEqual([]);
  });

  it('recoger antes del fin de la limpieza choca; a la hora exacta o después no', () => {
    const ocupado = ocupaciones(enLimpieza, [], ahora);
    expect(hayConflicto(ocupado, v('2026-11-12', '2026-11-14', '11:00', '10:00'))).toBe(true);
    expect(hayConflicto(ocupado, v('2026-11-12', '2026-11-14', '11:59', '10:00'))).toBe(true);
    expect(hayConflicto(ocupado, v('2026-11-12', '2026-11-14', '12:00', '10:00'))).toBe(false);
  });

  it('una reserva para el día siguiente sí se puede hacer durante la limpieza', () => {
    const ocupado = ocupaciones(enLimpieza, [], ahora);
    expect(hayConflicto(ocupado, v('2026-11-13', '2026-11-15', '10:00', '10:00'))).toBe(false);
    expect(hayConflicto(ocupado, v('2026-12-20', '2026-12-22'))).toBe(false);
  });

  it('informa cuándo queda libre y propone el día siguiente como alternativa', () => {
    const ocupado = ocupaciones(enLimpieza, [], ahora);
    const pedida = v('2026-11-12', '2026-11-14', '11:00', '10:00');
    expect(disponibleDesde(ocupado, pedida)).toBe('2026-11-12T12:00');
    const alt = alternativas(ocupado, pedida, '2026-11-12');
    expect(alt[0].fecha_recogida).toBe('2026-11-13');
  });

  it('combina limpieza y reservas futuras', () => {
    const ocupado = ocupaciones(enLimpieza, [v('2026-11-13', '2026-11-14')], ahora);
    expect(hayConflicto(ocupado, v('2026-11-13', '2026-11-14'))).toBe(true);
    expect(hayConflicto(ocupado, v('2026-11-15', '2026-11-16'))).toBe(false);
  });
});

describe('plazo de cancelación de 24 h', () => {
  // Hoy 12/11 10:00 hora de Ecuador = 15:00Z.
  const ahora = new Date('2026-11-12T15:00:00Z');

  it('calcula los minutos que faltan para la recogida en hora de Ecuador', () => {
    expect(minutosParaRecogida('2026-11-13', '10:00', ahora)).toBe(24 * 60);
    expect(minutosParaRecogida('2026-11-12', '12:30', ahora)).toBe(150);
    expect(minutosParaRecogida('2026-11-12', '09:00', ahora)).toBe(-60);
  });

  it('con 24 h justas se permite; con un minuto menos no', () => {
    expect(minutosParaRecogida('2026-11-13', '10:00', ahora) >= 24 * 60).toBe(true);
    expect(minutosParaRecogida('2026-11-13', '09:59', ahora) >= 24 * 60).toBe(false);
  });
});

describe('reserva entregada y sin devolver: ocupa el auto desde su recogida, sin fin', () => {
  const libre = { estadoOperativo: 'DISPONIBLE', disponibleDesde: null };
  // Reserva del 28 al 29, con las llaves ya entregadas y sin devolución registrada.
  const entregada: Ventana = { ...v('2026-11-28', '2026-11-29'), entregadaEn: new Date('2026-11-13T15:00:00Z'), devueltaEn: null };
  const ocupado = ocupaciones(libre, [entregada]);

  it('las fechas anteriores a la recogida siguen libres', () => {
    expect(hayConflicto(ocupado, v('2026-11-15', '2026-11-17'))).toBe(false);
    expect(hayConflicto(ocupado, v('2026-11-26', '2026-11-27'))).toBe(false);
  });

  it('desde la recogida en adelante no se ofrece hasta que se registre la devolución', () => {
    expect(hayConflicto(ocupado, v('2026-11-28', '2026-11-29'))).toBe(true);
    expect(hayConflicto(ocupado, v('2026-11-30', '2026-12-02'))).toBe(true);
    expect(hayConflicto(ocupado, v('2027-03-01', '2027-03-03'))).toBe(true);
  });

  it('no informa fecha de liberación (se sabrá al devolver) y sus alternativas son solo anteriores', () => {
    expect(disponibleDesde(ocupado, v('2026-12-05', '2026-12-07'))).toBeNull();
    const alt = alternativas(ocupado, v('2026-12-05', '2026-12-07'), '2026-11-13');
    expect(alt.length).toBeGreaterThan(0);
    expect(alt.every((a) => a.fecha_devolucion <= '2026-11-28')).toBe(true);
  });

  it('una reserva sin entregar, o ya devuelta, conserva su ventana normal', () => {
    expect(ventanasDeReservas([v('2026-11-28', '2026-11-29')])[0].fechaDevolucion).toBe('2026-11-29');
    const devuelta = { ...entregada, devueltaEn: new Date('2026-11-29T15:00:00Z') };
    expect(ventanasDeReservas([devuelta])[0].fechaDevolucion).toBe('2026-11-29');
    expect(hayConflicto(ocupaciones(libre, [devuelta]), v('2026-11-30', '2026-12-02'))).toBe(false);
  });
});
