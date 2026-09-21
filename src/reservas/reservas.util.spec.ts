import { describe, expect, it } from 'vitest';
import { calcularDias, generarCodigo, hoyEnEcuador } from './reservas.util.js';

describe('reservas.util', () => {
  it('calcula los días entre dos fechas', () => {
    expect(calcularDias('2026-10-01', '2026-10-04')).toBe(3);
    expect(calcularDias('2026-12-30', '2027-01-02')).toBe(3);
  });

  it('genera códigos con el formato esperado y distintos entre sí', () => {
    const a = generarCodigo();
    const b = generarCodigo();
    expect(a).toMatch(/^AR-[A-Z0-9]{6}$/);
    expect(a).not.toBe(b);
  });

  it('devuelve la fecha de hoy en formato AAAA-MM-DD', () => {
    expect(hoyEnEcuador()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
