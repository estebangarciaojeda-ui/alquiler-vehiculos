import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cuenta } from '../cuentas/cuenta.entity.js';
import { SucursalesModule } from '../sucursales/sucursales.module.js';
import { VehiculosModule } from '../vehiculos/vehiculos.module.js';
import { SeedService } from './seed.service.js';

@Module({
  imports: [SucursalesModule, VehiculosModule, TypeOrmModule.forFeature([Cuenta])],
  providers: [SeedService],
})
export class SeedModule {}
