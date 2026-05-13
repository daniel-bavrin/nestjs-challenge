import { RecordModule } from './record.module';
import {
  REDIS_CLIENT,
  TRACKLIST_QUEUE,
} from './jobs/tracklist-queue.constants';

describe('RecordModule', () => {
  it('is defined', () => {
    expect(RecordModule).toBeDefined();
  });

  it('registers redis provider and queue config', () => {
    const providers = Reflect.getMetadata('providers', RecordModule) as Array<
      Record<string, unknown>
    >;
    const imports = Reflect.getMetadata('imports', RecordModule) as unknown[];

    const redisProvider = providers.find(
      (provider) => provider && provider.provide === REDIS_CLIENT,
    );

    expect(redisProvider).toBeDefined();
    expect(redisProvider).toEqual(
      expect.objectContaining({
        provide: REDIS_CLIENT,
        useFactory: expect.any(Function),
      }),
    );
    expect(imports.length).toBeGreaterThanOrEqual(2);
    expect(TRACKLIST_QUEUE).toBe('tracklist');
  });
});
