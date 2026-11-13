import { COOLDOWN_MINUTOS } from './booking.util.js';

/**
 * Disponibilidad por intervalos con el ciclo de limpieza obligatorio (contrato autos v3: cooldown de 2 h tras cada devolución).
 * Un alquiler ocupa el auto desde su recogida hasta su devolución MÁS el tiempo de limpieza. Dos alquileres chocan si,
 * con ese margen aplicado a ambos extremos, sus intervalos se cruzan.
 */
export interface Ventana {
  fechaRecogida: string;
  horaRecogida?: string | null;
  fechaDevolucion: string;
  horaDevolucion?: string | null;
  /** Solo para reservas reales: si se entregaron las llaves y aún no se devolvió, el auto está fuera hasta que se registre la devolución. */
  entregadaEn?: Date | null;
  devueltaEn?: Date | null;
}

/** Fin "desconocido": la fecha de devolución real se sabrá cuando se registre la devolución. */
const SIN_FIN = '9999-12-31';

/**
 * Una reserva ENTREGADA y sin devolver ocupa el auto desde su recogida y sin fecha de fin: hasta que no se registre la devolución
 * (más las 2 h de limpieza) el auto no se ofrece para fechas posteriores. Las fechas anteriores a su recogida siguen libres.
 */
export function ventanasDeReservas(reservas: Ventana[]): Ventana[] {
  return reservas.map((r) => (r.entregadaEn && !r.devueltaEn ? { fechaRecogida: r.fechaRecogida, horaRecogida: r.horaRecogida, fechaDevolucion: SIN_FIN, horaDevolucion: '00:00' } : r));
}

/** Ecuador (America/Guayaquil) está en UTC-5 todo el año (sin horario de verano). */
const OFFSET_ECUADOR_MIN = 300;

/**
 * El ciclo de limpieza de 2 h tras una devolución (contrato v3: estado EN_LIMPIEZA) no bloquea el auto entero: solo impide
 * recogerlo ANTES de `disponibleDesde`. Se modela como un alquiler que termina en la devolución real (disponibleDesde - 2 h),
 * al que `hayConflicto` suma los 120 min de limpieza. Una recogida posterior a `disponibleDesde` queda libre.
 */
export function ventanaLimpieza(v: { estadoOperativo: string; disponibleDesde: Date | null }, ahora: Date = new Date(), margen: number = COOLDOWN_MINUTOS): Ventana | null {
  if (v.estadoOperativo !== 'EN_LIMPIEZA' || !v.disponibleDesde || v.disponibleDesde.getTime() <= ahora.getTime()) return null;
  const devolucionLocal = new Date(v.disponibleDesde.getTime() - (margen + OFFSET_ECUADOR_MIN) * 60_000).toISOString();
  return { fechaRecogida: '1970-01-01', horaRecogida: '00:00', fechaDevolucion: devolucionLocal.slice(0, 10), horaDevolucion: devolucionLocal.slice(11, 16) };
}

/** Alquileres confirmados del auto más, si aplica, su limpieza en curso: todo lo que ocupa el auto en el tiempo. */
export function ocupaciones(v: { estadoOperativo: string; disponibleDesde: Date | null }, reservas: Ventana[], ahora: Date = new Date()): Ventana[] {
  const limpieza = ventanaLimpieza(v, ahora);
  const ventanas = ventanasDeReservas(reservas);
  return limpieza ? [...ventanas, limpieza] : ventanas;
}

export interface Alternativa {
  fecha_recogida: string;
  hora_recogida: string;
  fecha_devolucion: string;
  hora_devolucion: string;
  dias: number;
}

const HORA_DEFECTO = '10:00';

/** Minutos desde una referencia fija: solo sirve para comparar y restar, no depende de la zona horaria. */
export function aMinutos(fecha: string, hora?: string | null): number {
  const [y, m, d] = fecha.split('-').map(Number);
  const [hh, mm] = (hora ?? HORA_DEFECTO).split(':').map(Number);
  return Date.UTC(y, m - 1, d, hh, mm) / 60000;
}

export function sumarDiasFecha(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
}

const diasEnteros = (desde: string, hasta: string): number => Math.round((aMinutos(hasta) - aMinutos(desde)) / 1440);

function choca(existente: Ventana, nueva: Ventana, margen: number): boolean {
  const eIni = aMinutos(existente.fechaRecogida, existente.horaRecogida);
  const eFin = aMinutos(existente.fechaDevolucion, existente.horaDevolucion);
  const nIni = aMinutos(nueva.fechaRecogida, nueva.horaRecogida);
  const nFin = aMinutos(nueva.fechaDevolucion, nueva.horaDevolucion);
  return nIni < eFin + margen && eIni < nFin + margen;
}

export function hayConflicto(existentes: Ventana[], nueva: Ventana, margen: number = COOLDOWN_MINUTOS): boolean {
  return existentes.some((e) => choca(e, nueva, margen));
}

/** Primer momento (hora local, ISO sin zona) en que el auto vuelve a estar libre tras la limpieza de los alquileres que chocan. */
export function disponibleDesde(existentes: Ventana[], nueva: Ventana, margen: number = COOLDOWN_MINUTOS): string | null {
  const choques = existentes.filter((e) => choca(e, nueva, margen));
  if (choques.length === 0) return null;
  if (choques.some((e) => e.fechaDevolucion === SIN_FIN)) return null; // fuera hasta que se registre la devolución
  const fin = Math.max(...choques.map((e) => aMinutos(e.fechaDevolucion, e.horaDevolucion) + margen));
  return new Date(fin * 60000).toISOString().slice(0, 16);
}

/**
 * Otras fechas libres con la misma duración y las mismas horas, de la más cercana a la más lejana a la solicitada
 * (primero hacia adelante en caso de empate). Nunca propone recogidas anteriores a `hoy`.
 */
export function alternativas(existentes: Ventana[], nueva: Ventana, hoy: string, max = 3, rangoDias = 45, margen: number = COOLDOWN_MINUTOS): Alternativa[] {
  const dias = Math.max(diasEnteros(nueva.fechaRecogida, nueva.fechaDevolucion), 1);
  const horaIni = nueva.horaRecogida ?? HORA_DEFECTO;
  const horaFin = nueva.horaDevolucion ?? HORA_DEFECTO;
  const salida: Alternativa[] = [];
  for (let k = 1; k <= rangoDias && salida.length < max; k++) {
    for (const desplazamiento of [k, -k]) {
      const ini = sumarDiasFecha(nueva.fechaRecogida, desplazamiento);
      if (ini < hoy) continue;
      const fin = sumarDiasFecha(ini, dias);
      const candidata: Ventana = { fechaRecogida: ini, horaRecogida: horaIni, fechaDevolucion: fin, horaDevolucion: horaFin };
      if (!hayConflicto(existentes, candidata, margen)) {
        salida.push({ fecha_recogida: ini, hora_recogida: horaIni, fecha_devolucion: fin, hora_devolucion: horaFin, dias });
        if (salida.length >= max) break;
      }
    }
  }
  return salida;
}

/** Minutos que faltan para la recogida (fecha y hora locales de Ecuador); negativo si ya pasó. */
export function minutosParaRecogida(fecha: string, hora?: string | null, ahora: Date = new Date()): number {
  return aMinutos(fecha, hora) + OFFSET_ECUADOR_MIN - ahora.getTime() / 60_000;
}
