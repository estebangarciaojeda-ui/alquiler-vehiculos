import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminModule } from './admin/admin.module.js';
import { AuthJwtModule } from './auth-jwt/auth-jwt.module.js';
import { CuentasModule } from './cuentas/cuentas.module.js';
import { GdsAutosModule } from './gds-autos/gds-autos.module.js';
import { ReservasModule } from './reservas/reservas.module.js';
import { SeedModule } from './seed/seed.module.js';
import { SucursalesModule } from './sucursales/sucursales.module.js';
import { VehiculosModule } from './vehiculos/vehiculos.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        autoLoadEntities: true,
        synchronize: true,
        ssl: config.get('NODE_ENV') === 'production' ? { rejectUnauthorized: false } : false,
      }),
    }),
    SucursalesModule,
    VehiculosModule,
    ReservasModule,
    SeedModule,
    GdsAutosModule,
    AdminModule,
    CuentasModule,
    AuthJwtModule,
  ],
})
export class AppModule {}
