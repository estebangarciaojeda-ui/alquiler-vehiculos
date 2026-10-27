import { Column, CreateDateColumn, Entity, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';
import { numericTransformer } from '../common/constants.js';

// Transactional Outbox: eventos CloudEvents que expone GET /autos/eventos.
@Entity('autos_eventos')
export class AutoEvento {
  @PrimaryGeneratedColumn()
  seq: number;

  @Column('varchar', { unique: true })
  eventId: string;

  @Column('varchar')
  tipo: string;

  @Column('varchar', { nullable: true })
  correlationId: string | null;

  @Column('jsonb')
  datos: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  tiempo: Date;
}

// Bitácora de mantenimiento (BIT-AUTO-<id>).
@Entity('autos_bitacora')
export class AutoBitacora {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int')
  vehiculoId: number;

  @Column('varchar')
  tecnicoId: string;

  @Column('int')
  kilometraje: number;

  @Column('int')
  nivelCombustible: number;

  @Column('varchar', { nullable: true })
  carroceria: string | null;

  @Column('varchar', { nullable: true })
  neumaticos: string | null;

  @Column('varchar', { nullable: true })
  observaciones: string | null;

  @Column('boolean', { default: false })
  mantenimientoRealizado: boolean;

  @Column('boolean', { default: false })
  alerta: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  creadaEn: Date;
}

// Acuerdo B2B de promociones y combos (una sola fila, id = 1).
@Entity('autos_promo_contrato')
export class AutoPromoContrato {
  @PrimaryColumn('int')
  id: number;

  @Column('boolean', { default: true })
  permitePromociones: boolean;

  @Column('numeric', { precision: 5, scale: 2, default: 15, transformer: numericTransformer })
  porcentajeDescuentoMaximo: number;

  @Column('jsonb', { default: () => "'[]'" })
  destinosHabilitados: string[];

  @Column('varchar', { nullable: true })
  vigenciaHasta: string | null;

  @Column('varchar', { nullable: true })
  condicionesCombo: string | null;
}
