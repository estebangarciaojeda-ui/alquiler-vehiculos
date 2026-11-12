import { Body, ConflictException, Controller, Get, HttpException, NotFoundException, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, QueryFailedError, Repository } from 'typeorm';
import { Reserva } from '../reservas/reserva.entity.js';
import { Cuenta } from '../cuentas/cuenta.entity.js';
import { CuentasService } from '../cuentas/cuentas.service.js';
import { hashContrasena } from '../cuentas/password.util.js';
import { GdsOrder } from '../gds-autos/entities/gds-order.entity.js';
import { GdsWebhook } from '../gds-autos/entities/gds-webhook.entity.js';
import { OrdenesB2bService } from '../integracion-booking/ordenes-b2b.service.js';
import { ProblemaV3Exception } from '../integracion-booking/problema-v3.js';
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
    @InjectRepository(Reserva) private readonly reservas: Repository<Reserva>,
    private readonly cuentasService: CuentasService,
    private readonly ordenesB2b: OrdenesB2bService,
  ) {}

  /**
   * Buscador del mostrador: por código de reserva, identificación/cédula, correo o nombre (sin `q` lista las más recientes), paginado con `page` y `limit`.
   * Cada fila trae `estado_mostrador`: RESERVADO (pendiente de entrega), CONFIRMADO_ASISTIDO (llaves entregadas), COMPLETADA o CANCELADA.
   */
  @Get('reservas/buscar')
  async buscarReservas(@Query('q') q?: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    const termino = (q ?? '').trim();
    const tam = Math.min(Math.max(parseInt(limit ?? '10', 10) || 10, 1), 100);
    const pagina = Math.max(parseInt(page ?? '1', 10) || 1, 1);
    const qb = this.reservas
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.vehiculo', 'v')
      .leftJoinAndSelect('r.sucursalRecogida', 'sr')
      .orderBy('r.id', 'DESC')
      .skip((pagina - 1) * tam)
      .take(tam);
    if (termino) {
      const patron = `%${termino.toLowerCase()}%`;
      const porCedula = await this.cuentas
        .createQueryBuilder('c')
        .select('c.email', 'email')
        .where('LOWER(c.identificacion) LIKE :p', { p: patron })
        .getRawMany<{ email: string }>();
      const correos = porCedula.map((c) => c.email);
      qb.where(
        new Brackets((w) => {
          w.where('LOWER(r.codigo) LIKE :p', { p: patron })
            .orWhere('LOWER(r.email) LIKE :p', { p: patron })
            .orWhere('LOWER(r.nombreCliente) LIKE :p', { p: patron })
            .orWhere("LOWER(COALESCE(r.conductor->>'identificacion', '')) LIKE :p", { p: patron });
          if (correos.length > 0) w.orWhere('LOWER(r.email) IN (:...correos)', { correos });
        }),
      );
    }
    const [filas, total] = await qb.getManyAndCount();
    const emails = [...new Set(filas.map((r) => r.email.toLowerCase()))];
    const cuentas = emails.length > 0 ? await this.cuentas.createQueryBuilder('c').where('LOWER(c.email) IN (:...emails)', { emails }).getMany() : [];
    const porCorreo = new Map(cuentas.map((c) => [c.email.toLowerCase(), c]));
    const items = filas.map((r) => {
      const cuenta = porCorreo.get(r.email.toLowerCase());
      let estadoMostrador = 'RESERVADO';
      if (r.estado === 'CANCELADA') estadoMostrador = 'CANCELADA';
      else if (r.devueltaEn) estadoMostrador = 'COMPLETADA';
      else if (r.entregadaEn) estadoMostrador = 'CONFIRMADO_ASISTIDO';
      return {
        ...r,
        estado_mostrador: estadoMostrador,
        identificacion: (r.conductor?.identificacion as string | undefined) ?? cuenta?.identificacion ?? null,
        client_id: cuenta ? `CLI-${String(cuenta.id).padStart(5, '0')}` : null,
      };
    });
    return { items, total, page: pagina, limit: tam, paginas: Math.max(Math.ceil(total / tam), 1) };
  }

  /** El administrador cancela una reserva aún no entregada: se libera el auto y se repone el stock en Booking. */
  @Post('reservas/:id/cancelar')
  async cancelarReserva(@Param('id', ParseIntPipe) id: number, @Body() cuerpo: Record<string, unknown>) {
    try {
      const motivo = typeof cuerpo?.motivo === 'string' ? cuerpo.motivo.trim() : undefined;
      return (await this.ordenesB2b.cancelarEnMostrador(String(id), motivo)).body;
    } catch (error) {
      if (error instanceof ProblemaV3Exception) {
        const p = error.getResponse() as { detail?: string; title?: string };
        throw new HttpException(p.detail ?? p.title ?? 'No se pudo cancelar la reserva', error.getStatus());
      }
      throw error;
    }
  }

  /** El administrador marca el auto como DISPONIBLE al terminar de limpiarlo (no espera las 2 h completas). */
  @Post('reservas/:id/disponible')
  async liberarAuto(@Param('id', ParseIntPipe) id: number) {
    try {
      return await this.ordenesB2b.liberarAutoEnMostrador(String(id));
    } catch (error) {
      if (error instanceof ProblemaV3Exception) {
        const p = error.getResponse() as { detail?: string; title?: string };
        throw new HttpException(p.detail ?? p.title ?? 'No se pudo habilitar el auto', error.getStatus());
      }
      throw error;
    }
  }

  /** El administrador registra en el mostrador la devolución del auto (km de retorno y combustible). */
  @Post('reservas/:id/devolucion')
  async devolverReserva(@Param('id', ParseIntPipe) id: number, @Body() cuerpo: Record<string, unknown>) {
    try {
      return (await this.ordenesB2b.devolverEnMostrador(String(id), cuerpo)).body;
    } catch (error) {
      if (error instanceof ProblemaV3Exception) {
        const p = error.getResponse() as { detail?: string; title?: string };
        throw new HttpException(p.detail ?? p.title ?? 'No se pudo registrar la devolución', error.getStatus());
      }
      throw error;
    }
  }

  /** El administrador confirma en el mostrador la entrega de llaves; si la reserva vino de Booking, se le notifica. */
  @Post('reservas/:id/entrega')
  async entregarReserva(@Param('id', ParseIntPipe) id: number, @Body() cuerpo: Record<string, unknown>) {
    try {
      const adminId = typeof cuerpo?.admin_id === 'string' && cuerpo.admin_id.trim() ? cuerpo.admin_id.trim() : 'operador-mostrador';
      return (await this.ordenesB2b.entregarEnMostrador(String(id), cuerpo, adminId)).body;
    } catch (error) {
      if (error instanceof ProblemaV3Exception) {
        const p = error.getResponse() as { detail?: string; title?: string };
        throw new HttpException(p.detail ?? p.title ?? 'No se pudo registrar la entrega', error.getStatus());
      }
      throw error;
    }
  }

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
      const datos: Partial<Cuenta> = { nombre: dto.nombre.trim(), email };
      if (dto.contrasena) {
        datos.passwordHash = await hashContrasena(dto.contrasena);
      }
      await this.cuentas.update(id, datos);
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
