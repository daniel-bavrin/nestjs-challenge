import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RecordService } from './record.service';
import { Record } from '../schemas/record.schema';
import { CreateRecordRequestDTO } from '../dtos/create-record.request.dto';
import { RecordCategory, RecordFormat } from '../schemas/record.enum';
import {
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { UpdateRecordRequestDTO } from '../dtos/update-record.request.dto';
import { FindRecordsQueryDTO } from '../dtos/find-records.query.dto';
import { MusicbrainzService } from './musicbrainz.service';

describe('RecordService', () => {
  let recordService: RecordService;
  let recordModel: Model<Record>;
  let musicbrainzService: MusicbrainzService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecordService,
        {
          provide: MusicbrainzService,
          useValue: {
            fetchTracklistByMbid: jest.fn(),
          },
        },
        {
          provide: getModelToken('Record'),
          useValue: {
            create: jest.fn(),
            findById: jest.fn(),
            find: jest.fn(),
            countDocuments: jest.fn(),
          },
        },
      ],
    }).compile();

    recordService = module.get<RecordService>(RecordService);
    recordModel = module.get<Model<Record>>(getModelToken('Record'));
    musicbrainzService = module.get<MusicbrainzService>(MusicbrainzService);
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

    const tracklist = [
      { position: 1, title: 'Come Together', duration: '4:20' },
    ];
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const updatedAt = new Date('2026-01-02T00:00:00.000Z');
    const createdRecord = {
      _id: '1',
      ...request,
      tracklist,
      createdAt,
      updatedAt,
    };

    jest
      .spyOn(musicbrainzService, 'fetchTracklistByMbid')
      .mockResolvedValue(tracklist as any);
    jest.spyOn(recordModel, 'create').mockResolvedValue(createdRecord as any);

    const result = await recordService.create(request);

    expect(result).toEqual({
      ...createdRecord,
      created: createdAt,
      lastModified: updatedAt,
    });
    expect(musicbrainzService.fetchTracklistByMbid).toHaveBeenCalledWith(
      request.mbid,
    );
    expect(recordModel.create).toHaveBeenCalledWith({
      ...request,
      tracklist,
    });
  });

  it('creates a record with empty tracklist when mbid is not provided', async () => {
    const request: CreateRecordRequestDTO = {
      artist: 'The Beatles',
      album: 'Abbey Road',
      price: 25,
      qty: 10,
      format: RecordFormat.VINYL,
      category: RecordCategory.ROCK,
    };

    const createdRecord = { _id: '1', ...request, tracklist: [] };
    jest.spyOn(recordModel, 'create').mockResolvedValue(createdRecord as any);

    await recordService.create(request);

    expect(musicbrainzService.fetchTracklistByMbid).not.toHaveBeenCalled();
    expect(recordModel.create).toHaveBeenCalledWith({
      ...request,
      tracklist: [],
    });
  });

  it('updates an existing record', async () => {
    const savedRecord = {
      mbid: 'old-mbid',
      tracklist: [{ position: 1, title: 'Old Song' }],
      save: jest.fn().mockResolvedValue({
        _id: '1',
        qty: 5,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-03T00:00:00.000Z'),
      }),
    } as unknown as Record;
    jest.spyOn(recordModel, 'findById').mockResolvedValue(savedRecord);

    const updateDto: UpdateRecordRequestDTO = { qty: 5 };
    const result = await recordService.update('1', updateDto);

    expect(recordModel.findById).toHaveBeenCalledWith('1');
    expect(result).toEqual({
      _id: '1',
      qty: 5,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-03T00:00:00.000Z'),
      created: new Date('2026-01-01T00:00:00.000Z'),
      lastModified: new Date('2026-01-03T00:00:00.000Z'),
    });
    expect(
      (savedRecord as unknown as { save: jest.Mock }).save,
    ).toHaveBeenCalled();
    expect(musicbrainzService.fetchTracklistByMbid).not.toHaveBeenCalled();
  });

  it('re-fetches tracklist when mbid changes on update', async () => {
    const savedRecord = {
      mbid: 'old-mbid',
      tracklist: [{ position: 1, title: 'Old Song' }],
      save: jest.fn().mockResolvedValue({ _id: '1', mbid: 'new-mbid' }),
    } as unknown as Record;
    jest.spyOn(recordModel, 'findById').mockResolvedValue(savedRecord);
    jest
      .spyOn(musicbrainzService, 'fetchTracklistByMbid')
      .mockResolvedValue([
        { position: 1, title: 'New Song', duration: '3:15' },
      ] as any);

    await recordService.update('1', { mbid: 'new-mbid' });

    expect(musicbrainzService.fetchTracklistByMbid).toHaveBeenCalledWith(
      'new-mbid',
    );
    expect((savedRecord as any).tracklist).toEqual([
      { position: 1, title: 'New Song', duration: '3:15' },
    ]);
  });

  it('clears tracklist when mbid is removed on update', async () => {
    const savedRecord = {
      mbid: 'old-mbid',
      tracklist: [{ position: 1, title: 'Old Song' }],
      save: jest.fn().mockResolvedValue({ _id: '1', mbid: undefined }),
    } as unknown as Record;
    jest.spyOn(recordModel, 'findById').mockResolvedValue(savedRecord);

    await recordService.update('1', { mbid: undefined });

    expect(musicbrainzService.fetchTracklistByMbid).not.toHaveBeenCalled();
    expect((savedRecord as any).tracklist).toEqual([]);
  });

  it('throws NotFoundException when updating a missing record', async () => {
    jest
      .spyOn(recordModel, 'findById')
      .mockResolvedValue(null as unknown as Record);

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
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      },
      {
        artist: 'Miles Davis',
        album: 'Kind of Blue',
        category: RecordCategory.JAZZ,
        format: RecordFormat.CD,
        createdAt: new Date('2026-01-05T00:00:00.000Z'),
        updatedAt: new Date('2026-01-06T00:00:00.000Z'),
      },
    ] as Record[];

    const findChain = {
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(records),
    };

    jest.spyOn(recordModel, 'find').mockReturnValue(findChain as any);
    const countDocumentsSpy = jest
      .spyOn(recordModel, 'countDocuments')
      .mockReturnValue({
        exec: jest.fn().mockResolvedValue(1),
      } as any);

    const query = new FindRecordsQueryDTO();
    query.q = 'Abbey';
    query.artist = 'Beatles';
    query.album = 'Road';
    query.format = RecordFormat.VINYL;
    query.category = RecordCategory.ROCK;
    query.page = 2;
    query.limit = 10;
    query.sort = 'artist';

    const result = await recordService.findAll(query);
    const expectedFilter = {
      $or: [{ artist: /Abbey/i }, { album: /Abbey/i }, { category: /Abbey/i }],
      artist: /Beatles/i,
      album: /Road/i,
      format: RecordFormat.VINYL,
      category: RecordCategory.ROCK,
    };

    expect(recordModel.find).toHaveBeenCalledWith(
      expect.objectContaining(expectedFilter),
    );
    expect(countDocumentsSpy).toHaveBeenCalledWith(expectedFilter);
    expect(findChain.sort).toHaveBeenCalledWith('artist');
    expect(findChain.skip).toHaveBeenCalledWith(10);
    expect(findChain.limit).toHaveBeenCalledWith(10);
    expect(result).toEqual({
      items: records.map((record) => ({
        ...record,
        created: (record as any).createdAt,
        lastModified: (record as any).updatedAt,
      })),
      meta: {
        total: 1,
        page: 2,
        limit: 10,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: true,
      },
    });
  });

  it('maps legacy sort fields to canonical timestamp fields', async () => {
    const findChain = {
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    };

    jest.spyOn(recordModel, 'find').mockReturnValue(findChain as any);
    jest.spyOn(recordModel, 'countDocuments').mockReturnValue({
      exec: jest.fn().mockResolvedValue(0),
    } as any);

    const query = new FindRecordsQueryDTO();
    query.sort = '-lastModified';

    await recordService.findAll(query);

    expect(findChain.sort).toHaveBeenCalledWith('-updatedAt');
  });
});
