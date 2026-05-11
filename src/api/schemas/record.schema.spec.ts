import mongoose from 'mongoose';
import { RecordSchema } from './record.schema';

describe('RecordSchema', () => {
  it('defines the expected indexes', () => {
    const indexes = RecordSchema.indexes();

    expect(indexes).toEqual(
      expect.arrayContaining([
        [
          { artist: 1, album: 1, format: 1 },
          expect.objectContaining({ unique: true, name: 'uq_record_artist_album_format' }),
        ],
        [{ artist: 1 }, expect.objectContaining({ background: true })],
        [{ album: 1 }, expect.objectContaining({ background: true })],
        [{ category: 1 }, expect.objectContaining({ background: true })],
        [{ format: 1 }, expect.objectContaining({ background: true })],
        [{ mbid: 1 }, expect.objectContaining({ background: true })],
      ]),
    );
  });

  it('defaults tracklist to an empty array', () => {
    const RecordModel =
      mongoose.models.RecordSchemaTest ||
      mongoose.model('RecordSchemaTest', RecordSchema);
    const record = new RecordModel({
      artist: 'Test',
      album: 'Test Album',
      price: 10,
      qty: 1,
      format: 'Vinyl',
      category: 'Rock',
    });

    expect(record.tracklist).toEqual([]);
  });
});
