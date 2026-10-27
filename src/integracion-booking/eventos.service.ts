import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import { Repository } from 'typeorm';
import { AutoEvento } from './entities.js';

const PREFIJO = 'ec.edu.epn.booking.autos';

export type TipoEvento = 'order.confirmed' | 'order.cancelled' | 'cooldown.started' | 'mantenimiento.alerta';

const ABREVIATURA: Record<TipoEvento, string> = {
  'order.confirmed': 'ord',
  'order.cancelled': 'canc',
  'cooldown.started': 'cool',
  'mantenimiento.alerta': 'mant',
};

/** Transactional Outbox: guarda los eventos como CloudEvents 1.0; GET /autos/eventos los expone. */
@Injectable()
export class EventosService {
  constructor(@InjectRepository(AutoEvento) private readonly repo: Repository<AutoEvento>) {}

  async emitir(tipo: TipoEvento, datos: Record<string, unknown>, correlationId?: string): Promise<AutoEvento> {
    return this.repo.save(
      this.repo.create({
        eventId: `evt-car-${ABREVIATURA[tipo]}-${randomBytes(3).toString('hex')}`,
        tipo: `${PREFIJO}.${tipo}`,
        correlationId: correlationId ?? null,
        datos,
      }),
    );
  }

  async listar(limit: number, after?: string) {
    let desde = 0;
    if (after) {
      const previo = await this.repo.findOneBy({ eventId: after });
      if (previo) desde = previo.seq;
    }
    const filas = await this.repo
      .createQueryBuilder('e')
      .where('e.seq > :desde', { desde })
      .orderBy('e.seq', 'ASC')
      .take(limit)
      .getMany();
    const total = await this.repo.count();
    return {
      events: filas.map((e) => ({
        specversion: '1.0',
        type: e.tipo,
        source: '/microservices/ms-autos',
        id: e.eventId,
        time: e.tiempo.toISOString(),
        correlation_id: e.correlationId,
        datacontenttype: 'application/json',
        data: e.datos,
      })),
      metadata: { total, timestamp: new Date().toISOString() },
    };
  }
}
