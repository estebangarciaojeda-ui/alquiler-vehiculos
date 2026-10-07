import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request } from 'express';
import { Repository } from 'typeorm';
import { Cuenta } from '../cuentas/cuenta.entity.js';
import { leerBearer, verificarJwt } from './jwt.util.js';

// Guard independiente para las rutas que consume el frontend React (JWT puro,
// sin cookie). AdminAuthGuard (panel admin clásico) también acepta este mismo
// JWT como alternativa, para no duplicar endpoints.
@Injectable()
export class JwtAdminGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    @InjectRepository(Cuenta) private readonly cuentas: Repository<Cuenta>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const secreto = this.config.get<string>('JWT_SECRET') ?? this.config.get<string>('ADMIN_SESSION_SECRET') ?? '';
    const token = leerBearer(request.headers.authorization);
    const payload = verificarJwt(token, secreto);
    if (!payload || payload.role !== 'admin') {
      throw new UnauthorizedException('Token JWT de administrador requerido');
    }
    if (payload.sub === 'admin') return true;
    if (/^\d+$/.test(payload.sub)) {
      const cuenta = await this.cuentas.findOne({ where: { id: Number(payload.sub) }, select: { id: true, rol: true } });
      if (cuenta?.rol === 'admin') return true;
    }
    throw new UnauthorizedException('La cuenta ya no tiene privilegios de administrador');
  }
}
