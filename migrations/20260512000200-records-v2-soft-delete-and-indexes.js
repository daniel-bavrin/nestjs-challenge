const COLLECTION_NAME = 'records';
const UNIQUE_INDEX_NAME = 'uq_record_artist_album_format';
const PREV_VERSION_UNIQUE_INDEX_NAME = 'artist_1_album_1_format_1';

const SUPPORTING_INDEXES = [
  { key: { artist: 1 }, name: 'artist_1' },
  { key: { album: 1 }, name: 'album_1' },
  { key: { category: 1 }, name: 'category_1' },
  { key: { format: 1 }, name: 'format_1' },
  { key: { mbid: 1 }, name: 'mbid_1' },
];

async function ensureCollection(db) {
  const collections = await db
    .listCollections({ name: COLLECTION_NAME }, { nameOnly: true })
    .toArray();

  if (collections.length === 0) {
    await db.createCollection(COLLECTION_NAME);
  }
}

async function dropIndexIfExists(collection, indexName) {
  const indexes = await collection.indexes();
  const exists = indexes.some((idx) => idx.name === indexName);
  if (exists) {
    await collection.dropIndex(indexName);
  }
}

module.exports = {
  async up(db) {
    await ensureCollection(db);

    const records = db.collection(COLLECTION_NAME);

    await records.updateMany(
      { deletedAt: { $exists: false } },
      { $set: { deletedAt: null } },
    );

    await records.updateMany(
      { tracklist: { $exists: false } },
      { $set: { tracklist: [] } },
    );

    await dropIndexIfExists(records, PREV_VERSION_UNIQUE_INDEX_NAME);
    await dropIndexIfExists(records, UNIQUE_INDEX_NAME);

    await records.createIndex(
      { artist: 1, album: 1, format: 1 },
      {
        unique: true,
        name: UNIQUE_INDEX_NAME,
        partialFilterExpression: { deletedAt: null },
      },
    );

    for (const index of SUPPORTING_INDEXES) {
      await records.createIndex(index.key, { name: index.name });
    }
  },

  async down(db) {
    await ensureCollection(db);

    const records = db.collection(COLLECTION_NAME);

    await dropIndexIfExists(records, UNIQUE_INDEX_NAME);

    for (const index of SUPPORTING_INDEXES) {
      await dropIndexIfExists(records, index.name);
    }

    await records.updateMany(
      { deletedAt: { $exists: true } },
      { $unset: { deletedAt: '' } },
    );

    await records.updateMany(
      { tracklist: { $exists: true } },
      { $unset: { tracklist: '' } },
    );
  },
};
