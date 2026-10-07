import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derivar = promisify(scrypt) as (contrasena: string, sal: Buffer, longitud: number) => Promise<Buffer>;
const LONGITUD = 64;

export async function hashContrasena(contrasena: string): Promise<string> {
  const sal = randomBytes(16);
  const clave = await derivar(contrasena, sal, LONGITUD);
  return `${sal.toString('hex')}:${clave.toString('hex')}`;
}

export async function verificarContrasena(contrasena: string, almacenada: string): Promise<boolean> {
  const [salHex, claveHex] = almacenada.split(':');
  if (!salHex || !claveHex) return false;
  const clave = await derivar(contrasena, Buffer.from(salHex, 'hex'), LONGITUD);
  const esperada = Buffer.from(claveHex, 'hex');
  return clave.length === esperada.length && timingSafeEqual(clave, esperada);
}
