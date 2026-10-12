import { describe, expect, it } from 'vitest';
import { hashContrasena, verificarContrasena } from './password.util.js';

describe('password.util', () => {
  it('genera un hash con formato sal:clave, distinto en cada llamada (sal aleatoria)', async () => {
    const hash1 = await hashContrasena('miClaveSegura123');
    const hash2 = await hashContrasena('miClaveSegura123');
    expect(hash1).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
    expect(hash1).not.toBe(hash2);
  });

  it('verifica correctamente la contraseña correcta', async () => {
    const hash = await hashContrasena('miClaveSegura123');
    expect(await verificarContrasena('miClaveSegura123', hash)).toBe(true);
  });

  it('rechaza una contraseña incorrecta', async () => {
    const hash = await hashContrasena('miClaveSegura123');
    expect(await verificarContrasena('otraClave', hash)).toBe(false);
  });

  it('rechaza un hash almacenado con formato inválido', async () => {
    expect(await verificarContrasena('cualquiera', 'esto-no-tiene-el-formato-correcto')).toBe(false);
    expect(await verificarContrasena('cualquiera', '')).toBe(false);
  });
});
