import { Module } from '@nestjs/common';
import { PagosService } from './pagos.service.js';

@Module({
  providers: [PagosService],
  exports: [PagosService],
})
export class PagosModule {}
