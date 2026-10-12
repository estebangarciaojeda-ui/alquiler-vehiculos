import { describe, expect, it } from 'vitest';
import { cookieDeCierre, crearCookieSesion, leerSesion } from './sesion-firmada.util.js';

const SECRETO = 'secreto-de-prueba';
const NOMBRE = 'mi_cookie';

describe('sesion-firmada.util', () => {
  it('crea una cookie que se puede leer de vuelta con el mismo sujeto', () => {
    const cookie = crearCookieSesion(NOMBRE, SECRETO, '7', 60_000);
    const valor = cookie.split(';')[0]; // "mi_cookie=sujeto.expira.firma"
    expect(leerSesion(valor, NOMBRE, SECRETO)).toBe('7');
  });

  it('rechaza la cookie si se firmó con otro secreto', () => {
    const cookie = crearCookieSesion(NOMBRE, SECRETO, '7', 60_000);
    const valor = cookie.split(';')[0];
    expect(leerSesion(valor, NOMBRE, 'otro-secreto')).toBeNull();
  });

  it('rechaza la cookie si el sujeto fue alterado sin resfirmar', () => {
    const cookie = crearCookieSesion(NOMBRE, SECRETO, '7', 60_000);
    const [, resto] = cookie.split('=');
    const [, expira, firma] = resto.split(';')[0].split('.');
    const falsa = `${NOMBRE}=999.${expira}.${firma}`;
    expect(leerSesion(falsa, NOMBRE, SECRETO)).toBeNull();
  });

  it('rechaza una sesión ya expirada', () => {
    const cookie = crearCookieSesion(NOMBRE, SECRETO, '7', -1000);
    const valor = cookie.split(';')[0];
    expect(leerSesion(valor, NOMBRE, SECRETO)).toBeNull();
  });

  it('devuelve null si la cookie buscada no está presente', () => {
    expect(leerSesion('otra_cookie=algo', NOMBRE, SECRETO)).toBeNull();
    expect(leerSesion(undefined, NOMBRE, SECRETO)).toBeNull();
  });

  it('devuelve null ante un valor de cookie malformado', () => {
    expect(leerSesion(`${NOMBRE}=solo-un-valor`, NOMBRE, SECRETO)).toBeNull();
  });

  it('cookieDeCierre expira inmediatamente la cookie', () => {
    expect(cookieDeCierre(NOMBRE)).toContain('Max-Age=0');
  });
});
