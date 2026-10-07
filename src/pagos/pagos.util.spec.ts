import { describe, expect, it } from 'vitest';
import { luhnValido, TARJETA_APROBADA, TARJETA_RECHAZADA, vencimientoVigente } from './pagos.util.js';

describe('pagos.util', () => {
  it('acepta tarjetas de prueba con Luhn válido y rechaza números alterados', () => {
    expect(luhnValido(TARJETA_APROBADA)).toBe(true);
    expect(luhnValido(TARJETA_RECHAZADA)).toBe(true);
    expect(luhnValido('4111111111111112')).toBe(false);
  });

  it('valida el vencimiento MM/AA contra la fecha actual', () => {
    const ahora = new Date(2026, 9, 6);
    expect(vencimientoVigente('10/26', ahora)).toBe(true);
    expect(vencimientoVigente('09/26', ahora)).toBe(false);
    expect(vencimientoVigente('13/30', ahora)).toBe(false);
    expect(vencimientoVigente('2030', ahora)).toBe(false);
  });
});
