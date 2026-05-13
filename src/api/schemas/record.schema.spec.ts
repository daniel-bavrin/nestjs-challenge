import mongoose from 'mongoose';
import { RecordSchema } from './record.schema';

describe('RecordSchema', () => {
  it('defines the expected indexes', () => {
    const indexes = RecordSchema.indexes();

    expect(indexes).toEqual(
      expect.arrayContaining([
        [
          { artist: 1, album: 1, format: 1 },
          expect.objectContaining({
            unique: true,
            name: 'uq_record_artist_album_format',
          }),
        ],
        [{ artist: 1 }, expect.objectContaining({ name: 'artist_1' })],
        [{ album: 1 }, expect.objectContaining({ name: 'album_1' })],
        [{ category: 1 }, expect.objectContaining({ name: 'category_1' })],
        [{ format: 1 }, expect.objectContaining({ name: 'format_1' })],
        [{ mbid: 1 }, expect.objectContaining({ name: 'mbid_1' })],
        [{ price: 1 }, expect.objectContaining({ name: 'price_1' })],
        [{ qty: 1 }, expect.objectContaining({ name: 'qty_1' })],
        [{ createdAt: -1 }, expect.objectContaining({ name: 'createdAt_-1' })],
        [{ updatedAt: -1 }, expect.objectContaining({ name: 'updatedAt_-1' })],
        [
          { 'tracklist.title': 1 },
          expect.objectContaining({ name: 'tracklist.title_1' }),
        ],
        [
          { deletedAt: 1, createdAt: -1 },
          expect.objectContaining({ name: 'deletedAt_1_createdAt_-1' }),
        ],
        [
          { deletedAt: 1, category: 1, format: 1, createdAt: -1 },
          expect.objectContaining({
            name: 'deletedAt_1_category_1_format_1_createdAt_-1',
          }),
        ],
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
