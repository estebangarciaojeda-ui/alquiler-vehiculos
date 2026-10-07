import { describe, expect, it } from 'vitest';
import { validarVehiculo } from './validarVehiculo.js';

const VALIDO = {
  marca: 'Toyota',
  modelo: 'Corolla',
  anio: 2024,
  precioPorDia: 45,
  pasajeros: 5,
  puertas: 4,
  maletas: 2,
};

describe('validarVehiculo', () => {
  it('no devuelve errores con datos válidos', () => {
    expect(validarVehiculo(VALIDO)).toEqual([]);
  });

  it('exige marca y modelo', () => {
    const errores = validarVehiculo({ ...VALIDO, marca: '  ', modelo: '' });
    expect(errores).toContain('La marca es obligatoria.');
    expect(errores).toContain('El modelo es obligatorio.');
  });

  it('rechaza año fuera de rango', () => {
    expect(validarVehiculo({ ...VALIDO, anio: 1899 })).toContain('El año debe estar entre 2000 y 2100.');
    expect(validarVehiculo({ ...VALIDO, anio: 2101 })).toContain('El año debe estar entre 2000 y 2100.');
  });

  it('exige precio por día positivo', () => {
    expect(validarVehiculo({ ...VALIDO, precioPorDia: 0 })).toContain('El precio por día debe ser mayor que 0.');
    expect(validarVehiculo({ ...VALIDO, precioPorDia: -10 })).toContain('El precio por día debe ser mayor que 0.');
  });

  it('valida el rango de pasajeros y puertas', () => {
    expect(validarVehiculo({ ...VALIDO, pasajeros: 0 })).toContain('Los pasajeros deben estar entre 1 y 15.');
    expect(validarVehiculo({ ...VALIDO, pasajeros: 16 })).toContain('Los pasajeros deben estar entre 1 y 15.');
    expect(validarVehiculo({ ...VALIDO, puertas: 1 })).toContain('Las puertas deben estar entre 2 y 6.');
    expect(validarVehiculo({ ...VALIDO, puertas: 7 })).toContain('Las puertas deben estar entre 2 y 6.');
  });

  it('acumula varios errores a la vez', () => {
    const errores = validarVehiculo({ marca: '', modelo: '', anio: 1, precioPorDia: -1, pasajeros: 0, puertas: 0, maletas: -1 });
    expect(errores.length).toBeGreaterThanOrEqual(5);
  });
});
