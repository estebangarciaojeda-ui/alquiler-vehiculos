import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { numericTransformer } from '../common/constants.js';
import { Sucursal } from '../sucursales/sucursal.entity.js';

@Entity('vehiculos')
export class Vehiculo {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('varchar')
  marca: string;

  @Column('varchar')
  modelo: string;

  @Column('int')
  anio: number;

  @Column('varchar')
  categoria: string;

  @Column('varchar')
  transmision: string;

  @Column('int')
  pasajeros: number;

  @Column('int')
  maletas: number;

  @Column('int')
  puertas: number;

  @Column('varchar')
  combustible: string;

  @Column('boolean', { default: true })
  aireAcondicionado: boolean;

  @Column('numeric', { precision: 10, scale: 2, transformer: numericTransformer })
  precioPorDia: number;

  @Column('int')
  sucursalId: number;

  // Estado operativo persistido (integración con Booking). RESERVADO,
  // LISTO_PARA_ENTREGAR y ENTREGADO se derivan de las reservas; aquí solo se
  // guardan DISPONIBLE, EN_LIMPIEZA (cooldown de 2 h) y EN_MANTENIMIENTO.
  @Column('varchar', { default: 'DISPONIBLE' })
  estadoOperativo: string;

  @Column('int', { default: 0 })
  kilometrajeActual: number;

  @Column('int', { default: 10000 })
  proximoMantenimientoKm: number;

  // Fin del cooldown de limpieza; null si no está en limpieza.
  @Column('timestamptz', { nullable: true })
  disponibleDesde: Date | null;

  @ManyToOne(() => Sucursal, { eager: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sucursalId' })
  sucursal: Sucursal;
}
