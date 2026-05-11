import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RecordService } from './record.service';
import { Record } from '../schemas/record.schema';
import { CreateRecordRequestDTO } from '../dtos/create-record.request.dto';
import { RecordCategory, RecordFormat } from '../schemas/record.enum';
import { NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { UpdateRecordRequestDTO } from '../dtos/update-record.request.dto';

describe('RecordService', () => {
  let recordService: RecordService;
  let recordModel: Model<Record>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecordService,
        {
          provide: getModelToken('Record'),
          useValue: {
            create: jest.fn(),
            findById: jest.fn(),
            find: jest.fn(),
          },
        },
      ],
    }).compile();

    recordService = module.get<RecordService>(RecordService);
    recordModel = module.get<Model<Record>>(getModelToken('Record'));
  });

  it('creates a record with the expected mapped fields', async () => {
    const request: CreateRecordRequestDTO = {
      artist: 'The Beatles',
      album: 'Abbey Road',
      price: 25,
      qty: 10,
      format: RecordFormat.VINYL,
      category: RecordCategory.ROCK,
      mbid: 'test-mbid',
    };

    const createdRecord = { _id: '1', ...request };
    jest.spyOn(recordModel, 'create').mockResolvedValue(createdRecord as any);

    const result = await recordService.create(request);

    expect(result).toEqual(createdRecord);
    expect(recordModel.create).toHaveBeenCalledWith(request);
  });

  it('updates an existing record', async () => {
    const savedRecord = {
      save: jest.fn().mockResolvedValue({ _id: '1', qty: 5 }),
    } as unknown as Record;
    jest.spyOn(recordModel, 'findById').mockResolvedValue(savedRecord);

    const updateDto: UpdateRecordRequestDTO = { qty: 5 };
    const result = await recordService.update('1', updateDto);

    expect(recordModel.findById).toHaveBeenCalledWith('1');
    expect(result).toEqual({ _id: '1', qty: 5 });
    expect((savedRecord as unknown as { save: jest.Mock }).save).toHaveBeenCalled();
  });

  it('throws NotFoundException when updating a missing record', async () => {
    jest.spyOn(recordModel, 'findById').mockResolvedValue(null as unknown as Record);

    await expect(recordService.update('missing', {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws InternalServerErrorException when saving fails', async () => {
    const savedRecord = {
      save: jest.fn().mockRejectedValue(new Error('boom')),
    } as unknown as Record;
    jest.spyOn(recordModel, 'findById').mockResolvedValue(savedRecord);

    await expect(recordService.update('1', { qty: 5 })).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });

  it('filters records using search and field filters', async () => {
    const records = [
      {
        artist: 'The Beatles',
        album: 'Abbey Road',
        category: RecordCategory.ROCK,
        format: RecordFormat.VINYL,
      },
      {
        artist: 'Miles Davis',
        album: 'Kind of Blue',
        category: RecordCategory.JAZZ,
        format: RecordFormat.CD,
      },
    ] as Record[];

    jest.spyOn(recordModel, 'find').mockReturnValue({
      exec: jest.fn().mockResolvedValue(records),
    } as unknown as ReturnType<Model<Record>['find']>);

    const result = await recordService.findAll({
      q: 'Abbey',
      artist: 'Beatles',
      album: 'Road',
      format: RecordFormat.VINYL,
      category: RecordCategory.ROCK,
    });

    expect(result).toHaveLength(1);
    expect(result[0].artist).toBe('The Beatles');
  });
});
