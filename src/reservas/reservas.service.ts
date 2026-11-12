import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { bloqueadoOperativamente, crearReembolso, DETALLE_NO_CANCELABLE, idPublico, MENSAJE_INVENTARIO } from '../integracion-booking/booking.util.js';
import { alternativas, disponibleDesde, hayConflicto } from '../integracion-booking/disponibilidad.util.js';
import { StockSyncService } from '../integracion-booking/stock-sync.service.js';
import { Cuenta } from '../cuentas/cuenta.entity.js';
import { PagosService } from '../pagos/pagos.service.js';
import { Sucursal } from '../sucursales/sucursal.entity.js';
import { Vehiculo } from '../vehiculos/vehiculo.entity.js';
import { CrearReservaDto } from './dto/crear-reserva.dto.js';
import { Reserva } from './reserva.entity.js';
import { calcularDias, generarCodigo, hoyEnEcuador } from './reservas.util.js';

@Injectable()
export class ReservasService {
  constructor(
    @InjectRepository(Reserva)
    private readonly repo: Repository<Reserva>,
    private readonly dataSource: DataSource,
    private readonly pagos: PagosService,
    private readonly stock: StockSyncService,
  ) {}

  listar(email?: string, codigo?: string): Promise<Reserva[]> {
    const where: Record<string, string> = {};
    if (email) where.email = email.trim().toLowerCase();
    if (codigo) where.codigo = codigo.trim().toUpperCase();
    return this.repo.find({ where, order: { creadaEn: 'DESC', id: 'DESC' } });
  }

  async findOne(id: number): Promise<Reserva> {
    const reserva = await this.repo.findOneBy({ id });
    if (!reserva) throw new NotFoundException(`Reserva ${id} no existe`);
    return reserva;
  }

  async crear(dto: CrearReservaDto, cuentaId: number): Promise<Reserva> {
    if (dto.fechaRecogida < hoyEnEcuador()) {
      throw new BadRequestException('La fecha de recogida no puede estar en el pasado');
    }
    if (dto.fechaDevolucion <= dto.fechaRecogida) {
      throw new BadRequestException('La fecha de devolución debe ser posterior a la de recogida');
    }
    const dias = calcularDias(dto.fechaRecogida, dto.fechaDevolucion);

    const id = await this.dataSource.transaction(async (manager) => {
      const vehiculo = await manager.findOne(Vehiculo, {
        where: { id: dto.vehiculoId },
        lock: { mode: 'pessimistic_write' },
        loadEagerRelations: false,
      });
      if (!vehiculo) throw new NotFoundException(`Vehículo ${dto.vehiculoId} no existe`);

      const sucursalDevolucionId = dto.sucursalDevolucionId ?? vehiculo.sucursalId;
      if (sucursalDevolucionId !== vehiculo.sucursalId) {
        const existe = await manager.existsBy(Sucursal, { id: sucursalDevolucionId });
        if (!existe) throw new BadRequestException(`La sucursal ${sucursalDevolucionId} no existe`);
      }

      if (bloqueadoOperativamente(vehiculo)) {
        throw new ConflictException('El vehículo no está disponible: está en limpieza o mantenimiento');
      }

      // Disponibilidad por intervalos con 2 h de limpieza entre alquileres; si choca, se ofrecen otras fechas.
      const activas = await manager.find(Reserva, { where: { vehiculoId: vehiculo.id, estado: 'CONFIRMADA' }, loadEagerRelations: false });
      const pedida = {
        fechaRecogida: dto.fechaRecogida,
        horaRecogida: dto.horaRecogida ?? '10:00',
        fechaDevolucion: dto.fechaDevolucion,
        horaDevolucion: dto.horaDevolucion ?? '10:00',
      };
      if (hayConflicto(activas, pedida)) {
        throw new ConflictException({
          statusCode: 409,
          error: 'Conflict',
          message: `El vehículo no está disponible del ${dto.fechaRecogida} al ${dto.fechaDevolucion} (incluye las 2 horas de limpieza entre alquileres). Elige otras fechas.`,
          disponibleDesde: disponibleDesde(activas, pedida),
          alternativas: alternativas(activas, pedida, hoyEnEcuador()),
        });
      }

      const total = Math.round(dias * vehiculo.precioPorDia * 100) / 100;
      const cobro = this.pagos.simularCobro(dto.pago);

      const nueva = manager.create(Reserva, {
        codigo: generarCodigo(),
        vehiculoId: vehiculo.id,
        sucursalRecogidaId: vehiculo.sucursalId,
        sucursalDevolucionId,
        fechaRecogida: dto.fechaRecogida,
        horaRecogida: dto.horaRecogida ?? '10:00',
        fechaDevolucion: dto.fechaDevolucion,
        horaDevolucion: dto.horaDevolucion ?? '10:00',
        nombreCliente: dto.nombreCliente.trim(),
        email: dto.email.trim().toLowerCase(),
        telefono: dto.telefono.trim(),
        dias,
        total,
        estado: 'CONFIRMADA',
        cuentaId,
        pagoReferencia: cobro.referencia,
        tarjetaUltimos4: cobro.tarjetaUltimos4,
        conductor: dto.identificacion
          ? { full_name: dto.nombreCliente.trim(), email: dto.email.trim().toLowerCase(), phone: dto.telefono.trim(), identificacion: dto.identificacion.trim() }
          : null,
      });
      const guardada = await manager.save(nueva);
      return guardada.id;
    });

    const reserva = await this.findOne(id);
    // La cédula del cliente queda también en su cuenta (si no tenía una y nadie más la usa) para encontrarlo por cédula.
    if (dto.identificacion) {
      const cuentas = this.dataSource.getRepository(Cuenta);
      const ident = dto.identificacion.trim();
      const propia = await cuentas.findOneBy({ id: cuentaId });
      if (propia && !propia.identificacion && !(await cuentas.existsBy({ identificacion: ident }))) {
        await cuentas.update(cuentaId, { identificacion: ident, telefono: propia.telefono ?? dto.telefono.trim() });
      }
    }
    this.stock.empujarEnSegundoPlano(reserva.vehiculoId, reserva.fechaRecogida, reserva.horaRecogida, false, 'reserva-marketplace');
    return reserva;
  }

  /**
   * Cancela una reserva que aún no fue retirada: el auto vuelve a estar disponible y se simula el reembolso del 100 %.
   * Si las llaves ya se entregaron (o el alquiler terminó), responde 409. Cancelar dos veces no repite nada.
   */
  async cancelar(id: number) {
    const reserva = await this.findOne(id);
    if (reserva.estado === 'COMPLETADA' || reserva.entregadaEn) {
      throw new ConflictException({ statusCode: 409, error: 'Conflict', title: 'Cancelación No Permitida', message: DETALLE_NO_CANCELABLE });
    }
    if (reserva.estado !== 'CANCELADA') {
      await this.repo.update(id, { estado: 'CANCELADA', reembolso: crearReembolso(reserva.total) });
      this.stock.empujarEnSegundoPlano(reserva.vehiculoId, reserva.fechaRecogida, reserva.horaRecogida, true, 'cancelacion-marketplace');
    }
    const actual = await this.findOne(id);
    return {
      ...actual,
      inventory_restoration: {
        status: 'RESTORED',
        vehicle_id: idPublico(actual.vehiculoId),
        new_state: 'DISPONIBLE',
        message: MENSAJE_INVENTARIO,
      },
    };
  }

  async eliminar(id: number): Promise<void> {
    const resultado = await this.repo.delete(id);
    if (resultado.affected === 0) throw new NotFoundException(`Reserva ${id} no existe`);
  }
}
