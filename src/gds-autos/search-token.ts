import { ProblemDetailsException } from '../common/problem-details.exception.js';
import type { RouteDto } from './dto/common.dto.js';

interface CargaSearchToken {
  currency: string;
  route: RouteDto;
  exp: number;
}

const DURACION_MS = 15 * 60 * 1000;

export function crearSearchToken(currency: string, route: RouteDto): string {
  const carga: CargaSearchToken = { currency, route, exp: Date.now() + DURACION_MS };
  return Buffer.from(JSON.stringify(carga)).toString('base64url');
}

export function leerSearchToken(token: string): CargaSearchToken {
  let carga: CargaSearchToken;
  try {
    carga = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
  } catch {
    throw new ProblemDetailsException(
      400,
      'VALIDATION_FAILED',
      'search_token inválido',
      'El search_token no tiene un formato reconocible.',
    );
  }
  if (!carga?.exp || Date.now() > carga.exp) {
    throw new ProblemDetailsException(
      400,
      'VALIDATION_FAILED',
      'search_token expirado',
      'El search_token expiró; realiza una nueva búsqueda con POST /search.',
    );
  }
  return carga;
}

export const soloFecha = (iso: string): string => iso.slice(0, 10);
