import { Module } from '@nestjs/common';
import { AuthJwtController } from './auth-jwt.controller.js';
import { JwtAdminGuard } from './jwt-admin.guard.js';

@Module({
  controllers: [AuthJwtController],
  providers: [JwtAdminGuard],
  exports: [JwtAdminGuard],
})
export class AuthJwtModule {}
