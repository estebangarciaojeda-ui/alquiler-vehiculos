import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ROLES_CUENTA, type RolCuenta } from '../../cuentas/cuenta.entity.js';

export class CrearCuentaDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  nombre: string;

  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  contrasena: string;

  @IsOptional()
  @IsIn(ROLES_CUENTA)
  rol?: RolCuenta;
}
