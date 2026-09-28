import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { randomInt, randomUUID } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { ProblemDetailsException } from '../common/problem-details.exception.js';
import { calcularDias } from '../reservas/reservas.util.js';
import { Vehiculo } from '../vehiculos/vehiculo.entity.js';
import { GdsHold } from './entities/gds-hold.entity.js';
import { GdsOrder } from './entities/gds-order.entity.js';
import { GdsPreview } from './entities/gds-preview.entity.js';
import { OrderCreateRequestDto, OrderDetailDto, OrderHoldRequestDto, OrderHoldResponseDto, OrderModifyRequestDto, OrderPreviewRequestDto, OrderPreviewResponseDto } from './dto/orders.dto.js';
import { WebhooksService } from './webhooks.service.js';
import { leerSearchToken, soloFecha } from './search-token.js';

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DURACION_HOLD_MS = 10 * 60 * 1000;
const PRECIO_EXTRAS: Record<string, number> = { CHILD_SEAT: 5, GPS: 3, ADDITIONAL_DRIVER: 7, WIFI: 4 };
const precioExtraPorDia = (nombre: string): number => PRECIO_EXTRAS[nombre.toUpperCase()] ?? 8;

function generarLocalizador(): string {
  let sufijo = '';
  for (let i = 0; i < 6; i++) sufijo += ALFABETO[randomInt(ALFABETO.length)];
  return `AUTO-${sufijo}`;
}

function calcularPrecio(precioPorDia: number, dias: number, extras: string[]): { base_price: number; extras_price: number; taxes: number; total: number } {
  const base_price = Math.round(precioPorDia * dias * 100) / 100;
  const extras_price = Math.round(extras.reduce((suma, e) => suma + precioExtraPorDia(e) * dias, 0) * 100) / 100;
  const total = Math.round((base_price + extras_price) * 100) / 100;
  return { base_price, extras_price, taxes: 0, total };
}

@Injectable()
export class OrdenesService {
  constructor(
    @InjectRepository(Vehiculo) private readonly vehiculos: Repository<Vehiculo>,
    @InjectRepository(GdsHold) private readonly holds: Repository<GdsHold>,
    @InjectRepository(GdsPreview) private readonly previews: Repository<GdsPreview>,
    @InjectRepository(GdsOrder) private readonly ordenes: Repository<GdsOrder>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly webhooks: WebhooksService,
  ) {}

  async crearHold(dto: OrderHoldRequestDto): Promise<OrderHoldResponseDto> {
    const carga = leerSearchToken(dto.search_token);
    const vehiculo = await this.buscarVehiculo(dto.vehicle_id);
    const desde = soloFecha(carga.route.pickup.datetime);
    const hasta = soloFecha(carga.route.dropoff.datetime);

    const disponible = await this.verificarDisponible(vehiculo.id, desde, hasta);
    if (!disponible) {
      throw new ProblemDetailsException(409, 'CAR_NO_LONGER_AVAILABLE', 'Vehículo no disponible', 'El vehículo ya no está disponible para esas fechas.');
    }

    const expiresAt = new Date(Date.now() + DURACION_HOLD_MS);
    const hold = await this.holds.save(
      this.holds.create({
        vehiculoId: vehiculo.id,
        searchToken: dto.search_token,
        driverAge: dto.driver?.age ?? null,
        fechaRecogida: desde,
        fechaDevolucion: hasta,
        expiresAt,
      }),
    );
    return { hold_id: hold.id, expires_at: expiresAt.toISOString(), status: 'HELD' };
  }

  async previsualizar(dto: OrderPreviewRequestDto): Promise<OrderPreviewResponseDto> {
    const carga = leerSearchToken(dto.search_token);
    const vehiculo = await this.buscarVehiculo(dto.vehicle_id);

    let hold: GdsHold | null = null;
    if (dto.hold_id) {
      hold = await this.holds.findOneBy({ id: dto.hold_id });
      if (!hold || hold.vehiculoId !== vehiculo.id || hold.expiresAt.getTime() < Date.now()) {
        throw new ProblemDetailsException(409, 'CAR_NO_LONGER_AVAILABLE', 'Hold inválido o expirado', 'El hold_id no corresponde a este vehículo o ya expiró.');
      }
    }

    const desde = soloFecha(carga.route.pickup.datetime);
    const hasta = soloFecha(carga.route.dropoff.datetime);
    const disponible = await this.verificarDisponible(vehiculo.id, desde, hasta, { excluirHoldId: hold?.id });
    if (!disponible) {
      throw new ProblemDetailsException(409, 'CAR_NO_LONGER_AVAILABLE', 'Vehículo no disponible', 'El vehículo ya no está disponible para esas fechas.');
    }

    const dias = calcularDias(desde, hasta);
    const extras = dto.extras ?? [];
    const desglose = calcularPrecio(vehiculo.precioPorDia, dias, extras);

    const preview = await this.previews.save(
      this.previews.create({
        vehiculoId: vehiculo.id,
        holdId: hold?.id ?? null,
        extras,
        fechaRecogida: desde,
        fechaDevolucion: hasta,
        ruta: carga.route,
        moneda: carga.currency,
        precioTotal: desglose.total,
        desglose,
        consumida: false,
      }),
    );

    return {
      request_id: randomUUID(),
      data: { order_preview_id: preview.id, total_price: desglose.total, currency: carga.currency, breakdown: desglose },
    };
  }

  async crearOrden(dto: OrderCreateRequestDto): Promise<OrderDetailDto> {
    const preview = await this.previews.findOneBy({ id: dto.order_preview_id });
    if (!preview || preview.consumida) {
      throw new ProblemDetailsException(400, 'VALIDATION_FAILED', 'order_preview_id inválido', 'El order_preview_id no existe o ya fue utilizado.');
    }

    const disponible = await this.verificarDisponible(preview.vehiculoId, preview.fechaRecogida, preview.fechaDevolucion, {
      excluirHoldId: preview.holdId ?? undefined,
    });
    if (!disponible) {
      throw new ProblemDetailsException(409, 'CAR_NO_LONGER_AVAILABLE', 'Vehículo no disponible', 'El vehículo ya no está disponible; realiza una nueva búsqueda.');
    }

    const vehiculo = await this.buscarVehiculo(String(preview.vehiculoId));
    preview.consumida = true;
    await this.previews.save(preview);

    const orden = await this.ordenes.save(
      this.ordenes.create({
        locator: generarLocalizador(),
        estado: 'CONFIRMED',
        vehiculoId: vehiculo.id,
        vehiculoSnapshot: {
          vehicle_id: String(vehiculo.id),
          marca: vehiculo.marca,
          modelo: vehiculo.modelo,
          anio: vehiculo.anio,
          categoria: vehiculo.categoria,
          transmision: vehiculo.transmision,
          pasajeros: vehiculo.pasajeros,
          maletas: vehiculo.maletas,
          puertas: vehiculo.puertas,
          combustible: vehiculo.combustible,
          precio_por_dia: vehiculo.precioPorDia,
        },
        fechaRecogida: preview.fechaRecogida,
        fechaDevolucion: preview.fechaDevolucion,
        ruta: preview.ruta,
        extras: preview.extras,
        precioTotal: preview.precioTotal,
        moneda: preview.moneda,
        driverDetails: dto.driver_details,
        paymentReference: dto.payment_reference,
      }),
    );

    void this.webhooks.disparar('CAR_ORDER_CONFIRMED', orden.id, { locator: orden.locator, total_price: orden.precioTotal, currency: orden.moneda });

    return this.aDetalle(orden);
  }

  async obtener(orderId: string): Promise<OrderDetailDto> {
    return this.aDetalle(await this.buscarOrden(orderId));
  }

  async modificar(orderId: string, dto: OrderModifyRequestDto): Promise<OrderDetailDto> {
    const orden = await this.buscarOrden(orderId);
    if (orden.estado === 'CANCELLED') {
      throw new ProblemDetailsException(409, 'CAR_NO_LONGER_AVAILABLE', 'Orden cancelada', 'No se puede modificar una orden que ya fue cancelada.');
    }

    let fechaRecogida = orden.fechaRecogida;
    let fechaDevolucion = orden.fechaDevolucion;
    let ruta = orden.ruta;

    if (dto.route) {
      const desde = soloFecha(dto.route.pickup.datetime);
      const hasta = soloFecha(dto.route.dropoff.datetime);
      if (hasta <= desde) {
        throw new ProblemDetailsException(400, 'VALIDATION_FAILED', 'Ruta inválida', 'route.dropoff.datetime debe ser posterior a route.pickup.datetime.');
      }
      const disponible = await this.verificarDisponible(orden.vehiculoId, desde, hasta, { excluirOrdenId: orden.id });
      if (!disponible) {
        throw new ProblemDetailsException(409, 'CAR_NO_LONGER_AVAILABLE', 'Vehículo no disponible', 'El vehículo no está disponible en las nuevas fechas.');
      }
      fechaRecogida = desde;
      fechaDevolucion = hasta;
      ruta = dto.route;
    }

    const extras = new Set(orden.extras.filter(Boolean));
    for (const extra of dto.extras_to_add ?? []) extras.add(extra);
    for (const extra of dto.extras_to_remove ?? []) extras.delete(extra);

    const vehiculo = await this.buscarVehiculo(String(orden.vehiculoId));
    const dias = calcularDias(fechaRecogida, fechaDevolucion);
    const desglose = calcularPrecio(vehiculo.precioPorDia, dias, [...extras]);

    orden.fechaRecogida = fechaRecogida;
    orden.fechaDevolucion = fechaDevolucion;
    orden.ruta = ruta;
    orden.extras = [...extras];
    orden.precioTotal = desglose.total;
    await this.ordenes.save(orden);

    return this.aDetalle(orden);
  }

  async cancelar(orderId: string): Promise<OrderDetailDto> {
    const orden = await this.buscarOrden(orderId);
    if (orden.estado === 'CANCELLED') {
      throw new ProblemDetailsException(409, 'CANCELLATION_NOT_ALLOWED', 'Orden ya cancelada', 'Esta orden ya había sido cancelada previamente.');
    }
    orden.estado = 'CANCELLED';
    await this.ordenes.save(orden);
    void this.webhooks.disparar('CAR_ORDER_CANCELLED', orden.id, { locator: orden.locator });
    return this.aDetalle(orden);
  }

  private async buscarVehiculo(vehicleId: string): Promise<Vehiculo> {
    const id = Number(vehicleId);
    const vehiculo = id > 0 ? await this.vehiculos.findOneBy({ id }) : null;
    if (!vehiculo) {
      throw new ProblemDetailsException(400, 'VALIDATION_FAILED', 'Vehículo inexistente', `vehicle_id "${vehicleId}" no existe.`);
    }
    return vehiculo;
  }

  private async buscarOrden(orderId: string): Promise<GdsOrder> {
    const orden = await this.ordenes.findOneBy({ id: orderId });
    if (!orden) throw new NotFoundException(`Orden ${orderId} no existe`);
    return orden;
  }

  private async verificarDisponible(
    vehiculoId: number,
    desde: string,
    hasta: string,
    opciones: { excluirHoldId?: string; excluirOrdenId?: string } = {},
  ): Promise<boolean> {
    const filas = await this.dataSource.query(
      `SELECT
         NOT EXISTS (
           SELECT 1 FROM reservas r
           WHERE r."vehiculoId" = $1 AND r.estado = 'CONFIRMADA' AND r."fechaRecogida" < $3 AND r."fechaDevolucion" > $2
         ) AS libre_reservas,
         NOT EXISTS (
           SELECT 1 FROM gds_orders o
           WHERE o."vehiculoId" = $1 AND o.estado IN ('CONFIRMED', 'PENDING')
             AND o."fechaRecogida" < $3 AND o."fechaDevolucion" > $2 AND o.id IS DISTINCT FROM $5
         ) AS libre_ordenes,
         NOT EXISTS (
           SELECT 1 FROM gds_holds h
           WHERE h."vehiculoId" = $1 AND h."expiresAt" > now()
             AND h."fechaRecogida" < $3 AND h."fechaDevolucion" > $2 AND h.id IS DISTINCT FROM $4
         ) AS libre_holds`,
      [vehiculoId, desde, hasta, opciones.excluirHoldId ?? null, opciones.excluirOrdenId ?? null],
    );
    const fila = filas[0] as { libre_reservas: boolean; libre_ordenes: boolean; libre_holds: boolean };
    return fila.libre_reservas && fila.libre_ordenes && fila.libre_holds;
  }

  private aDetalle(orden: GdsOrder): OrderDetailDto {
    const base = `/api/v1/orders/${orden.id}`;
    const _links: Record<string, string> = { self: base };
    if (orden.estado !== 'CANCELLED') {
      _links.modify = `${base}/modify`;
      _links.cancel = `${base}/cancel`;
    }
    return {
      order_id: orden.id,
      locator: orden.locator,
      status: orden.estado,
      vehicle_details: orden.vehiculoSnapshot as unknown as Record<string, unknown>,
      route_details: orden.ruta as unknown as Record<string, unknown>,
      total_price: orden.precioTotal,
      currency: orden.moneda,
      creation_date: orden.creadoEn.toISOString(),
      _links,
    };
  }
}
