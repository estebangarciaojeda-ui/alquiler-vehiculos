import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('sucursales')
export class Sucursal {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('varchar')
  nombre: string;

  @Column('varchar')
  ciudad: string;

  @Column('varchar')
  direccion: string;

  @Column('boolean', { default: false })
  esAeropuerto: boolean;
}
