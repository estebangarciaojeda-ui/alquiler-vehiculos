import { Injectable, Logger } from '@nestjs/common';
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
  generarPnr,
  hoyEnEcuador,
  idPublico,
  MONEDA,
  normalizarSolicitudReserva,
  resolverSucursales,
  type ErrorCampo,
  type SolicitudReserva,
} from './booking.util.js';
import { EventosService } from './eventos.service.js';
import { FlotaService } from './flota.service.js';
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

@Injectable()
export class OrdenesB2bService {
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
  ) {}

  // ── Idempotencia ──────────────────────────────────────────────────────

  /** Misma Idempotency-Key + misma petición => misma respuesta sin repetir efectos; distinta petición => 400. */
  private async conIdempotencia(operacion: string, ctx: Ctx, huella: unknown, fn: () => Promise<Salida>): Promise<Salida> {
    if (!ctx.idempotencyKey) return fn();
    const clave = `autos3:${operacion}:${ctx.idempotencyKey}`;
    const hash = createHash('sha256').update(JSON.stringify(huella)).digest('hex');
    const previa = await this.idem.findOneBy({ clave });
    if (previa) {
      const guardada = previa.respuesta as { hash: string; status: number; body: unknown };
      if (guardada.hash !== hash) {
        throw new ProblemaV3Exception(
          400,
          'IDEMPOTENCY_CONFLICT',
          'Conflicto de idempotencia',
          'La Idempotency-Key ya fue usada con una petición distinta.',
        );
      }
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

  async listar() {
    const filas = await this.reservas.find({ order: { creadaEn: 'DESC', id: 'DESC' }, take: 200 });
    return filas.map((r) => this.respuestaOrden(r));
  }

  // ── Crear ─────────────────────────────────────────────────────────────

  async crear(cuerpo: unknown, ctx: Ctx): Promise<Salida> {
    const norm = normalizarSolicitudReserva(cuerpo, hoyEnEcuador());
    if (!norm.ok) {
      const titulos = { INVALID_PAYLOAD: 'Petición inválida', INVALID_DATES: 'Fechas inválidas', DRIVER_UNDERAGE: 'Conductor menor de 18 años' } as const;
      throw new ProblemaV3Exception(422, norm.codigo, titulos[norm.codigo], norm.errores.map((e) => `${e.name}: ${e.reason}`).join(' '), norm.errores);
    }
    const sol = norm.valor;
    return this.conIdempotencia('create', ctx, sol, async () => {
      const id = await this.crearTransaccion(sol, ctx);
      const orden = await this.reservas.findOneByOrFail({ id });

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

      if (enLimpiezaActiva(v)) {
        throw new ProblemaV3Exception(
          409,
          'VEHICLE_IN_CLEANING_COOLDOWN',
          'Vehículo en Cooldown de Limpieza Obligatorio (2 Horas)',
          `El vehículo ${idPublico(v.id)} se encuentra en ciclo de limpieza e higienización obligatoria (${COOLDOWN_MINUTOS} minutos). Estará disponible nuevamente a las ${v.disponibleDesde?.toISOString()}.`,
        );
      }
      if (bloqueadoOperativamente(v)) {
        throw new ProblemaV3Exception(409, 'VEHICLE_UNAVAILABLE', 'Vehículo No Disponible', `El vehículo ${idPublico(v.id)} se encuentra en mantenimiento.`);
      }

      const solapadas = await m
        .getRepository(Reserva)
        .createQueryBuilder('r')
        .where('r.vehiculoId = :vid', { vid: v.id })
        .andWhere("r.estado = 'CONFIRMADA'")
        .andWhere('r.fechaRecogida < :hasta', { hasta: sol.devolucion })
        .andWhere('r.fechaDevolucion > :desde', { desde: sol.recogida })
        .getCount();
      if (solapadas > 0) {
        throw new ProblemaV3Exception(409, 'VEHICLE_UNAVAILABLE', 'Vehículo No Disponible', `El vehículo ${idPublico(v.id)} ya está reservado en esas fechas.`);
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
        throw new ProblemaV3Exception(409, 'CANCELLATION_NOT_ALLOWED', 'Cancelación no permitida', 'La orden ya fue entregada al cliente o completada.');
      }

      if (r.estado !== 'CANCELADA') {
        const reembolso = {
          refund_id: `REF-AUTO-${randomBytes(2).toString('hex').toUpperCase()}`,
          amount: r.total,
          currency: MONEDA,
          percentage: 100,
          status: 'PROCESSED',
        };
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
          refund: reembolso,
          inventory_restoration: { status: 'RESTORED', vehicle_id: idPublico(actual.vehiculoId), new_state: 'DISPONIBLE' },
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
