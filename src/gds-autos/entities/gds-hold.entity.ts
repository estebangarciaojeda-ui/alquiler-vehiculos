import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('gds_holds')
export class GdsHold {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('int')
  vehiculoId: number;

  @Column('varchar')
  searchToken: string;

  @Column('int', { nullable: true })
  driverAge: number | null;

  @Column('date')
  fechaRecogida: string;

  @Column('date')
  fechaDevolucion: string;

  @Column('timestamptz')
  expiresAt: Date;

  @CreateDateColumn()
  creadoEn: Date;
}
