import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PagosModule } from '../pagos/pagos.module.js';
import { Reserva } from './reserva.entity.js';
import { ReservasController } from './reservas.controller.js';
import { ReservasService } from './reservas.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Reserva]), PagosModule],
  controllers: [ReservasController],
  providers: [ReservasService],
})
export class ReservasModule {}
