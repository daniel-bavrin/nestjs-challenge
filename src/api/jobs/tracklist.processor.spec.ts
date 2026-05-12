import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Job } from 'bullmq';
import { TracklistProcessor } from './tracklist.processor';
import {
  FETCH_TRACKLIST_JOB,
  REDIS_CLIENT,
  TRACKLIST_QUEUE,
} from './tracklist-queue.constants';
import {
  TRACKLIST_PROVIDER,
  TracklistProvider,
} from '../interfaces/tracklist-provider.interface';

describe('TracklistProcessor', () => {
  let processor: TracklistProcessor;
  let tracklistProvider: TracklistProvider;
  let recordModel: any;
  let redisClient: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TracklistProcessor,
        {
          provide: TRACKLIST_PROVIDER,
          useValue: {
            fetchTracklist: jest.fn(),
          },
        },
        {
          provide: getModelToken('Record'),
          useValue: {
            updateOne: jest.fn(),
          },
        },
        {
          provide: REDIS_CLIENT,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
          },
        },
      ],
    }).compile();

    processor = module.get<TracklistProcessor>(TracklistProcessor);
    tracklistProvider = module.get<TracklistProvider>(TRACKLIST_PROVIDER);
    recordModel = module.get(getModelToken('Record'));
    redisClient = module.get(REDIS_CLIENT);
  });

  it('fetches from provider and caches when cache miss', async () => {
    const tracklist = [{ position: 1, title: 'Song A', duration: '3:10' }];
    redisClient.get.mockResolvedValue(null);
    jest
      .spyOn(tracklistProvider, 'fetchTracklist')
      .mockResolvedValue(tracklist as any);
    redisClient.set.mockResolvedValue('OK');
    const exec = jest.fn().mockResolvedValue({ acknowledged: true });
    recordModel.updateOne.mockReturnValue({ exec });

    const job = {
      name: FETCH_TRACKLIST_JOB,
      queueName: TRACKLIST_QUEUE,
      data: { recordId: 'r1', externalId: 'mbid-1' },
    } as unknown as Job;

    await processor.process(job);

    expect(tracklistProvider.fetchTracklist).toHaveBeenCalledWith('mbid-1');
    expect(redisClient.set).toHaveBeenCalledWith(
      'tracklist:mbid-1',
      JSON.stringify(tracklist),
      'EX',
      2592000,
    );
    expect(recordModel.updateOne).toHaveBeenCalledWith(
      { _id: 'r1', deletedAt: null, mbid: 'mbid-1' },
      { $set: { tracklist } },
    );
    expect(exec).toHaveBeenCalled();
  });

  it('uses cached tracklist and skips provider when cache hit', async () => {
    const tracklist = [{ position: 1, title: 'Song A', duration: '3:10' }];
    redisClient.get.mockResolvedValue(JSON.stringify(tracklist));
    const exec = jest.fn().mockResolvedValue({ acknowledged: true });
    recordModel.updateOne.mockReturnValue({ exec });

    const job = {
      name: FETCH_TRACKLIST_JOB,
      queueName: TRACKLIST_QUEUE,
      data: { recordId: 'r1', externalId: 'mbid-1' },
    } as unknown as Job;

    await processor.process(job);

    expect(tracklistProvider.fetchTracklist).not.toHaveBeenCalled();
    expect(redisClient.set).not.toHaveBeenCalled();
    expect(recordModel.updateOne).toHaveBeenCalledWith(
      { _id: 'r1', deletedAt: null, mbid: 'mbid-1' },
      { $set: { tracklist } },
    );
  });

  it('ignores unknown job names', async () => {
    const job = {
      name: 'other-job',
      queueName: TRACKLIST_QUEUE,
      data: { recordId: 'r1', externalId: 'mbid-1' },
    } as unknown as Job;

    await processor.process(job);

    expect(tracklistProvider.fetchTracklist).not.toHaveBeenCalled();
    expect(recordModel.updateOne).not.toHaveBeenCalled();
  });
});
