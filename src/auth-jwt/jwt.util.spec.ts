import { describe, expect, it } from 'vitest';
import { crearJwt, leerBearer, verificarJwt } from './jwt.util.js';

const SECRETO = 'secreto-de-prueba';

describe('jwt.util', () => {
  it('crea un token que se verifica con el mismo secreto y conserva el payload', () => {
    const token = crearJwt({ sub: '42', role: 'admin', nombre: 'Ana' }, SECRETO, 60_000);
    const payload = verificarJwt(token, SECRETO);
    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe('42');
    expect(payload?.role).toBe('admin');
    expect(payload?.nombre).toBe('Ana');
  });

  it('rechaza un token firmado con un secreto distinto', () => {
    const token = crearJwt({ sub: '1', role: 'cliente' }, SECRETO, 60_000);
    expect(verificarJwt(token, 'otro-secreto')).toBeNull();
  });

  it('rechaza un token manipulado (payload alterado sin resfirmar)', () => {
    const token = crearJwt({ sub: '1', role: 'cliente' }, SECRETO, 60_000);
    const [header, , firma] = token.split('.');
    const payloadFalso = Buffer.from(JSON.stringify({ sub: '1', role: 'admin', iat: 0, exp: 9_999_999_999 })).toString('base64url');
    expect(verificarJwt(`${header}.${payloadFalso}.${firma}`, SECRETO)).toBeNull();
  });

  it('rechaza un token ya expirado', () => {
    const token = crearJwt({ sub: '1', role: 'cliente' }, SECRETO, -1000);
    expect(verificarJwt(token, SECRETO)).toBeNull();
  });

  it('rechaza tokens malformados o ausentes', () => {
    expect(verificarJwt(undefined, SECRETO)).toBeNull();
    expect(verificarJwt('no-es-un-jwt', SECRETO)).toBeNull();
    expect(verificarJwt('a.b', SECRETO)).toBeNull();
  });

  it('leerBearer extrae el token del encabezado Authorization', () => {
    expect(leerBearer('Bearer abc.def.ghi')).toBe('abc.def.ghi');
    expect(leerBearer(undefined)).toBeUndefined();
    expect(leerBearer('Basic dXNlcjpwYXNz')).toBeUndefined();
  });
});
