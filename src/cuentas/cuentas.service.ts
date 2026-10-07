import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cuenta } from './cuenta.entity.js';
import { verificarContrasena } from './password.util.js';

@Injectable()
export class CuentasService {
  constructor(@InjectRepository(Cuenta) private readonly repo: Repository<Cuenta>) {}

  async validarLogin(email: string, contrasena: string): Promise<Cuenta | null> {
    const cuenta = await this.repo.findOneBy({ email: email.trim().toLowerCase() });
    if (!cuenta) return null;
    return (await verificarContrasena(contrasena, cuenta.passwordHash)) ? cuenta : null;
  }

  buscarPorId(id: number): Promise<Cuenta | null> {
    return this.repo.findOneBy({ id });
  }
}
