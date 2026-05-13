import { AppModule } from './app.module';

describe('AppModule', () => {
  it('is defined', () => {
    expect(AppModule).toBeDefined();
  });

  it('declares module imports', () => {
    const imports = Reflect.getMetadata('imports', AppModule) as unknown[];

    expect(Array.isArray(imports)).toBe(true);
    expect(imports.length).toBeGreaterThan(0);
  });
});
