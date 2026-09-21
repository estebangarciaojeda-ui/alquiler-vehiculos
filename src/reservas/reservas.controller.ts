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
  Res,
} from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
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
  @HttpCode(HttpStatus.CREATED)
  async crear(@Body() dto: CrearReservaDto, @Res({ passthrough: true }) res: Response) {
    const nueva = await this.service.crear(dto);
    res.setHeader('Location', `/api/v1/reservas/${nueva.id}`);
    return nueva;
  }

  @Patch(':id/cancelar')
  cancelar(@Param('id', ParseIntPipe) id: number) {
    return this.service.cancelar(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async eliminar(@Param('id', ParseIntPipe) id: number) {
    await this.service.eliminar(id);
  }
}
