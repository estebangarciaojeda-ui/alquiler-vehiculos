import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

// clave = `${Idempotency-Key}:${método} ${ruta}` -> cachea la respuesta exacta de la
// primera ejecución para que un reintento con la misma clave nunca repita el efecto.
@Entity('gds_idempotencia')
export class GdsIdempotencia {
  @PrimaryColumn('varchar')
  clave: string;

  @Column('jsonb')
  respuesta: unknown;

  @CreateDateColumn()
  creadoEn: Date;
}
