import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { leerSesion } from '../common/sesion-firmada.util.js';

export const COOKIE_CLIENTE = 'cliente_session';

export type PeticionCliente = Request & { clienteId?: number };

@Injectable()
export class ClienteAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<PeticionCliente>();
    const secreto = this.config.get<string>('ADMIN_SESSION_SECRET') ?? '';
    const sujeto = leerSesion(request.headers.cookie, COOKIE_CLIENTE, secreto);
    if (!sujeto || !/^\d+$/.test(sujeto)) {
      throw new UnauthorizedException('Inicia sesión para continuar');
    }
    request.clienteId = Number(sujeto);
    return true;
  }
}
