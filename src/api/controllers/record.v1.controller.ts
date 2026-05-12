import {
  Controller,
  Delete,
  Get,
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
import { RecordResponse, RecordService } from '../services/record.service';
import { FindRecordsQueryDTO } from '../dtos/find-records.query.dto';
import { FindRecordsResponseDTO } from '../dtos/find-records.response.dto';

@Controller('v1/records')
export class RecordV1Controller {
  constructor(private readonly recordService: RecordService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new record' })
  @ApiResponse({ status: 201, description: 'Record successfully created' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  async create(
    @Body() request: CreateRecordRequestDTO,
  ): Promise<RecordResponse> {
    return this.recordService.create(request);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an existing record' })
  @ApiResponse({ status: 200, description: 'Record updated successfully' })
  @ApiResponse({ status: 500, description: 'Cannot find record to update' })
  async update(
    @Param('id') id: string,
    @Body() updateRecordDto: UpdateRecordRequestDTO,
  ): Promise<RecordResponse> {
    return this.recordService.update(id, updateRecordDto);
  }
  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Soft-delete a record' })
  @ApiResponse({ status: 204, description: 'Record deleted' })
  @ApiResponse({ status: 404, description: 'Record not found' })
  async remove(@Param('id') id: string): Promise<void> {
    return this.recordService.softDelete(id);
  }

  @Get()
  @ApiOperation({ summary: 'Get all records with optional filters' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of records',
    type: FindRecordsResponseDTO,
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
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number',
    type: Number,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Page size',
    type: Number,
  })
  @ApiQuery({
    name: 'sort',
    required: false,
    description: 'Sort field',
    type: String,
  })
  async findAll(
    @Query() query: FindRecordsQueryDTO,
  ): Promise<FindRecordsResponseDTO> {
    return this.recordService.findAll(query);
  }
}
