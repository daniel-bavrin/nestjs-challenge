const COLLECTION_NAME = 'orders';
const ORDER_RECORD_CREATED_INDEX = 'recordId_1_createdAt_-1';

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

    const orders = db.collection(COLLECTION_NAME);

    await orders.createIndex(
      { recordId: 1, createdAt: -1 },
      { name: ORDER_RECORD_CREATED_INDEX },
    );
  },

  async down(db) {
    await ensureCollection(db);

    const orders = db.collection(COLLECTION_NAME);
    await dropIndexIfExists(orders, ORDER_RECORD_CREATED_INDEX);
  },
};
