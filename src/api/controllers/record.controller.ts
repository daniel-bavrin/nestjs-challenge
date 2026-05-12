import {
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Post,
  Body,
  Param,
  Query,
  Put,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { CreateRecordRequestDTO } from '../dtos/create-record.request.dto';
import { RecordCategory, RecordFormat } from '../schemas/record.enum';
import { UpdateRecordRequestDTO } from '../dtos/update-record.request.dto';
import { RecordResponseV0, RecordService } from '../services/record.service';

const V0_SUNSET = 'Wed, 31 Dec 2026 23:59:59 GMT';
const V0_SUCCESSOR_LINK = '</v1/records>; rel="successor-version"';
const V0_DEPRECATION_MESSAGE =
  'API v0 is deprecated and will be removed after the sunset date. Migrate to /v1/records.';

@Controller('records')
export class RecordController {
  constructor(private readonly recordService: RecordService) {}

  @Post()
  @Header('Deprecation', 'true')
  @Header('Sunset', V0_SUNSET)
  @Header('Link', V0_SUCCESSOR_LINK)
  @Header('X-API-Warn', V0_DEPRECATION_MESSAGE)
  @ApiOperation({ summary: 'Create a new record', deprecated: true })
  @ApiResponse({ status: 201, description: 'Record successfully created' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  async create(
    @Body() request: CreateRecordRequestDTO,
  ): Promise<RecordResponseV0> {
    return this.recordService.createV0(request);
  }

  @Put(':id')
  @Header('Deprecation', 'true')
  @Header('Sunset', V0_SUNSET)
  @Header('Link', V0_SUCCESSOR_LINK)
  @Header('X-API-Warn', V0_DEPRECATION_MESSAGE)
  @ApiOperation({ summary: 'Update an existing record', deprecated: true })
  @ApiResponse({ status: 200, description: 'Record updated successfully' })
  @ApiResponse({ status: 500, description: 'Cannot find record to update' })
  async update(
    @Param('id') id: string,
    @Body() updateRecordDto: UpdateRecordRequestDTO,
  ): Promise<RecordResponseV0> {
    return this.recordService.updateV0(id, updateRecordDto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Header('Deprecation', 'true')
  @Header('Sunset', V0_SUNSET)
  @Header('Link', V0_SUCCESSOR_LINK)
  @Header('X-API-Warn', V0_DEPRECATION_MESSAGE)
  @ApiOperation({ summary: 'Soft-delete a record', deprecated: true })
  @ApiResponse({ status: 204, description: 'Record deleted' })
  @ApiResponse({ status: 404, description: 'Record not found' })
  async remove(@Param('id') id: string): Promise<void> {
    return this.recordService.softDelete(id);
  }

  @Get()
  @Header('Deprecation', 'true')
  @Header('Sunset', V0_SUNSET)
  @Header('Link', V0_SUCCESSOR_LINK)
  @Header('X-API-Warn', V0_DEPRECATION_MESSAGE)
  @ApiOperation({
    summary: 'Get all records with optional filters',
    deprecated: true,
  })
  @ApiResponse({
    status: 200,
    description: 'List of records',
  })
  @ApiQuery({
    name: 'q',
    required: false,
    description:
      'Search query (search across multiple fields like artist, album, category, etc.)',
    type: String,
  })
  @ApiQuery({
    name: 'artist',
    required: false,
    description: 'Filter by artist name',
    type: String,
  })
  @ApiQuery({
    name: 'album',
    required: false,
    description: 'Filter by album name',
    type: String,
  })
  @ApiQuery({
    name: 'format',
    required: false,
    description: 'Filter by record format (Vinyl, CD, etc.)',
    enum: RecordFormat,
    type: String,
  })
  @ApiQuery({
    name: 'category',
    required: false,
    description: 'Filter by record category (e.g., Rock, Jazz)',
    enum: RecordCategory,
    type: String,
  })
  async findAll(
    @Query('q') q?: string,
    @Query('artist') artist?: string,
    @Query('album') album?: string,
    @Query('format') format?: RecordFormat,
    @Query('category') category?: RecordCategory,
  ): Promise<RecordResponseV0[]> {
    return this.recordService.findAllV0({
      q,
      artist,
      album,
      format,
      category,
    });
  }
}
