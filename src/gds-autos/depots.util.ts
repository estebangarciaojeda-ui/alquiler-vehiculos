// Catálogo interno de ciudades y aeropuertos, derivado de las sucursales de AutoSpot.
// No se persiste en la BD: se calcula aquí para no tocar la tabla sucursales (que también usa el sitio web).
const CIUDAD_A_ID: Record<string, number> = { Quito: 1, Guayaquil: 2, Cuenca: 3, Manta: 4 };

const IATA_POR_NOMBRE: Record<string, string> = {
  'Aeropuerto Mariscal Sucre': 'UIO',
  'Aeropuerto José Joaquín de Olmedo': 'GYE',
  'Aeropuerto Eloy Alfaro': 'MEC',
};

export function idDeCiudad(ciudad: string): number {
  return CIUDAD_A_ID[ciudad] ?? 0;
}

export function iataDeSucursal(nombre: string): string | undefined {
  return IATA_POR_NOMBRE[nombre];
}

// Calificación determinística (misma sucursal -> mismo puntaje siempre), entre 4.2 y 4.9,
// ya que no existe todavía un sistema real de reseñas.
export function calificacionDeSucursal(id: number): number {
  return Math.round((4.2 + ((id * 7) % 8) * 0.1) * 10) / 10;
}
