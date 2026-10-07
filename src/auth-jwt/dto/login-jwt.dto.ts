import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class LoginJwtDto {
  @ApiProperty({ description: 'Usuario admin o correo de una cuenta de cliente', example: 'admin' })
  @IsString()
  @MinLength(1)
  identificador: string;

  @ApiProperty({ example: 'admin' })
  @IsString()
  @MinLength(1)
  contrasena: string;
}
