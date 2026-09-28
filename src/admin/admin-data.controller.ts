import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GdsOrder } from '../gds-autos/entities/gds-order.entity.js';
import { GdsWebhook } from '../gds-autos/entities/gds-webhook.entity.js';
import { AdminAuthGuard } from './admin-auth.guard.js';

@ApiExcludeController()
@Controller('admin/api')
@UseGuards(AdminAuthGuard)
export class AdminDataController {
  constructor(
    @InjectRepository(GdsOrder) private readonly ordenes: Repository<GdsOrder>,
    @InjectRepository(GdsWebhook) private readonly webhooks: Repository<GdsWebhook>,
  ) {}

  @Get('gds-orders')
  listarOrdenes() {
    return this.ordenes.find({ order: { creadoEn: 'DESC' }, take: 200 });
  }

  @Get('gds-webhooks')
  listarWebhooks() {
    return this.webhooks.find({ order: { creadoEn: 'DESC' } });
  }
}
