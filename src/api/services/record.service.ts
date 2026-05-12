import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { CreateRecordRequestDTO } from '../dtos/create-record.request.dto';
import { FindRecordsQueryDTO } from '../dtos/find-records.query.dto';
import { UpdateRecordRequestDTO } from '../dtos/update-record.request.dto';
import { Record } from '../schemas/record.schema';
import { MusicbrainzService } from './musicbrainz.service';

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
    private readonly musicbrainzService: MusicbrainzService,
  ) {}

  async create(request: CreateRecordRequestDTO): Promise<RecordResponse> {
    const tracklist = request.mbid
      ? await this.musicbrainzService.fetchTracklistByMbid(request.mbid)
      : [];

    const createdRecord = await this.recordModel.create({
      artist: request.artist,
      album: request.album,
      price: request.price,
      qty: request.qty,
      format: request.format,
      category: request.category,
      mbid: request.mbid,
      tracklist,
    });

    return this.mapTimestamps(createdRecord);
  }

  async createV0(request: CreateRecordRequestDTO): Promise<RecordResponseV0> {
    const created = await this.create(request);
    return this.removeTracklist(created);
  }

  async update(
    id: string,
    updateRecordDto: UpdateRecordRequestDTO,
  ): Promise<RecordResponse> {
    const record = await this.recordModel.findById(id);
    if (!record) {
      throw new NotFoundException('Record not found');
    }

    const hasMbidField = Object.prototype.hasOwnProperty.call(
      updateRecordDto,
      'mbid',
    );

    if (hasMbidField) {
      const nextMbid = updateRecordDto.mbid?.trim();
      if (!nextMbid) {
        record.tracklist = [];
      } else if (nextMbid !== record.mbid) {
        record.tracklist =
          await this.musicbrainzService.fetchTracklistByMbid(nextMbid);
      }
    }

    Object.assign(record, updateRecordDto);

    try {
      const updatedRecord = await record.save();
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

    return {
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
  }

  async findAllV0(query: RecordFilterFields): Promise<RecordResponseV0[]> {
    const filter = this.buildFilter(query);
    const items = await this.recordModel.find(filter).exec();

    return items.map((item) => this.removeTracklist(this.mapTimestamps(item)));
  }

  private buildFilter(query: RecordFilterFields): FilterQuery<Record> {
    const filter: FilterQuery<Record> = {};

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
}
