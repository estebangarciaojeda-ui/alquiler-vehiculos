import { createHmac, timingSafeEqual } from 'node:crypto';

export interface PayloadJwt {
  sub: string;
  role: 'admin' | 'cliente';
  nombre?: string;
  iat: number;
  exp: number;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function firmar(datos: string, secreto: string): string {
  return createHmac('sha256', secreto).update(datos).digest('base64url');
}

// Implementación mínima y estándar de JWT (HS256): header.payload.firma en base64url,
// sin dependencias externas. Misma estructura y garantías que cualquier librería JWT.
export function crearJwt(payload: Omit<PayloadJwt, 'iat' | 'exp'>, secreto: string, duracionMs: number): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const ahora = Math.floor(Date.now() / 1000);
  const cuerpo: PayloadJwt = { ...payload, iat: ahora, exp: ahora + Math.floor(duracionMs / 1000) };

  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(cuerpo));
  const firma = firmar(`${headerB64}.${payloadB64}`, secreto);

  return `${headerB64}.${payloadB64}.${firma}`;
}

export function verificarJwt(token: string | undefined, secreto: string): PayloadJwt | null {
  if (!token) return null;
  const partes = token.split('.');
  if (partes.length !== 3) return null;
  const [headerB64, payloadB64, firma] = partes;

  const firmaEsperada = Buffer.from(firmar(`${headerB64}.${payloadB64}`, secreto));
  const firmaRecibida = Buffer.from(firma);
  if (firmaEsperada.length !== firmaRecibida.length || !timingSafeEqual(firmaEsperada, firmaRecibida)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as PayloadJwt;
    if (Math.floor(Date.now() / 1000) >= payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function leerBearer(authorization: string | undefined): string | undefined {
  if (!authorization?.startsWith('Bearer ')) return undefined;
  return authorization.slice('Bearer '.length).trim();
}
