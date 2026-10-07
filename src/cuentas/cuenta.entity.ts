import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export const ROLES_CUENTA = ['cliente', 'admin'] as const;
export type RolCuenta = (typeof ROLES_CUENTA)[number];

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

  @Column('varchar', { default: 'cliente' })
  rol: RolCuenta;

  @CreateDateColumn()
  creadaEn: Date;
}
