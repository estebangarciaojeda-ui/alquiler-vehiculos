import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Injectable, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { generarCorrelationId, type ErrorCampo } from './booking.util.js';
import { RegistroService } from './registro.service.js';

export type CodigoV3 =
  | 'VEHICLE_UNAVAILABLE'
  | 'VEHICLE_IN_CLEANING_COOLDOWN'
  | 'OUT_OF_STOCK'
  | 'DRIVER_UNDERAGE'
  | 'INVALID_DATES'
  | 'INVALID_PAYLOAD'
  | 'MALFORMED_REQUEST'
  | 'IDEMPOTENCY_CONFLICT'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CANCELLATION_NOT_ALLOWED'
  | 'ORDER_STATE_CONFLICT'
  | 'RATE_LIMIT_EXCEEDED'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL_ERROR';

const BASE_TIPO = 'https://booking.epn.edu.ec/errors';

/** Error RFC 7807 con los códigos del contrato autos-openapi-v3. */
export class ProblemaV3Exception extends HttpException {
  constructor(
    status: number,
    readonly codigo: CodigoV3,
    title: string,
    detail: string,
    invalidParams?: ErrorCampo[],
  ) {
    super(
      {
        type: `${BASE_TIPO}/${codigo.toLowerCase().replace(/_/g, '-')}`,
        title,
        status,
        detail,
        code: codigo,
        ...(invalidParams ? { invalid_params: invalidParams } : {}),
      },
      status,
    );
  }
}

const CODIGO_POR_ESTADO: Record<number, [CodigoV3, string]> = {
  400: ['MALFORMED_REQUEST', 'Solicitud mal formada'],
  401: ['UNAUTHORIZED', 'No autenticado'],
  403: ['FORBIDDEN', 'Acceso restringido'],
  404: ['NOT_FOUND', 'Recurso no encontrado'],
  409: ['ORDER_STATE_CONFLICT', 'Conflicto de estado'],
  422: ['INVALID_PAYLOAD', 'Entidad no procesable'],
  429: ['RATE_LIMIT_EXCEEDED', 'Demasiadas solicitudes'],
};

type ReqConCorrelacion = Request & { correlationId?: string };

/** Garantiza un X-Correlation-Id por petición (el recibido o uno generado) y lo devuelve en la respuesta. */
export function asegurarCorrelacion(req: ReqConCorrelacion, res: Response): string {
  if (!req.correlationId) {
    const recibido = req.headers['x-correlation-id'];
    req.correlationId = (Array.isArray(recibido) ? recibido[0] : recibido)?.trim().slice(0, 100) || generarCorrelationId();
  }
  if (!res.headersSent) res.setHeader('X-Correlation-Id', req.correlationId);
  return req.correlationId;
}

/** Traduce cualquier excepción de los controladores B2B a application/problem+json (RFC 7807). */
@Catch()
@Injectable()
export class ProblemaV3Filter implements ExceptionFilter {
  private readonly logger = new Logger('ProblemaV3');

  constructor(private readonly registro: RegistroService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const req = host.switchToHttp().getRequest<ReqConCorrelacion>();
    const res = host.switchToHttp().getResponse<Response>();
    const correlationId = asegurarCorrelacion(req, res);

    let status = 500;
    let cuerpo: Record<string, unknown>;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const original = exception.getResponse();
      if (typeof original === 'object' && original !== null && 'code' in original) {
        cuerpo = { ...(original as Record<string, unknown>) };
      } else {
        const mensaje = (original as { message?: string | string[] })?.message ?? exception.message;
        const [codigo, titulo] = CODIGO_POR_ESTADO[status] ?? ['INTERNAL_ERROR', 'Error'];
        cuerpo = {
          type: `${BASE_TIPO}/${codigo.toLowerCase().replace(/_/g, '-')}`,
          title: titulo,
          status,
          detail: Array.isArray(mensaje) ? mensaje.join('; ') : String(mensaje),
          code: codigo,
        };
      }
    } else {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
      cuerpo = {
        type: `${BASE_TIPO}/internal-error`,
        title: 'Error interno del servidor',
        status: 500,
        detail: 'Ocurrió un error inesperado.',
        code: 'INTERNAL_ERROR',
      };
    }

    cuerpo.instance = req.originalUrl;
    cuerpo.correlation_id = correlationId;
    cuerpo.timestamp = new Date().toISOString();

    this.registro.registrar(status >= 500 ? 'error' : 'warn', 'http.error', {
      correlation_id: correlationId,
      idempotency_key: req.headers['idempotency-key'],
      metodo: req.method,
      ruta: req.originalUrl,
      status,
      codigo: cuerpo.code,
      detalle: cuerpo.detail,
    });

    res.status(status).contentType('application/problem+json').json(cuerpo);
  }
}
