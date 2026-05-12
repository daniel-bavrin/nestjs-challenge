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
RecordSchema.index({ artist: 1 });
RecordSchema.index({ album: 1 });
RecordSchema.index({ category: 1 });
RecordSchema.index({ format: 1 });
RecordSchema.index({ mbid: 1 });
