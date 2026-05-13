import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { OrderStatus } from '../schemas/order.enum';

export class UpdateOrderRequestDTO {
  @ApiPropertyOptional({ enum: OrderStatus, description: 'New order status' })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({
    type: Number,
    description: 'Update order quantity (will adjust inventory)',
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @ApiPropertyOptional({
    type: String,
    description: 'Optional customer reference',
    maxLength: 120,
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerRef?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Optional admin/POS notes',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
