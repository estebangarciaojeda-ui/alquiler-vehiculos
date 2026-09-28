import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsOptional, IsString, Matches, Max, Min, ValidateNested } from 'class-validator';
import { CATEGORIAS, TRANSMISIONES } from '../../common/constants.js';
import { BookerDto, DriverDto, RouteDto } from './common.dto.js';

class CarSearchFiltersDto {
  @ApiPropertyOptional({ type: [String], enum: CATEGORIAS })
  @IsOptional()
  @IsArray()
  @IsIn(CATEGORIAS, { each: true })
  car_types?: string[];

  @ApiPropertyOptional({ type: [String], enum: TRANSMISIONES })
  @IsOptional()
  @IsArray()
  @IsIn(TRANSMISIONES, { each: true })
  transmission?: string[];
}

export class CarSearchRequestDto {
  @ApiProperty({ type: BookerDto })
  @ValidateNested()
  @Type(() => BookerDto)
  booker: BookerDto;

  @ApiProperty({ example: 'USD' })
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency: string;

  @ApiProperty({ type: DriverDto })
  @ValidateNested()
  @Type(() => DriverDto)
  driver: DriverDto;

  @ApiProperty({ type: RouteDto })
  @ValidateNested()
  @Type(() => RouteDto)
  route: RouteDto;

  @ApiPropertyOptional({ type: CarSearchFiltersDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CarSearchFiltersDto)
  filters?: CarSearchFiltersDto;

  @ApiPropertyOptional({ default: 100, minimum: 10, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(500)
  maximum_results?: number = 100;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  page?: string;
}

class CarSearchResultItemDto {
  @ApiProperty() vehicle_id: string;
  @ApiProperty() price: number;
  @ApiProperty() supplier_id: number;
}

class CarSearchMetadataDto {
  @ApiProperty() total_results: number;
  @ApiPropertyOptional({ nullable: true }) next_page: string | null;
}

export class CarSearchResponseDto {
  @ApiProperty() request_id: string;
  @ApiProperty({ type: [CarSearchResultItemDto] }) data: CarSearchResultItemDto[];
  @ApiProperty({ type: CarSearchMetadataDto }) metadata: CarSearchMetadataDto;
  @ApiProperty() search_token: string;
}
