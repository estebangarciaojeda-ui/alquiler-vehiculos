import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sucursal } from '../sucursales/sucursal.entity.js';
import { Vehiculo } from '../vehiculos/vehiculo.entity.js';
import { CatalogoService } from './catalogo.service.js';
import { GdsHold } from './entities/gds-hold.entity.js';
import { GdsIdempotencia } from './entities/gds-idempotency.entity.js';
import { GdsOrder } from './entities/gds-order.entity.js';
import { GdsPreview } from './entities/gds-preview.entity.js';
import { GdsWebhook } from './entities/gds-webhook.entity.js';
import { GdsAutosController } from './gds-autos.controller.js';
import { IdempotencyInterceptor } from './idempotency.interceptor.js';
import { OrdenesService } from './ordenes.service.js';
import { WebhooksService } from './webhooks.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Vehiculo, Sucursal, GdsHold, GdsPreview, GdsOrder, GdsWebhook, GdsIdempotencia]),
  ],
  controllers: [GdsAutosController],
  providers: [CatalogoService, OrdenesService, WebhooksService, IdempotencyInterceptor],
})
export class GdsAutosModule {}
