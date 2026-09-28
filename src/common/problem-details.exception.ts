import { HttpException } from '@nestjs/common';

// Códigos definidos en contracts/autos-openapi.yaml (components.schemas.ProblemDetails.code.enum).
export const CODIGOS_PROBLEMA = [
  'VALIDATION_FAILED',
  'CAR_NO_LONGER_AVAILABLE',
  'PRICE_CHANGED',
  'DEPOT_CLOSED',
  'DRIVER_AGE_RESTRICTION',
  'BOOKING_NOT_CONFIRMED',
  'CANCELLATION_NOT_ALLOWED',
  'RATE_LIMIT_EXCEEDED',
  'PAYMENT_REFERENCE_INVALID',
  'PAYMENT_NOT_AUTHORIZED',
] as const;

export type CodigoProblema = (typeof CODIGOS_PROBLEMA)[number];

export interface ParametroInvalido {
  name: string;
  reason: string;
}

/**
 * Error con forma ProblemDetails (RFC 7807), tal como lo exige el contrato.
 * ProblemDetailsFilter lo serializa como application/problem+json sin modificarlo.
 */
export class ProblemDetailsException extends HttpException {
  constructor(
    status: number,
    code: CodigoProblema,
    title: string,
    detail?: string,
    invalidParams?: ParametroInvalido[],
  ) {
    super(
      {
        type: `https://api.booking-hub.com/errors/${code.toLowerCase().replace(/_/g, '-')}`,
        title,
        status,
        detail,
        code,
        invalidParams,
      },
      status,
    );
  }
}
