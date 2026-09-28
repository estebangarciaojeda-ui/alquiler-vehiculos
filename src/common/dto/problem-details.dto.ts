import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CODIGOS_PROBLEMA } from '../problem-details.exception.js';

class InvalidParamDto {
  @ApiProperty() name: string;
  @ApiProperty() reason: string;
}

// Solo para documentación en Swagger (components.schemas.ProblemDetails del contrato).
export class ProblemDetailsDto {
  @ApiProperty() type: string;
  @ApiProperty() title: string;
  @ApiProperty() status: number;
  @ApiPropertyOptional() detail?: string;
  @ApiProperty({ enum: CODIGOS_PROBLEMA }) code: string;
  @ApiPropertyOptional({ type: [InvalidParamDto] }) invalidParams?: InvalidParamDto[];
}
