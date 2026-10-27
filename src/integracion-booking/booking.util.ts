import { randomInt } from 'node:crypto';

export const TZ = 'America/Guayaquil';
export const COOLDOWN_MINUTOS = 120;
export const MONEDA = 'USD';

export const ESTADOS_VEHICULO = [
  'DISPONIBLE',
  'RESERVADO',
  'LISTO_PARA_ENTREGAR',
  'ENTREGADO',
  'EN_LIMPIEZA',
  'EN_MANTENIMIENTO',
] as const;
export type EstadoVehiculo = (typeof ESTADOS_VEHICULO)[number];

const redondear = (n: number): number => Math.round(n * 100) / 100;

// ── Identificadores públicos ────────────────────────────────────────────

export const idPublico = (id: number): string => `auto-${String(id).padStart(3, '0')}`;

/** Acepta "auto-007", "7", 7 y devuelve el id numérico interno (o null). */
export function parsearIdPublico(valor: unknown): number | null {
  if (typeof valor === 'number') return Number.isInteger(valor) && valor > 0 ? valor : null;
  if (typeof valor !== 'string') return null;
  const m = /^(?:auto-)?0*(\d+)$/i.exec(valor.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return n > 0 ? n : null;
}

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** PNR de 8 caracteres: "CAR" + 5. */
export function generarPnr(): string {
  let s = 'CAR';
  for (let i = 0; i < 5; i++) s += ALFABETO[randomInt(ALFABETO.length)];
  return s;
}

export const generarCorrelationId = (): string => `cid-aut-${randomInt(0x10000000, 0xfffffff0).toString(16)}`;

// ── Fechas, horas y slots ───────────────────────────────────────────────

export function hoyEnEcuador(ahora: Date = new Date()): string {
  return ahora.toLocaleDateString('en-CA', { timeZone: TZ });
}

export const esFechaValida = (s: unknown): s is string => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const f = new Date(Date.UTC(y, m - 1, d));
  return f.getUTCFullYear() === y && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
};

export const esHoraValida = (s: unknown): s is string => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

/** "10:17" -> "10:00"; "10:45" -> "10:30" (franjas de 30 minutos). */
export function slotDeHora(hora: string): string {
  const [h, m] = hora.split(':');
  return `${h}:${Number(m) >= 30 ? '30' : '00'}`;
}

/** slot_id estándar del contrato: "slot-YYYYMMDD-HHMM". */
export const slotId = (fecha: string, slot: string): string => `slot-${fecha.replace(/-/g, '')}-${slot.replace(':', '')}`;

export function fechaYSlotLocal(d: Date): { fecha: string; slot: string } {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string): string => partes.find((p) => p.type === t)?.value ?? '00';
  return { fecha: `${get('year')}-${get('month')}-${get('day')}`, slot: `${get('hour')}:${Number(get('minute')) >= 30 ? '30' : '00'}` };
}

export function diasEntre(desde: string, hasta: string): number {
  const [ya, ma, da] = desde.split('-').map(Number);
  const [yb, mb, db] = hasta.split('-').map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000);
}

// ── Categorías y transmisión (nuestro catálogo <-> contrato v3) ─────────

const CATEGORIA_A_CONTRATO: Record<string, string> = {
  ECONOMICO: 'ECONOMICO',
  COMPACTO: 'COMPACTO',
  INTERMEDIO: 'COMPACTO',
  SUV: 'SUV',
  CAMIONETA: 'SUV',
  VAN: 'VAN',
  LUJO: 'PREMIUM',
};
export const categoriaContrato = (interna: string): string => CATEGORIA_A_CONTRATO[interna] ?? interna;

export function categoriasInternas(contrato: string): string[] {
  return Object.entries(CATEGORIA_A_CONTRATO)
    .filter(([, c]) => c === contrato)
    .map(([i]) => i);
}

export const transmisionContrato = (t: string): string => (t === 'AUTOMATICA' ? 'AUTOMATICO' : t);
export const transmisionInterna = (t: string): string => (t === 'AUTOMATICO' ? 'AUTOMATICA' : t);

// ── Coberturas y tarifas ────────────────────────────────────────────────

export const COBERTURAS = {
  BASICA: { costoDiario: 0, franquicia: 1200, deposito: 500 },
  TOTAL: { costoDiario: 18, franquicia: 0, deposito: 0 },
} as const;
export type Cobertura = keyof typeof COBERTURAS;

export function normalizarCobertura(valor: unknown): Cobertura | null {
  if (valor === undefined || valor === null || valor === '') return 'BASICA';
  const v = String(valor).trim().toUpperCase();
  if (v === 'BASIC' || v === 'BASICA') return 'BASICA';
  if (v === 'TOTAL' || v === 'PREMIUM') return 'TOTAL';
  return null;
}

export const aplicaRecargoEdad = (edad: number | undefined): boolean => edad !== undefined && (edad < 25 || edad > 70);

export function calcularTarifa(precioPorDia: number, dias: number, cobertura: Cobertura, edad?: number) {
  const base = redondear(precioPorDia * dias);
  const coverage = redondear(COBERTURAS[cobertura].costoDiario * dias);
  const surcharge = aplicaRecargoEdad(edad) ? redondear(base * 0.1) : 0;
  return { days: dias, base, coverage, surcharge, total: redondear(base + coverage + surcharge) };
}

// ── Máquina de estados de la flota ──────────────────────────────────────

export interface VehiculoOperativo {
  estadoOperativo: string;
  disponibleDesde: Date | null;
}

export interface ReservaParaEstado {
  estado: string;
  fechaRecogida: string;
  fechaDevolucion: string;
  checkinEn: Date | null;
  entregadaEn: Date | null;
  devueltaEn: Date | null;
}

export function enLimpiezaActiva(v: VehiculoOperativo, ahora: Date = new Date()): boolean {
  return v.estadoOperativo === 'EN_LIMPIEZA' && !!v.disponibleDesde && v.disponibleDesde.getTime() > ahora.getTime();
}

/** Excluido de búsquedas y de nuevas reservas: mantenimiento o cooldown de limpieza vigente. */
export function bloqueadoOperativamente(v: VehiculoOperativo, ahora: Date = new Date()): boolean {
  return v.estadoOperativo === 'EN_MANTENIMIENTO' || enLimpiezaActiva(v, ahora);
}

export function segundosRestantesCooldown(v: VehiculoOperativo, ahora: Date = new Date()): number {
  if (!enLimpiezaActiva(v, ahora)) return 0;
  return Math.max(0, Math.ceil(((v.disponibleDesde as Date).getTime() - ahora.getTime()) / 1000));
}

export function estadoEfectivo(
  v: VehiculoOperativo,
  reservas: ReservaParaEstado[],
  ahora: Date = new Date(),
): EstadoVehiculo {
  if (v.estadoOperativo === 'EN_MANTENIMIENTO') return 'EN_MANTENIMIENTO';
  if (enLimpiezaActiva(v, ahora)) return 'EN_LIMPIEZA';

  const vivas = reservas.filter((r) => r.estado === 'CONFIRMADA');
  if (vivas.some((r) => r.entregadaEn && !r.devueltaEn)) return 'ENTREGADO';

  const hoy = hoyEnEcuador(ahora);
  const enVentana = vivas.filter((r) => !r.entregadaEn && r.fechaRecogida <= hoy && hoy < r.fechaDevolucion);
  if (enVentana.some((r) => r.checkinEn)) return 'LISTO_PARA_ENTREGAR';
  if (enVentana.length > 0) return 'RESERVADO';
  return 'DISPONIBLE';
}

// ── Ubicaciones ─────────────────────────────────────────────────────────

const sinAcentos = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const CIUDAD_POR_IATA: Record<string, string> = { uio: 'quito', gye: 'guayaquil', cue: 'cuenca', mec: 'manta' };

export interface SucursalBasica {
  id: number;
  nombre: string;
  ciudad: string;
  esAeropuerto: boolean;
}

/**
 * Traduce el texto libre del contrato ("Aeropuerto Mariscal Sucre (UIO), Quito") a ids de
 * sucursal. Devuelve null cuando no se reconoce ninguna ubicación (no se filtra por lugar).
 */
export function resolverSucursales(texto: string | undefined, sucursales: SucursalBasica[]): number[] | null {
  if (!texto || !texto.trim()) return null;
  const t = sinAcentos(texto);

  const porNombre = sucursales.filter((s) => t.includes(sinAcentos(s.nombre)));
  if (porNombre.length > 0) return porNombre.map((s) => s.id);

  const codigo = /\b(uio|gye|cue|mec)\b/.exec(t)?.[1];
  const ciudad = codigo
    ? CIUDAD_POR_IATA[codigo]
    : [...new Set(sucursales.map((s) => sinAcentos(s.ciudad)))].find((c) => t.includes(c));
  if (!ciudad) return null;

  let deLaCiudad = sucursales.filter((s) => sinAcentos(s.ciudad) === ciudad);
  if (codigo || t.includes('aeropuerto')) {
    const aeropuertos = deLaCiudad.filter((s) => s.esAeropuerto);
    if (aeropuertos.length > 0) deLaCiudad = aeropuertos;
  }
  return deLaCiudad.map((s) => s.id);
}

// ── Validación de peticiones (alias en español tolerados: Ley de Postel) ─

export interface ErrorCampo {
  name: string;
  reason: string;
}

export type CodigoValidacion = 'INVALID_PAYLOAD' | 'INVALID_DATES' | 'DRIVER_UNDERAGE';

export type Resultado<T> = { ok: true; valor: T } | { ok: false; codigo: CodigoValidacion; errores: ErrorCampo[] };

type Dic = Record<string, unknown>;
const esDic = (v: unknown): v is Dic => typeof v === 'object' && v !== null && !Array.isArray(v);
const primero = (o: Dic, ...claves: string[]): unknown => {
  for (const c of claves) if (o[c] !== undefined && o[c] !== null && o[c] !== '') return o[c];
  return undefined;
};
const texto = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

export interface Conductor {
  full_name: string;
  email: string;
  phone: string;
  license_number: string;
  country_license: string;
  age: number;
  flight_number?: string;
}

export interface SolicitudReserva {
  vehiculoId: number;
  recogida: string;
  devolucion: string;
  horaRecogida: string;
  horaDevolucion: string;
  lugarRecogida?: string;
  lugarDevolucion?: string;
  cobertura: Cobertura;
  conductor: Conductor;
}

export function normalizarSolicitudReserva(cuerpo: unknown, hoy: string): Resultado<SolicitudReserva> {
  if (!esDic(cuerpo)) {
    return { ok: false, codigo: 'INVALID_PAYLOAD', errores: [{ name: 'body', reason: 'Se esperaba un objeto JSON.' }] };
  }
  const errores: ErrorCampo[] = [];

  const vehiculoId = parsearIdPublico(primero(cuerpo, 'vehicle_id', 'auto_id', 'vehiculo_id', 'id'));
  if (vehiculoId === null) errores.push({ name: 'vehicle_id', reason: 'Obligatorio. Ej: auto-007.' });

  const recogida = primero(cuerpo, 'pickup_date', 'fecha_recogida');
  const devolucion = primero(cuerpo, 'dropoff_date', 'fecha_devolucion');
  if (!esFechaValida(recogida)) errores.push({ name: 'pickup_date', reason: 'Obligatorio, formato YYYY-MM-DD.' });
  if (!esFechaValida(devolucion)) errores.push({ name: 'dropoff_date', reason: 'Obligatorio, formato YYYY-MM-DD.' });

  const horaRecogida = primero(cuerpo, 'pickup_time', 'hora_recogida') ?? '10:00';
  const horaDevolucion = primero(cuerpo, 'dropoff_time', 'hora_devolucion') ?? '10:00';
  if (!esHoraValida(horaRecogida)) errores.push({ name: 'pickup_time', reason: 'Formato HH:mm.' });
  if (!esHoraValida(horaDevolucion)) errores.push({ name: 'dropoff_time', reason: 'Formato HH:mm.' });

  const cobertura = normalizarCobertura(primero(cuerpo, 'coverage_type', 'tipo_cobertura', 'cobertura'));
  if (cobertura === null) errores.push({ name: 'coverage_type', reason: 'Valores: BASIC, TOTAL.' });

  const crudoConductor = primero(cuerpo, 'driver', 'conductor');
  const d: Dic = esDic(crudoConductor) ? crudoConductor : {};
  if (!esDic(crudoConductor)) errores.push({ name: 'driver', reason: 'Obligatorio.' });

  const nombre = texto(primero(d, 'full_name', 'nombre'));
  const email = texto(primero(d, 'email', 'correo'));
  const telefono = texto(primero(d, 'phone', 'telefono'));
  const licencia = texto(primero(d, 'license_number', 'licencia_conducir'));
  const edadCruda = primero(d, 'age', 'edad');
  const edad = typeof edadCruda === 'string' && /^\d+$/.test(edadCruda) ? Number(edadCruda) : edadCruda;
  if (esDic(crudoConductor)) {
    if (!nombre) errores.push({ name: 'driver.full_name', reason: 'Obligatorio.' });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errores.push({ name: 'driver.email', reason: 'Correo válido obligatorio.' });
    if (!telefono) errores.push({ name: 'driver.phone', reason: 'Obligatorio.' });
    if (!licencia) errores.push({ name: 'driver.license_number', reason: 'Obligatorio.' });
    if (typeof edad !== 'number' || !Number.isInteger(edad) || edad < 0 || edad > 120) {
      errores.push({ name: 'driver.age', reason: 'Entero obligatorio.' });
    }
  }

  if (errores.length > 0) return { ok: false, codigo: 'INVALID_PAYLOAD', errores };

  const edadFinal = edad as number;
  if (edadFinal < 18) {
    return { ok: false, codigo: 'DRIVER_UNDERAGE', errores: [{ name: 'driver.age', reason: 'El conductor debe tener al menos 18 años.' }] };
  }

  const fechas = { r: recogida as string, d: devolucion as string };
  const errFechas: ErrorCampo[] = [];
  if (fechas.r < hoy) errFechas.push({ name: 'pickup_date', reason: 'La fecha de recogida no puede ser en el pasado.' });
  if (fechas.d <= fechas.r) errFechas.push({ name: 'dropoff_date', reason: 'Debe ser posterior a la fecha de recogida.' });
  if (errFechas.length > 0) return { ok: false, codigo: 'INVALID_DATES', errores: errFechas };

  return {
    ok: true,
    valor: {
      vehiculoId: vehiculoId as number,
      recogida: fechas.r,
      devolucion: fechas.d,
      horaRecogida: horaRecogida as string,
      horaDevolucion: horaDevolucion as string,
      lugarRecogida: texto(primero(cuerpo, 'pickup_location', 'lugar_recogida')),
      lugarDevolucion: texto(primero(cuerpo, 'dropoff_location', 'lugar_devolucion')),
      cobertura: cobertura as Cobertura,
      conductor: {
        full_name: nombre as string,
        email: (email as string).toLowerCase(),
        phone: telefono as string,
        license_number: licencia as string,
        country_license: texto(primero(d, 'country_license')) ?? 'Ecuador',
        age: edadFinal,
        flight_number: texto(primero(d, 'flight_number')),
      },
    },
  };
}

export interface SolicitudBusqueda {
  lugarRecogida: string;
  lugarDevolucion?: string;
  recogida: string;
  devolucion: string;
  horaRecogida: string;
  horaDevolucion: string;
  edad: number;
  categoria: string;
  transmision: string;
}

export function normalizarSolicitudBusqueda(cuerpo: unknown, hoy: string): Resultado<SolicitudBusqueda> {
  if (!esDic(cuerpo)) {
    return { ok: false, codigo: 'INVALID_PAYLOAD', errores: [{ name: 'body', reason: 'Se esperaba un objeto JSON.' }] };
  }
  const errores: ErrorCampo[] = [];
  const lugar = texto(primero(cuerpo, 'pickup_location', 'lugar_recogida'));
  if (!lugar) errores.push({ name: 'pickup_location', reason: 'Obligatorio.' });
  const recogida = primero(cuerpo, 'pickup_date', 'fecha_recogida');
  const devolucion = primero(cuerpo, 'dropoff_date', 'fecha_devolucion');
  if (!esFechaValida(recogida)) errores.push({ name: 'pickup_date', reason: 'Obligatorio, formato YYYY-MM-DD.' });
  if (!esFechaValida(devolucion)) errores.push({ name: 'dropoff_date', reason: 'Obligatorio, formato YYYY-MM-DD.' });
  const horaR = primero(cuerpo, 'pickup_time', 'hora_recogida');
  const horaD = primero(cuerpo, 'dropoff_time', 'hora_devolucion');
  if (!esHoraValida(horaR)) errores.push({ name: 'pickup_time', reason: 'Obligatorio, formato HH:mm.' });
  if (!esHoraValida(horaD)) errores.push({ name: 'dropoff_time', reason: 'Obligatorio, formato HH:mm.' });

  const edadCruda = primero(cuerpo, 'driver_age', 'edad');
  const edad = edadCruda === undefined ? 30 : typeof edadCruda === 'string' && /^\d+$/.test(edadCruda) ? Number(edadCruda) : edadCruda;
  if (typeof edad !== 'number' || !Number.isInteger(edad) || edad < 0 || edad > 120) {
    errores.push({ name: 'driver_age', reason: 'Debe ser un entero.' });
  }

  const categoria = String(primero(cuerpo, 'category', 'categoria') ?? 'ALL').toUpperCase();
  const transmision = String(primero(cuerpo, 'transmission', 'transmision') ?? 'ALL').toUpperCase();
  if (!['ALL', 'ECONOMICO', 'COMPACTO', 'SUV', 'PREMIUM', 'VAN'].includes(categoria)) {
    errores.push({ name: 'category', reason: 'Valores: ALL, ECONOMICO, COMPACTO, SUV, PREMIUM, VAN.' });
  }
  if (!['ALL', 'MANUAL', 'AUTOMATICO', 'AUTOMATICA'].includes(transmision)) {
    errores.push({ name: 'transmission', reason: 'Valores: ALL, MANUAL, AUTOMATICO.' });
  }
  if (errores.length > 0) return { ok: false, codigo: 'INVALID_PAYLOAD', errores };

  if ((edad as number) < 18) {
    return { ok: false, codigo: 'DRIVER_UNDERAGE', errores: [{ name: 'driver_age', reason: 'El conductor debe tener al menos 18 años.' }] };
  }
  const errFechas: ErrorCampo[] = [];
  if ((recogida as string) < hoy) errFechas.push({ name: 'pickup_date', reason: 'La fecha de recogida no puede ser en el pasado.' });
  if ((devolucion as string) <= (recogida as string)) errFechas.push({ name: 'dropoff_date', reason: 'Debe ser posterior a la fecha de recogida.' });
  if (errFechas.length > 0) return { ok: false, codigo: 'INVALID_DATES', errores: errFechas };

  return {
    ok: true,
    valor: {
      lugarRecogida: lugar as string,
      lugarDevolucion: texto(primero(cuerpo, 'dropoff_location', 'lugar_devolucion')),
      recogida: recogida as string,
      devolucion: devolucion as string,
      horaRecogida: horaR as string,
      horaDevolucion: horaD as string,
      edad: edad as number,
      categoria,
      transmision: transmision === 'ALL' ? 'ALL' : transmisionInterna(transmision),
    },
  };
}

/** Mismo slug que public/app.js para resolver public/img/autos/<marca-modelo>.jpg. */
export const claveModelo = (marca: string, modelo: string): string =>
  sinAcentos(`${marca} ${modelo}`).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
