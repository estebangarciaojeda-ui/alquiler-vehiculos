import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsIn, IsOptional, IsString, IsUrl } from 'class-validator';

const EVENTOS = ['CAR_ORDER_CONFIRMED', 'CAR_ORDER_CANCELLED', 'DEPOT_UPDATE'] as const;

export class CreateWebhookDto {
  @ApiProperty({ format: 'uri' })
  @IsUrl({ require_tld: false })
  url: string;

  @ApiProperty({ type: [String], enum: EVENTOS })
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(EVENTOS, { each: true })
  events: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  secret?: string;
}

export class WebhookSubscriptionDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uri' })
  url: string;

  @ApiProperty({ type: [String], enum: EVENTOS })
  events: string[];

  @ApiPropertyOptional()
  secret?: string;
}

export class WebhookPayloadDto {
  @ApiProperty({ format: 'uuid' }) eventId: string;
  @ApiProperty() eventType: string;
  @ApiProperty({ format: 'date-time' }) timestamp: string;
  @ApiProperty() resourceId: string;
  @ApiPropertyOptional() data?: Record<string, unknown>;
}
