import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class PagoTarjetaDto {
  @ApiProperty({ example: '4111 1111 1111 1111', description: 'Pago simulado: no se cobra nada real' })
  @IsString()
  @Matches(/^[0-9 -]{13,23}$/, { message: 'El número de tarjeta no es válido' })
  numero: string;

  @ApiProperty({ example: '12/30', description: 'MM/AA' })
  @IsString()
  @Matches(/^(0[1-9]|1[0-2])\/\d{2}$/, { message: 'El vencimiento debe tener formato MM/AA' })
  vencimiento: string;

  @ApiProperty({ example: '123' })
  @IsString()
  @Matches(/^\d{3,4}$/, { message: 'El CVV debe tener 3 o 4 dígitos' })
  cvv: string;
}
