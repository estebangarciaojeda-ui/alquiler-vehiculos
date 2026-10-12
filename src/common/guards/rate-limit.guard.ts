import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerException, ThrottlerGuard } from '@nestjs/throttler';

// Mismo límite que ThrottlerGuard, pero con un mensaje en español y
// orientado al usuario en vez del genérico "ThrottlerException: Too Many
// Requests" que muestra la librería por defecto.
@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  protected async throwThrottlingException(_context: ExecutionContext): Promise<void> {
    throw new ThrottlerException('Demasiados intentos. Espera un minuto antes de volver a intentar.');
  }
}
