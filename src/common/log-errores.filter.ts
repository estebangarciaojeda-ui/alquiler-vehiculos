import { ArgumentsHost, Catch, HttpException, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { Request } from 'express';

// Filtro global: solo registra el error en el log del servidor (visible en
// Render → Logs) y delega el formateo de la respuesta al manejador por
// defecto de Nest (o al filtro específico del controlador, si existe), para
// no alterar ningún formato de respuesta ya existente.
@Catch()
export class LogErroresFilter extends BaseExceptionFilter {
  private readonly logger = new Logger('ExcepcionNoCapturada');

  catch(exception: unknown, host: ArgumentsHost): void {
    const request = host.switchToHttp().getRequest<Request>();
    const metodoYRuta = `${request?.method ?? ''} ${request?.originalUrl ?? ''}`;

    if (exception instanceof HttpException && exception.getStatus() < 500) {
      this.logger.warn(`${metodoYRuta} → ${exception.getStatus()} ${exception.message}`);
    } else {
      const mensaje = exception instanceof Error ? exception.stack : String(exception);
      this.logger.error(`${metodoYRuta} → error no controlado: ${mensaje}`);
    }

    super.catch(exception, host);
  }
}
