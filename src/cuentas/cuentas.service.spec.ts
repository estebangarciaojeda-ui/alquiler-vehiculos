import { ConflictException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { Cuenta } from './cuenta.entity.js';
import { CuentasService } from './cuentas.service.js';
import { verificarContrasena } from './password.util.js';

describe('CuentasService', () => {
  function preparar(existente: Cuenta | null = null) {
    const repo = {
      findOneBy: vi.fn().mockResolvedValue(existente),
      create: vi.fn((datos) => ({ id: 7, ...datos })),
      save: vi.fn(async (cuenta) => cuenta),
    } as unknown as Repository<Cuenta>;
    return { repo, service: new CuentasService(repo) };
  }

  it('normaliza el correo, cifra la contraseña y crea la cuenta', async () => {
    const { repo, service } = preparar();

    const cuenta = await service.registrar('  Ana Pérez  ', '  ANA@CORREO.COM ', 'clave-segura');

    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ nombre: 'Ana Pérez', email: 'ana@correo.com' }));
    expect(cuenta.passwordHash).not.toContain('clave-segura');
    await expect(verificarContrasena('clave-segura', cuenta.passwordHash)).resolves.toBe(true);
  });

  it('rechaza un correo ya registrado', async () => {
    const existente = { id: 1, email: 'ana@correo.com' } as Cuenta;
    const { service } = preparar(existente);

    await expect(service.registrar('Ana', 'ANA@CORREO.COM', 'clave-segura')).rejects.toBeInstanceOf(ConflictException);
  });
});
