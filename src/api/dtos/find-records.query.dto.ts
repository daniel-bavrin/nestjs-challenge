import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { RecordCategory, RecordFormat } from '../schemas/record.enum';

export class FindRecordsQueryDTO {
  @ApiPropertyOptional({
    description:
      'Search query (search across multiple fields like artist, album, category, etc.)',
    type: String,
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description: 'Filter by artist name',
    type: String,
  })
  @IsOptional()
  @IsString()
  artist?: string;

  @ApiPropertyOptional({
    description: 'Filter by album name',
    type: String,
  })
  @IsOptional()
  @IsString()
  album?: string;

  @ApiPropertyOptional({
    description: 'Filter by record format (Vinyl, CD, etc.)',
    enum: RecordFormat,
  })
  @IsOptional()
  @IsEnum(RecordFormat)
  format?: RecordFormat;

  @ApiPropertyOptional({
    description: 'Filter by record category (e.g., Rock, Jazz)',
    enum: RecordCategory,
  })
  @IsOptional()
  @IsEnum(RecordCategory)
  category?: RecordCategory;

  @ApiPropertyOptional({
    description: 'Page number (reserved for paginated response in next phase)',
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({
    description: 'Page size (reserved for paginated response in next phase)',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({
    description: 'Sort field (reserved for next phase)',
    example: 'createdAt',
  })
  @IsOptional()
  @IsString()
  sort?: string;
}
