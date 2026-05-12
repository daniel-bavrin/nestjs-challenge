const COLLECTION_NAME = 'records';

module.exports = {
  async up(db) {
    const collections = await db
      .listCollections({ name: COLLECTION_NAME }, { nameOnly: true })
      .toArray();

    if (collections.length === 0) {
      await db.createCollection(COLLECTION_NAME);
    }
  },

  async down(db) {
    // Intentionally a no-op: baseline rollback should not drop production data.
    await Promise.resolve(db);
  },
};
