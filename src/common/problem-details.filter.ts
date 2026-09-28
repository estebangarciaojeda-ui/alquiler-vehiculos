import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';

interface CuerpoConCodigo {
  code?: string;
  message?: string | string[];
}

/**
 * Traduce cualquier excepción (incluidas las que lanzan ValidationPipe y los pipes de
 * parámetros) al formato ProblemDetails del contrato. Se aplica solo al controlador de
 * autos vía @UseFilters, para no cambiar las respuestas de error de sucursales/vehiculos/reservas.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const cuerpo = exception.getResponse();

      if (typeof cuerpo === 'object' && cuerpo !== null && 'code' in cuerpo) {
        // Ya viene con forma ProblemDetails (ProblemDetailsException).
        response.status(status).contentType('application/problem+json').json(cuerpo);
        return;
      }

      const mensaje = (cuerpo as CuerpoConCodigo | undefined)?.message ?? exception.message;
      const detail = Array.isArray(mensaje) ? mensaje.join('; ') : String(mensaje);
      response
        .status(status)
        .contentType('application/problem+json')
        .json({
          type: 'https://api.booking-hub.com/errors/validation-failed',
          title: exception.name,
          status,
          detail,
          code: 'VALIDATION_FAILED',
        });
      return;
    }

    // No hay un código de la enumeración del contrato para "error interno inesperado";
    // se reutiliza VALIDATION_FAILED como el más genérico de los disponibles.
    response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .contentType('application/problem+json')
      .json({
        type: 'https://api.booking-hub.com/errors/internal-error',
        title: 'Internal Server Error',
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        detail: 'Ocurrió un error inesperado.',
        code: 'VALIDATION_FAILED',
      });
  }
}
