import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('gds_webhooks')
export class GdsWebhook {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar')
  url: string;

  @Column('simple-array')
  events: string[];

  @Column('varchar', { nullable: true })
  secret: string | null;

  @CreateDateColumn()
  creadoEn: Date;
}
