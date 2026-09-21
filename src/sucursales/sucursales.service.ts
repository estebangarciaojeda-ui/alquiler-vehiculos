import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { esErrorDeLlaveForanea } from '../common/db-errors.js';
import { CrearSucursalDto } from './dto/crear-sucursal.dto.js';
import { Sucursal } from './sucursal.entity.js';

@Injectable()
export class SucursalesService {
  constructor(
    @InjectRepository(Sucursal)
    private readonly repo: Repository<Sucursal>,
  ) {}

  findAll(ciudad?: string): Promise<Sucursal[]> {
    return this.repo.find({
      where: ciudad ? { ciudad: ILike(`%${ciudad}%`) } : {},
      order: { ciudad: 'ASC', nombre: 'ASC' },
    });
  }

  async findOne(id: number): Promise<Sucursal> {
    const sucursal = await this.repo.findOneBy({ id });
    if (!sucursal) throw new NotFoundException(`Sucursal ${id} no existe`);
    return sucursal;
  }

  crear(dto: CrearSucursalDto): Promise<Sucursal> {
    return this.repo.save(this.repo.create(dto));
  }

  async reemplazar(id: number, dto: CrearSucursalDto): Promise<void> {
    await this.findOne(id);
    await this.repo.update(id, { esAeropuerto: false, ...dto });
  }

  async eliminar(id: number): Promise<void> {
    try {
      const resultado = await this.repo.delete(id);
      if (resultado.affected === 0) throw new NotFoundException(`Sucursal ${id} no existe`);
    } catch (error) {
      if (esErrorDeLlaveForanea(error)) {
        throw new ConflictException('La sucursal tiene vehículos o reservas asociados');
      }
      throw error;
    }
  }
}
