import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class ActualizarCuentaDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  nombre: string;

  @IsEmail()
  @MaxLength(254)
  email: string;
}
