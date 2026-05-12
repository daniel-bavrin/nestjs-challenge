import { ApiProperty } from '@nestjs/swagger';
import { Record } from '../schemas/record.schema';

export class PaginatedRecordsMetaDTO {
  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 3 })
  totalPages: number;

  @ApiProperty({ example: true })
  hasNextPage: boolean;

  @ApiProperty({ example: false })
  hasPrevPage: boolean;
}

export class FindRecordsResponseDTO {
  @ApiProperty({ type: [Record] })
  items: Record[];

  @ApiProperty({ type: PaginatedRecordsMetaDTO })
  meta: PaginatedRecordsMetaDTO;
}
