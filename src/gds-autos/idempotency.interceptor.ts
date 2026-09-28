import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request } from 'express';
import { Observable, of, tap } from 'rxjs';
import { Repository } from 'typeorm';
import { GdsIdempotencia } from './entities/gds-idempotency.entity.js';

/**
 * Complementa a IdempotencyKeyGuard: si ya existe una respuesta guardada para esta
 * Idempotency-Key + ruta, la devuelve tal cual (sin ejecutar el controlador de nuevo).
 * Si es la primera vez, deja pasar la petición y guarda el resultado al terminar.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    @InjectRepository(GdsIdempotencia)
    private readonly repo: Repository<GdsIdempotencia>,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<Request>();
    const idempotencyKey = request.headers['idempotency-key'] as string | undefined;
    if (!idempotencyKey) return next.handle();

    const clave = `${idempotencyKey}:${request.method} ${request.route?.path ?? request.originalUrl}`;
    const previa = await this.repo.findOneBy({ clave });
    if (previa) return of(previa.respuesta);

    return next.handle().pipe(
      tap((respuesta: unknown) => {
        this.repo.save({ clave, respuesta }).catch(() => undefined);
      }),
    );
  }
}
