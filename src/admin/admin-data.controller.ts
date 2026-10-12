import { Body, ConflictException, Controller, Get, NotFoundException, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { Cuenta } from '../cuentas/cuenta.entity.js';
import { CuentasService } from '../cuentas/cuentas.service.js';
import { GdsOrder } from '../gds-autos/entities/gds-order.entity.js';
import { GdsWebhook } from '../gds-autos/entities/gds-webhook.entity.js';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { ActualizarCuentaDto } from './dto/actualizar-cuenta.dto.js';
import { ActualizarRolDto } from './dto/actualizar-rol.dto.js';
import { CrearCuentaDto } from './dto/crear-cuenta.dto.js';

@ApiExcludeController()
@Controller('admin/api')
@UseGuards(AdminAuthGuard)
export class AdminDataController {
  constructor(
    @InjectRepository(GdsOrder) private readonly ordenes: Repository<GdsOrder>,
    @InjectRepository(GdsWebhook) private readonly webhooks: Repository<GdsWebhook>,
    @InjectRepository(Cuenta) private readonly cuentas: Repository<Cuenta>,
    private readonly cuentasService: CuentasService,
  ) {}

  @Get('cuentas')
  listarCuentas() {
    return this.cuentas.find({
      select: { id: true, nombre: true, email: true, rol: true, creadaEn: true },
      order: { creadaEn: 'DESC', id: 'DESC' },
    });
  }

  @Post('cuentas')
  async crearCuenta(@Body() dto: CrearCuentaDto) {
    const cuenta = await this.cuentasService.registrar(dto.nombre, dto.email, dto.contrasena, dto.rol ?? 'cliente');
    const { passwordHash: _passwordHash, ...resto } = cuenta;
    return resto;
  }

  @Patch('cuentas/:id')
  async actualizarCuenta(@Param('id', ParseIntPipe) id: number, @Body() dto: ActualizarCuentaDto) {
    const cuenta = await this.cuentas.findOneBy({ id });
    if (!cuenta) throw new NotFoundException(`Cuenta ${id} no existe`);

    const email = dto.email.trim().toLowerCase();
    const duplicada = await this.cuentas.findOneBy({ email });
    if (duplicada && duplicada.id !== id) throw new ConflictException('Ya existe una cuenta con ese correo');

    try {
      await this.cuentas.update(id, { nombre: dto.nombre.trim(), email });
    } catch (error) {
      if (error instanceof QueryFailedError && (error.driverError as { code?: string })?.code === '23505') {
        throw new ConflictException('Ya existe una cuenta con ese correo');
      }
      throw error;
    }

    return this.cuentas.findOne({
      where: { id },
      select: { id: true, nombre: true, email: true, rol: true, creadaEn: true },
    });
  }

  @Patch('cuentas/:id/rol')
  async actualizarRol(@Param('id', ParseIntPipe) id: number, @Body() dto: ActualizarRolDto) {
    const resultado = await this.cuentas.update(id, { rol: dto.rol });
    if (resultado.affected === 0) throw new NotFoundException(`Cuenta ${id} no existe`);
    const cuenta = await this.cuentas.findOne({
      where: { id },
      select: { id: true, nombre: true, email: true, rol: true, creadaEn: true },
    });
    return cuenta;
  }

  @Get('gds-orders')
  listarOrdenes() {
    return this.ordenes.find({ order: { creadoEn: 'DESC' }, take: 200 });
  }

  @Get('gds-webhooks')
  listarWebhooks() {
    return this.webhooks.find({ order: { creadoEn: 'DESC' } });
  }
}
