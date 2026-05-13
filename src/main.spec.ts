import { AppConfig } from './app.config';

const createMock = jest.fn();
const createDocumentMock = jest.fn();
const setupMock = jest.fn();
const setTitleMock = jest.fn();
const setDescriptionMock = jest.fn();
const buildMock = jest.fn();

jest.mock('@nestjs/core', () => ({
  NestFactory: {
    create: (...args: unknown[]) => createMock(...args),
  },
}));

jest.mock('@nestjs/swagger', () => {
  const actual = jest.requireActual('@nestjs/swagger');

  return {
    ...actual,
    SwaggerModule: {
      createDocument: (...args: unknown[]) => createDocumentMock(...args),
      setup: (...args: unknown[]) => setupMock(...args),
    },
    DocumentBuilder: jest.fn().mockImplementation(() => ({
      setTitle: (...args: unknown[]) => setTitleMock(...args),
      setDescription: (...args: unknown[]) => setDescriptionMock(...args),
      build: (...args: unknown[]) => buildMock(...args),
    })),
  };
});

describe('main bootstrap', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    setTitleMock.mockReturnValue({
      setDescription: (...args: unknown[]) => setDescriptionMock(...args),
      build: (...args: unknown[]) => buildMock(...args),
    });
    setDescriptionMock.mockReturnValue({
      build: (...args: unknown[]) => buildMock(...args),
    });
    buildMock.mockReturnValue({ openapi: '3.0.0' });
  });

  it('bootstraps app, configures swagger and listens on configured port', async () => {
    const useGlobalPipes = jest.fn();
    const listen = jest.fn().mockResolvedValue(undefined);
    const app = { useGlobalPipes, listen };

    createMock.mockResolvedValue(app);
    createDocumentMock.mockReturnValue({ openapi: '3.0.0' });

    await import('./main');
    await new Promise((resolve) => setImmediate(resolve));

    expect(createMock).toHaveBeenCalled();
    expect(useGlobalPipes).toHaveBeenCalledTimes(1);
    expect(setTitleMock).toHaveBeenCalledWith('Record API');
    expect(setDescriptionMock).toHaveBeenCalledWith(
      'The record management API',
    );
    expect(createDocumentMock).toHaveBeenCalledWith(app, { openapi: '3.0.0' });
    expect(setupMock).toHaveBeenCalledWith(
      'swagger',
      app,
      { openapi: '3.0.0' },
      { jsonDocumentUrl: 'swagger-json' },
    );
    expect(listen).toHaveBeenCalledWith(AppConfig.port);
  });
});
