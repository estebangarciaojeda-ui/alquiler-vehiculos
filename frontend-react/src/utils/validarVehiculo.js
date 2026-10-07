// Validación pura (sin dependencias de React ni del DOM) para poder probarla
// con pruebas unitarias de forma aislada.
export function validarVehiculo(datos) {
  const errores = [];

  if (!datos.marca?.trim()) errores.push('La marca es obligatoria.');
  if (!datos.modelo?.trim()) errores.push('El modelo es obligatorio.');

  const anio = Number(datos.anio);
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) {
    errores.push('El año debe estar entre 2000 y 2100.');
  }

  const precio = Number(datos.precioPorDia);
  if (!(precio > 0)) errores.push('El precio por día debe ser mayor que 0.');

  const pasajeros = Number(datos.pasajeros);
  if (!Number.isInteger(pasajeros) || pasajeros < 1 || pasajeros > 15) {
    errores.push('Los pasajeros deben estar entre 1 y 15.');
  }

  const puertas = Number(datos.puertas);
  if (!Number.isInteger(puertas) || puertas < 2 || puertas > 6) {
    errores.push('Las puertas deben estar entre 2 y 6.');
  }

  const maletas = Number(datos.maletas);
  if (!Number.isInteger(maletas) || maletas < 0 || maletas > 10) {
    errores.push('Las maletas deben estar entre 0 y 10.');
  }

  return errores;
}
