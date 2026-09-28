import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { sesionValida } from './admin-session.util.js';

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const secreto = this.config.get<string>('ADMIN_SESSION_SECRET') ?? '';
    if (!sesionValida(request.headers.cookie, secreto)) {
      throw new UnauthorizedException('Sesión de administrador requerida');
    }
    return true;
  }
}
