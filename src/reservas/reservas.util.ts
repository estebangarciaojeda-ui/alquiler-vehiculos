import { randomInt } from 'node:crypto';

const MS_POR_DIA = 24 * 60 * 60 * 1000;
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function calcularDias(desde: string, hasta: string): number {
  const [ya, ma, da] = desde.split('-').map(Number);
  const [yb, mb, db] = hasta.split('-').map(Number);
  const diferencia = Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da);
  return Math.round(diferencia / MS_POR_DIA);
}

export function generarCodigo(): string {
  let sufijo = '';
  for (let i = 0; i < 6; i++) sufijo += ALFABETO[randomInt(ALFABETO.length)];
  return `AS-${sufijo}`;
}

export function hoyEnEcuador(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' });
}
