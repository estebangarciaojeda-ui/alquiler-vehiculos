import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator';
import { CATEGORIAS, ORDENES, TRANSMISIONES } from '../../common/constants.js';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export class BuscarVehiculosDto {
  @ApiPropertyOptional({ description: 'Id de la sucursal de recogida', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sucursalId?: number;

  @ApiPropertyOptional({ description: 'Ciudad (búsqueda parcial, sin distinguir mayúsculas)', example: 'quito' })
  @IsOptional()
  @IsString()
  ciudad?: string;

  @ApiPropertyOptional({ enum: CATEGORIAS })
  @IsOptional()
  @IsIn(CATEGORIAS)
  categoria?: string;

  @ApiPropertyOptional({ enum: TRANSMISIONES })
  @IsOptional()
  @IsIn(TRANSMISIONES)
  transmision?: string;

  @ApiPropertyOptional({ description: 'Mínimo de pasajeros', example: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pasajeros?: number;

  @ApiPropertyOptional({ description: 'Precio máximo por día en USD', example: 60 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  precioMax?: number;

  @ApiPropertyOptional({ description: 'Fecha de recogida (AAAA-MM-DD). Requiere "hasta".', example: '2026-12-01' })
  @IsOptional()
  @Matches(FECHA, { message: 'desde debe tener formato AAAA-MM-DD' })
  desde?: string;

  @ApiPropertyOptional({ description: 'Fecha de devolución (AAAA-MM-DD). Requiere "desde".', example: '2026-12-05' })
  @IsOptional()
  @Matches(FECHA, { message: 'hasta debe tener formato AAAA-MM-DD' })
  hasta?: string;

  @ApiPropertyOptional({ enum: ORDENES, default: 'precio_asc' })
  @IsOptional()
  @IsIn(ORDENES)
  orden?: string;
}
