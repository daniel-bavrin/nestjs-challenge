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

export interface PaginatedRecordsResponse {
  items: Record[];
  meta: PaginatedRecordsMeta;
}

@Injectable()
export class RecordService {
  constructor(
    @InjectModel('Record') private readonly recordModel: Model<Record>,
    private readonly musicbrainzService: MusicbrainzService,
  ) {}

  async create(request: CreateRecordRequestDTO): Promise<Record> {
    const tracklist = request.mbid
      ? await this.musicbrainzService.fetchTracklistByMbid(request.mbid)
      : [];

    return this.recordModel.create({
      artist: request.artist,
      album: request.album,
      price: request.price,
      qty: request.qty,
      format: request.format,
      category: request.category,
      mbid: request.mbid,
      tracklist,
    });
  }

  async update(
    id: string,
    updateRecordDto: UpdateRecordRequestDTO,
  ): Promise<Record> {
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
      return await record.save();
    } catch {
      throw new InternalServerErrorException('Failed to update record');
    }
  }

  async findAll(query: FindRecordsQueryDTO): Promise<PaginatedRecordsResponse> {
    const filter = this.buildFilter(query);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const sort = query.sort ?? '-createdAt';
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.recordModel.find(filter).sort(sort).skip(skip).limit(limit).exec(),
      this.recordModel.countDocuments(filter).exec(),
    ]);

    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    return {
      items,
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

  private buildFilter(query: FindRecordsQueryDTO): FilterQuery<Record> {
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
}
