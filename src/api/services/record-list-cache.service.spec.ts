import { AppConfig } from '../../app.config';
import { RecordListCacheService } from './record-list-cache.service';

type MockRedis = {
  get: jest.Mock;
  set: jest.Mock;
  del: jest.Mock;
  scan: jest.Mock;
};

describe('RecordListCacheService', () => {
  let redis: MockRedis;
  let service: RecordListCacheService;

  beforeEach(() => {
    redis = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      scan: jest.fn(),
    };

    service = new RecordListCacheService(redis as any);
  });

  it('returns null when list key is not cached', async () => {
    redis.get.mockResolvedValue(null);

    const result = await service.get('v1', { artist: 'ABBA' });

    expect(result).toBeNull();
  });

  it('gets and sets list cache using normalized query key', async () => {
    redis.get.mockResolvedValue(JSON.stringify({ ok: true }));

    await service.set('v1', { q: 'x', page: 1, status: '' }, { ok: true });
    const result = await service.get('v1', { page: 1, status: '', q: 'x' });

    expect(redis.set).toHaveBeenCalledWith(
      'records:list:v1:{"page":1,"q":"x"}',
      JSON.stringify({ ok: true }),
      'EX',
      AppConfig.recordListCacheTtlSeconds,
    );
    expect(redis.get).toHaveBeenCalledWith(
      'records:list:v1:{"page":1,"q":"x"}',
    );
    expect(result).toEqual({ ok: true });
  });

  it('gets and sets item cache', async () => {
    redis.get.mockResolvedValue(JSON.stringify({ id: 'r1' }));

    await service.setItem('r1', { id: 'r1' });
    const result = await service.getItem<{ id: string }>('r1');

    expect(redis.set).toHaveBeenCalledWith(
      'records:item:r1',
      JSON.stringify({ id: 'r1' }),
      'EX',
      AppConfig.recordListCacheTtlSeconds,
    );
    expect(redis.get).toHaveBeenCalledWith('records:item:r1');
    expect(result).toEqual({ id: 'r1' });
  });

  it('returns null when item key is not cached', async () => {
    redis.get.mockResolvedValue(null);

    const result = await service.getItem('missing');

    expect(result).toBeNull();
  });

  it('invalidates a single item key', async () => {
    await service.invalidateItem('r99');

    expect(redis.del).toHaveBeenCalledWith('records:item:r99');
  });

  it('invalidates all list keys across scan pages', async () => {
    redis.scan
      .mockResolvedValueOnce(['101', ['records:list:v1:{"page":1}']])
      .mockResolvedValueOnce([
        '0',
        ['records:list:v1:{"page":2}', 'records:list:v0:{}'],
      ]);

    await service.invalidateAll();

    expect(redis.scan).toHaveBeenNthCalledWith(
      1,
      '0',
      'MATCH',
      'records:list:*',
      'COUNT',
      100,
    );
    expect(redis.scan).toHaveBeenNthCalledWith(
      2,
      '101',
      'MATCH',
      'records:list:*',
      'COUNT',
      100,
    );
    expect(redis.del).toHaveBeenNthCalledWith(1, 'records:list:v1:{"page":1}');
    expect(redis.del).toHaveBeenNthCalledWith(
      2,
      'records:list:v1:{"page":2}',
      'records:list:v0:{}',
    );
  });

  it('does not call del when scan page has no keys', async () => {
    redis.scan.mockResolvedValueOnce(['0', []]);

    await service.invalidateAll();

    expect(redis.del).not.toHaveBeenCalled();
  });
});
