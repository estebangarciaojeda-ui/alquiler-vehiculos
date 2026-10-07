import { Body, Controller, HttpCode, HttpStatus, Post, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { timingSafeEqual } from 'node:crypto';
import { CuentasService } from '../cuentas/cuentas.service.js';
import { LoginJwtDto } from './dto/login-jwt.dto.js';
import { crearJwt } from './jwt.util.js';

function igual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

const DURACION_MS = 8 * 60 * 60 * 1000;

// Login con JWT (RFC 7519): usado por el frontend React, separado de las
// sesiones por cookie del marketplace y del panel admin clásico.
@ApiTags('Autenticación JWT (React)')
@Controller('api/v1/auth')
export class AuthJwtController {
  constructor(
    private readonly config: ConfigService,
    private readonly cuentas: CuentasService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login con JWT: admite usuario admin o cuenta de cliente' })
  async login(@Body() dto: LoginJwtDto) {
    const secreto = this.config.get<string>('JWT_SECRET') ?? this.config.get<string>('ADMIN_SESSION_SECRET') ?? '';

    const usuarioAdmin = this.config.get<string>('ADMIN_USER') ?? '';
    const contrasenaAdmin = this.config.get<string>('ADMIN_PASSWORD') ?? '';
    if (igual(dto.identificador, usuarioAdmin) && igual(dto.contrasena, contrasenaAdmin)) {
      const accessToken = crearJwt({ sub: 'admin', role: 'admin', nombre: 'Administrador' }, secreto, DURACION_MS);
      return { accessToken, role: 'admin', nombre: 'Administrador' };
    }

    const cuenta = await this.cuentas.validarLogin(dto.identificador, dto.contrasena);
    if (cuenta) {
      const accessToken = crearJwt({ sub: String(cuenta.id), role: cuenta.rol, nombre: cuenta.nombre }, secreto, DURACION_MS);
      return { accessToken, role: cuenta.rol, nombre: cuenta.nombre };
    }

    throw new UnauthorizedException('Credenciales incorrectas');
  }
}
