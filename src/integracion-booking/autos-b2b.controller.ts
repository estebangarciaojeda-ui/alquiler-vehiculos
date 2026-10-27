import { Body, Controller, Get, Headers, HttpCode, Param, Patch, Post, Put, Query, Req, Res, UseFilters, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Acceso, B2bAuthGuard, TrazaInterceptor } from './acceso-b2b.js';
import { hoyEnEcuador, normalizarSolicitudBusqueda } from './booking.util.js';
import { EventosService } from './eventos.service.js';
import { FlotaService } from './flota.service.js';
import { OrdenesB2bService, type Ctx, type Salida } from './ordenes-b2b.service.js';
import { ProblemaV3Exception, ProblemaV3Filter } from './problema-v3.js';

type Req = Request & { correlationId?: string };

const baseUrl = (req: Request): string => (process.env.PUBLIC_BASE_URL ?? `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');

function contexto(req: Req, idempotencyKey?: string): Ctx {
  const key = idempotencyKey?.trim();
  return { correlationId: req.correlationId ?? 'sin-correlacion', idempotencyKey: key ? key.slice(0, 100) : undefined };
}

function responder(res: Response, salida: Salida): unknown {
  res.status(salida.status);
  if (salida.replay) res.setHeader('Idempotent-Replayed', 'true');
  return salida.body;
}

/**
 * Contrato REST canónico v3 (contracts/autos-openapi-v3.yaml) que consume Booking Prototipo.
 * Se publica bajo /autos y /api/v3/autos; los alias raíz (/health, /reservas) están en AutosB2bRaizController.
 * Los controladores B2B no pasan por el límite de peticiones (Booking llama desde una sola IP).
 */
@ApiExcludeController()
@SkipThrottle()
@UseFilters(ProblemaV3Filter)
@UseGuards(B2bAuthGuard)
@UseInterceptors(TrazaInterceptor)
@Controller(['autos', 'api/v3/autos'])
export class AutosB2bController {
  constructor(
    private readonly flota: FlotaService,
    private readonly ordenes: OrdenesB2bService,
    private readonly eventos: EventosService,
  ) {}

  @Get('health')
  salud() {
    return this.flota.salud();
  }

  @Get('promociones/contrato')
  contratoPromo() {
    return this.flota.obtenerContratoPromo();
  }

  @Put('promociones/contrato')
  actualizarContratoPromo(@Body() cuerpo: unknown) {
    return this.flota.actualizarContratoPromo(cuerpo);
  }

  @Get('eventos')
  @Acceso('admin_o_clave')
  listarEventos(@Query('limit') limit?: string, @Query('after') after?: string) {
    const n = Math.min(Math.max(parseInt(limit ?? '10', 10) || 10, 1), 100);
    return this.eventos.listar(n, after);
  }

  @Get()
  catalogo(@Req() req: Request, @Query('category') categoria?: string, @Query('transmission') transmision?: string, @Query('limit') limit?: string) {
    const n = Math.min(Math.max(parseInt(limit ?? '100', 10) || 100, 1), 200);
    return this.flota.catalogo({ categoria: categoria?.toUpperCase(), transmision: transmision?.toUpperCase(), limit: n }, baseUrl(req));
  }

  @Post('search')
  @HttpCode(200)
  buscar(@Req() req: Request, @Body() cuerpo: unknown) {
    const norm = normalizarSolicitudBusqueda(cuerpo, hoyEnEcuador());
    if (!norm.ok) {
      const titulos = { INVALID_PAYLOAD: 'Petición inválida', INVALID_DATES: 'Fechas inválidas', DRIVER_UNDERAGE: 'Conductor menor de 18 años' } as const;
      throw new ProblemaV3Exception(422, norm.codigo, titulos[norm.codigo], norm.errores.map((e) => `${e.name}: ${e.reason}`).join(' '), norm.errores);
    }
    return this.flota.buscar(norm.valor, baseUrl(req));
  }

  @Get('flota')
  verFlota(@Req() req: Request) {
    return this.flota.flota(baseUrl(req));
  }

  @Post('inventario/sincronizar')
  @HttpCode(200)
  @Acceso('admin_o_clave')
  sincronizar() {
    return this.flota.sincronizarFlota();
  }

  // ── Órdenes ───────────────────────────────────────────────────────────

  @Get('orders')
  @Acceso('admin_o_clave')
  listarOrdenes() {
    return this.ordenes.listar();
  }

  @Post(['orders/create', 'reservas'])
  async crear(@Req() req: Req, @Res({ passthrough: true }) res: Response, @Body() cuerpo: unknown, @Headers('idempotency-key') clave?: string) {
    return responder(res, await this.ordenes.crear(cuerpo, contexto(req, clave)));
  }

  @Post('reservas/:id/checkin')
  @HttpCode(200)
  async checkin(@Req() req: Req, @Res({ passthrough: true }) res: Response, @Param('id') id: string, @Body() cuerpo: unknown, @Headers('idempotency-key') clave?: string) {
    return responder(res, await this.ordenes.checkinDigital(id, cuerpo, contexto(req, clave)));
  }

  @Post('orders/:id/checkin-entrega')
  @HttpCode(200)
  async entrega(@Req() req: Req, @Res({ passthrough: true }) res: Response, @Param('id') id: string, @Body() cuerpo: unknown, @Headers('idempotency-key') clave?: string) {
    return responder(res, await this.ordenes.entregar(id, cuerpo, contexto(req, clave)));
  }

  @Post('orders/:id/checkin-devolucion')
  @HttpCode(200)
  async devolucion(@Req() req: Req, @Res({ passthrough: true }) res: Response, @Param('id') id: string, @Body() cuerpo: unknown, @Headers('idempotency-key') clave?: string) {
    return responder(res, await this.ordenes.devolver(id, cuerpo, contexto(req, clave)));
  }

  @Get('orders/:orderId')
  obtenerOrden(@Param('orderId') orderId: string) {
    return this.ordenes.obtener(orderId);
  }

  @Post('orders/:orderId/cancel')
  @HttpCode(200)
  async cancelar(@Req() req: Req, @Res({ passthrough: true }) res: Response, @Param('orderId') orderId: string, @Body() cuerpo: unknown, @Headers('idempotency-key') clave?: string) {
    return responder(res, await this.ordenes.cancelar(orderId, cuerpo, contexto(req, clave)));
  }

  // ── Vehículo individual (rutas con :id al final para no tapar las anteriores) ──

  @Post(':id/devolucion')
  @HttpCode(200)
  devolucionDirecta(@Req() req: Req, @Param('id') id: string) {
    return this.flota.devolucionDirecta(id, req.correlationId);
  }

  @Post(':id/mantenimiento/registro')
  @HttpCode(200)
  @Acceso('mantenimiento')
  mantenimiento(@Req() req: Req, @Param('id') id: string, @Body() cuerpo: unknown) {
    return this.flota.registrarMantenimiento(id, cuerpo, req.correlationId);
  }

  @Patch(':id/estado')
  @Acceso('mantenimiento')
  cambiarEstado(@Param('id') id: string, @Body() cuerpo: unknown) {
    return this.flota.cambiarEstado(id, (cuerpo as { estado?: unknown } | null)?.estado);
  }

  @Get(':id/coberturas')
  coberturas(@Param('id') id: string) {
    return this.flota.coberturas(id);
  }

  @Get(':id')
  detalle(@Req() req: Request, @Param('id') id: string) {
    return this.flota.detalle(id, baseUrl(req));
  }
}

/** Alias en la raíz: Booking puede registrar la tienda con baseUrlRest = https://host y llamar /health y /reservas. */
@ApiExcludeController()
@SkipThrottle()
@UseFilters(ProblemaV3Filter)
@UseGuards(B2bAuthGuard)
@UseInterceptors(TrazaInterceptor)
@Controller()
export class AutosB2bRaizController {
  constructor(
    private readonly flota: FlotaService,
    private readonly ordenes: OrdenesB2bService,
  ) {}

  @Get(['health', 'api/v3/health'])
  salud() {
    return this.flota.salud();
  }

  @Post(['reservas', 'api/v3/reservas', 'orders/create', 'api/v3/orders/create'])
  async crear(@Req() req: Req, @Res({ passthrough: true }) res: Response, @Body() cuerpo: unknown, @Headers('idempotency-key') clave?: string) {
    return responder(res, await this.ordenes.crear(cuerpo, contexto(req, clave)));
  }
}
