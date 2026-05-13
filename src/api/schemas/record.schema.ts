import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { RecordFormat, RecordCategory } from './record.enum';

@Schema({ _id: false })
export class Track {
  @Prop({ required: true })
  position: number;

  @Prop({ required: true })
  title: string;

  @Prop({ required: false })
  duration?: string;
}

export const TrackSchema = SchemaFactory.createForClass(Track);

@Schema({ timestamps: true })
export class Record extends Document {
  @Prop({ required: true })
  artist: string;

  @Prop({ required: true })
  album: string;

  @Prop({ required: true })
  price: number;

  @Prop({ required: true })
  qty: number;

  @Prop({ enum: RecordFormat, required: true })
  format: RecordFormat;

  @Prop({ enum: RecordCategory, required: true })
  category: RecordCategory;

  createdAt: Date;

  updatedAt: Date;

  @Prop({ required: false })
  mbid?: string;

  @Prop({ type: [TrackSchema], default: [] })
  tracklist: Track[];

  @Prop({ required: false, default: null })
  deletedAt?: Date | null;
}

export const RecordSchema = SchemaFactory.createForClass(Record);

// Partial unique index: only enforces uniqueness among non-deleted records,
// so the same artist+album+format can be re-created after a soft-delete.
RecordSchema.index(
  { artist: 1, album: 1, format: 1 },
  {
    unique: true,
    name: 'uq_record_artist_album_format',
    partialFilterExpression: { deletedAt: null },
  },
);
RecordSchema.index({ artist: 1 }, { name: 'artist_1' });
RecordSchema.index({ album: 1 }, { name: 'album_1' });
RecordSchema.index({ category: 1 }, { name: 'category_1' });
RecordSchema.index({ format: 1 }, { name: 'format_1' });
RecordSchema.index({ mbid: 1 }, { name: 'mbid_1' });
RecordSchema.index({ price: 1 }, { name: 'price_1' });
RecordSchema.index({ qty: 1 }, { name: 'qty_1' });
RecordSchema.index({ createdAt: -1 }, { name: 'createdAt_-1' });
RecordSchema.index({ updatedAt: -1 }, { name: 'updatedAt_-1' });
RecordSchema.index({ 'tracklist.title': 1 }, { name: 'tracklist.title_1' });
RecordSchema.index(
  { deletedAt: 1, createdAt: -1 },
  { name: 'deletedAt_1_createdAt_-1' },
);
RecordSchema.index(
  { deletedAt: 1, category: 1, format: 1, createdAt: -1 },
  { name: 'deletedAt_1_category_1_format_1_createdAt_-1' },
);
