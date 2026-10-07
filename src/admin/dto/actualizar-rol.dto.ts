import { IsIn } from 'class-validator';
import { ROLES_CUENTA, type RolCuenta } from '../../cuentas/cuenta.entity.js';

export class ActualizarRolDto {
  @IsIn(ROLES_CUENTA)
  rol: RolCuenta;
}
