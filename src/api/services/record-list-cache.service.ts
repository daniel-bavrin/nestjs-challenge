import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { AppConfig } from '../../app.config';
import { REDIS_CLIENT } from '../jobs/tracklist-queue.constants';

const RECORD_LIST_CACHE_PREFIX = 'records:list';
const RECORD_ITEM_CACHE_PREFIX = 'records:item';

@Injectable()
export class RecordListCacheService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async get<T>(
    version: 'v0' | 'v1',
    query: Record<string, unknown>,
  ): Promise<T | null> {
    const cached = await this.redis.get(this.buildKey(version, query));

    if (!cached) {
      return null;
    }

    return JSON.parse(cached) as T;
  }

  async set(
    version: 'v0' | 'v1',
    query: Record<string, unknown>,
    payload: unknown,
  ): Promise<void> {
    await this.redis.set(
      this.buildKey(version, query),
      JSON.stringify(payload),
      'EX',
      AppConfig.recordListCacheTtlSeconds,
    );
  }

  async getItem<T>(id: string): Promise<T | null> {
    const cached = await this.redis.get(`${RECORD_ITEM_CACHE_PREFIX}:${id}`);
    if (!cached) {
      return null;
    }
    return JSON.parse(cached) as T;
  }

  async setItem(id: string, payload: unknown): Promise<void> {
    await this.redis.set(
      `${RECORD_ITEM_CACHE_PREFIX}:${id}`,
      JSON.stringify(payload),
      'EX',
      AppConfig.recordListCacheTtlSeconds,
    );
  }

  async invalidateItem(id: string): Promise<void> {
    await this.redis.del(`${RECORD_ITEM_CACHE_PREFIX}:${id}`);
  }

  async invalidateAll(): Promise<void> {
    let cursor = '0';

    do {
      const [nextCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${RECORD_LIST_CACHE_PREFIX}:*`,
        'COUNT',
        100,
      );

      cursor = nextCursor;

      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } while (cursor !== '0');
  }

  private buildKey(
    version: 'v0' | 'v1',
    query: Record<string, unknown>,
  ): string {
    const normalizedQuery = Object.entries(query)
      .filter(
        ([, value]) => value !== undefined && value !== null && value !== '',
      )
      .sort(([left], [right]) => left.localeCompare(right))
      .reduce<Record<string, unknown>>((accumulator, [key, value]) => {
        accumulator[key] = value;
        return accumulator;
      }, {});

    return `${RECORD_LIST_CACHE_PREFIX}:${version}:${JSON.stringify(normalizedQuery)}`;
  }
}
