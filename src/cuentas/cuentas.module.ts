import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClienteAuthGuard } from './cliente-auth.guard.js';
import { Cuenta } from './cuenta.entity.js';
import { CuentasController } from './cuentas.controller.js';
import { CuentasService } from './cuentas.service.js';

// Global: ClienteAuthGuard se usa desde el controlador de reservas.
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Cuenta])],
  controllers: [CuentasController],
  providers: [CuentasService, ClienteAuthGuard],
  exports: [ClienteAuthGuard],
})
export class CuentasModule {}
