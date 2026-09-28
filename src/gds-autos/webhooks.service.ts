import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { GdsWebhook } from './entities/gds-webhook.entity.js';
import type { CreateWebhookDto, WebhookSubscriptionDto } from './dto/webhooks.dto.js';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @InjectRepository(GdsWebhook)
    private readonly repo: Repository<GdsWebhook>,
  ) {}

  async listar(): Promise<WebhookSubscriptionDto[]> {
    const filas = await this.repo.find({ order: { creadoEn: 'DESC' } });
    return filas.map((f) => ({ id: f.id, url: f.url, events: f.events, secret: f.secret ?? undefined }));
  }

  async crear(dto: CreateWebhookDto): Promise<WebhookSubscriptionDto> {
    const guardado = await this.repo.save(this.repo.create({ url: dto.url, events: dto.events, secret: dto.secret ?? null }));
    return { id: guardado.id, url: guardado.url, events: guardado.events, secret: guardado.secret ?? undefined };
  }

  async eliminar(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  // "Best effort": no bloquea la respuesta al cliente ni la hace fallar si el webhook no responde.
  async disparar(evento: 'CAR_ORDER_CONFIRMED' | 'CAR_ORDER_CANCELLED', resourceId: string, data: Record<string, unknown>): Promise<void> {
    const suscritos = await this.repo.find({ where: {} });
    const destinatarios = suscritos.filter((s) => s.events.includes(evento));
    const payload = { eventId: randomUUID(), eventType: evento, timestamp: new Date().toISOString(), resourceId, data };

    await Promise.all(
      destinatarios.map(async (destino) => {
        try {
          await fetch(destino.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(5000),
          });
        } catch (error) {
          this.logger.warn(`No se pudo notificar el webhook ${destino.id} (${destino.url}): ${(error as Error).message}`);
        }
      }),
    );
  }
}
