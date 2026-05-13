import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { OrderSource } from '../schemas/order.enum';

export class CreateOrderRequestDTO {
  @ApiProperty({
    description: 'Record identifier to order from',
    type: String,
    example: '6821b4fd25b68ab63ec4f9a5',
  })
  @IsMongoId()
  recordId: string;

  @ApiProperty({
    description: 'Quantity to order',
    type: Number,
    example: 2,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({
    description: 'Order origin channel',
    enum: OrderSource,
    example: OrderSource.ADMIN,
    required: false,
  })
  @IsOptional()
  @IsEnum(OrderSource)
  source?: OrderSource;

  @ApiProperty({
    description: 'External order identifier (used for POS idempotency)',
    type: String,
    example: 'POS-ORD-100001',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  externalOrderId?: string;

  @ApiProperty({
    description: 'Optional customer reference',
    type: String,
    example: 'CUST-7788',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerRef?: string;

  @ApiProperty({
    description: 'Optional notes',
    type: String,
    example: 'Gift wrap requested',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
