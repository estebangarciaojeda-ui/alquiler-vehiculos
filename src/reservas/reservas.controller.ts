import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AdminAuthGuard } from '../admin/admin-auth.guard.js';
import { ClienteAuthGuard, type PeticionCliente } from '../cuentas/cliente-auth.guard.js';
import { CrearReservaDto } from './dto/crear-reserva.dto.js';
import { ReservasService } from './reservas.service.js';

@ApiTags('Reservas')
@Controller('api/v1/reservas')
export class ReservasController {
  constructor(private readonly service: ReservasService) {}

  @Get()
  @ApiQuery({ name: 'email', required: false })
  @ApiQuery({ name: 'codigo', required: false })
  listar(@Query('email') email?: string, @Query('codigo') codigo?: string) {
    return this.service.listar(email, codigo);
  }

  @Get(':id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @UseGuards(ClienteAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Reservar un vehículo con pago simulado (requiere sesión de cliente)' })
  @ApiResponse({ status: 401, description: 'Inicia sesión para reservar' })
  @ApiResponse({ status: 409, description: 'El vehículo ya está reservado en esas fechas' })
  async crear(@Body() dto: CrearReservaDto, @Req() req: PeticionCliente, @Res({ passthrough: true }) res: Response) {
    const nueva = await this.service.crear(dto, req.clienteId!);
    res.setHeader('Location', `/api/v1/reservas/${nueva.id}`);
    return nueva;
  }

  @Patch(':id/cancelar')
  cancelar(@Param('id', ParseIntPipe) id: number) {
    return this.service.cancelar(id);
  }

  @Delete(':id')
  @UseGuards(AdminAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async eliminar(@Param('id', ParseIntPipe) id: number) {
    await this.service.eliminar(id);
  }
}
