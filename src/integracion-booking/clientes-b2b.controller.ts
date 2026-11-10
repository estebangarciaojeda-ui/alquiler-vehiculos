import { Body, Controller, Get, Post, Query, Res, UseFilters, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { B2bAuthGuard, TrazaInterceptor } from './acceso-b2b.js';
import { ClientesService } from './clientes.service.js';
import { ProblemaV3Filter } from './problema-v3.js';

/**
 * Contrato v3.1: Booking consulta si el conductor ya existe (GET) y lo registra si no (POST), sin duplicarlo.
 * GET responde 404 cuando no existe; POST responde 201 al crear y 200 con el client_id existente si ya estaba.
 */
@ApiExcludeController()
@SkipThrottle()
@UseFilters(ProblemaV3Filter)
@UseGuards(B2bAuthGuard)
@UseInterceptors(TrazaInterceptor)
@Controller(['api/v3/clientes', 'clientes'])
export class ClientesB2bController {
  constructor(private readonly clientes: ClientesService) {}

  @Get()
  buscar(@Query('email') email?: string, @Query('identificacion') identificacion?: string) {
    return this.clientes.buscar(email, identificacion);
  }

  @Post()
  async crear(@Res({ passthrough: true }) res: Response, @Body() cuerpo: unknown) {
    const salida = await this.clientes.crear(cuerpo);
    res.status(salida.status);
    return salida.body;
  }
}
