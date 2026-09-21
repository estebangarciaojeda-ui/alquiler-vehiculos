import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
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

  async crear(dto: CrearReservaDto): Promise<Reserva> {
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

      const solapadas = await manager
        .getRepository(Reserva)
        .createQueryBuilder('r')
        .where('r.vehiculoId = :vehiculoId', { vehiculoId: vehiculo.id })
        .andWhere("r.estado = 'CONFIRMADA'")
        .andWhere('r.fechaRecogida < :hasta', { hasta: dto.fechaDevolucion })
        .andWhere('r.fechaDevolucion > :desde', { desde: dto.fechaRecogida })
        .getCount();
      if (solapadas > 0) {
        throw new ConflictException('El vehículo no está disponible en esas fechas');
      }

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
        total: Math.round(dias * vehiculo.precioPorDia * 100) / 100,
        estado: 'CONFIRMADA',
      });
      const guardada = await manager.save(nueva);
      return guardada.id;
    });

    return this.findOne(id);
  }

  async cancelar(id: number): Promise<Reserva> {
    const reserva = await this.findOne(id);
    if (reserva.estado !== 'CANCELADA') {
      await this.repo.update(id, { estado: 'CANCELADA' });
    }
    return this.findOne(id);
  }

  async eliminar(id: number): Promise<void> {
    const resultado = await this.repo.delete(id);
    if (resultado.affected === 0) throw new NotFoundException(`Reserva ${id} no existe`);
  }
}
