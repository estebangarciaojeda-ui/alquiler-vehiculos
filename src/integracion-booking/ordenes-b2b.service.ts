import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { GdsIdempotencia } from '../gds-autos/entities/gds-idempotency.entity.js';
import { Reserva } from '../reservas/reserva.entity.js';
import { Sucursal } from '../sucursales/sucursal.entity.js';
import { Vehiculo } from '../vehiculos/vehiculo.entity.js';
import {
  bloqueadoOperativamente,
  calcularTarifa,
  COBERTURAS,
  COOLDOWN_MINUTOS,
  diasEntre,
  enLimpiezaActiva,
  crearReembolso,
  esCedulaEcuatoriana,
  DETALLE_FUERA_DE_PLAZO,
  DETALLE_NO_CANCELABLE,
  generarCorrelationId,
  MENSAJE_INVENTARIO,
  MENSAJE_REEMBOLSO,
  PLAZO_CANCELACION_MIN,
  generarPnr,
  hoyEnEcuador,
  idPublico,
  MONEDA,
  normalizarSolicitudReserva,
  resolverSucursales,
  type ErrorCampo,
  type SolicitudReserva,
} from './booking.util.js';
import { ClientesService } from './clientes.service.js';
import { EventosService } from './eventos.service.js';
import { FlotaService } from './flota.service.js';
import { alternativas, disponibleDesde, hayConflicto, minutosParaRecogida, ocupaciones, ventanaLimpieza, ventanasDeReservas } from './disponibilidad.util.js';
import { ProblemaV3Exception } from './problema-v3.js';
import { RegistroService } from './registro.service.js';
import { StockSyncService } from './stock-sync.service.js';

export interface Ctx {
  correlationId: string;
  idempotencyKey?: string;
}
export interface Salida<T = unknown> {
  status: number;
  body: T;
  replay?: boolean;
}

type Dic = Record<string, unknown>;
const dic = (v: unknown): Dic => (typeof v === 'object' && v !== null ? (v as Dic) : {});
const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

/** Booking (Azure) puede tardar 30 s o más en frío: plazo por aviso y para la lectura de verificación. */
const PLAZO_AVISO_BOOKING_MS = 25_000;
const PLAZO_VERIFICACION_BOOKING_MS = 20_000;
/** Reintento automático del aviso de check-in cuando Booking no lo acepta a la primera. */
const REINTENTO_AVISOS_MS = 45_000;
const MAX_REINTENTOS_AVISO = 8;
@Injectable()
export class OrdenesB2bService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('OrdenesB2B');

  constructor(
    @InjectRepository(Reserva) private readonly reservas: Repository<Reserva>,
    @InjectRepository(Vehiculo) private readonly vehiculos: Repository<Vehiculo>,
    @InjectRepository(GdsIdempotencia) private readonly idem: Repository<GdsIdempotencia>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly flota: FlotaService,
    private readonly sync: StockSyncService,
    private readonly eventos: EventosService,
    private readonly registro: RegistroService,
    private readonly clientes: ClientesService,
  ) {}

  /** Avisos de check-in a Booking que no llegaron bien (404, 5xx o timeout): se reintentan solos hasta que Booking los acepte. */
  private readonly avisosPendientes = new Map<string, { reservaId: number; tipo: 'ENTREGA' | 'DEVOLUCION'; intentos: number }>();
  private temporizadorAvisos?: NodeJS.Timeout;
  private reintentandoAvisos = false;

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    void this.completarCedulasPendientes().catch((e) => this.logger.warn(`No se pudieron completar las cédulas pendientes: ${(e as Error).message}`));
    this.temporizadorAvisos = setInterval(() => void this.reintentarAvisosPendientes(), REINTENTO_AVISOS_MS);
    this.temporizadorAvisos.unref();
  }

  onModuleDestroy(): void {
    if (this.temporizadorAvisos) clearInterval(this.temporizadorAvisos);
  }

  /** Reintenta los avisos pendientes (uno tras otro). Se detiene por reserva cuando Booking responde bien o tras MAX_REINTENTOS_AVISO intentos. */
  async reintentarAvisosPendientes(): Promise<number> {
    if (this.reintentandoAvisos || this.avisosPendientes.size === 0) return 0;
    this.reintentandoAvisos = true;
    let resueltos = 0;
    try {
      for (const [codigo, p] of [...this.avisosPendientes]) {
        const r = await this.reservas.findOneBy({ id: p.reservaId });
        if (!r || r.estado === 'CANCELADA' || (p.tipo === 'ENTREGA' && r.devueltaEn)) {
          this.avisosPendientes.delete(codigo);
          continue;
        }
        p.intentos += 1;
        const n = await this.notificarCheckin(r, {}, 'reintento-automatico', { correlationId: generarCorrelationId() }, p.tipo);
        if (n.enviada === true && n.principal_ok === true) {
          this.avisosPendientes.delete(codigo);
          resueltos += 1;
        } else if (p.intentos >= MAX_REINTENTOS_AVISO) {
          this.avisosPendientes.delete(codigo);
          this.registro.registrar('warn', 'booking.checkin-abandonado', { pnr: codigo, tipo: p.tipo, intentos: p.intentos });
        }
      }
    } catch (e) {
      this.logger.warn(`Reintento de avisos a Booking: ${(e as Error).message}`);
    } finally {
      this.reintentandoAvisos = false;
    }
    return resueltos;
  }

  /**
   * Reservas de Booking: toma la cédula (`identificacion` o, si es una cédula válida, `license_number`), la deja en la reserva y la liga
   * al cliente que tiene esa cédula, sin duplicarlo. Si la reserva estaba ligada a otra cuenta creada solo por la integración (antes de
   * conocer la cédula) y esa cuenta ya no tiene reservas, se unifica. Es idempotente: no cambia nada que ya esté bien.
   */
  async completarCedulasPendientes(): Promise<number> {
    const candidatas = await this.reservas
      .createQueryBuilder('r')
      .where("r.origen = 'BOOKING'")
      .andWhere("(COALESCE(r.conductor->>'identificacion', '') <> '' OR COALESCE(r.conductor->>'license_number', '') <> '')")
      .orderBy('r.id', 'ASC')
      .getMany();
    let arregladas = 0;
    for (const r of candidatas) {
      const conductor = (r.conductor ?? {}) as Dic;
      const explicita = typeof conductor.identificacion === 'string' && conductor.identificacion.trim() ? conductor.identificacion.trim() : undefined;
      const cedula = explicita ?? (esCedulaEcuatoriana(conductor.license_number) ? conductor.license_number : undefined);
      if (!cedula) continue;
      const cli = await this.clientes
        .asegurarCuenta({ nombre: r.nombreCliente, email: r.email, identificacion: cedula, telefono: r.telefono, licencia: typeof conductor.license_number === 'string' ? conductor.license_number : undefined })
        .catch(() => null);
      const cambios: { conductor?: Record<string, unknown>; cuentaId?: number } = {};
      if (!explicita) cambios.conductor = { ...conductor, identificacion: cedula };
      if (cli && r.cuentaId !== cli.cuentaId) cambios.cuentaId = cli.cuentaId;
      if (Object.keys(cambios).length === 0) continue;
      await this.reservas.update(r.id, cambios as never);
      const anterior = r.cuentaId;
      if (cli && anterior && anterior !== cli.cuentaId && (await this.reservas.countBy({ cuentaId: anterior })) === 0) {
        await this.clientes.eliminarDuplicadoDeIntegracion(anterior, cedula).catch(() => false);
      }
      arregladas++;
    }
    if (arregladas > 0) this.registro.registrar('info', 'reservas.cedulas-completadas', { total: arregladas });
    return arregladas;
  }

  // ── Idempotencia ──────────────────────────────────────────────────────

  /** Misma Idempotency-Key + misma petición => misma respuesta sin repetir efectos; distinta petición => 400. */
  private readonly enVuelo = new Map<string, { hash: string; promesa: Promise<Salida> }>();

  private conflictoIdempotencia(): ProblemaV3Exception {
    return new ProblemaV3Exception(400, 'IDEMPOTENCY_CONFLICT', 'Conflicto de idempotencia', 'La Idempotency-Key ya fue usada con una petición distinta.');
  }

  private async conIdempotencia(operacion: string, ctx: Ctx, huella: unknown, fn: () => Promise<Salida>): Promise<Salida> {
    if (!ctx.idempotencyKey) return fn();
    const clave = `autos3:${operacion}:${ctx.idempotencyKey}`;
    const hash = createHash('sha256').update(JSON.stringify(huella)).digest('hex');

    // Reintentos simultáneos con la misma clave: esperan al primero y reciben su misma respuesta.
    const activa = this.enVuelo.get(clave);
    if (activa) {
      if (activa.hash !== hash) throw this.conflictoIdempotencia();
      const salida = await activa.promesa;
      this.registro.registrar('info', 'idempotencia.replay', { correlation_id: ctx.correlationId, idempotency_key: ctx.idempotencyKey, operacion });
      return { ...salida, replay: true };
    }
    const promesa = this.ejecutarIdempotente(clave, hash, operacion, ctx, fn);
    this.enVuelo.set(clave, { hash, promesa });
    try {
      return await promesa;
    } finally {
      this.enVuelo.delete(clave);
    }
  }

  private async ejecutarIdempotente(clave: string, hash: string, operacion: string, ctx: Ctx, fn: () => Promise<Salida>): Promise<Salida> {
    const previa = await this.idem.findOneBy({ clave });
    if (previa) {
      const guardada = previa.respuesta as { hash: string; status: number; body: unknown };
      if (guardada.hash !== hash) throw this.conflictoIdempotencia();
      this.registro.registrar('info', 'idempotencia.replay', { correlation_id: ctx.correlationId, idempotency_key: ctx.idempotencyKey, operacion });
      return { status: guardada.status, body: guardada.body, replay: true };
    }
    const salida = await fn();
    await this.idem.save({ clave, respuesta: { hash, status: salida.status, body: salida.body } }).catch(() => undefined);
    return salida;
  }

  // ── Presentación ──────────────────────────────────────────────────────

  private estadoContrato(r: Reserva): string {
    if (r.estado === 'CANCELADA') return 'CANCELLED';
    if (r.estado === 'COMPLETADA') return 'COMPLETADA';
    if (r.entregadaEn && !r.devueltaEn) return 'ENTREGADO';
    return 'CONFIRMED';
  }

  private respuestaOrden(r: Reserva) {
    const auto = idPublico(r.vehiculoId);
    const estado = this.estadoContrato(r);
    const voucher = `BOOKING-CAR-${r.codigo}-${auto}-${estado}`;
    const reembolso = r.reembolso as Dic | null;
    return {
      order_id: r.codigo,
      pnr: r.codigo,
      status: estado,
      auto_id: auto,
      vehicle_id: auto,
      tipo_cobertura: r.cobertura,
      deposito_garantia: r.depositoGarantia,
      total_price: { currency: MONEDA, total: r.total, desglose: r.desglose ?? {} },
      voucher_qr_data: voucher,
      voucher_qr_payload: voucher,
      checklist_mostrador: ['Licencia de conducir física vigente', 'Documento de identidad', 'Tarjeta de crédito para el depósito de garantía'],
      refund: reembolso,
      _links: {
        self: `/autos/orders/${r.codigo}`,
        cancel: `/autos/orders/${r.codigo}/cancel`,
        checkin: `/autos/reservas/${r.codigo}/checkin`,
      },
      codigo_reserva: r.codigo,
      estado,
      moneda: MONEDA,
      precio_total_monto: r.total,
      ...(reembolso ? { reembolso_id: reembolso.refund_id, monto_reembolsado: reembolso.amount } : {}),
      pickup_date: r.fechaRecogida,
      pickup_time: r.horaRecogida,
      dropoff_date: r.fechaDevolucion,
      dropoff_time: r.horaDevolucion,
      pickup_location: r.sucursalRecogida ? `${r.sucursalRecogida.nombre}, ${r.sucursalRecogida.ciudad}` : undefined,
      dropoff_location: r.sucursalDevolucion ? `${r.sucursalDevolucion.nombre}, ${r.sucursalDevolucion.ciudad}` : undefined,
      driver: r.conductor ?? { full_name: r.nombreCliente, email: r.email, phone: r.telefono },
      origen: r.origen,
      created_at: r.creadaEn.toISOString(),
    };
  }

  // ── Consultas ─────────────────────────────────────────────────────────

  async buscarOrden(idOPnr: string): Promise<Reserva> {
    const clave = idOPnr.trim();
    const porCodigo = await this.reservas.findOneBy({ codigo: clave.toUpperCase() });
    const r = porCodigo ?? (/^\d+$/.test(clave) ? await this.reservas.findOneBy({ id: Number(clave) }) : null);
    if (!r) throw new ProblemaV3Exception(404, 'NOT_FOUND', 'Orden no encontrada', `No existe la orden o PNR ${idOPnr}.`);
    return r;
  }

  async obtener(idOPnr: string) {
    return this.respuestaOrden(await this.buscarOrden(idOPnr));
  }

  /** Recuperación tras un timeout: devuelve únicamente la orden creada con esa Idempotency-Key (404 si no hay). */
  async buscarPorIdempotencia(idempotencyKey: string) {
    const previa = await this.idem.findOneBy({ clave: `autos3:create:${idempotencyKey.trim().slice(0, 100)}` });
    const orden = (previa?.respuesta as { body?: { order_id?: string } } | undefined)?.body?.order_id;
    if (!orden) throw new ProblemaV3Exception(404, 'NOT_FOUND', 'Orden no encontrada', 'No hay ninguna orden creada con esa Idempotency-Key.');
    return this.obtener(orden);
  }

  async listar() {
    const filas = await this.reservas.find({ order: { creadaEn: 'DESC', id: 'DESC' }, take: 200 });
    return filas.map((r) => this.respuestaOrden(r));
  }

  // ── Crear ─────────────────────────────────────────────────────────────

  async crear(cuerpo: unknown, ctx: Ctx): Promise<Salida> {
    if (!ctx.idempotencyKey) {
      throw new ProblemaV3Exception(400, 'MISSING_IDEMPOTENCY_KEY', 'Falta Idempotency-Key', 'La cabecera Idempotency-Key es obligatoria al crear una orden.', [
        { name: 'Idempotency-Key', reason: 'Obligatoria (UUID recomendado).' },
      ]);
    }
    const norm = normalizarSolicitudReserva(cuerpo, hoyEnEcuador());
    if (!norm.ok) {
      const titulos = { INVALID_PAYLOAD: 'Petición inválida', INVALID_DATES: 'Fechas inválidas', DRIVER_UNDERAGE: 'Conductor menor de 18 años' } as const;
      throw new ProblemaV3Exception(422, norm.codigo, titulos[norm.codigo], norm.errores.map((e) => `${e.name}: ${e.reason}`).join(' '), norm.errores);
    }
    const sol = norm.valor;
    return this.conIdempotencia('create', ctx, sol, async () => {
      const id = await this.crearTransaccion(sol, ctx);
      let orden = await this.reservas.findOneByOrFail({ id });

      // El conductor de Booking queda registrado como cliente (sin duplicarse) y ligado a la reserva.
      try {
        const cli = await this.clientes.asegurarCuenta({
          nombre: sol.conductor.full_name,
          email: sol.conductor.email,
          identificacion: sol.conductor.identificacion,
          telefono: sol.conductor.phone,
          licencia: sol.conductor.license_number,
        });
        if (cli) {
          await this.reservas.update(id, { cuentaId: cli.cuentaId });
          orden = await this.reservas.findOneByOrFail({ id });
        }
      } catch (e) {
        this.logger.warn(`No se pudo ligar el cliente a la reserva ${orden.codigo}: ${(e as Error).message}`);
      }

      // Booking debe ver 0 unidades en el turno de retiro; el evento queda en el outbox.
      this.sync.empujarEnSegundoPlano(orden.vehiculoId, orden.fechaRecogida, orden.horaRecogida, false, 'orden-confirmada');
      await this.eventos
        .emitir(
          'order.confirmed',
          { order_id: orden.codigo, pnr: orden.codigo, auto_id: idPublico(orden.vehiculoId), total_price: orden.total, nuevo_estado_auto: 'RESERVADO' },
          ctx.correlationId,
        )
        .catch((e) => this.logger.warn(`Evento order.confirmed no registrado: ${(e as Error).message}`));
      this.registro.registrar('info', 'orden.creada', {
        correlation_id: ctx.correlationId,
        idempotency_key: ctx.idempotencyKey,
        pnr: orden.codigo,
        auto_id: idPublico(orden.vehiculoId),
        total: orden.total,
      });
      return { status: 201, body: this.respuestaOrden(orden) };
    });
  }

  private async crearTransaccion(sol: SolicitudReserva, ctx: Ctx): Promise<number> {
    return this.dataSource.transaction(async (m) => {
      const v = await m.findOne(Vehiculo, { where: { id: sol.vehiculoId }, lock: { mode: 'pessimistic_write' }, loadEagerRelations: false });
      if (!v) throw new ProblemaV3Exception(404, 'NOT_FOUND', 'Vehículo no encontrado', `El vehículo ${idPublico(sol.vehiculoId)} no existe.`);

      // Mantenimiento no tiene fecha de fin: bloquea todo. La limpieza (2 h tras una devolución) solo bloquea recogidas anteriores a su fin.
      if (v.estadoOperativo === 'EN_MANTENIMIENTO') {
        throw new ProblemaV3Exception(409, 'VEHICLE_UNAVAILABLE', 'Vehículo No Disponible', `El vehículo ${idPublico(v.id)} se encuentra en mantenimiento.`);
      }

      // Disponibilidad por intervalos: alquileres confirmados + limpieza en curso, con 2 h de limpieza entre alquileres.
      const activas = await m.find(Reserva, { where: { vehiculoId: v.id, estado: 'CONFIRMADA' }, loadEagerRelations: false });
      const pedida = { fechaRecogida: sol.recogida, horaRecogida: sol.horaRecogida, fechaDevolucion: sol.devolucion, horaDevolucion: sol.horaDevolucion };
      const limpieza = ventanaLimpieza(v);
      const ocupado = ocupaciones(v, activas);
      if (hayConflicto(ocupado, pedida)) {
        const libreDesde = disponibleDesde(ocupado, pedida);
        const porLimpieza = !!limpieza && hayConflicto([limpieza], pedida) && !hayConflicto(ventanasDeReservas(activas), pedida);
        if (porLimpieza) {
          throw new ProblemaV3Exception(
            409,
            'VEHICLE_IN_CLEANING_COOLDOWN',
            'Vehículo en Cooldown de Limpieza Obligatorio (2 Horas)',
            `El vehículo ${idPublico(v.id)} se encuentra en ciclo de limpieza e higienización obligatoria (${COOLDOWN_MINUTOS} minutos). Estará disponible nuevamente a las ${v.disponibleDesde?.toISOString()}.`,
            undefined,
            { disponible_desde: v.disponibleDesde?.toISOString() ?? null, alternativas: alternativas(ocupado, pedida, hoyEnEcuador()) },
          );
        }
        throw new ProblemaV3Exception(
          409,
          'VEHICLE_UNAVAILABLE',
          'Vehículo No Disponible',
          `El vehículo ${idPublico(v.id)} no está disponible del ${sol.recogida} al ${sol.devolucion} (incluye las 2 horas de limpieza entre alquileres).`,
          undefined,
          { disponible_desde: libreDesde, alternativas: alternativas(ocupado, pedida, hoyEnEcuador()) },
        );
      }

      const sucursales = await m.find(Sucursal);
      const destino = resolverSucursales(sol.lugarDevolucion, sucursales)?.[0] ?? v.sucursalId;
      const dias = diasEntre(sol.recogida, sol.devolucion);
      const tarifa = calcularTarifa(v.precioPorDia, dias, sol.cobertura, sol.conductor.age);

      let pnr = generarPnr();
      for (let intento = 0; intento < 5 && (await m.existsBy(Reserva, { codigo: pnr })); intento++) pnr = generarPnr();

      const nueva = m.create(Reserva, {
        codigo: pnr,
        vehiculoId: v.id,
        sucursalRecogidaId: v.sucursalId,
        sucursalDevolucionId: destino,
        fechaRecogida: sol.recogida,
        horaRecogida: sol.horaRecogida,
        fechaDevolucion: sol.devolucion,
        horaDevolucion: sol.horaDevolucion,
        nombreCliente: sol.conductor.full_name,
        email: sol.conductor.email,
        telefono: sol.conductor.phone,
        dias,
        total: tarifa.total,
        estado: 'CONFIRMADA',
        cuentaId: null,
        pagoReferencia: null,
        tarjetaUltimos4: null,
        origen: 'BOOKING',
        cobertura: sol.cobertura,
        depositoGarantia: COBERTURAS[sol.cobertura].deposito,
        conductor: { ...sol.conductor },
        desglose: tarifa,
      });
      const guardada = await m.save(nueva);
      this.registro.registrar('info', 'orden.reservada', { correlation_id: ctx.correlationId, pnr });
      return guardada.id;
    });
  }

  // ── Cancelar (compensación Saga) ──────────────────────────────────────

  async cancelar(idOPnr: string, cuerpo: unknown, ctx: Ctx): Promise<Salida> {
    const b = dic(cuerpo);
    return this.conIdempotencia('cancel', ctx, { idOPnr: idOPnr.toUpperCase(), motivo: b.reason ?? b.motivo ?? null, solicitante: b.solicitante ?? null }, async () => {
      const r = await this.buscarOrden(idOPnr);

      if (r.estado === 'COMPLETADA' || (r.entregadaEn && !r.devueltaEn)) {
        throw new ProblemaV3Exception(409, 'CANCELLATION_NOT_ALLOWED', 'Cancelación No Permitida', DETALLE_NO_CANCELABLE);
      }

      // Plazo de 24 h: aplica al autoservicio del cliente. La compensación de la Saga (SAGA_ORCHESTRATOR) y el administrador del mostrador no se bloquean.
      const solicitante = typeof b.solicitante === 'string' ? b.solicitante.trim().toUpperCase() : 'CLIENTE';
      const exento = solicitante === 'SAGA_ORCHESTRATOR' || solicitante === 'ADMIN';
      if (r.estado !== 'CANCELADA' && !exento && minutosParaRecogida(r.fechaRecogida, r.horaRecogida) < PLAZO_CANCELACION_MIN) {
        throw new ProblemaV3Exception(409, 'CANCELLATION_NOT_ALLOWED', 'Cancelación Fuera de Plazo', DETALLE_FUERA_DE_PLAZO);
      }

      if (r.estado !== 'CANCELADA') {
        const reembolso = crearReembolso(r.total);
        await this.reservas.update(r.id, { estado: 'CANCELADA', reembolso });
        this.sync.empujarEnSegundoPlano(r.vehiculoId, r.fechaRecogida, r.horaRecogida, true, 'orden-cancelada');
        await this.eventos
          .emitir(
            'order.cancelled',
            { order_id: r.codigo, pnr: r.codigo, auto_id: idPublico(r.vehiculoId), refund_id: reembolso.refund_id, refund_amount: reembolso.amount, estado_restituido: 'DISPONIBLE' },
            ctx.correlationId,
          )
          .catch((e) => this.logger.warn(`Evento order.cancelled no registrado: ${(e as Error).message}`));
        this.registro.registrar('info', 'orden.cancelada', {
          correlation_id: ctx.correlationId,
          idempotency_key: ctx.idempotencyKey,
          pnr: r.codigo,
          solicitante: b.solicitante ?? 'CLIENTE',
          motivo: b.reason ?? b.motivo,
        });
      }

      const actual = await this.reservas.findOneByOrFail({ id: r.id });
      const reembolso = actual.reembolso as Dic | null;
      return {
        status: 200,
        body: {
          order_id: actual.codigo,
          pnr: actual.codigo,
          status: 'CANCELLED',
          auto_id: idPublico(actual.vehiculoId),
          refund: reembolso ? { ...reembolso, message: reembolso.message ?? MENSAJE_REEMBOLSO } : reembolso,
          inventory_restoration: { status: 'RESTORED', vehicle_id: idPublico(actual.vehiculoId), new_state: 'DISPONIBLE', message: MENSAJE_INVENTARIO },
          message: 'Orden de renta cancelada exitosamente. Vehículo liberado y reembolso procesado.',
        },
      };
    });
  }

  // ── Check-in digital, entrega y devolución ────────────────────────────

  async checkinDigital(idOPnr: string, cuerpo: unknown, ctx: Ctx): Promise<Salida> {
    const b = dic(cuerpo);
    const documento = typeof b.documento_identidad === 'string' ? b.documento_identidad.trim() : '';
    if (!documento) {
      throw new ProblemaV3Exception(400, 'MALFORMED_REQUEST', 'Check-in inválido', 'documento_identidad es obligatorio.', [{ name: 'documento_identidad', reason: 'Obligatorio.' }]);
    }
    return this.conIdempotencia('checkin', ctx, { idOPnr: idOPnr.toUpperCase(), documento }, async () => {
      const r = await this.buscarOrden(idOPnr);
      if (r.estado !== 'CONFIRMADA') throw new ProblemaV3Exception(409, 'ORDER_STATE_CONFLICT', 'Orden no activa', `La orden está en estado ${this.estadoContrato(r)}.`);
      if (!r.checkinEn) await this.reservas.update(r.id, { checkinEn: new Date() });
      this.registro.registrar('info', 'orden.checkin-digital', { correlation_id: ctx.correlationId, idempotency_key: ctx.idempotencyKey, pnr: r.codigo });
      return {
        status: 200,
        body: {
          reserva_id: r.codigo,
          pnr: r.codigo,
          checkin_status: 'CHECKIN_COMPLETED',
          fast_track_pickup: true,
          mensaje: 'Check-in digital exitoso. Presenta tu código QR en el mostrador para retiro express.',
          voucher_qr_data: `AUTOS-CHECKIN-${r.codigo}-VERIFIED-${documento}`,
          requisitos: ['Licencia de conducir física vigente', 'Documento de identidad original'],
        },
      };
    });
  }

  private enteroNoNegativo(valor: unknown, campo: string, errores: ErrorCampo[]): number | undefined {
    if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < 0) {
      errores.push({ name: campo, reason: 'Entero >= 0 obligatorio.' });
      return undefined;
    }
    return valor;
  }

  async entregar(idOPnr: string, cuerpo: unknown, ctx: Ctx): Promise<Salida> {
    const b = dic(cuerpo);
    const errores: ErrorCampo[] = [];
    const licencia = typeof b.licencia_conducir === 'string' ? b.licencia_conducir.trim() : '';
    if (!licencia) errores.push({ name: 'licencia_conducir', reason: 'Obligatorio.' });
    const km = this.enteroNoNegativo(b.km_salida, 'km_salida', errores);
    if (errores.length > 0) throw new ProblemaV3Exception(400, 'MALFORMED_REQUEST', 'Check-in de entrega inválido', 'Revise los campos indicados.', errores);

    return this.conIdempotencia('entrega', ctx, { idOPnr: idOPnr.toUpperCase(), licencia, km }, async () => {
      const r = await this.buscarOrden(idOPnr);
      if (r.estado !== 'CONFIRMADA') throw new ProblemaV3Exception(409, 'ORDER_STATE_CONFLICT', 'Orden no activa', `La orden está en estado ${this.estadoContrato(r)}.`);
      if (r.entregadaEn) throw new ProblemaV3Exception(409, 'ORDER_STATE_CONFLICT', 'Orden ya entregada', 'Las llaves de esta orden ya fueron entregadas.');

      await this.reservas.update(r.id, { entregadaEn: new Date(), kmSalida: km as number });
      await this.vehiculos.update(r.vehiculoId, { kilometrajeActual: km as number });
      this.registro.registrar('info', 'orden.entregada', { correlation_id: ctx.correlationId, idempotency_key: ctx.idempotencyKey, pnr: r.codigo, km_salida: km });
      return {
        status: 200,
        body: {
          success: true,
          order_id: r.codigo,
          pnr: r.codigo,
          estado_orden: 'ENTREGADO',
          km_salida: km,
          licencia_verificada: licencia,
          mensaje: 'Llaves entregadas al conductor. Auto en tránsito (Fase ENTREGADO).',
        },
      };
    });
  }

  /**
   * Entrega confirmada por el administrador en el mostrador (panel web): registra el check-in de entrega y, si la orden
   * vino de Booking, le notifica POST {BOOKING_BASE_URL}/reservas/{codigo}/checkin con estado CONFIRMADO_ASISTIDO.
   */
  async entregarEnMostrador(idOPnr: string, cuerpo: unknown, adminId: string): Promise<Salida> {
    const ctx: Ctx = { correlationId: generarCorrelationId() };
    // El operador confirma (o completa) la cédula del cliente antes de entregar las llaves.
    const cedula = typeof dic(cuerpo).identificacion === 'string' ? (dic(cuerpo).identificacion as string).trim() : '';
    if (cedula && !/^[A-Za-z0-9-]{5,20}$/.test(cedula)) {
      throw new ProblemaV3Exception(400, 'MALFORMED_REQUEST', 'Cédula inválida', 'La cédula o identificación debe tener de 5 a 20 letras, números o guiones.', [
        { name: 'identificacion', reason: 'Entre 5 y 20 letras, números o guiones.' },
      ]);
    }
    const salida = await this.entregar(idOPnr, cuerpo, ctx);
    if (cedula) {
      const previa = await this.buscarOrden(idOPnr);
      await this.reservas.update(previa.id, {
        conductor: { ...(previa.conductor ?? { full_name: previa.nombreCliente, email: previa.email, phone: previa.telefono }), identificacion: cedula },
      });
      await this.clientes
        .asegurarCuenta({ nombre: previa.nombreCliente, email: previa.email, identificacion: cedula, telefono: previa.telefono })
        .catch((e) => this.logger.warn(`No se pudo completar la cédula del cliente: ${(e as Error).message}`));
      this.registro.registrar('info', 'cliente.cedula-confirmada', { correlation_id: ctx.correlationId, pnr: previa.codigo, admin_id: adminId });
    }
    const r = await this.buscarOrden(idOPnr);
    const notificacion =
      r.origen === 'BOOKING'
        ? await this.notificarCheckin(r, dic(cuerpo), adminId, ctx)
        : { enviada: false, detalle: 'Reserva propia del marketplace: Booking no la conoce, no se notifica.' };
    return { ...salida, body: { ...dic(salida.body), notificacion_booking: notificacion } };
  }

  /** Cancelación hecha por el administrador desde el panel (solo antes de entregar las llaves): libera el auto y repone el stock. */
  async cancelarEnMostrador(idOPnr: string, motivo?: string): Promise<Salida> {
    return this.cancelar(idOPnr, { reason: motivo || 'Cancelada por el administrador', solicitante: 'ADMIN' }, { correlationId: generarCorrelationId() });
  }

  /**
   * El administrador confirma que el auto ya está limpio y lo deja DISPONIBLE sin esperar el fin de las 2 h
   * (mismo cambio que PATCH /autos/{id}/estado del contrato): se repone el stock en Booking y vuelve a aparecer en las búsquedas.
   */
  async liberarAutoEnMostrador(idOPnr: string) {
    const r = await this.buscarOrden(idOPnr);
    const v = await this.vehiculos.findOneByOrFail({ id: r.vehiculoId });
    if (!ventanaLimpieza(v)) {
      throw new ProblemaV3Exception(409, 'ORDER_STATE_CONFLICT', 'El auto no está en limpieza', `El vehículo ${idPublico(v.id)} ya está disponible o no está en ciclo de limpieza.`);
    }
    const res = await this.flota.cambiarEstado(idPublico(v.id), 'DISPONIBLE');
    this.registro.registrar('info', 'flota.liberado-manual', { pnr: r.codigo, auto_id: idPublico(v.id) });
    return { ...res, mensaje: `Vehículo ${idPublico(v.id)} disponible. Stock repuesto en Booking.` };
  }

  /** Deja un auto DISPONIBLE desde la lista de vehículos (fin anticipado de limpieza o salida de mantenimiento). */
  async liberarVehiculo(vehiculoId: number) {
    const v = await this.vehiculos.findOneBy({ id: vehiculoId });
    if (!v) throw new ProblemaV3Exception(404, 'NOT_FOUND', 'Vehículo no encontrado', `El vehículo ${idPublico(vehiculoId)} no existe.`);
    if (v.estadoOperativo === 'DISPONIBLE') {
      throw new ProblemaV3Exception(409, 'ORDER_STATE_CONFLICT', 'El auto ya está disponible', `El vehículo ${idPublico(v.id)} ya está disponible.`);
    }
    const res = await this.flota.cambiarEstado(idPublico(v.id), 'DISPONIBLE');
    this.registro.registrar('info', 'flota.liberado-manual', { auto_id: idPublico(v.id), desde: v.estadoOperativo });
    return { ...res, mensaje: `Vehículo ${idPublico(v.id)} disponible. Stock repuesto en Booking.` };
  }

  /**
   * Reenvía a Booking el último aviso de la reserva (entrega o devolución) por POST /reservas/{codigo}/checkin. Sirve cuando Booking
   * no lo vio o cuando cambió algún dato (p. ej. el client_id tras unificar clientes). Es idempotente del lado de Booking.
   */
  async reenviarAvisoABooking(idOPnr: string, adminId = 'operador-mostrador'): Promise<Dic> {
    const r = await this.buscarOrden(idOPnr);
    if (r.origen !== 'BOOKING') {
      throw new ProblemaV3Exception(409, 'ORDER_STATE_CONFLICT', 'Reserva propia', 'Esta reserva no vino de Booking: no hay nada que reenviar.');
    }
    const tipo = r.devueltaEn ? 'DEVOLUCION' : r.entregadaEn ? 'ENTREGA' : null;
    if (!tipo) {
      throw new ProblemaV3Exception(409, 'ORDER_STATE_CONFLICT', 'Aún sin entrega', 'Primero hay que confirmar la entrega de llaves; después se puede avisar a Booking.');
    }
    const notificacion = await this.notificarCheckin(r, {}, adminId, { correlationId: generarCorrelationId() }, tipo);
    return { codigo: r.codigo, tipo, notificacion_booking: notificacion };
  }

  /** Devolución registrada por el administrador en el mostrador: cierra la orden e inicia la limpieza de 2 h. */
  async devolverEnMostrador(idOPnr: string, cuerpo: unknown, adminId = 'operador-mostrador'): Promise<Salida> {
    const ctx: Ctx = { correlationId: generarCorrelationId() };
    const salida = await this.devolver(idOPnr, cuerpo, ctx);
    const r = await this.buscarOrden(idOPnr);
    const notificacion =
      r.origen === 'BOOKING'
        ? await this.notificarCheckin(r, dic(cuerpo), adminId, ctx, 'DEVOLUCION')
        : { enviada: false, detalle: 'Reserva propia del marketplace: Booking no la conoce, no se notifica.' };
    return { ...salida, body: { ...dic(salida.body), notificacion_booking: notificacion } };
  }

  /**
   * POST JSON a Booking con X-API-Key y X-Correlation-Id. Plazo amplio (Booking en Azure puede tardar 30 s o más en frío) y un reintento
   * solo ante un 5xx o un fallo de red inmediato. Tras un timeout NO se reintenta: Booking suele haber recibido y estar procesando el aviso,
   * y repetirlo solo alarga la espera; el estado real se comprueba después con leerEstadoBooking.
   */
  private async postBooking(url: string, cuerpo: Dic, ctx: Ctx): Promise<{ ok: boolean; status?: number; json?: Dic | null; error?: string }> {
    const clave = process.env.BOOKING_API_KEY;
    let res: Response | undefined;
    let falloRed: Error | undefined;
    for (let intento = 0; intento < 2; intento++) {
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Correlation-Id': ctx.correlationId, ...(clave ? { 'X-API-Key': clave } : {}) },
          body: JSON.stringify(cuerpo),
          signal: AbortSignal.timeout(PLAZO_AVISO_BOOKING_MS),
        });
        falloRed = undefined;
        if (res.status < 500) break;
      } catch (e) {
        falloRed = e as Error;
        if ((e as Error).name === 'TimeoutError' || /timeout/i.test((e as Error).message)) break;
      }
      await new Promise((r2) => setTimeout(r2, 1500));
    }
    if (!res) return { ok: false, error: falloRed?.message ?? 'sin respuesta' };
    const json = (await res.json().catch(() => null)) as Dic | null;
    return { ok: res.ok, status: res.status, json };
  }

  /** Lo que Booking tiene registrado de la reserva (estado y vertical), para comprobar que quedó como AUTOS. */
  private async leerEstadoBooking(base: string, codigo: string, plazoMs = 10_000): Promise<Dic | null> {
    try {
      const clave = process.env.BOOKING_API_KEY;
      const res = await fetch(`${base}/reservas/${encodeURIComponent(codigo)}/estado`, { headers: clave ? { 'X-API-Key': clave } : {}, signal: AbortSignal.timeout(plazoMs) });
      if (!res.ok) return null;
      const d = (await res.json()) as Dic;
      return { estado: d.estado ?? d.status, vertical: d.vertical };
    } catch {
      return null;
    }
  }

  /**
   * Avisa a Booking, en este orden:
   *  1) POST /reservas/{codigo}/checkin (contrato v3.1): estado CONFIRMADO_ASISTIDO con cédula, client_id, km, etc.
   *  2) POST /autos/orders/{codigo}/checkin-entrega o checkin-devolucion (contrato autos v3, rutas que Booking ahora acepta): hace que
   *     Booking la registre en la vertical AUTOS. Va después porque Booking conserva la vertical del último aviso.
   * Al final lee el estado que Booking quedó con la reserva. Booking solo define RESERVADO y CONFIRMADO_ASISTIDO para socios, así que
   * entrega y devolución se distinguen con `tipo` (ENTREGA | DEVOLUCION).
   */
  private async notificarCheckin(r: Reserva, b: Dic, adminId: string, ctx: Ctx, tipo: 'ENTREGA' | 'DEVOLUCION' = 'ENTREGA'): Promise<Dic> {
    const base = (process.env.BOOKING_BASE_URL ?? 'https://booking-core-api.azurewebsites.net/api/v3').replace(/\/+$/, '');
    const codigo = encodeURIComponent(r.codigo);
    const texto = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
    try {
      const conductor = r.conductor ?? {};
      const cedula = texto(conductor.identificacion);
      const clientId = await this.clientes.asegurar({
        nombre: texto(conductor.full_name) ?? r.nombreCliente,
        email: texto(conductor.email) ?? r.email,
        identificacion: cedula,
        telefono: texto(conductor.phone),
        licencia: texto(conductor.license_number),
      });
      const esDevolucion = tipo === 'DEVOLUCION';
      const recorridos = esDevolucion && r.kmRetorno !== null && r.kmSalida !== null ? r.kmRetorno - r.kmSalida : undefined;
      const nivel = typeof b.nivel_combustible === 'number' ? b.nivel_combustible : undefined;
      const observaciones = esDevolucion
        ? (texto(b.observaciones) ?? `Vehículo devuelto en mostrador. Recorrió ${recorridos ?? 0} km. Limpieza de ${COOLDOWN_MINUTOS / 60} h iniciada.`)
        : (texto(b.observaciones) ?? 'Vehículo entregado físicamente con contrato y licencia validada');
      const cuerpo: Dic = {
        external_order_id: r.codigo,
        order_id: r.codigo,
        pnr: r.codigo,
        reservation_code: r.codigo,
        // Alias documentados en CheckinNotificationDto de Booking: su búsqueda de la reserva puede usar cualquiera de ellos.
        codigo_reserva: r.codigo,
        localizador: r.codigo,
        reserva_id: r.codigo,
        reservation_id: r.codigo,
        id: r.codigo,
        client_id: clientId,
        ...(cedula ? { document_id: cedula, cedula, identificacion: cedula } : {}),
        estado: 'CONFIRMADO_ASISTIDO',
        admin_id: adminId,
        fecha_checkin: ((esDevolucion ? r.devueltaEn : r.entregadaEn) ?? new Date()).toISOString(),
        observaciones,
        km_salida: r.kmSalida ?? undefined,
        ...(nivel !== undefined ? { fuel_level: nivel } : {}),
        proveedor: 'AutoSpot',
        modulo: 'AUTOS',
        tipo,
      };
      const principal = await this.postBooking(`${base}/reservas/${codigo}/checkin`, cuerpo, ctx);
      this.registro.registrar(principal.ok ? 'info' : 'warn', 'booking.checkin', { correlation_id: ctx.correlationId, pnr: r.codigo, tipo, status: principal.status, error: principal.error });

      // Ruta de autos del contrato (CheckinEntregaRequestV2 / CheckinDevolucionRequestV2).
      const licencia = texto(conductor.license_number) ?? cedula;
      const cuerpoAutos: Dic | null = esDevolucion
        ? { km_retorno: r.kmRetorno ?? 0, ...(nivel !== undefined ? { nivel_combustible: nivel } : {}), observaciones }
        : licencia
          ? { licencia_conducir: licencia, km_salida: r.kmSalida ?? 0, tecnico_entrega: adminId }
          : null;
      let autos: Dic = { enviada: false, detalle: 'Sin licencia del conductor: no se puede avisar por la ruta de autos.' };
      if (cuerpoAutos) {
        const ruta = esDevolucion ? 'checkin-devolucion' : 'checkin-entrega';
        const a = await this.postBooking(`${base}/autos/orders/${codigo}/${ruta}`, cuerpoAutos, ctx);
        autos = a.ok
          ? { enviada: true, status: a.status, respuesta: a.json }
          : { enviada: false, status: a.status, detalle: a.error ?? `Booking respondió HTTP ${a.status}${typeof a.json?.detail === 'string' ? `: ${a.json.detail}` : ''}.`, respuesta: a.json };
        this.registro.registrar(a.ok ? 'info' : 'warn', 'booking.checkin-autos', { correlation_id: ctx.correlationId, pnr: r.codigo, tipo, ruta, status: a.status, error: a.error });
      }

      const enviada = principal.ok || autos.enviada === true;
      // Si la ruta principal falló, el aviso queda en cola para reintentarse solo (si se resuelve antes, p. ej. con "Reenviar", se retira).
      if (principal.ok) this.avisosPendientes.delete(r.codigo);
      else this.avisosPendientes.set(r.codigo, { reservaId: r.id, tipo, intentos: this.avisosPendientes.get(r.codigo)?.intentos ?? 0 });
      const estadoBooking = await this.leerEstadoBooking(base, r.codigo, enviada ? 10_000 : PLAZO_VERIFICACION_BOOKING_MS);

      // Booking respondió tarde (timeout) pero ya había registrado la entrega: se comprueba lo que tiene guardado antes de dar el aviso por perdido.
      // Solo vale para la entrega: tras la devolución el estado sigue siendo CONFIRMADO_ASISTIDO y no prueba que procesó el aviso.
      if (!enviada && !esDevolucion && estadoBooking?.estado === 'CONFIRMADO_ASISTIDO') {
        this.registro.registrar('info', 'booking.checkin-verificado', { correlation_id: ctx.correlationId, pnr: r.codigo, tipo, vertical: estadoBooking.vertical });
        return {
          enviada: true,
          principal_ok: false,
          tipo,
          verificada_por_lectura: true,
          detalle: 'Booking tardó en responder, pero su estado ya es CONFIRMADO_ASISTIDO: recibió el aviso de entrega.',
          respuesta: { acknowledged: true, status: 'CONFIRMADO_ASISTIDO', vertical: estadoBooking.vertical },
          autos,
          estado_booking: estadoBooking,
        };
      }
      return enviada
        ? { enviada: true, principal_ok: principal.ok, tipo, status: principal.status, respuesta: principal.json ?? (autos.respuesta as Dic | null), autos, estado_booking: estadoBooking }
        : { enviada: false, tipo, status: principal.status, detalle: principal.error ? `No se pudo contactar a Booking: ${principal.error}` : `Booking respondió HTTP ${principal.status}.`, respuesta: principal.json, autos };
    } catch (e) {
      this.registro.registrar('warn', 'booking.checkin', { correlation_id: ctx.correlationId, pnr: r.codigo, tipo, error: (e as Error).message });
      return { enviada: false, tipo, detalle: `No se pudo contactar a Booking: ${(e as Error).message}` };
    }
  }

  async devolver(idOPnr: string, cuerpo: unknown, ctx: Ctx): Promise<Salida> {
    const b = dic(cuerpo);
    const errores: ErrorCampo[] = [];
    const km = this.enteroNoNegativo(b.km_retorno, 'km_retorno', errores);
    const combustible = b.nivel_combustible;
    if (combustible !== undefined && (typeof combustible !== 'number' || !Number.isInteger(combustible) || combustible < 0 || combustible > 100)) {
      errores.push({ name: 'nivel_combustible', reason: 'Entero entre 0 y 100.' });
    }
    if (errores.length > 0) throw new ProblemaV3Exception(400, 'MALFORMED_REQUEST', 'Check-in de devolución inválido', 'Revise los campos indicados.', errores);

    return this.conIdempotencia('devolucion', ctx, { idOPnr: idOPnr.toUpperCase(), km, combustible: combustible ?? null }, async () => {
      const r = await this.buscarOrden(idOPnr);
      if (r.estado === 'COMPLETADA') throw new ProblemaV3Exception(409, 'ORDER_STATE_CONFLICT', 'Orden ya devuelta', 'El vehículo de esta orden ya fue devuelto.');
      if (r.estado !== 'CONFIRMADA' || !r.entregadaEn) {
        throw new ProblemaV3Exception(409, 'ORDER_STATE_CONFLICT', 'Orden no entregada', 'Debe registrarse primero el check-in de entrega.');
      }
      const salida = r.kmSalida ?? 0;
      if ((km as number) < salida) {
        throw new ProblemaV3Exception(400, 'MALFORMED_REQUEST', 'Odómetro inválido', `km_retorno (${km}) no puede ser menor que km_salida (${salida}).`, [
          { name: 'km_retorno', reason: `Debe ser >= ${salida}.` },
        ]);
      }

      await this.reservas.update(r.id, { devueltaEn: new Date(), kmRetorno: km as number, estado: 'COMPLETADA' });
      const v = await this.vehiculos.findOneByOrFail({ id: r.vehiculoId });
      await this.vehiculos.update(v.id, { kilometrajeActual: km as number });
      const hasta = await this.flota.iniciarCooldown(v, ctx.correlationId);

      const alerta = (km as number) >= v.proximoMantenimientoKm;
      if (alerta) {
        await this.eventos
          .emitir('mantenimiento.alerta', { auto_id: idPublico(v.id), kilometraje_actual: km, proximo_mantenimiento_km: v.proximoMantenimientoKm, severidad: 'WARNING' }, ctx.correlationId)
          .catch(() => undefined);
        this.registro.registrar('warn', 'mantenimiento.alerta', {
          correlation_id: ctx.correlationId,
          auto_id: idPublico(v.id),
          kilometraje_actual: km,
          proximo_mantenimiento_km: v.proximoMantenimientoKm,
        });
      }
      this.registro.registrar('info', 'orden.devuelta', { correlation_id: ctx.correlationId, idempotency_key: ctx.idempotencyKey, pnr: r.codigo, km_retorno: km, km_recorridos: (km as number) - salida });
      return {
        status: 200,
        body: {
          success: true,
          order_id: r.codigo,
          pnr: r.codigo,
          estado_orden: 'COMPLETADA',
          km_retorno: km,
          km_recorridos: (km as number) - salida,
          cooldown: {
            auto_id: idPublico(v.id),
            vehiculo: `${v.marca} ${v.modelo}`,
            estado: 'EN_LIMPIEZA',
            cooldown_horas: COOLDOWN_MINUTOS / 60,
            disponible_desde: iso(hasta),
            mensaje: 'Vehículo en ciclo de limpieza y desinfección. Estará disponible en 2 horas.',
          },
          alerta_mantenimiento: alerta
            ? `ALERTA PREVENTIVA: El vehículo ha superado el límite de ${v.proximoMantenimientoKm} km. Mantenimiento requerido.`
            : 'Kilometraje en rango normal.',
        },
      };
    });
  }
}
