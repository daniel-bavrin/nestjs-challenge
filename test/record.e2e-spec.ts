import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { RecordFormat, RecordCategory } from '../src/api/schemas/record.enum';

describe('RecordController (e2e)', () => {
  let app: INestApplication;
  let recordIds: string[];
  let recordModel;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    recordModel = app.get('RecordModel');
    recordIds = [];
    await app.init();
  });

  // Test to create a record
  it('should create a new record', async () => {
    const createRecordDto = {
      artist: 'The Beatles',
      album: 'Abbey Road',
      price: 25,
      qty: 10,
      format: RecordFormat.VINYL,
      category: RecordCategory.ROCK,
    };

    const response = await request(app.getHttpServer())
      .post('/records')
      .send(createRecordDto)
      .expect(201);

    recordIds.push(response.body._id);
    expect(response.body).toHaveProperty('artist', 'The Beatles');
    expect(response.body).toHaveProperty('album', 'Abbey Road');
    expect(response.body).not.toHaveProperty('tracklist');
  });

  it('should create a new record and fetch it with filters', async () => {
    const createRecordDto = {
      artist: 'The Fake Band',
      album: 'Fake Album',
      price: 25,
      qty: 10,
      format: RecordFormat.VINYL,
      category: RecordCategory.ROCK,
    };

    const createResponse = await request(app.getHttpServer())
      .post('/records')
      .send(createRecordDto)
      .expect(201);

    recordIds.push(createResponse.body._id);

    const response = await request(app.getHttpServer())
      .get('/records?artist=The Fake Band')
      .expect(200);
    expect(response.body.length).toBe(1);
    expect(response.body[0]).toHaveProperty('artist', 'The Fake Band');
    expect(response.body[0]).not.toHaveProperty('tracklist');
  });

  it('should support v1 create and paginated list contracts', async () => {
    const createRecordDto = {
      artist: 'The V1 Band',
      album: 'V1 Album',
      price: 35,
      qty: 4,
      format: RecordFormat.CD,
      category: RecordCategory.ROCK,
    };

    const createResponse = await request(app.getHttpServer())
      .post('/v1/records')
      .send(createRecordDto)
      .expect(201);

    recordIds.push(createResponse.body._id);
    expect(createResponse.body).toHaveProperty('tracklist');

    const listResponse = await request(app.getHttpServer())
      .get('/v1/records?artist=The V1 Band')
      .expect(200);

    expect(listResponse.body).toHaveProperty('items');
    expect(listResponse.body).toHaveProperty('meta');
    expect(Array.isArray(listResponse.body.items)).toBe(true);
    expect(listResponse.body.items[0]).toHaveProperty('tracklist');
  });

  afterEach(async () => {
    for (const id of recordIds) {
      await recordModel.findByIdAndDelete(id);
    }
  });

  afterAll(async () => {
    await app.close();
  });
});
