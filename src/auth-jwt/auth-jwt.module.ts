import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cuenta } from '../cuentas/cuenta.entity.js';
import { AuthJwtController } from './auth-jwt.controller.js';
import { JwtAdminGuard } from './jwt-admin.guard.js';

@Module({
  imports: [TypeOrmModule.forFeature([Cuenta])],
  controllers: [AuthJwtController],
  providers: [JwtAdminGuard],
  exports: [JwtAdminGuard],
})
export class AuthJwtModule {}
