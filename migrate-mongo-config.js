require('dotenv').config();

module.exports = {
  mongodb: {
    url: process.env.MONGO_URL,
    options: {
      ignoreUndefined: true,
    },
  },
  migrationsDir: 'migrations',
  changelogCollectionName: 'migrations_changelog',
  migrationFileExtension: '.js',
  useFileHash: false,
  moduleSystem: 'commonjs',
};
