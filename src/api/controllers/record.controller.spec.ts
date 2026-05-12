import { Test, TestingModule } from '@nestjs/testing';
import { RecordController } from './record.controller';
import { CreateRecordRequestDTO } from '../dtos/create-record.request.dto';
import { RecordCategory, RecordFormat } from '../schemas/record.enum';
import { RecordResponseV0, RecordService } from '../services/record.service';
import { UpdateRecordRequestDTO } from '../dtos/update-record.request.dto';

const timestamps = {
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  created: new Date('2026-01-01T00:00:00.000Z'),
  lastModified: new Date('2026-01-02T00:00:00.000Z'),
};

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
            createV0: jest.fn(),
            updateV0: jest.fn(),
            findAllV0: jest.fn(),
            softDelete: jest.fn(),
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

    const savedRecord: RecordResponseV0 = {
      _id: '1',
      artist: 'Test',
      album: 'Test Record',
      price: 100,
      qty: 10,
      category: RecordCategory.ALTERNATIVE,
      format: RecordFormat.VINYL,
      ...timestamps,
    } as unknown as RecordResponseV0;

    jest.spyOn(recordService, 'createV0').mockResolvedValue(savedRecord);

    const result = await recordController.create(createRecordDto);
    expect(result).toEqual(savedRecord);
    expect(recordService.createV0).toHaveBeenCalledWith(createRecordDto);
  });

  it('should return an array of records', async () => {
    const items: RecordResponseV0[] = [
      {
        _id: '1',
        artist: 'A',
        album: 'Record 1',
        price: 100,
        qty: 10,
        category: RecordCategory.ROCK,
        format: RecordFormat.VINYL,
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
        ...timestamps,
      },
    ] as unknown as RecordResponseV0[];

    jest.spyOn(recordService, 'findAllV0').mockResolvedValue(items);

    const result = await recordController.findAll(
      'query',
      'artist',
      'album',
      RecordFormat.VINYL,
      RecordCategory.ROCK,
    );
    expect(result).toEqual(items);
    expect(recordService.findAllV0).toHaveBeenCalledWith({
      q: 'query',
      artist: 'artist',
      album: 'album',
      format: RecordFormat.VINYL,
      category: RecordCategory.ROCK,
    });
  });

  it('should update an existing record', async () => {
    const updateDto: UpdateRecordRequestDTO = {
      qty: 5,
    };
    const updatedRecord: RecordResponseV0 = {
      _id: '1',
      artist: 'Test',
      album: 'Test Record',
      price: 100,
      qty: 5,
      category: RecordCategory.ALTERNATIVE,
      format: RecordFormat.VINYL,
      ...timestamps,
    } as unknown as RecordResponseV0;

    jest.spyOn(recordService, 'updateV0').mockResolvedValue(updatedRecord);

    const result = await recordController.update('1', updateDto);
    expect(result).toEqual(updatedRecord);
    expect(recordService.updateV0).toHaveBeenCalledWith('1', updateDto);
  });

  it('should soft-delete a record', async () => {
    jest.spyOn(recordService, 'softDelete').mockResolvedValue(undefined);

    await recordController.remove('1');

    expect(recordService.softDelete).toHaveBeenCalledWith('1');
  });
});
