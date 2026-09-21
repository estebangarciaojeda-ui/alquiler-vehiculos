import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { CATEGORIAS, COMBUSTIBLES, TRANSMISIONES } from '../../common/constants.js';

export class CrearVehiculoDto {
  @ApiProperty({ example: 'Kia' })
  @IsString()
  @IsNotEmpty()
  marca: string;

  @ApiProperty({ example: 'Rio' })
  @IsString()
  @IsNotEmpty()
  modelo: string;

  @ApiProperty({ example: 2024 })
  @IsInt()
  @Min(2000)
  @Max(2100)
  anio: number;

  @ApiProperty({ enum: CATEGORIAS, example: 'COMPACTO' })
  @IsIn(CATEGORIAS)
  categoria: string;

  @ApiProperty({ enum: TRANSMISIONES, example: 'AUTOMATICA' })
  @IsIn(TRANSMISIONES)
  transmision: string;

  @ApiProperty({ example: 5 })
  @IsInt()
  @Min(1)
  @Max(15)
  pasajeros: number;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(0)
  @Max(10)
  maletas: number;

  @ApiProperty({ example: 4 })
  @IsInt()
  @Min(2)
  @Max(6)
  puertas: number;

  @ApiProperty({ enum: COMBUSTIBLES, example: 'GASOLINA' })
  @IsIn(COMBUSTIBLES)
  combustible: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  aireAcondicionado?: boolean;

  @ApiProperty({ example: 32.5, description: 'Precio en USD por día' })
  @IsNumber()
  @IsPositive()
  precioPorDia: number;

  @ApiProperty({ example: 1, description: 'Id de la sucursal donde está el vehículo' })
  @IsInt()
  @Min(1)
  sucursalId: number;
}
