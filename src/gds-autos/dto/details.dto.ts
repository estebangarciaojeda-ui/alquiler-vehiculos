import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString } from 'class-validator';

export class CarDetailsRequestDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() last_modified?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() maximum_results?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() page?: string;
}

class CarDetailsItemDto {
  @ApiProperty() vehicle_id: string;
  @ApiProperty() make: string;
  @ApiProperty() model: string;
  @ApiProperty() doors: number;
  @ApiProperty() bag_capacity: number;
  @ApiProperty() seats: number;
}

export class CarDetailsResponseDto {
  @ApiProperty() request_id: string;
  @ApiProperty({ type: [CarDetailsItemDto] }) data: CarDetailsItemDto[];
}
