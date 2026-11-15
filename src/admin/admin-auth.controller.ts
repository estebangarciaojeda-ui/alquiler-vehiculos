import { Body, Controller, Get, HttpCode, HttpStatus, Post, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { timingSafeEqual } from 'node:crypto';
import type { Response } from 'express';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { LoginDto } from './dto/login.dto.js';
import { cookieDeCierre, crearCookieSesion } from '../common/sesion-firmada.util.js';
import { COOKIE_ADMIN } from './admin-auth.guard.js';
import { CuentasService } from '../cuentas/cuentas.service.js';

function igual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

@ApiExcludeController()
@Controller('admin/api')
export class AdminAuthController {
  constructor(
    private readonly config: ConfigService,
    private readonly cuentas: CuentasService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const usuarioEsperado = this.config.get<string>('ADMIN_USER') ?? '';
    const contrasenaEsperada = this.config.get<string>('ADMIN_PASSWORD') ?? '';
    let ok = igual(dto.usuario, usuarioEsperado) && igual(dto.contrasena, contrasenaEsperada);
    // Además del administrador principal, entra cualquier cuenta con rol administrador (correo o identificación + contraseña),
    // igual que en el login JWT del panel React: así las mismas credenciales sirven en ambos paneles.
    if (!ok) {
      const cuenta = await this.cuentas.validarLogin(dto.usuario, dto.contrasena);
      ok = cuenta?.rol === 'admin';
    }
    if (!ok) throw new UnauthorizedException('Usuario o contraseña incorrectos');

    const secreto = this.config.get<string>('ADMIN_SESSION_SECRET') ?? '';
    res.setHeader('Set-Cookie', crearCookieSesion(COOKIE_ADMIN, secreto, 'admin', 8 * 60 * 60 * 1000));
    return { ok: true };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Res({ passthrough: true }) res: Response) {
    res.setHeader('Set-Cookie', cookieDeCierre(COOKIE_ADMIN));
    return { ok: true };
  }

  @Get('whoami')
  @UseGuards(AdminAuthGuard)
  whoami() {
    return { ok: true };
  }
}
