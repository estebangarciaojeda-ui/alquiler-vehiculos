import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CrearSucursalDto {
  @ApiProperty({ example: 'Aeropuerto Mariscal Sucre' })
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @ApiProperty({ example: 'Quito' })
  @IsString()
  @IsNotEmpty()
  ciudad: string;

  @ApiProperty({ example: 'Aeropuerto Internacional Mariscal Sucre, Tababela' })
  @IsString()
  @IsNotEmpty()
  direccion: string;

  @ApiPropertyOptional({ example: true, default: false })
  @IsOptional()
  @IsBoolean()
  esAeropuerto?: boolean;
}
