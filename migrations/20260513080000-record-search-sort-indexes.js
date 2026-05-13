const COLLECTION_NAME = 'records';

const INDEXES = [
  { key: { price: 1 }, name: 'price_1' },
  { key: { qty: 1 }, name: 'qty_1' },
  { key: { createdAt: -1 }, name: 'createdAt_-1' },
  { key: { updatedAt: -1 }, name: 'updatedAt_-1' },
  { key: { 'tracklist.title': 1 }, name: 'tracklist.title_1' },
  { key: { deletedAt: 1, createdAt: -1 }, name: 'deletedAt_1_createdAt_-1' },
  {
    key: { deletedAt: 1, category: 1, format: 1, createdAt: -1 },
    name: 'deletedAt_1_category_1_format_1_createdAt_-1',
  },
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

function sameKey(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function createIndexIfMissing(collection, index) {
  const indexes = await collection.indexes();
  const exists = indexes.some(
    (existingIndex) =>
      existingIndex.name === index.name ||
      sameKey(existingIndex.key, index.key),
  );

  if (!exists) {
    await collection.createIndex(index.key, { name: index.name });
  }
}

module.exports = {
  async up(db) {
    await ensureCollection(db);

    const records = db.collection(COLLECTION_NAME);

    for (const index of INDEXES) {
      await createIndexIfMissing(records, index);
    }
  },

  async down(db) {
    await ensureCollection(db);

    const records = db.collection(COLLECTION_NAME);

    for (const index of INDEXES) {
      await dropIndexIfExists(records, index.name);
    }
  },
};
