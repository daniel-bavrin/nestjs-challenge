import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsMongoId, Min } from 'class-validator';

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
}
