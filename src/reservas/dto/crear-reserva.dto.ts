import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CrearReservaDto {
  @ApiProperty({ example: 1, description: 'Id del vehículo a reservar' })
  @IsInt()
  @Min(1)
  vehiculoId: number;

  @ApiPropertyOptional({ example: 1, description: 'Sucursal de devolución. Por defecto, la misma de recogida.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  sucursalDevolucionId?: number;

  @ApiProperty({ example: '2026-12-01', description: 'AAAA-MM-DD' })
  @Matches(FECHA, { message: 'fechaRecogida debe tener formato AAAA-MM-DD' })
  fechaRecogida: string;

  @ApiPropertyOptional({ example: '10:00', default: '10:00', description: 'HH:mm' })
  @IsOptional()
  @Matches(HORA, { message: 'horaRecogida debe tener formato HH:mm' })
  horaRecogida?: string;

  @ApiProperty({ example: '2026-12-05', description: 'AAAA-MM-DD' })
  @Matches(FECHA, { message: 'fechaDevolucion debe tener formato AAAA-MM-DD' })
  fechaDevolucion: string;

  @ApiPropertyOptional({ example: '10:00', default: '10:00', description: 'HH:mm' })
  @IsOptional()
  @Matches(HORA, { message: 'horaDevolucion debe tener formato HH:mm' })
  horaDevolucion?: string;

  @ApiProperty({ example: 'María Fernanda López' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nombreCliente: string;

  @ApiProperty({ example: 'maria@correo.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '0991234567' })
  @IsString()
  @Matches(/^[0-9+\-\s()]{7,20}$/, { message: 'telefono no es válido' })
  telefono: string;
}
