import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request } from 'express';
import { Repository } from 'typeorm';
import { leerBearer, verificarJwt } from '../auth-jwt/jwt.util.js';
import { leerSesion } from '../common/sesion-firmada.util.js';
import { Cuenta } from '../cuentas/cuenta.entity.js';

export const COOKIE_ADMIN = 'admin_session';

// Acepta sesión por cookie (panel admin clásico) O un JWT de rol admin
// (frontend React). Cualquiera de las dos es suficiente.
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    @InjectRepository(Cuenta) private readonly cuentas: Repository<Cuenta>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const secretoSesion = this.config.get<string>('ADMIN_SESSION_SECRET') ?? '';
    if (leerSesion(request.headers.cookie, COOKIE_ADMIN, secretoSesion) === 'admin') {
      return true;
    }

    const secretoJwt = this.config.get<string>('JWT_SECRET') ?? secretoSesion;
    const payload = verificarJwt(leerBearer(request.headers.authorization), secretoJwt);
    if (payload?.role === 'admin') {
      if (payload.sub === 'admin') return true;
      if (/^\d+$/.test(payload.sub)) {
        const cuenta = await this.cuentas.findOne({ where: { id: Number(payload.sub) }, select: { id: true, rol: true } });
        if (cuenta?.rol === 'admin') return true;
      }
    }

    throw new UnauthorizedException('Sesión de administrador requerida');
  }
}
