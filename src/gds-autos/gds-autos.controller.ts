import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { IdempotencyKeyGuard } from '../common/guards/idempotency-key.guard.js';
import { ProblemDetailsDto } from '../common/dto/problem-details.dto.js';
import { ProblemDetailsException } from '../common/problem-details.exception.js';
import { ProblemDetailsFilter } from '../common/problem-details.filter.js';
import { CatalogoService } from './catalogo.service.js';
import { CarConstantsRequestDto, CarConstantsResponseDto } from './dto/constants.dto.js';
import { CarDetailsRequestDto, CarDetailsResponseDto } from './dto/details.dto.js';
import { DepotScoresRequestDto, DepotScoresResponseDto, DepotsRequestDto, DepotsResponseDto } from './dto/depots.dto.js';
import {
  OrderCreateRequestDto,
  OrderDetailDto,
  OrderHoldRequestDto,
  OrderHoldResponseDto,
  OrderModifyRequestDto,
  OrderPreviewRequestDto,
  OrderPreviewResponseDto,
} from './dto/orders.dto.js';
import { CarSearchRequestDto, CarSearchResponseDto } from './dto/search.dto.js';
import { SuppliersRequestDto, SuppliersResponseDto } from './dto/suppliers.dto.js';
import { CreateWebhookDto, WebhookSubscriptionDto } from './dto/webhooks.dto.js';
import { IdempotencyInterceptor } from './idempotency.interceptor.js';
import { OrdenesService } from './ordenes.service.js';
import { WebhooksService } from './webhooks.service.js';

function exigirAffiliateId(valor: string | undefined): number {
  const id = Number(valor);
  if (!valor || !Number.isInteger(id) || id <= 0) {
    throw new ProblemDetailsException(400, 'VALIDATION_FAILED', 'X-Affiliate-Id requerido', 'La cabecera X-Affiliate-Id es obligatoria y debe ser un entero.');
  }
  return id;
}

// Alineado 1:1 con contracts/autos-openapi.yaml (paths, verbos, cabeceras y esquemas).
@Controller('api/v1')
@UseFilters(ProblemDetailsFilter)
@ApiResponse({ status: 400, type: ProblemDetailsDto, description: 'Petición inválida' })
export class GdsAutosController {
  constructor(
    private readonly catalogo: CatalogoService,
    private readonly ordenes: OrdenesService,
    private readonly webhooks: WebhooksService,
  ) {}

  // ── Búsqueda y Catálogo ────────────────────────────────────────────────

  @Post('search')
  @ApiTags('Búsqueda y Catálogo')
  @ApiOperation({ summary: 'Búsqueda de renta de vehículos' })
  @ApiHeader({ name: 'X-Affiliate-Id', required: true })
  @ApiResponse({ status: 200, type: CarSearchResponseDto })
  @Header('Cache-Control', 'public, max-age=300')
  @HttpCode(HttpStatus.OK)
  search(@Headers('X-Affiliate-Id') affiliateId: string, @Body() dto: CarSearchRequestDto) {
    exigirAffiliateId(affiliateId);
    return this.catalogo.search(dto);
  }

  @Post('details')
  @ApiTags('Búsqueda y Catálogo')
  @ApiOperation({ summary: 'Obtener especificaciones y características de los vehículos' })
  @ApiHeader({ name: 'X-Affiliate-Id', required: true })
  @ApiResponse({ status: 200, type: CarDetailsResponseDto })
  @Header('Cache-Control', 'public, max-age=300')
  @HttpCode(HttpStatus.OK)
  details(@Headers('X-Affiliate-Id') affiliateId: string, @Body() dto: CarDetailsRequestDto) {
    exigirAffiliateId(affiliateId);
    return this.catalogo.getDetails(dto);
  }

  // ── Información de Agencias y Proveedores ─────────────────────────────

  @Post('depots')
  @ApiTags('Información de Agencias y Proveedores')
  @ApiOperation({ summary: 'Consultar lista de agencias de renta (puntos de recogida y entrega)' })
  @ApiHeader({ name: 'X-Affiliate-Id', required: true })
  @ApiResponse({ status: 200, type: DepotsResponseDto })
  @Header('Cache-Control', 'public, max-age=3600')
  @HttpCode(HttpStatus.OK)
  depots(@Headers('X-Affiliate-Id') affiliateId: string, @Body() dto: DepotsRequestDto) {
    exigirAffiliateId(affiliateId);
    return this.catalogo.getDepots(dto);
  }

  @Post('depots/reviews/scores')
  @ApiTags('Información de Agencias y Proveedores')
  @ApiOperation({ summary: 'Obtener puntuaciones y reseñas de las agencias' })
  @ApiHeader({ name: 'X-Affiliate-Id', required: true })
  @ApiResponse({ status: 200, type: DepotScoresResponseDto })
  @Header('Cache-Control', 'public, max-age=600')
  @HttpCode(HttpStatus.OK)
  depotScores(@Headers('X-Affiliate-Id') affiliateId: string, @Body() dto: DepotScoresRequestDto) {
    exigirAffiliateId(affiliateId);
    return this.catalogo.getDepotScores(dto);
  }

  @Post('suppliers')
  @ApiTags('Información de Agencias y Proveedores')
  @ApiOperation({ summary: 'Listar proveedores de renta de autos' })
  @ApiHeader({ name: 'X-Affiliate-Id', required: true })
  @ApiResponse({ status: 200, type: SuppliersResponseDto })
  @Header('Cache-Control', 'public, max-age=3600')
  @HttpCode(HttpStatus.OK)
  suppliers(@Headers('X-Affiliate-Id') affiliateId: string, @Body() dto: SuppliersRequestDto) {
    exigirAffiliateId(affiliateId);
    return this.catalogo.getSuppliers(dto);
  }

  // ── Componentes Comunes ────────────────────────────────────────────────

  @Post('constants')
  @ApiTags('Componentes Comunes')
  @ApiOperation({ summary: 'Consultar constantes del sistema (políticas, seguros, servicios extra)' })
  @ApiHeader({ name: 'X-Affiliate-Id', required: true })
  @ApiResponse({ status: 200, type: CarConstantsResponseDto })
  @Header('Cache-Control', 'public, max-age=86400')
  @HttpCode(HttpStatus.OK)
  constants(@Headers('X-Affiliate-Id') affiliateId: string, @Body() dto: CarConstantsRequestDto) {
    exigirAffiliateId(affiliateId);
    return this.catalogo.getConstants(dto);
  }

  // ── Gestión de Órdenes (Reservas) ──────────────────────────────────────

  @Post('orders/hold')
  @ApiTags('Gestión de Órdenes (Reservas)')
  @ApiSecurity('OAuth2Security', ['autos:book'])
  @ApiOperation({ summary: 'Bloquear temporalmente el vehículo y precio (Hold)' })
  @ApiResponse({ status: 200, type: OrderHoldResponseDto })
  @ApiResponse({ status: 409, type: ProblemDetailsDto, description: 'Conflicto (auto no disponible)' })
  @HttpCode(HttpStatus.OK)
  holdOrder(@Body() dto: OrderHoldRequestDto) {
    return this.ordenes.crearHold(dto);
  }

  @Post('orders/preview')
  @ApiTags('Gestión de Órdenes (Reservas)')
  @ApiSecurity('OAuth2Security', ['autos:read'])
  @ApiOperation({ summary: 'Previsualizar la orden de renta antes de confirmar' })
  @ApiResponse({ status: 200, type: OrderPreviewResponseDto })
  @HttpCode(HttpStatus.OK)
  previewOrder(@Body() dto: OrderPreviewRequestDto) {
    return this.ordenes.previsualizar(dto);
  }

  @Post('orders/create')
  @ApiTags('Gestión de Órdenes (Reservas)')
  @ApiSecurity('OAuth2Security', ['autos:book'])
  @ApiOperation({ summary: 'Crear orden/reserva de renta de vehículo' })
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'UUID v4 para evitar cobros duplicados' })
  @ApiResponse({ status: 201, type: OrderDetailDto })
  @ApiResponse({ status: 409, type: ProblemDetailsDto, description: 'Conflicto (auto no disponible)' })
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(IdempotencyKeyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  createOrder(@Body() dto: OrderCreateRequestDto) {
    return this.ordenes.crearOrden(dto);
  }

  @Get('orders/:orderId')
  @ApiTags('Gestión de Órdenes (Reservas)')
  @ApiSecurity('OAuth2Security', ['autos:read'])
  @ApiOperation({ summary: 'Obtener detalles de la orden' })
  @ApiResponse({ status: 200, type: OrderDetailDto })
  @ApiResponse({ status: 404, type: ProblemDetailsDto, description: 'Orden no encontrada' })
  getOrder(@Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.ordenes.obtener(orderId);
  }

  @Post('orders/:orderId/modify')
  @ApiTags('Gestión de Órdenes (Reservas)')
  @ApiSecurity('OAuth2Security', ['autos:book'])
  @ApiOperation({ summary: 'Modificar una orden existente' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiResponse({ status: 200, type: OrderDetailDto })
  @ApiResponse({ status: 409, type: ProblemDetailsDto })
  @HttpCode(HttpStatus.OK)
  @UseGuards(IdempotencyKeyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  modifyOrder(@Param('orderId', ParseUUIDPipe) orderId: string, @Body() dto: OrderModifyRequestDto) {
    return this.ordenes.modificar(orderId, dto);
  }

  @Post('orders/:orderId/cancel')
  @ApiTags('Gestión de Órdenes (Reservas)')
  @ApiSecurity('OAuth2Security', ['autos:cancel'])
  @ApiOperation({ summary: 'Cancelar una orden de renta' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiResponse({ status: 200, type: OrderDetailDto })
  @ApiResponse({ status: 409, type: ProblemDetailsDto })
  @HttpCode(HttpStatus.OK)
  @UseGuards(IdempotencyKeyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  cancelOrder(@Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.ordenes.cancelar(orderId);
  }

  // ── Webhooks ────────────────────────────────────────────────────────────

  @Get('webhooks')
  @ApiTags('Webhooks')
  @ApiSecurity('OAuth2Security', ['autos:webhooks'])
  @ApiOperation({ summary: 'Listar suscripciones a eventos' })
  @ApiResponse({ status: 200, type: [WebhookSubscriptionDto] })
  listWebhooks() {
    return this.webhooks.listar();
  }

  @Post('webhooks')
  @ApiTags('Webhooks')
  @ApiSecurity('OAuth2Security', ['autos:webhooks'])
  @ApiOperation({ summary: 'Registrar un nuevo webhook' })
  @ApiResponse({ status: 201, type: WebhookSubscriptionDto })
  @HttpCode(HttpStatus.CREATED)
  createWebhook(@Body() dto: CreateWebhookDto) {
    return this.webhooks.crear(dto);
  }

  @Delete('webhooks/:id')
  @ApiTags('Webhooks')
  @ApiSecurity('OAuth2Security', ['autos:webhooks'])
  @ApiOperation({ summary: 'Eliminar suscripción de webhook' })
  @ApiResponse({ status: 204 })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteWebhook(@Param('id', ParseUUIDPipe) id: string) {
    await this.webhooks.eliminar(id);
  }
}
