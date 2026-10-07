import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { cookieDeCierre, crearCookieSesion } from '../common/sesion-firmada.util.js';
import { ClienteAuthGuard, COOKIE_CLIENTE, type PeticionCliente } from './cliente-auth.guard.js';
import { CuentasService } from './cuentas.service.js';
import { LoginCuentaDto } from './dto/login-cuenta.dto.js';

const DURACION_SESION_MS = 8 * 60 * 60 * 1000;

@ApiTags('Cuentas de cliente')
@Controller('api/v1/cuentas')
export class CuentasController {
  constructor(
    private readonly cuentas: CuentasService,
    private readonly config: ConfigService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Iniciar sesión como cliente (crea una cookie de sesión)' })
  @ApiResponse({ status: 401, description: 'Correo o contraseña incorrectos' })
  async login(@Body() dto: LoginCuentaDto, @Res({ passthrough: true }) res: Response) {
    const cuenta = await this.cuentas.validarLogin(dto.email, dto.contrasena);
    if (!cuenta) throw new UnauthorizedException('Correo o contraseña incorrectos');

    const secreto = this.config.get<string>('ADMIN_SESSION_SECRET') ?? '';
    res.setHeader('Set-Cookie', crearCookieSesion(COOKIE_CLIENTE, secreto, String(cuenta.id), DURACION_SESION_MS));
    return { id: cuenta.id, email: cuenta.email, nombre: cuenta.nombre };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cerrar la sesión del cliente' })
  logout(@Res({ passthrough: true }) res: Response) {
    res.setHeader('Set-Cookie', cookieDeCierre(COOKIE_CLIENTE));
    return { ok: true };
  }

  @Get('yo')
  @UseGuards(ClienteAuthGuard)
  @ApiOperation({ summary: 'Datos de la cuenta con sesión iniciada' })
  async yo(@Req() req: PeticionCliente) {
    const cuenta = await this.cuentas.buscarPorId(req.clienteId!);
    if (!cuenta) throw new UnauthorizedException('Inicia sesión para continuar');
    return { id: cuenta.id, email: cuenta.email, nombre: cuenta.nombre };
  }
}
