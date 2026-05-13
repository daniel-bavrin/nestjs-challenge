import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { OrderSource, OrderStatus } from '../schemas/order.enum';

export class FindOrdersQueryDTO {
  @ApiPropertyOptional({
    enum: OrderStatus,
    description: 'Filter by order status',
  })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({
    enum: OrderSource,
    description: 'Filter by order source',
  })
  @IsOptional()
  @IsEnum(OrderSource)
  source?: OrderSource;

  @ApiPropertyOptional({ type: String, description: 'Filter by record id' })
  @IsOptional()
  @IsMongoId()
  recordId?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Filter by external order id',
  })
  @IsOptional()
  @IsString()
  externalOrderId?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: 'Created after or equal',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: 'Created before or equal',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ type: Number, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ type: Number, default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    type: String,
    description:
      'Sort field, prefix with - for descending. Allowed: created,lastModified,status,source',
  })
  @IsOptional()
  @IsString()
  sort?: string;
}
