import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString } from 'class-validator';

export class SuppliersRequestDto {
  @ApiPropertyOptional({ type: [Number], description: 'IDs de proveedores específicos; vacío = todos' })
  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  suppliers?: number[];

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() maximum_results?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() page?: string;
}

class SupplierItemDto {
  @ApiProperty() supplier_id: number;
  @ApiProperty() name: string;
}

export class SuppliersResponseDto {
  @ApiProperty() request_id: string;
  @ApiProperty({ type: [SupplierItemDto] }) data: SupplierItemDto[];
}
