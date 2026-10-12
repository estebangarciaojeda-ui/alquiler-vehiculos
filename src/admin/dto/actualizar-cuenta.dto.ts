import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ActualizarCuentaDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  nombre: string;

  @IsEmail()
  @MaxLength(254)
  email: string;

  // Opcional: si se envía, reemplaza la contraseña. Si se omite, no cambia.
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  contrasena?: string;
}
