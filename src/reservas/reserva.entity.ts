import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { numericTransformer } from '../common/constants.js';
import { Sucursal } from '../sucursales/sucursal.entity.js';
import { Vehiculo } from '../vehiculos/vehiculo.entity.js';

@Entity('reservas')
export class Reserva {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('varchar', { unique: true })
  codigo: string;

  @Column('int')
  vehiculoId: number;

  @ManyToOne(() => Vehiculo, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'vehiculoId' })
  vehiculo: Vehiculo;

  @Column('int')
  sucursalRecogidaId: number;

  @ManyToOne(() => Sucursal, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sucursalRecogidaId' })
  sucursalRecogida: Sucursal;

  @Column('int')
  sucursalDevolucionId: number;

  @ManyToOne(() => Sucursal, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sucursalDevolucionId' })
  sucursalDevolucion: Sucursal;

  @Column('date')
  fechaRecogida: string;

  @Column('varchar', { default: '10:00' })
  horaRecogida: string;

  @Column('date')
  fechaDevolucion: string;

  @Column('varchar', { default: '10:00' })
  horaDevolucion: string;

  @Column('varchar')
  nombreCliente: string;

  @Column('varchar')
  email: string;

  @Column('varchar')
  telefono: string;

  @Column('int')
  dias: number;

  @Column('numeric', { precision: 10, scale: 2, transformer: numericTransformer })
  total: number;

  @Column('varchar', { default: 'CONFIRMADA' })
  estado: string;

  @CreateDateColumn()
  creadaEn: Date;
}
