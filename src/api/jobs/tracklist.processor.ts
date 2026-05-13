import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import Redis from 'ioredis';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  FETCH_TRACKLIST_JOB,
  REDIS_CLIENT,
  TRACKLIST_QUEUE,
} from './tracklist-queue.constants';
import {
  TRACKLIST_PROVIDER,
  TracklistProvider,
} from '../interfaces/tracklist-provider.interface';
import { Record } from '../schemas/record.schema';
import { Track } from '../schemas/record.schema';
import { AppConfig } from '../../app.config';
import { RecordListCacheService } from '../services/record-list-cache.service';

interface FetchTracklistJobPayload {
  recordId: string;
  externalId: string;
}

@Processor(TRACKLIST_QUEUE)
export class TracklistProcessor extends WorkerHost {
  private readonly logger = new Logger(TracklistProcessor.name);

  constructor(
    @Inject(TRACKLIST_PROVIDER)
    private readonly tracklistProvider: TracklistProvider,
    @InjectModel('Record') private readonly recordModel: Model<Record>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly recordListCacheService: RecordListCacheService,
  ) {
    super();
  }

  async process(job: Job<FetchTracklistJobPayload>): Promise<void> {
    if (job.name !== FETCH_TRACKLIST_JOB) {
      this.logger.warn(`Unhandled job name: ${job.name}`);
      return;
    }

    const { recordId, externalId } = job.data;
    const tracklist = await this.getTracklist(externalId);

    const updateResult = await this.recordModel
      .updateOne(
        { _id: recordId, deletedAt: null, mbid: externalId },
        { $set: { tracklist } },
      )
      .exec();

    if (updateResult.modifiedCount === 1) {
      await Promise.all([
        this.recordListCacheService.invalidateItem(recordId),
        this.recordListCacheService.invalidateAll(),
      ]);
    }
  }

  private async getTracklist(externalId: string): Promise<Track[]> {
    const cacheKey = `tracklist:${externalId}`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached) as Track[];
    }

    const tracklist = await this.tracklistProvider.fetchTracklist(externalId);
    await this.redis.set(
      cacheKey,
      JSON.stringify(tracklist),
      'EX',
      AppConfig.tracklistCacheTtlSeconds,
    );
    return tracklist;
  }
}
