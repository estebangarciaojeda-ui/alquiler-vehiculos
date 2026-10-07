import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginCuentaDto {
  @ApiProperty({ example: 'cliente1@correo.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'cliente1' })
  @IsString()
  @MinLength(1)
  contrasena: string;
}
