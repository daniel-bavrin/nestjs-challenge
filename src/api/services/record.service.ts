import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { FilterQuery, Model } from 'mongoose';
import { Queue } from 'bullmq';
import { CreateRecordRequestDTO } from '../dtos/create-record.request.dto';
import { FindRecordsQueryDTO } from '../dtos/find-records.query.dto';
import { UpdateRecordRequestDTO } from '../dtos/update-record.request.dto';
import { Record } from '../schemas/record.schema';
import {
  FETCH_TRACKLIST_JOB,
  TRACKLIST_QUEUE,
} from '../jobs/tracklist-queue.constants';
import { RecordListCacheService } from './record-list-cache.service';

export interface PaginatedRecordsMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface RecordResponse extends Record {
  created: Date;
  lastModified: Date;
}

export type RecordResponseV0 = Omit<RecordResponse, 'tracklist'>;

type RecordFilterFields = Pick<
  FindRecordsQueryDTO,
  'q' | 'artist' | 'album' | 'format' | 'category'
>;

export interface PaginatedRecordsResponse {
  items: RecordResponse[];
  meta: PaginatedRecordsMeta;
}

@Injectable()
export class RecordService {
  constructor(
    @InjectModel('Record') private readonly recordModel: Model<Record>,
    @InjectQueue(TRACKLIST_QUEUE) private readonly tracklistQueue: Queue,
    private readonly recordListCacheService: RecordListCacheService,
  ) {}

  async create(request: CreateRecordRequestDTO): Promise<RecordResponse> {
    const createdRecord = await this.recordModel.create({
      artist: request.artist,
      album: request.album,
      price: request.price,
      qty: request.qty,
      format: request.format,
      category: request.category,
      mbid: request.mbid,
      tracklist: [],
    });

    if (request.mbid) {
      await this.enqueueTracklistFetch(String(createdRecord._id), request.mbid);
    }

    await this.recordListCacheService.invalidateAll();

    return this.mapTimestamps(createdRecord);
  }

  async createV0(request: CreateRecordRequestDTO): Promise<RecordResponseV0> {
    const created = await this.create(request);
    return this.removeTracklist(created);
  }

  async softDelete(id: string): Promise<void> {
    const record = await this.recordModel.findOne({
      _id: id,
      deletedAt: null,
    });
    if (!record) {
      throw new NotFoundException('Record not found');
    }
    record.deletedAt = new Date();
    await record.save();
    await this.recordListCacheService.invalidateAll();
  }

  async update(
    id: string,
    updateRecordDto: UpdateRecordRequestDTO,
  ): Promise<RecordResponse> {
    const record = await this.recordModel.findOne({
      _id: id,
      deletedAt: null,
    });
    if (!record) {
      throw new NotFoundException('Record not found');
    }

    const hasMbidField = Object.prototype.hasOwnProperty.call(
      updateRecordDto,
      'mbid',
    );
    const previousMbid = record.mbid;

    if (hasMbidField) {
      const nextMbid = updateRecordDto.mbid?.trim();
      if (!nextMbid) {
        record.tracklist = [];
      } else if (nextMbid !== record.mbid) {
        record.tracklist = [];
      }
    }

    Object.assign(record, updateRecordDto);

    try {
      const updatedRecord = await record.save();

      if (hasMbidField) {
        const nextMbid = updateRecordDto.mbid?.trim();
        if (nextMbid && nextMbid !== previousMbid) {
          await this.enqueueTracklistFetch(String(updatedRecord._id), nextMbid);
        }
      }

      await this.recordListCacheService.invalidateAll();

      return this.mapTimestamps(updatedRecord);
    } catch {
      throw new InternalServerErrorException('Failed to update record');
    }
  }

  async updateV0(
    id: string,
    updateRecordDto: UpdateRecordRequestDTO,
  ): Promise<RecordResponseV0> {
    const updated = await this.update(id, updateRecordDto);
    return this.removeTracklist(updated);
  }

  async findAll(query: FindRecordsQueryDTO): Promise<PaginatedRecordsResponse> {
    const cacheQuery = this.buildV1CacheQuery(query);
    const cached =
      await this.recordListCacheService.get<PaginatedRecordsResponse>(
        'v1',
        cacheQuery,
      );

    if (cached) {
      return cached;
    }

    const filter = this.buildFilter(query);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const sort = this.resolveSortField(query.sort);
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.recordModel.find(filter).sort(sort).skip(skip).limit(limit).exec(),
      this.recordModel.countDocuments(filter).exec(),
    ]);

    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    const response = {
      items: items.map((item) => this.mapTimestamps(item)),
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };

    await this.recordListCacheService.set('v1', cacheQuery, response);

    return response;
  }

  async findAllV0(query: RecordFilterFields): Promise<RecordResponseV0[]> {
    const cached = await this.recordListCacheService.get<RecordResponseV0[]>(
      'v0',
      query,
    );

    if (cached) {
      return cached;
    }

    const filter = this.buildFilter(query);
    const items = await this.recordModel.find(filter).exec();
    const response = items.map((item) =>
      this.removeTracklist(this.mapTimestamps(item)),
    );

    await this.recordListCacheService.set('v0', query, response);

    return response;
  }

  async softDeleteV0(id: string): Promise<void> {
    return this.softDelete(id);
  }

  private buildFilter(query: RecordFilterFields): FilterQuery<Record> {
    const filter: FilterQuery<Record> = { deletedAt: null };

    if (query.q) {
      const qRegex = this.buildRegex(query.q);
      filter.$or = [
        { artist: qRegex },
        { album: qRegex },
        { category: qRegex },
      ];
    }

    if (query.artist) {
      filter.artist = this.buildRegex(query.artist);
    }

    if (query.album) {
      filter.album = this.buildRegex(query.album);
    }

    if (query.format) {
      filter.format = query.format;
    }

    if (query.category) {
      filter.category = query.category;
    }

    return filter;
  }

  private buildRegex(value: string): RegExp {
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(escaped, 'i');
  }

  private resolveSortField(sort?: string): string {
    if (!sort) {
      return '-createdAt';
    }

    const descending = sort.startsWith('-');
    const rawField = descending ? sort.slice(1) : sort;

    const normalizedField =
      rawField === 'created'
        ? 'createdAt'
        : rawField === 'lastModified'
          ? 'updatedAt'
          : rawField;

    return descending ? `-${normalizedField}` : normalizedField;
  }

  private buildV1CacheQuery(query: FindRecordsQueryDTO): {
    [key: string]: unknown;
  } {
    return {
      q: query.q,
      artist: query.artist,
      album: query.album,
      format: query.format,
      category: query.category,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      sort: this.resolveSortField(query.sort),
    };
  }

  private mapTimestamps(record: Record): RecordResponse {
    const output = record.toObject
      ? (record.toObject() as RecordResponse)
      : (record as RecordResponse);

    output.created = output.createdAt;
    output.lastModified = output.updatedAt;

    return output;
  }

  private removeTracklist(record: RecordResponse): RecordResponseV0 {
    const v0Shape = { ...record } as RecordResponse & {
      tracklist?: RecordResponse['tracklist'];
    };
    delete v0Shape.tracklist;
    return v0Shape as RecordResponseV0;
  }

  private async enqueueTracklistFetch(
    recordId: string,
    externalId: string,
  ): Promise<void> {
    await this.tracklistQueue.add(
      FETCH_TRACKLIST_JOB,
      { recordId, externalId },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: true,
      },
    );
  }
}
