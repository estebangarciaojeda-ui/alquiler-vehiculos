import { createHmac, timingSafeEqual } from 'node:crypto';

const NOMBRE_COOKIE = 'admin_session';
const DURACION_MS = 8 * 60 * 60 * 1000;

function firmar(payload: string, secreto: string): string {
  return createHmac('sha256', secreto).update(payload).digest('base64url');
}

export function crearCookieSesion(secreto: string): string {
  const payload = `admin.${Date.now() + DURACION_MS}`;
  const firma = firmar(payload, secreto);
  const valor = `${payload}.${firma}`;
  return `${NOMBRE_COOKIE}=${valor}; HttpOnly; Path=/; Max-Age=${DURACION_MS / 1000}; SameSite=Lax`;
}

export function cookieDeCierre(): string {
  return `${NOMBRE_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`;
}

export function sesionValida(cookieHeader: string | undefined, secreto: string): boolean {
  if (!cookieHeader) return false;
  const match = cookieHeader.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${NOMBRE_COOKIE}=`));
  if (!match) return false;

  const valor = match.slice(NOMBRE_COOKIE.length + 1);
  const ultimoPunto = valor.lastIndexOf('.');
  if (ultimoPunto === -1) return false;

  const payload = valor.slice(0, ultimoPunto);
  const firma = valor.slice(ultimoPunto + 1);
  const firmaEsperada = firmar(payload, secreto);

  const bufA = Buffer.from(firma);
  const bufB = Buffer.from(firmaEsperada);
  if (bufA.length !== bufB.length || !timingSafeEqual(bufA, bufB)) return false;

  const expiraEn = Number(payload.split('.')[1]);
  return Number.isFinite(expiraEn) && Date.now() < expiraEn;
}
