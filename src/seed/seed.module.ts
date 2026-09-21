import { Module } from '@nestjs/common';
import { SucursalesModule } from '../sucursales/sucursales.module.js';
import { VehiculosModule } from '../vehiculos/vehiculos.module.js';
import { SeedService } from './seed.service.js';

@Module({
  imports: [SucursalesModule, VehiculosModule],
  providers: [SeedService],
})
export class SeedModule {}
