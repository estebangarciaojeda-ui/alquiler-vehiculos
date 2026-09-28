import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { numericTransformer } from '../../common/constants.js';
import type { RouteDto } from '../dto/common.dto.js';

export interface VehiculoSnapshot {
  vehicle_id: string;
  marca: string;
  modelo: string;
  anio: number;
  categoria: string;
  transmision: string;
  pasajeros: number;
  maletas: number;
  puertas: number;
  combustible: string;
  precio_por_dia: number;
}

export interface DriverDetailsSnapshot {
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
}

@Entity('gds_orders')
export class GdsOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { unique: true })
  locator: string;

  @Column('varchar', { default: 'CONFIRMED' })
  estado: string; // CONFIRMED | CANCELLED | PENDING

  @Column('int')
  vehiculoId: number;

  @Column('jsonb')
  vehiculoSnapshot: VehiculoSnapshot;

  @Column('date')
  fechaRecogida: string;

  @Column('date')
  fechaDevolucion: string;

  @Column('jsonb')
  ruta: RouteDto;

  @Column('simple-array', { default: '' })
  extras: string[];

  @Column('numeric', { precision: 10, scale: 2, transformer: numericTransformer })
  precioTotal: number;

  @Column('varchar', { length: 3 })
  moneda: string;

  @Column('jsonb')
  driverDetails: DriverDetailsSnapshot;

  @Column('varchar')
  paymentReference: string;

  @CreateDateColumn()
  creadoEn: Date;
}
