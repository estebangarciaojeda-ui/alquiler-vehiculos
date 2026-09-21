import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CrearSucursalDto } from './dto/crear-sucursal.dto.js';
import { SucursalesService } from './sucursales.service.js';

@ApiTags('Sucursales')
@Controller('api/v1/sucursales')
export class SucursalesController {
  constructor(private readonly service: SucursalesService) {}

  @Get()
  @ApiQuery({ name: 'ciudad', required: false })
  listar(@Query('ciudad') ciudad?: string) {
    return this.service.findAll(ciudad);
  }

  @Get(':id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async crear(@Body() dto: CrearSucursalDto, @Res({ passthrough: true }) res: Response) {
    const nueva = await this.service.crear(dto);
    res.setHeader('Location', `/api/v1/sucursales/${nueva.id}`);
    return nueva;
  }

  @Put(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reemplazar(@Param('id', ParseIntPipe) id: number, @Body() dto: CrearSucursalDto) {
    await this.service.reemplazar(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async eliminar(@Param('id', ParseIntPipe) id: number) {
    await this.service.eliminar(id);
  }
}
