import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('cuentas')
export class Cuenta {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('varchar', { unique: true })
  email: string;

  @Column('varchar')
  nombre: string;

  @Column('varchar')
  passwordHash: string;

  @CreateDateColumn()
  creadaEn: Date;
}
