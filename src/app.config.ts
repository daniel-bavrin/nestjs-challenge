import * as dotenv from 'dotenv';

dotenv.config();

export const AppConfig = {
  mongoUrl: process.env.MONGO_URL || 'mongodb://localhost:27017/records',
  port: process.env.PORT || 3000,
  redisHost: process.env.REDIS_HOST || 'localhost',
  redisPort: parseInt(process.env.REDIS_PORT || '6379', 10),
  recordListCacheTtlSeconds: parseInt(
    process.env.RECORD_LIST_CACHE_TTL_SECONDS || '300',
    10,
  ),
  tracklistCacheTtlSeconds: parseInt(
    process.env.TRACKLIST_CACHE_TTL_SECONDS || '2592000',
    10,
  ),
};
