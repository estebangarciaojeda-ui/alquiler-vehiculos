import { describe, expect, it } from 'vitest';
import { alternativas, disponibleDesde, hayConflicto, type Ventana } from './disponibilidad.util.js';

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
