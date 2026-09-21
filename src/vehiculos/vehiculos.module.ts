import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sucursal } from '../sucursales/sucursal.entity.js';
import { Vehiculo } from './vehiculo.entity.js';
import { VehiculosController } from './vehiculos.controller.js';
import { VehiculosService } from './vehiculos.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Vehiculo, Sucursal])],
  controllers: [VehiculosController],
  providers: [VehiculosService],
  exports: [TypeOrmModule],
})
export class VehiculosModule {}
