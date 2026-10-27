import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GdsIdempotencia } from '../gds-autos/entities/gds-idempotency.entity.js';
import { Reserva } from '../reservas/reserva.entity.js';
import { Sucursal } from '../sucursales/sucursal.entity.js';
import { Vehiculo } from '../vehiculos/vehiculo.entity.js';
import { B2bAuthGuard, TrazaInterceptor } from './acceso-b2b.js';
import { AutosB2bController, AutosB2bRaizController } from './autos-b2b.controller.js';
import { AutoBitacora, AutoEvento, AutoPromoContrato } from './entities.js';
import { EventosService } from './eventos.service.js';
import { FlotaService } from './flota.service.js';
import { OrdenesB2bService } from './ordenes-b2b.service.js';
import { ProblemaV3Filter } from './problema-v3.js';
import { RegistroService } from './registro.service.js';
import { StockSyncService } from './stock-sync.service.js';

// Global: ReservasService notifica a Booking los cambios de stock del marketplace.
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Vehiculo, Reserva, Sucursal, AutoEvento, AutoBitacora, AutoPromoContrato, GdsIdempotencia])],
  controllers: [AutosB2bController, AutosB2bRaizController],
  providers: [RegistroService, StockSyncService, EventosService, FlotaService, OrdenesB2bService, B2bAuthGuard, TrazaInterceptor, ProblemaV3Filter],
  exports: [StockSyncService, RegistroService],
})
export class IntegracionBookingModule {}
