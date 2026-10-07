import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { Cuenta } from './cuenta.entity.js';
import { hashContrasena, verificarContrasena } from './password.util.js';

@Injectable()
export class CuentasService {
  constructor(@InjectRepository(Cuenta) private readonly repo: Repository<Cuenta>) {}

  async validarLogin(email: string, contrasena: string): Promise<Cuenta | null> {
    const cuenta = await this.repo.findOneBy({ email: email.trim().toLowerCase() });
    if (!cuenta) return null;
    return (await verificarContrasena(contrasena, cuenta.passwordHash)) ? cuenta : null;
  }

  async registrar(nombre: string, email: string, contrasena: string): Promise<Cuenta> {
    const emailNormalizado = email.trim().toLowerCase();
    if (await this.repo.findOneBy({ email: emailNormalizado })) {
      throw new ConflictException('Ya existe una cuenta con ese correo');
    }

    const cuenta = this.repo.create({
      nombre: nombre.trim(),
      email: emailNormalizado,
      passwordHash: await hashContrasena(contrasena),
    });

    try {
      return await this.repo.save(cuenta);
    } catch (error) {
      // La restricción UNIQUE de PostgreSQL evita duplicados aun si dos
      // registros del mismo correo llegan simultáneamente.
      if (error instanceof QueryFailedError && (error.driverError as { code?: string })?.code === '23505') {
        throw new ConflictException('Ya existe una cuenta con ese correo');
      }
      throw error;
    }
  }

  buscarPorId(id: number): Promise<Cuenta | null> {
    return this.repo.findOneBy({ id });
  }
}
