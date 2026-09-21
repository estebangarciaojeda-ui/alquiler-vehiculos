import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { esErrorDeLlaveForanea } from '../common/db-errors.js';
import { Sucursal } from '../sucursales/sucursal.entity.js';
import { ActualizarPrecioDto } from './dto/actualizar-precio.dto.js';
import { BuscarVehiculosDto } from './dto/buscar-vehiculos.dto.js';
import { CrearVehiculoDto } from './dto/crear-vehiculo.dto.js';
import { Vehiculo } from './vehiculo.entity.js';

@Injectable()
export class VehiculosService {
  constructor(
    @InjectRepository(Vehiculo)
    private readonly repo: Repository<Vehiculo>,
    @InjectRepository(Sucursal)
    private readonly sucursalesRepo: Repository<Sucursal>,
  ) {}

  async buscar(filtros: BuscarVehiculosDto): Promise<Vehiculo[]> {
    const { desde, hasta } = filtros;
    if ((desde && !hasta) || (!desde && hasta)) {
      throw new BadRequestException('Los parámetros desde y hasta deben enviarse juntos');
    }
    if (desde && hasta && hasta <= desde) {
      throw new BadRequestException('La fecha de devolución debe ser posterior a la de recogida');
    }

    const qb = this.repo.createQueryBuilder('v').leftJoinAndSelect('v.sucursal', 's');

    if (filtros.sucursalId) qb.andWhere('v.sucursalId = :sucursalId', { sucursalId: filtros.sucursalId });
    if (filtros.ciudad) qb.andWhere('s.ciudad ILIKE :ciudad', { ciudad: `%${filtros.ciudad}%` });
    if (filtros.categoria) qb.andWhere('v.categoria = :categoria', { categoria: filtros.categoria });
    if (filtros.transmision) qb.andWhere('v.transmision = :transmision', { transmision: filtros.transmision });
    if (filtros.pasajeros) qb.andWhere('v.pasajeros >= :pasajeros', { pasajeros: filtros.pasajeros });
    if (filtros.precioMax) qb.andWhere('v.precioPorDia <= :precioMax', { precioMax: filtros.precioMax });

    if (desde && hasta) {
      qb.andWhere(
        `NOT EXISTS (
          SELECT 1 FROM reservas r
          WHERE r."vehiculoId" = v.id
            AND r.estado = 'CONFIRMADA'
            AND r."fechaRecogida" < :hasta
            AND r."fechaDevolucion" > :desde
        )`,
        { desde, hasta },
      );
    }

    qb.orderBy('v.precioPorDia', filtros.orden === 'precio_desc' ? 'DESC' : 'ASC').addOrderBy('v.id', 'ASC');
    return qb.getMany();
  }

  async findOne(id: number): Promise<Vehiculo> {
    const vehiculo = await this.repo.findOneBy({ id });
    if (!vehiculo) throw new NotFoundException(`Vehículo ${id} no existe`);
    return vehiculo;
  }

  async crear(dto: CrearVehiculoDto): Promise<Vehiculo> {
    await this.verificarSucursal(dto.sucursalId);
    const guardado = await this.repo.save(this.repo.create(dto));
    return this.findOne(guardado.id);
  }

  async reemplazar(id: number, dto: CrearVehiculoDto): Promise<void> {
    await this.findOne(id);
    await this.verificarSucursal(dto.sucursalId);
    await this.repo.update(id, { aireAcondicionado: true, ...dto });
  }

  async actualizarPrecio(id: number, dto: ActualizarPrecioDto): Promise<Vehiculo> {
    await this.findOne(id);
    await this.repo.update(id, { precioPorDia: dto.precioPorDia });
    return this.findOne(id);
  }

  async eliminar(id: number): Promise<void> {
    try {
      const resultado = await this.repo.delete(id);
      if (resultado.affected === 0) throw new NotFoundException(`Vehículo ${id} no existe`);
    } catch (error) {
      if (esErrorDeLlaveForanea(error)) {
        throw new ConflictException('El vehículo tiene reservas asociadas');
      }
      throw error;
    }
  }

  private async verificarSucursal(sucursalId: number): Promise<void> {
    const existe = await this.sucursalesRepo.existsBy({ id: sucursalId });
    if (!existe) throw new BadRequestException(`La sucursal ${sucursalId} no existe`);
  }
}
