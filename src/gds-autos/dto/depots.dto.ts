import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsInt, IsOptional, IsString } from 'class-validator';
import { LocationPointDto } from './common.dto.js';

export class DepotsRequestDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() last_modified?: string;
  @ApiPropertyOptional({ default: 100 }) @IsOptional() @Type(() => Number) @IsInt() maximum_results?: number = 100;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) languages?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() page?: string;
}

class DepotItemDto {
  @ApiProperty() depot_id: number;
  @ApiProperty() name: string;
  @ApiProperty({ type: LocationPointDto }) location: LocationPointDto;
}

export class DepotsResponseDto {
  @ApiProperty() request_id: string;
  @ApiProperty({ type: [DepotItemDto] }) data: DepotItemDto[];
  @ApiProperty() metadata: { total_results: number };
}

export class DepotScoresRequestDto {
  @ApiPropertyOptional({ default: 100 }) @IsOptional() @Type(() => Number) @IsInt() maximum_results?: number = 100;
  @ApiPropertyOptional() @IsOptional() @IsString() page?: string;
}

class DepotScoreItemDto {
  @ApiProperty() depot_id: number;
  @ApiProperty() score: number;
}

export class DepotScoresResponseDto {
  @ApiProperty() request_id: string;
  @ApiProperty({ type: [DepotScoreItemDto] }) data: DepotScoreItemDto[];
  @ApiProperty() metadata: { total_results: number };
}
