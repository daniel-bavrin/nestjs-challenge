import { Test, TestingModule } from '@nestjs/testing';
import { RecordV1Controller } from './record.v1.controller';
import { CreateRecordRequestDTO } from '../dtos/create-record.request.dto';
import { RecordCategory, RecordFormat } from '../schemas/record.enum';
import {
  PaginatedRecordsResponse,
  RecordResponse,
  RecordService,
} from '../services/record.service';
import { UpdateRecordRequestDTO } from '../dtos/update-record.request.dto';
import { FindRecordsQueryDTO } from '../dtos/find-records.query.dto';

const timestamps = {
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  created: new Date('2026-01-01T00:00:00.000Z'),
  lastModified: new Date('2026-01-02T00:00:00.000Z'),
};

describe('RecordV1Controller', () => {
  let recordController: RecordV1Controller;
  let recordService: RecordService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RecordV1Controller],
      providers: [
        {
          provide: RecordService,
          useValue: {
            create: jest.fn(),
            update: jest.fn(),
            findOne: jest.fn(),
            findAll: jest.fn(),
            softDelete: jest.fn(),
            fillTracklistNow: jest.fn(),
            clearTracklistNow: jest.fn(),
          },
        },
      ],
    }).compile();

    recordController = module.get<RecordV1Controller>(RecordV1Controller);
    recordService = module.get<RecordService>(RecordService);
  });

  it('should create a new record', async () => {
    const createRecordDto: CreateRecordRequestDTO = {
      artist: 'Test',
      album: 'Test Record',
      price: 100,
      qty: 10,
      format: RecordFormat.VINYL,
      category: RecordCategory.ALTERNATIVE,
    };

    const savedRecord: RecordResponse = {
      _id: '1',
      artist: 'Test',
      album: 'Test Record',
      price: 100,
      qty: 10,
      category: RecordCategory.ALTERNATIVE,
      format: RecordFormat.VINYL,
      tracklist: [],
      ...timestamps,
    } as unknown as RecordResponse;

    jest.spyOn(recordService, 'create').mockResolvedValue(savedRecord);

    const result = await recordController.create(createRecordDto);
    expect(result).toEqual(savedRecord);
    expect(recordService.create).toHaveBeenCalledWith(createRecordDto);
  });

  it('should return a paginated response', async () => {
    const query = new FindRecordsQueryDTO();
    const items: RecordResponse[] = [
      {
        _id: '1',
        artist: 'A',
        album: 'Record 1',
        price: 100,
        qty: 10,
        category: RecordCategory.ROCK,
        format: RecordFormat.VINYL,
        tracklist: [],
        ...timestamps,
      },
      {
        _id: '2',
        artist: 'B',
        album: 'Record 2',
        price: 200,
        qty: 20,
        category: RecordCategory.JAZZ,
        format: RecordFormat.CD,
        tracklist: [],
        ...timestamps,
      },
    ] as unknown as RecordResponse[];
    const response: PaginatedRecordsResponse = {
      items,
      meta: {
        total: 2,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      },
    };

    jest.spyOn(recordService, 'findAll').mockResolvedValue(response);

    const result = await recordController.findAll(query);
    expect(result).toEqual(response);
    expect(recordService.findAll).toHaveBeenCalledWith(query);
  });

  it('should update an existing record', async () => {
    const updateDto: UpdateRecordRequestDTO = {
      qty: 5,
    };
    const updatedRecord: RecordResponse = {
      _id: '1',
      artist: 'Test',
      album: 'Test Record',
      price: 100,
      qty: 5,
      category: RecordCategory.ALTERNATIVE,
      format: RecordFormat.VINYL,
      tracklist: [],
      ...timestamps,
    } as unknown as RecordResponse;

    jest.spyOn(recordService, 'update').mockResolvedValue(updatedRecord);

    const result = await recordController.update('1', updateDto);
    expect(result).toEqual(updatedRecord);
    expect(recordService.update).toHaveBeenCalledWith('1', updateDto);
  });

  it('should soft-delete a record', async () => {
    jest.spyOn(recordService, 'softDelete').mockResolvedValue(undefined);

    await recordController.remove('1');

    expect(recordService.softDelete).toHaveBeenCalledWith('1');
  });

  it('should fill and return tracklist for record', async () => {
    const updatedRecord: RecordResponse = {
      _id: '1',
      artist: 'Test',
      album: 'Test Record',
      price: 100,
      qty: 5,
      category: RecordCategory.ALTERNATIVE,
      format: RecordFormat.VINYL,
      tracklist: [{ position: 1, title: 'Song A' }],
      ...timestamps,
    } as unknown as RecordResponse;

    jest
      .spyOn(recordService, 'fillTracklistNow')
      .mockResolvedValue(updatedRecord);

    const result = await recordController.fillTracklist('1');

    expect(result).toEqual(updatedRecord);
    expect(recordService.fillTracklistNow).toHaveBeenCalledWith('1');
  });

  it('should clear and return tracklist for record', async () => {
    const updatedRecord: RecordResponse = {
      _id: '1',
      artist: 'Test',
      album: 'Test Record',
      price: 100,
      qty: 5,
      category: RecordCategory.ALTERNATIVE,
      format: RecordFormat.VINYL,
      tracklist: [],
      ...timestamps,
    } as unknown as RecordResponse;

    jest
      .spyOn(recordService, 'clearTracklistNow')
      .mockResolvedValue(updatedRecord);

    const result = await recordController.clearTracklist('1');

    expect(result).toEqual(updatedRecord);
    expect(recordService.clearTracklistNow).toHaveBeenCalledWith('1');
  });
});
