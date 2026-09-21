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
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ActualizarPrecioDto } from './dto/actualizar-precio.dto.js';
import { BuscarVehiculosDto } from './dto/buscar-vehiculos.dto.js';
import { CrearVehiculoDto } from './dto/crear-vehiculo.dto.js';
import { VehiculosService } from './vehiculos.service.js';

@ApiTags('Vehículos')
@Controller('api/v1/vehiculos')
export class VehiculosController {
  constructor(private readonly service: VehiculosService) {}

  @Get()
  listar(@Query() filtros: BuscarVehiculosDto) {
    return this.service.buscar(filtros);
  }

  @Get('marcas')
  marcas() {
    return this.service.marcas();
  }

  @Get(':id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async crear(@Body() dto: CrearVehiculoDto, @Res({ passthrough: true }) res: Response) {
    const nuevo = await this.service.crear(dto);
    res.setHeader('Location', `/api/v1/vehiculos/${nuevo.id}`);
    return nuevo;
  }

  @Put(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reemplazar(@Param('id', ParseIntPipe) id: number, @Body() dto: CrearVehiculoDto) {
    await this.service.reemplazar(id, dto);
  }

  @Patch(':id')
  actualizarPrecio(@Param('id', ParseIntPipe) id: number, @Body() dto: ActualizarPrecioDto) {
    return this.service.actualizarPrecio(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async eliminar(@Param('id', ParseIntPipe) id: number) {
    await this.service.eliminar(id);
  }
}
