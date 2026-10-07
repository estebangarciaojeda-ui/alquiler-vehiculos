import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { cookieDeCierre, crearCookieSesion } from '../common/sesion-firmada.util.js';
import { ClienteAuthGuard, COOKIE_CLIENTE, type PeticionCliente } from './cliente-auth.guard.js';
import { CuentasService } from './cuentas.service.js';
import { LoginCuentaDto } from './dto/login-cuenta.dto.js';
import { RegistroCuentaDto } from './dto/registro-cuenta.dto.js';

const DURACION_SESION_MS = 8 * 60 * 60 * 1000;

@ApiTags('Cuentas de cliente')
@Controller('api/v1/cuentas')
export class CuentasController {
  constructor(
    private readonly cuentas: CuentasService,
    private readonly config: ConfigService,
  ) {}

  private iniciarSesion(res: Response, cuentaId: number): void {
    const secreto = this.config.get<string>('ADMIN_SESSION_SECRET') ?? '';
    res.setHeader('Set-Cookie', crearCookieSesion(COOKIE_CLIENTE, secreto, String(cuentaId), DURACION_SESION_MS));
  }

  @Post('registro')
  @ApiOperation({ summary: 'Crear una cuenta de cliente e iniciar sesión' })
  @ApiResponse({ status: 201, description: 'Cuenta creada' })
  @ApiResponse({ status: 409, description: 'El correo ya está registrado' })
  async registro(@Body() dto: RegistroCuentaDto, @Res({ passthrough: true }) res: Response) {
    const cuenta = await this.cuentas.registrar(dto.nombre, dto.email, dto.contrasena);
    this.iniciarSesion(res, cuenta.id);
    return { id: cuenta.id, email: cuenta.email, nombre: cuenta.nombre };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Iniciar sesión como cliente (crea una cookie de sesión)' })
  @ApiResponse({ status: 401, description: 'Correo o contraseña incorrectos' })
  async login(@Body() dto: LoginCuentaDto, @Res({ passthrough: true }) res: Response) {
    const cuenta = await this.cuentas.validarLogin(dto.email, dto.contrasena);
    if (!cuenta) throw new UnauthorizedException('Correo o contraseña incorrectos');

    this.iniciarSesion(res, cuenta.id);
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
