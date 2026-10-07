import { createHmac, timingSafeEqual } from 'node:crypto';

function firmar(payload: string, secreto: string): string {
  return createHmac('sha256', secreto).update(payload).digest('base64url');
}

export function crearCookieSesion(nombre: string, secreto: string, sujeto: string, duracionMs: number): string {
  const payload = `${sujeto}.${Date.now() + duracionMs}`;
  const valor = `${payload}.${firmar(payload, secreto)}`;
  return `${nombre}=${valor}; HttpOnly; Path=/; Max-Age=${duracionMs / 1000}; SameSite=Lax`;
}

export function cookieDeCierre(nombre: string): string {
  return `${nombre}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`;
}

export function leerSesion(cookieHeader: string | undefined, nombre: string, secreto: string): string | null {
  if (!cookieHeader) return null;
  const cookie = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${nombre}=`));
  if (!cookie) return null;

  const [sujeto, expira, firma, ...resto] = cookie.slice(nombre.length + 1).split('.');
  if (!sujeto || !expira || !firma || resto.length > 0) return null;

  const esperada = Buffer.from(firmar(`${sujeto}.${expira}`, secreto));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;

  return Date.now() < Number(expira) ? sujeto : null;
}
