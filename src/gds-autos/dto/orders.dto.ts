import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  ValidateNested,
} from 'class-validator';
import { DriverDto, RouteDto } from './common.dto.js';

export class OrderHoldRequestDto {
  @ApiProperty() @IsString() @IsNotEmpty() vehicle_id: string;
  @ApiProperty() @IsString() @IsNotEmpty() search_token: string;

  @ApiPropertyOptional({ type: DriverDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DriverDto)
  driver?: DriverDto;
}

export class OrderHoldResponseDto {
  @ApiProperty() hold_id: string;
  @ApiProperty({ format: 'date-time' }) expires_at: string;
  @ApiProperty({ enum: ['HELD', 'FAILED'] }) status: 'HELD' | 'FAILED';
}

export class OrderPreviewRequestDto {
  @ApiProperty() @IsString() @IsNotEmpty() vehicle_id: string;
  @ApiProperty() @IsString() @IsNotEmpty() search_token: string;

  @ApiPropertyOptional({ description: 'Si el vehículo fue puesto en Hold previamente' })
  @IsOptional()
  @IsUUID()
  hold_id?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  extras?: string[];
}

export class OrderPreviewResponseDto {
  @ApiProperty() request_id: string;
  @ApiProperty()
  data: {
    order_preview_id: string;
    total_price: number;
    currency: string;
    breakdown: Record<string, number>;
  };
}

class DriverDetailsDto {
  @ApiProperty() @IsString() @IsNotEmpty() first_name: string;
  @ApiProperty() @IsString() @IsNotEmpty() last_name: string;
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsString() @Matches(/^[0-9+\-\s()]{7,20}$/) phone_number: string;
}

export class OrderCreateRequestDto {
  @ApiProperty() @IsUUID() order_preview_id: string;
  @ApiProperty() @IsString() @IsNotEmpty() payment_reference: string;

  @ApiProperty({ type: DriverDetailsDto })
  @ValidateNested()
  @Type(() => DriverDetailsDto)
  driver_details: DriverDetailsDto;
}

export class OrderModifyRequestDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  extras_to_add?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  extras_to_remove?: string[];

  @ApiPropertyOptional({ type: RouteDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RouteDto)
  route?: RouteDto;
}

export class OrderDetailDto {
  @ApiProperty({ format: 'uuid' }) order_id: string;
  @ApiProperty({ description: 'Localizador (PNR) de la reserva' }) locator: string;
  @ApiProperty({ enum: ['CONFIRMED', 'CANCELLED', 'PENDING'] }) status: string;
  @ApiProperty() vehicle_details: Record<string, unknown>;
  @ApiProperty() route_details: Record<string, unknown>;
  @ApiProperty() total_price: number;
  @ApiProperty() currency: string;
  @ApiProperty({ format: 'date-time' }) creation_date: string;
  @ApiPropertyOptional() _links?: Record<string, string>;
}
