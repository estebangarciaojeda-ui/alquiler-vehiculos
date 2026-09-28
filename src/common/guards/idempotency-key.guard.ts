import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ProblemDetailsException } from '../problem-details.exception.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Exige la cabecera Idempotency-Key (UUID) en los endpoints transaccionales de /orders,
 * tal como lo pide el contrato, para evitar cobros u operaciones duplicadas.
 */
@Injectable()
export class IdempotencyKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const idempotencyKey = request.headers['idempotency-key'] as string | undefined;

    if (!idempotencyKey || !UUID_REGEX.test(idempotencyKey)) {
      throw new ProblemDetailsException(
        400,
        'VALIDATION_FAILED',
        'Idempotency-Key inválida',
        'La cabecera Idempotency-Key es obligatoria y debe ser un UUID v4.',
      );
    }
    return true;
  }
}
