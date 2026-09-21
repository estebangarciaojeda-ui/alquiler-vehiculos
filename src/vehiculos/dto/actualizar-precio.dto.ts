import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsPositive } from 'class-validator';

export class ActualizarPrecioDto {
  @ApiProperty({ example: 35, description: 'Nuevo precio en USD por día' })
  @IsNumber()
  @IsPositive()
  precioPorDia: number;
}
