import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { getQueueToken } from '@nestjs/bullmq';
import { Model } from 'mongoose';
import { RecordService } from './record.service';
import { Record } from '../schemas/record.schema';
import { CreateRecordRequestDTO } from '../dtos/create-record.request.dto';
import { RecordCategory, RecordFormat } from '../schemas/record.enum';
import {
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { UpdateRecordRequestDTO } from '../dtos/update-record.request.dto';
import { FindRecordsQueryDTO } from '../dtos/find-records.query.dto';
import {
  FETCH_TRACKLIST_JOB,
  TRACKLIST_QUEUE,
} from '../jobs/tracklist-queue.constants';
import { RecordListCacheService } from './record-list-cache.service';
import {
  TRACKLIST_PROVIDER,
  TracklistProvider,
} from '../interfaces/tracklist-provider.interface';

describe('RecordService', () => {
  let recordService: RecordService;
  let recordModel: Model<Record>;
  let tracklistQueue: Queue;
  let recordListCacheService: RecordListCacheService;
  let tracklistProvider: TracklistProvider;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecordService,
        {
          provide: getQueueToken(TRACKLIST_QUEUE),
          useValue: {
            add: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: getModelToken('Record'),
          useValue: {
            create: jest.fn(),
            findById: jest.fn(),
            findOne: jest.fn(),
            findOneAndUpdate: jest.fn(),
            find: jest.fn(),
            countDocuments: jest.fn(),
          },
        },
        {
          provide: RecordListCacheService,
          useValue: {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue(undefined),
            getItem: jest.fn().mockResolvedValue(null),
            setItem: jest.fn().mockResolvedValue(undefined),
            invalidateItem: jest.fn().mockResolvedValue(undefined),
            invalidateAll: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: TRACKLIST_PROVIDER,
          useValue: {
            fetchTracklist: jest.fn(),
          },
        },
      ],
    }).compile();

    recordService = module.get<RecordService>(RecordService);
    recordModel = module.get<Model<Record>>(getModelToken('Record'));
    tracklistQueue = module.get<Queue>(getQueueToken(TRACKLIST_QUEUE));
    recordListCacheService = module.get<RecordListCacheService>(
      RecordListCacheService,
    );
    tracklistProvider = module.get<TracklistProvider>(TRACKLIST_PROVIDER);
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

    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const updatedAt = new Date('2026-01-02T00:00:00.000Z');
    const createdRecord = {
      _id: '1',
      ...request,
      tracklist: [],
      createdAt,
      updatedAt,
    };

    jest.spyOn(recordModel, 'create').mockResolvedValue(createdRecord as any);

    const result = await recordService.create(request);

    expect(result).toEqual({
      ...createdRecord,
      created: createdAt,
      lastModified: updatedAt,
    });
    expect(tracklistQueue.add).toHaveBeenCalledWith(
      FETCH_TRACKLIST_JOB,
      { recordId: '1', externalId: request.mbid },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
      },
    );
    expect(recordModel.create).toHaveBeenCalledWith({
      ...request,
      tracklist: [],
    });
    expect(recordListCacheService.invalidateAll).toHaveBeenCalled();
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

    expect(tracklistQueue.add).not.toHaveBeenCalled();
    expect(recordModel.create).toHaveBeenCalledWith({
      ...request,
      tracklist: [],
    });
    expect(recordListCacheService.invalidateAll).toHaveBeenCalled();
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
    jest.spyOn(recordModel, 'findOne').mockResolvedValue(savedRecord);

    const updateDto: UpdateRecordRequestDTO = { qty: 5 };
    const result = await recordService.update('1', updateDto);

    expect(recordModel.findOne).toHaveBeenCalledWith({
      _id: '1',
      deletedAt: null,
    });
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
    expect(tracklistQueue.add).not.toHaveBeenCalled();
    expect(recordListCacheService.invalidateItem).toHaveBeenCalledWith('1');
    expect(recordListCacheService.invalidateAll).toHaveBeenCalled();
  });

  it('enqueues tracklist refresh when mbid changes on update', async () => {
    const savedRecord = {
      mbid: 'old-mbid',
      tracklist: [{ position: 1, title: 'Old Song' }],
      save: jest.fn().mockResolvedValue({ _id: '1', mbid: 'new-mbid' }),
    } as unknown as Record;
    jest.spyOn(recordModel, 'findOne').mockResolvedValue(savedRecord);

    await recordService.update('1', { mbid: 'new-mbid' });

    expect((savedRecord as any).tracklist).toEqual([]);
    expect(tracklistQueue.add).toHaveBeenCalledWith(
      FETCH_TRACKLIST_JOB,
      { recordId: '1', externalId: 'new-mbid' },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
      },
    );
  });

  it('clears tracklist when mbid is removed on update', async () => {
    const savedRecord = {
      mbid: 'old-mbid',
      tracklist: [{ position: 1, title: 'Old Song' }],
      save: jest.fn().mockResolvedValue({ _id: '1', mbid: '' }),
    } as unknown as Record;
    jest.spyOn(recordModel, 'findOne').mockResolvedValue(savedRecord);

    await recordService.update('1', { mbid: undefined });

    expect(tracklistQueue.add).not.toHaveBeenCalled();
    expect((savedRecord as any).tracklist).toEqual([]);
    expect((savedRecord as any).mbid).toBe('');
  });

  it('sets mbid to an empty string and clears tracklist when mbid is blank on update', async () => {
    const savedRecord = {
      mbid: 'old-mbid',
      tracklist: [{ position: 1, title: 'Old Song' }],
      save: jest.fn().mockResolvedValue({ _id: '1', mbid: '' }),
    } as unknown as Record;
    jest.spyOn(recordModel, 'findOne').mockResolvedValue(savedRecord);

    await recordService.update('1', { mbid: '' });

    expect(tracklistQueue.add).not.toHaveBeenCalled();
    expect((savedRecord as any).tracklist).toEqual([]);
    expect((savedRecord as any).mbid).toBe('');
  });

  it('throws NotFoundException when updating a missing record', async () => {
    jest
      .spyOn(recordModel, 'findOne')
      .mockResolvedValue(null as unknown as Record);

    await expect(recordService.update('missing', {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws InternalServerErrorException when saving fails', async () => {
    const savedRecord = {
      save: jest.fn().mockRejectedValue(new Error('boom')),
    } as unknown as Record;
    jest.spyOn(recordModel, 'findOne').mockResolvedValue(savedRecord);

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
      deletedAt: null,
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
    expect(recordListCacheService.set).toHaveBeenCalledWith(
      'v1',
      {
        q: 'Abbey',
        artist: 'Beatles',
        album: 'Road',
        format: RecordFormat.VINYL,
        category: RecordCategory.ROCK,
        page: 2,
        limit: 10,
        sort: 'artist',
      },
      result,
    );
  });

  it('returns cached v1 list response when available', async () => {
    const query = new FindRecordsQueryDTO();
    query.artist = 'Beatles';

    const cachedResponse = {
      items: [],
      meta: {
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: false,
      },
    };

    jest
      .spyOn(recordListCacheService, 'get')
      .mockResolvedValueOnce(cachedResponse as any);

    const result = await recordService.findAll(query);

    expect(result).toEqual(cachedResponse);
    expect(recordModel.find).not.toHaveBeenCalled();
    expect(recordModel.countDocuments).not.toHaveBeenCalled();
  });

  it('maps v0 sort fields to canonical timestamp fields', async () => {
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

  it('creates v0 response without tracklist', async () => {
    const request: CreateRecordRequestDTO = {
      artist: 'The Beatles',
      album: 'Abbey Road',
      price: 25,
      qty: 10,
      format: RecordFormat.VINYL,
      category: RecordCategory.ROCK,
    };

    jest.spyOn(recordService, 'create').mockResolvedValue({
      _id: '1',
      ...request,
      tracklist: [{ position: 1, title: 'Come Together' }],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      created: new Date('2026-01-01T00:00:00.000Z'),
      lastModified: new Date('2026-01-02T00:00:00.000Z'),
    } as any);

    const result = await recordService.createV0(request);

    expect(result).not.toHaveProperty('tracklist');
    expect(result).toHaveProperty('artist', request.artist);
  });

  it('returns v0 list shape without tracklist and pagination', async () => {
    const records = [
      {
        toObject: jest.fn().mockReturnValue({
          _id: '1',
          artist: 'The Beatles',
          album: 'Abbey Road',
          price: 25,
          qty: 10,
          format: RecordFormat.VINYL,
          category: RecordCategory.ROCK,
          tracklist: [{ position: 1, title: 'Come Together' }],
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-02T00:00:00.000Z'),
        }),
      },
    ] as unknown as Record[];

    jest.spyOn(recordModel, 'find').mockReturnValue({
      exec: jest.fn().mockResolvedValue(records),
    } as any);

    const result = await recordService.findAllV0({
      artist: 'Beatles',
    });

    expect(recordModel.find).toHaveBeenCalledWith({
      deletedAt: null,
      artist: /Beatles/i,
    });
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).not.toHaveProperty('tracklist');
    expect(result[0]).toHaveProperty('created');
    expect(result[0]).toHaveProperty('lastModified');
  });

  it('always includes deletedAt: null in query filters', async () => {
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

    await recordService.findAll(new FindRecordsQueryDTO());

    expect(recordModel.find).toHaveBeenCalledWith(
      expect.objectContaining({ deletedAt: null }),
    );
  });

  it('soft-deletes a record by setting deletedAt', async () => {
    const saveMock = jest.fn().mockResolvedValue(undefined);
    const record = { deletedAt: null, save: saveMock } as unknown as Record;
    jest.spyOn(recordModel, 'findOne').mockResolvedValue(record);

    await recordService.softDelete('record-id');

    expect(recordModel.findOne).toHaveBeenCalledWith({
      _id: 'record-id',
      deletedAt: null,
    });
    expect((record as any).deletedAt).toBeInstanceOf(Date);
    expect(saveMock).toHaveBeenCalled();
    expect(recordListCacheService.invalidateItem).toHaveBeenCalledWith(
      'record-id',
    );
    expect(recordListCacheService.invalidateAll).toHaveBeenCalled();
  });

  it('throws NotFoundException when soft-deleting a missing or already-deleted record', async () => {
    jest.spyOn(recordModel, 'findOne').mockResolvedValue(null);

    await expect(recordService.softDelete('gone-id')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns a single record by id', async () => {
    const record = {
      _id: 'r1',
      artist: 'The Beatles',
      album: 'Abbey Road',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    } as unknown as Record;
    jest.spyOn(recordModel, 'findOne').mockResolvedValue(record);

    const result = await recordService.findOne('r1');

    expect(recordModel.findOne).toHaveBeenCalledWith({
      _id: 'r1',
      deletedAt: null,
    });
    expect(recordListCacheService.getItem).toHaveBeenCalledWith('r1');
    expect(recordListCacheService.setItem).toHaveBeenCalledWith(
      'r1',
      expect.objectContaining({ _id: 'r1' }),
    );
    expect(result).toMatchObject({
      _id: 'r1',
      created: new Date('2026-01-01T00:00:00.000Z'),
      lastModified: new Date('2026-01-02T00:00:00.000Z'),
    });
  });

  it('returns cached item when available for findOne', async () => {
    const cached = {
      _id: 'r1',
      artist: 'Cached Artist',
      created: new Date('2026-01-01T00:00:00.000Z'),
      lastModified: new Date('2026-01-02T00:00:00.000Z'),
    };
    jest
      .spyOn(recordListCacheService, 'getItem')
      .mockResolvedValueOnce(cached as any);

    const result = await recordService.findOne('r1');

    expect(result).toEqual(cached);
    expect(recordModel.findOne).not.toHaveBeenCalled();
  });

  it('queues tracklist fill when record has mbid', async () => {
    const saveMock = jest.fn().mockResolvedValue(undefined);
    const record = {
      _id: 'r1',
      mbid: 'mbid-1',
      tracklist: [{ position: 1, title: 'Old Track' }],
      save: saveMock,
    } as unknown as Record;
    jest.spyOn(recordModel, 'findOne').mockResolvedValue(record);

    await recordService.requestTracklistFill('r1');

    expect((record as any).tracklist).toEqual([]);
    expect(saveMock).toHaveBeenCalled();
    expect(tracklistQueue.add).toHaveBeenCalledWith(
      FETCH_TRACKLIST_JOB,
      { recordId: 'r1', externalId: 'mbid-1' },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
      },
    );
    expect(recordListCacheService.invalidateItem).toHaveBeenCalledWith('r1');
    expect(recordListCacheService.invalidateAll).toHaveBeenCalled();
  });

  it('throws BadRequestException on tracklist fill when mbid is missing', async () => {
    const record = {
      _id: 'r1',
      mbid: undefined,
      tracklist: [],
      save: jest.fn(),
    } as unknown as Record;
    jest.spyOn(recordModel, 'findOne').mockResolvedValue(record);

    await expect(
      recordService.requestTracklistFill('r1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tracklistQueue.add).not.toHaveBeenCalled();
  });

  it('fills tracklist synchronously from provider', async () => {
    const saveMock = jest.fn().mockResolvedValue({
      _id: 'r1',
      tracklist: [{ position: 1, title: 'Song A' }],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    });
    const record = {
      _id: 'r1',
      mbid: 'mbid-1',
      tracklist: [],
      save: saveMock,
    } as unknown as Record;
    jest.spyOn(recordModel, 'findOne').mockResolvedValue(record);
    jest
      .spyOn(tracklistProvider, 'fetchTracklist')
      .mockResolvedValue([{ position: 1, title: 'Song A' }] as any);

    const result = await recordService.fillTracklistNow('r1');

    expect(tracklistProvider.fetchTracklist).toHaveBeenCalledWith('mbid-1');
    expect((record as any).tracklist).toEqual([
      { position: 1, title: 'Song A' },
    ]);
    expect(saveMock).toHaveBeenCalled();
    expect(recordListCacheService.invalidateItem).toHaveBeenCalledWith('r1');
    expect(recordListCacheService.invalidateAll).toHaveBeenCalled();
    expect(result).toMatchObject({ _id: 'r1' });
  });

  it('clears tracklist synchronously when present', async () => {
    const saveMock = jest.fn().mockResolvedValue({
      _id: 'r1',
      tracklist: [],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    });
    const record = {
      _id: 'r1',
      tracklist: [{ position: 1, title: 'Song A' }],
      save: saveMock,
    } as unknown as Record;
    jest.spyOn(recordModel, 'findOne').mockResolvedValue(record);

    const result = await recordService.clearTracklistNow('r1');

    expect((record as any).tracklist).toEqual([]);
    expect(saveMock).toHaveBeenCalled();
    expect(recordListCacheService.invalidateItem).toHaveBeenCalledWith('r1');
    expect(recordListCacheService.invalidateAll).toHaveBeenCalled();
    expect(result).toMatchObject({ _id: 'r1' });
  });

  it('returns current record when clear tracklist called on empty tracklist', async () => {
    const record = {
      _id: 'r1',
      tracklist: [],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    } as unknown as Record;
    jest.spyOn(recordModel, 'findOne').mockResolvedValue(record);

    const result = await recordService.clearTracklistNow('r1');

    expect(result).toMatchObject({ _id: 'r1' });
    expect(recordListCacheService.invalidateItem).not.toHaveBeenCalledWith(
      'r1',
    );
  });

  it('throws NotFoundException when record not found', async () => {
    jest.spyOn(recordModel, 'findOne').mockResolvedValue(null);

    await expect(recordService.findOne('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('update() scopes lookup to non-deleted records', async () => {
    const savedRecord = {
      mbid: undefined,
      tracklist: [],
      deletedAt: null,
      save: jest.fn().mockResolvedValue({
        _id: '1',
        qty: 5,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-03T00:00:00.000Z'),
      }),
    } as unknown as Record;
    jest.spyOn(recordModel, 'findOne').mockResolvedValue(savedRecord);

    await recordService.update('1', { qty: 5 });

    expect(recordModel.findOne).toHaveBeenCalledWith({
      _id: '1',
      deletedAt: null,
    });
  });

  it('escapes regex metacharacters in query text filters', async () => {
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
    query.q = 'A.*(B)+?';

    await recordService.findAll(query);

    const filterArg = (recordModel.find as jest.Mock).mock.calls[0][0];
    expect(filterArg.$or[0].artist).toEqual(/A\.\*\(B\)\+\?/i);
    expect(filterArg.$or[1].album).toEqual(/A\.\*\(B\)\+\?/i);
    expect(filterArg.$or[2].category).toEqual(/A\.\*\(B\)\+\?/i);
  });

  it('maps created sort field to createdAt', async () => {
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
    query.sort = 'created';

    await recordService.findAll(query);

    expect(findChain.sort).toHaveBeenCalledWith('createdAt');
  });

  it('falls back to default sort for unsupported record sort fields', async () => {
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
    query.sort = 'tracklist.position';

    await recordService.findAll(query);

    expect(findChain.sort).toHaveBeenCalledWith('-createdAt');
  });

  it('adjustInventory invalidates item and list caches on successful change', async () => {
    jest.spyOn(recordModel, 'findOneAndUpdate').mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: 'r1',
        qty: 7,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      }),
    } as any);

    const result = await recordService.adjustInventory('r1', 1);

    expect(recordListCacheService.invalidateItem).toHaveBeenCalledWith('r1');
    expect(recordListCacheService.invalidateAll).toHaveBeenCalled();
    expect(result).toHaveProperty('qty', 7);
  });

  it('adjustInventory debits stock with an atomic quantity guard', async () => {
    jest.spyOn(recordModel, 'findOneAndUpdate').mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: 'r1',
        qty: 3,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      }),
    } as any);

    await recordService.adjustInventory('r1', -2);

    expect(recordModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: 'r1',
        deletedAt: null,
        qty: { $gte: 2 },
      },
      { $inc: { qty: -2 } },
      { new: true },
    );
    expect(recordModel.findOne).not.toHaveBeenCalled();
  });

  it('adjustInventory reports insufficient stock when guarded debit misses an existing record', async () => {
    jest.spyOn(recordModel, 'findOneAndUpdate').mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    } as any);
    jest.spyOn(recordModel, 'findOne').mockReturnValue({
      exec: jest.fn().mockResolvedValue({ _id: 'r1', qty: 1 }),
    } as any);

    await expect(recordService.adjustInventory('r1', -2)).rejects.toThrow(
      'Insufficient stock. Available: 1, requested: 2',
    );
  });

  it('adjustInventory delegates to findOne when delta is zero', async () => {
    const findOneSpy = jest.spyOn(recordService, 'findOne').mockResolvedValue({
      _id: 'r1',
      created: new Date('2026-01-01T00:00:00.000Z'),
      lastModified: new Date('2026-01-02T00:00:00.000Z'),
    } as any);

    await recordService.adjustInventory('r1', 0);

    expect(findOneSpy).toHaveBeenCalledWith('r1');
    expect(recordModel.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
