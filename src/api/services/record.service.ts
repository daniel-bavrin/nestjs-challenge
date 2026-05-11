import {
	Injectable,
	InternalServerErrorException,
	NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateRecordRequestDTO } from '../dtos/create-record.request.dto';
import { UpdateRecordRequestDTO } from '../dtos/update-record.request.dto';
import { RecordCategory, RecordFormat } from '../schemas/record.enum';
import { Record } from '../schemas/record.schema';

@Injectable()
export class RecordService {
	constructor(@InjectModel('Record') private readonly recordModel: Model<Record>) {}

	async create(request: CreateRecordRequestDTO): Promise<Record> {
		return this.recordModel.create({
			artist: request.artist,
			album: request.album,
			price: request.price,
			qty: request.qty,
			format: request.format,
			category: request.category,
			mbid: request.mbid,
		});
	}

	async update(id: string, updateRecordDto: UpdateRecordRequestDTO): Promise<Record> {
		const record = await this.recordModel.findById(id);
		if (!record) {
			throw new NotFoundException('Record not found');
		}

		Object.assign(record, updateRecordDto);

		try {
			return await record.save();
		} catch {
			throw new InternalServerErrorException('Failed to update record');
		}
	}

	async findAll(filters: {
		q?: string;
		artist?: string;
		album?: string;
		format?: RecordFormat;
		category?: RecordCategory;
	}): Promise<Record[]> {
		const allRecords = await this.recordModel.find().exec();

		return allRecords.filter((record) => {
			let match = true;

			if (filters.q) {
				match =
					match &&
					(record.artist.includes(filters.q) ||
						record.album.includes(filters.q) ||
						record.category.includes(filters.q));
			}

			if (filters.artist) {
				match = match && record.artist.includes(filters.artist);
			}

			if (filters.album) {
				match = match && record.album.includes(filters.album);
			}

			if (filters.format) {
				match = match && record.format === filters.format;
			}

			if (filters.category) {
				match = match && record.category === filters.category;
			}

			return match;
		});
	}
}
