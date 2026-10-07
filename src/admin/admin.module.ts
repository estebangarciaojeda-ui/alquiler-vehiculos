import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cuenta } from '../cuentas/cuenta.entity.js';
import { GdsOrder } from '../gds-autos/entities/gds-order.entity.js';
import { GdsWebhook } from '../gds-autos/entities/gds-webhook.entity.js';
import { AdminAuthController } from './admin-auth.controller.js';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { AdminDataController } from './admin-data.controller.js';

// Global: AdminAuthGuard se usa con @UseGuards(AdminAuthGuard) desde
// controladores de otros módulos (sucursales, vehículos, reservas).
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([GdsOrder, GdsWebhook, Cuenta])],
  controllers: [AdminAuthController, AdminDataController],
  providers: [AdminAuthGuard],
  exports: [AdminAuthGuard],
})
export class AdminModule {}
