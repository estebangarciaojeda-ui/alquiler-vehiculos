import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  usuario: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  contrasena: string;
}
