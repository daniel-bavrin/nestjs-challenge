import { Test, TestingModule } from '@nestjs/testing';
import { RecordController } from './record.controller';
import { Record } from '../schemas/record.schema';
import { CreateRecordRequestDTO } from '../dtos/create-record.request.dto';
import { RecordCategory, RecordFormat } from '../schemas/record.enum';
import { RecordService } from '../services/record.service';
import { UpdateRecordRequestDTO } from '../dtos/update-record.request.dto';
import { FindRecordsQueryDTO } from '../dtos/find-records.query.dto';
import { FindRecordsResponseDTO } from '../dtos/find-records.response.dto';

describe('RecordController', () => {
  let recordController: RecordController;
  let recordService: RecordService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RecordController],
      providers: [
        {
          provide: RecordService,
          useValue: {
            create: jest.fn(),
            update: jest.fn(),
            findAll: jest.fn(),
          },
        },
      ],
    }).compile();

    recordController = module.get<RecordController>(RecordController);
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

    const savedRecord = {
      _id: '1',
      artist: 'Test',
      album: 'Test Record',
      price: 100,
      qty: 10,
      category: RecordCategory.ALTERNATIVE,
      format: RecordFormat.VINYL,
    };

    jest
      .spyOn(recordService, 'create')
      .mockResolvedValue(savedRecord as Record);

    const result = await recordController.create(createRecordDto);
    expect(result).toEqual(savedRecord);
    expect(recordService.create).toHaveBeenCalledWith(createRecordDto);
  });

  it('should return an array of records', async () => {
    const query = new FindRecordsQueryDTO();
    const items = [
      { _id: '1', artist: 'A', album: 'Record 1', price: 100, qty: 10 },
      { _id: '2', artist: 'B', album: 'Record 2', price: 200, qty: 20 },
    ] as unknown as Record[];
    const response: FindRecordsResponseDTO = {
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
    const updatedRecord = {
      _id: '1',
      artist: 'Test',
      album: 'Test Record',
      qty: 5,
    };

    jest
      .spyOn(recordService, 'update')
      .mockResolvedValue(updatedRecord as unknown as Record);

    const result = await recordController.update('1', updateDto);
    expect(result).toEqual(updatedRecord);
    expect(recordService.update).toHaveBeenCalledWith('1', updateDto);
  });
});
