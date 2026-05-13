import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { ClientSession, FilterQuery, Model } from 'mongoose';
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
import {
  TRACKLIST_PROVIDER,
  TracklistProvider,
} from '../interfaces/tracklist-provider.interface';
import { Track } from '../schemas/record.schema';

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
  | 'q'
  | 'artist'
  | 'album'
  | 'format'
  | 'category'
  | 'mbid'
  | 'priceMin'
  | 'priceMax'
  | 'qtyMin'
  | 'qtyMax'
>;

const RECORD_SORT_FIELDS: { [key: string]: string } = {
  artist: 'artist',
  album: 'album',
  category: 'category',
  format: 'format',
  mbid: 'mbid',
  price: 'price',
  qty: 'qty',
  created: 'createdAt',
  createdAt: 'createdAt',
  lastModified: 'updatedAt',
  updatedAt: 'updatedAt',
};

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
    @Inject(TRACKLIST_PROVIDER)
    private readonly tracklistProvider: TracklistProvider,
  ) {}

  async create(request: CreateRecordRequestDTO): Promise<RecordResponse> {
    let createdRecord: Record;

    try {
      createdRecord = await this.recordModel.create({
        artist: request.artist,
        album: request.album,
        price: request.price,
        qty: request.qty,
        format: request.format,
        category: request.category,
        mbid: request.mbid,
        tracklist: [],
      });
    } catch (error) {
      this.throwIfDuplicateRecord(error);
      throw error;
    }

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
    await Promise.all([
      this.recordListCacheService.invalidateItem(id),
      this.recordListCacheService.invalidateAll(),
    ]);
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

    const updatePayload = { ...updateRecordDto };

    if (hasMbidField) {
      const nextMbid = updateRecordDto.mbid?.trim();
      delete updatePayload.mbid;

      if (!nextMbid) {
        record.mbid = '';
        record.tracklist = [];
      } else {
        record.mbid = nextMbid;
        if (nextMbid !== previousMbid) {
          record.tracklist = [];
        }
      }
    }

    Object.assign(record, updatePayload);

    try {
      const updatedRecord = await record.save();

      if (hasMbidField) {
        const nextMbid = updateRecordDto.mbid?.trim();
        if (nextMbid && nextMbid !== previousMbid) {
          await this.enqueueTracklistFetch(String(updatedRecord._id), nextMbid);
        }
      }

      await Promise.all([
        this.recordListCacheService.invalidateItem(id),
        this.recordListCacheService.invalidateAll(),
      ]);

      return this.mapTimestamps(updatedRecord);
    } catch (error) {
      this.throwIfDuplicateRecord(error);
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

  async findOne(id: string): Promise<RecordResponse> {
    const cached =
      await this.recordListCacheService.getItem<RecordResponse>(id);
    if (cached) {
      return cached;
    }

    const record = await this.recordModel.findOne({
      _id: id,
      deletedAt: null,
    });
    if (!record) {
      throw new NotFoundException('Record not found');
    }

    const response = this.mapTimestamps(record);
    await this.recordListCacheService.setItem(id, response);
    return response;
  }

  async requestTracklistFill(id: string): Promise<void> {
    const record = await this.recordModel.findOne({
      _id: id,
      deletedAt: null,
    });
    if (!record) {
      throw new NotFoundException('Record not found');
    }

    const mbid = record.mbid?.trim();
    if (!mbid) {
      throw new BadRequestException('Record has no mbid to fetch tracklist');
    }

    record.tracklist = [];
    await record.save();

    await this.enqueueTracklistFetch(String(record._id), mbid);

    await Promise.all([
      this.recordListCacheService.invalidateItem(id),
      this.recordListCacheService.invalidateAll(),
    ]);
  }

  async fillTracklistNow(id: string): Promise<RecordResponse> {
    const record = await this.recordModel.findOne({
      _id: id,
      deletedAt: null,
    });
    if (!record) {
      throw new NotFoundException('Record not found');
    }

    const mbid = record.mbid?.trim();
    if (!mbid) {
      throw new BadRequestException('Record has no mbid to fetch tracklist');
    }

    const tracklist: Track[] =
      await this.tracklistProvider.fetchTracklist(mbid);
    record.tracklist = tracklist;

    const updatedRecord = await record.save();

    await Promise.all([
      this.recordListCacheService.invalidateItem(id),
      this.recordListCacheService.invalidateAll(),
    ]);

    return this.mapTimestamps(updatedRecord);
  }

  async clearTracklistNow(id: string): Promise<RecordResponse> {
    const record = await this.recordModel.findOne({
      _id: id,
      deletedAt: null,
    });
    if (!record) {
      throw new NotFoundException('Record not found');
    }

    if (Array.isArray(record.tracklist) && record.tracklist.length === 0) {
      return this.mapTimestamps(record);
    }

    record.tracklist = [];
    const updatedRecord = await record.save();

    await Promise.all([
      this.recordListCacheService.invalidateItem(id),
      this.recordListCacheService.invalidateAll(),
    ]);

    return this.mapTimestamps(updatedRecord);
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
        { format: qRegex },
        { mbid: qRegex },
        { 'tracklist.title': qRegex },
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

    if (query.mbid !== undefined) {
      filter.mbid = query.mbid;
    }

    if (query.priceMin !== undefined || query.priceMax !== undefined) {
      filter.price = {};
      if (query.priceMin !== undefined) {
        filter.price.$gte = query.priceMin;
      }
      if (query.priceMax !== undefined) {
        filter.price.$lte = query.priceMax;
      }
    }

    if (query.qtyMin !== undefined || query.qtyMax !== undefined) {
      filter.qty = {};
      if (query.qtyMin !== undefined) {
        filter.qty.$gte = query.qtyMin;
      }
      if (query.qtyMax !== undefined) {
        filter.qty.$lte = query.qtyMax;
      }
    }

    return filter;
  }

  /**
   * Adjust inventory for an order operation (atomic).
   * Delta: negative = debit (reserve), positive = credit (restock)
   * For debits: validates sufficient inventory exists before applying change.
   * @throws NotFoundException if record not found or deleted
   * @throws BadRequestException if insufficient inventory for debit
   */
  async adjustInventory(
    recordId: string,
    delta: number,
    session?: ClientSession,
  ): Promise<RecordResponse> {
    if (delta === 0) {
      return this.findOne(recordId);
    }

    const requestedQuantity = Math.abs(delta);
    const updateFilter: FilterQuery<Record> = {
      _id: recordId,
      deletedAt: null,
    };

    if (delta < 0) {
      updateFilter.qty = { $gte: requestedQuantity };
    }

    let updateQuery = this.recordModel.findOneAndUpdate(
      updateFilter,
      {
        $inc: { qty: delta },
      },
      { new: true },
    );

    if (session) {
      updateQuery = updateQuery.session(session);
    }

    const updatedRecord = await updateQuery.exec();

    if (!updatedRecord) {
      if (delta < 0) {
        let findQuery = this.recordModel.findOne(
          { _id: recordId, deletedAt: null },
          { qty: 1 },
        );

        if (session) {
          findQuery = findQuery.session(session);
        }

        const record = await findQuery.exec();

        if (record) {
          throw new BadRequestException(
            `Insufficient stock. Available: ${record.qty}, requested: ${requestedQuantity}`,
          );
        }
      }

      throw new NotFoundException('Record not found');
    }

    await Promise.all([
      this.recordListCacheService.invalidateItem(String(recordId)),
      this.recordListCacheService.invalidateAll(),
    ]);

    return this.mapTimestamps(updatedRecord);
  }

  private buildRegex(value: string): RegExp {
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(escaped, 'i');
  }

  private throwIfDuplicateRecord(error: unknown): never | void {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    ) {
      throw new ConflictException(
        'Record already exists for artist, album, and format',
      );
    }
  }

  private resolveSortField(sort?: string): string {
    if (!sort) {
      return '-createdAt';
    }

    const descending = sort.startsWith('-');
    const rawField = descending ? sort.slice(1) : sort;
    const normalizedField = RECORD_SORT_FIELDS[rawField];

    if (!normalizedField) {
      return '-createdAt';
    }

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
      mbid: query.mbid,
      priceMin: query.priceMin,
      priceMax: query.priceMax,
      qtyMin: query.qtyMin,
      qtyMax: query.qtyMax,
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
