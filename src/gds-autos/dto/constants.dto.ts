import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';

const CONSTANTES_DISPONIBLES = [
  'depot_services',
  'fuel_policies',
  'fuel_types',
  'general',
  'payment_timings',
  'transmission',
] as const;

export class CarConstantsRequestDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  languages?: string[];

  @ApiPropertyOptional({ type: [String], enum: CONSTANTES_DISPONIBLES })
  @IsOptional()
  @IsArray()
  @IsIn(CONSTANTES_DISPONIBLES, { each: true })
  constants?: (typeof CONSTANTES_DISPONIBLES)[number][];
}

export class CarConstantsResponseDto {
  @ApiProperty() request_id: string;
  @ApiProperty() data: Record<string, unknown>;
}
