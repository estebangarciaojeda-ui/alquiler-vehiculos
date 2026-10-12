import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
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
    // Límite por defecto para toda la API: 100 peticiones/minuto por IP.
    // Los endpoints de login tienen un límite más estricto (ver @Throttle
    // en sus controladores) para dificultar ataques de fuerza bruta.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
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
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
