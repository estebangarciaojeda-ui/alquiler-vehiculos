import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { numericTransformer } from '../../common/constants.js';
import type { RouteDto } from '../dto/common.dto.js';

@Entity('gds_previews')
export class GdsPreview {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('int')
  vehiculoId: number;

  @Column('uuid', { nullable: true })
  holdId: string | null;

  @Column('simple-array', { default: '' })
  extras: string[];

  @Column('date')
  fechaRecogida: string;

  @Column('date')
  fechaDevolucion: string;

  @Column('jsonb')
  ruta: RouteDto;

  @Column('varchar', { length: 3 })
  moneda: string;

  @Column('numeric', { precision: 10, scale: 2, transformer: numericTransformer })
  precioTotal: number;

  @Column('jsonb')
  desglose: Record<string, number>;

  @Column('boolean', { default: false })
  consumida: boolean;

  @CreateDateColumn()
  creadoEn: Date;
}
