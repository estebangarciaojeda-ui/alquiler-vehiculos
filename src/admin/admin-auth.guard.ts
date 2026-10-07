import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { leerBearer, verificarJwt } from '../auth-jwt/jwt.util.js';
import { leerSesion } from '../common/sesion-firmada.util.js';
import { CuentasService } from '../cuentas/cuentas.service.js';

export const COOKIE_ADMIN = 'admin_session';

// Acepta sesión por cookie (panel admin clásico) O un JWT de rol admin
// (frontend React). Cualquiera de las dos es suficiente.
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly cuentas: CuentasService,
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
        const cuenta = await this.cuentas.buscarPorId(Number(payload.sub));
        if (cuenta?.rol === 'admin') return true;
      }
    }

    throw new UnauthorizedException('Sesión de administrador requerida');
  }
}
