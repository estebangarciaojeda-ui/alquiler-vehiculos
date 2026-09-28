import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmptyObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

// Los nombres de propiedad de este módulo son snake_case a propósito: deben coincidir
// exactamente con contracts/autos-openapi.yaml, que es la fuente de la verdad del contrato.

export class BookerDto {
  @ApiProperty({ example: 'ec', description: 'Código ISO 3166-1 alpha-2 del país del comprador' })
  @IsString()
  @Matches(/^[a-z]{2}$/)
  country: string;
}

export class DriverDto {
  @ApiProperty({ example: 28, minimum: 18, maximum: 99, description: 'Edad del conductor' })
  @IsInt()
  @Min(18)
  @Max(99)
  age: number;
}

class CoordinatesDto {
  @ApiProperty()
  @IsLatitude()
  latitude: number;

  @ApiProperty()
  @IsLongitude()
  longitude: number;
}

export class LocationPointDto {
  @ApiPropertyOptional({ example: 'UIO', description: 'Código IATA de aeropuerto, si aplica' })
  @IsOptional()
  @IsString()
  airport?: string;

  @ApiPropertyOptional({ example: 1, description: 'ID interno de la ciudad' })
  @IsOptional()
  @IsInt()
  city_id?: number;

  @ApiPropertyOptional({ type: CoordinatesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CoordinatesDto)
  coordinates?: CoordinatesDto;
}

export class RoutePointDto {
  @ApiProperty({ example: '2026-12-01T10:00:00Z' })
  @IsString()
  datetime: string;

  @ApiProperty({ type: LocationPointDto })
  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => LocationPointDto)
  location: LocationPointDto;
}

export class RouteDto {
  @ApiProperty({ type: RoutePointDto })
  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => RoutePointDto)
  pickup: RoutePointDto;

  @ApiProperty({ type: RoutePointDto })
  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => RoutePointDto)
  dropoff: RoutePointDto;
}
