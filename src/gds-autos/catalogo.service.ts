import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { COMBUSTIBLES, TRANSMISIONES } from '../common/constants.js';
import { ProblemDetailsException } from '../common/problem-details.exception.js';
import { calcularDias } from '../reservas/reservas.util.js';
import { Sucursal } from '../sucursales/sucursal.entity.js';
import { Vehiculo } from '../vehiculos/vehiculo.entity.js';
import { CarConstantsRequestDto, CarConstantsResponseDto } from './dto/constants.dto.js';
import { CarDetailsRequestDto, CarDetailsResponseDto } from './dto/details.dto.js';
import { DepotScoresRequestDto, DepotScoresResponseDto, DepotsRequestDto, DepotsResponseDto } from './dto/depots.dto.js';
import { CarSearchRequestDto, CarSearchResponseDto } from './dto/search.dto.js';
import { SuppliersRequestDto, SuppliersResponseDto } from './dto/suppliers.dto.js';
import { calificacionDeSucursal, iataDeSucursal, idDeCiudad } from './depots.util.js';
import { idDeMarca, todosLosProveedores } from './marcas.util.js';
import { crearSearchToken, soloFecha } from './search-token.js';

const paginar = (page: string | undefined): number => {
  const offset = Number(page);
  return Number.isFinite(offset) && offset > 0 ? offset : 0;
};

@Injectable()
export class CatalogoService {
  constructor(
    @InjectRepository(Vehiculo) private readonly vehiculos: Repository<Vehiculo>,
    @InjectRepository(Sucursal) private readonly sucursales: Repository<Sucursal>,
  ) {}

  async search(dto: CarSearchRequestDto): Promise<CarSearchResponseDto> {
    const desde = soloFecha(dto.route.pickup.datetime);
    const hasta = soloFecha(dto.route.dropoff.datetime);
    if (hasta <= desde) {
      throw new ProblemDetailsException(400, 'VALIDATION_FAILED', 'Ruta inválida', 'route.dropoff.datetime debe ser posterior a route.pickup.datetime.');
    }
    const dias = calcularDias(desde, hasta);

    const offset = paginar(dto.page);
    const limite = dto.maximum_results ?? 100;

    const qb = this.vehiculos.createQueryBuilder('v').leftJoin('v.sucursal', 's');
    if (dto.filters?.car_types?.length) qb.andWhere('v.categoria IN (:...tipos)', { tipos: dto.filters.car_types });
    if (dto.filters?.transmission?.length) qb.andWhere('v.transmision IN (:...transmisiones)', { transmisiones: dto.filters.transmission });
    qb.andWhere(
      `NOT EXISTS (SELECT 1 FROM reservas r WHERE r."vehiculoId" = v.id AND r.estado = 'CONFIRMADA' AND r."fechaRecogida" < :hasta AND r."fechaDevolucion" > :desde)
       AND NOT EXISTS (SELECT 1 FROM gds_orders o WHERE o."vehiculoId" = v.id AND o.estado IN ('CONFIRMED', 'PENDING') AND o."fechaRecogida" < :hasta AND o."fechaDevolucion" > :desde)
       AND NOT EXISTS (SELECT 1 FROM gds_holds h WHERE h."vehiculoId" = v.id AND h."expiresAt" > now() AND h."fechaRecogida" < :hasta AND h."fechaDevolucion" > :desde)`,
      { desde, hasta },
    );
    qb.orderBy('v.precioPorDia', 'ASC').addOrderBy('v.id', 'ASC').skip(offset).take(limite);

    const [vehiculos, total] = await qb.getManyAndCount();

    return {
      request_id: randomUUID(),
      data: vehiculos.map((v) => ({
        vehicle_id: String(v.id),
        price: Math.round(v.precioPorDia * dias * 100) / 100,
        supplier_id: idDeMarca(v.marca),
      })),
      metadata: {
        total_results: total,
        next_page: offset + vehiculos.length < total ? String(offset + vehiculos.length) : null,
      },
      search_token: crearSearchToken(dto.currency, dto.route),
    };
  }

  async getDetails(dto: CarDetailsRequestDto): Promise<CarDetailsResponseDto> {
    const offset = paginar(dto.page);
    const limite = dto.maximum_results ?? 100;
    const [vehiculos] = await this.vehiculos
      .createQueryBuilder('v')
      .orderBy('v.id', 'ASC')
      .skip(offset)
      .take(limite)
      .getManyAndCount();

    return {
      request_id: randomUUID(),
      data: vehiculos.map((v) => ({
        vehicle_id: String(v.id),
        make: v.marca,
        model: v.modelo,
        doors: v.puertas,
        bag_capacity: v.maletas,
        seats: v.pasajeros,
      })),
    };
  }

  async getDepots(dto: DepotsRequestDto): Promise<DepotsResponseDto> {
    const offset = paginar(dto.page);
    const limite = dto.maximum_results ?? 100;
    const [sucursales, total] = await this.sucursales
      .createQueryBuilder('s')
      .orderBy('s.id', 'ASC')
      .skip(offset)
      .take(limite)
      .getManyAndCount();

    return {
      request_id: randomUUID(),
      data: sucursales.map((s) => ({
        depot_id: s.id,
        name: s.nombre,
        location: { airport: iataDeSucursal(s.nombre), city_id: idDeCiudad(s.ciudad) },
      })),
      metadata: { total_results: total },
    };
  }

  async getDepotScores(dto: DepotScoresRequestDto): Promise<DepotScoresResponseDto> {
    const offset = paginar(dto.page);
    const limite = dto.maximum_results ?? 100;
    const [sucursales, total] = await this.sucursales
      .createQueryBuilder('s')
      .orderBy('s.id', 'ASC')
      .skip(offset)
      .take(limite)
      .getManyAndCount();

    return {
      request_id: randomUUID(),
      data: sucursales.map((s) => ({ depot_id: s.id, score: calificacionDeSucursal(s.id) })),
      metadata: { total_results: total },
    };
  }

  async getSuppliers(dto: SuppliersRequestDto): Promise<SuppliersResponseDto> {
    const todos = todosLosProveedores();
    const filtrados = dto.suppliers?.length ? todos.filter((p) => dto.suppliers!.includes(p.supplier_id)) : todos;
    return { request_id: randomUUID(), data: filtrados };
  }

  getConstants(dto: CarConstantsRequestDto): CarConstantsResponseDto {
    const todas: Record<string, unknown> = {
      depot_services: ['WIFI', 'SHUTTLE', 'CHILD_SEAT_RENTAL', 'ADDITIONAL_DRIVER'],
      fuel_policies: ['FULL_TO_FULL', 'FULL_TO_EMPTY'],
      fuel_types: COMBUSTIBLES,
      general: { min_driver_age: 18, max_driver_age: 99, supported_currencies: ['USD'] },
      payment_timings: ['PAY_NOW', 'PAY_AT_DEPOT'],
      transmission: TRANSMISIONES,
    };
    const claves = dto.constants?.length ? dto.constants : Object.keys(todas);
    const data: Record<string, unknown> = {};
    for (const clave of claves) data[clave] = todas[clave];
    return { request_id: randomUUID(), data };
  }
}
