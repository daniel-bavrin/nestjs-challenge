import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { RecordFormat, RecordCategory } from '../src/api/schemas/record.enum';

describe('RecordController (e2e)', () => {
  let app: INestApplication;
  let recordIds: string[];
  let orderIds: string[];
  let recordModel;
  let orderModel;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    recordModel = app.get('RecordModel');
    orderModel = app.get('OrderModel');
    recordIds = [];
    orderIds = [];
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

  it('should soft-delete a record and exclude it from subsequent list results', async () => {
    const createRecordDto = {
      artist: 'The Deleted Band',
      album: 'Gone Album',
      price: 10,
      qty: 1,
      format: RecordFormat.VINYL,
      category: RecordCategory.ROCK,
    };

    const createResponse = await request(app.getHttpServer())
      .post('/v1/records')
      .send(createRecordDto)
      .expect(201);

    const id = createResponse.body._id;
    recordIds.push(id);

    await request(app.getHttpServer()).delete(`/v1/records/${id}`).expect(204);

    const listResponse = await request(app.getHttpServer())
      .get('/v1/records?artist=The Deleted Band')
      .expect(200);

    expect(listResponse.body.items).toHaveLength(0);
    expect(listResponse.body.meta.total).toBe(0);
  });

  it('should create an order and decrement record qty atomically', async () => {
    const createRecordDto = {
      artist: 'The Order Band',
      album: 'Order Album',
      price: 20,
      qty: 5,
      format: RecordFormat.VINYL,
      category: RecordCategory.ROCK,
    };

    const createRecordResponse = await request(app.getHttpServer())
      .post('/v1/records')
      .send(createRecordDto)
      .expect(201);

    const recordId = createRecordResponse.body._id;
    recordIds.push(recordId);

    const createOrderResponse = await request(app.getHttpServer())
      .post('/v1/orders')
      .send({ recordId, quantity: 2 })
      .expect(201);

    orderIds.push(createOrderResponse.body._id);
    expect(createOrderResponse.body).toHaveProperty('recordId', recordId);
    expect(createOrderResponse.body).toHaveProperty('quantity', 2);
    expect(createOrderResponse.body).toHaveProperty('unitPrice', 20);
    expect(createOrderResponse.body).toHaveProperty('totalPrice', 40);

    const listResponse = await request(app.getHttpServer())
      .get('/v1/records?artist=The Order Band')
      .expect(200);

    expect(listResponse.body.items[0]).toHaveProperty('qty', 3);
  });

  it('should return insufficient stock error when order quantity exceeds available qty', async () => {
    const createRecordDto = {
      artist: 'The Low Stock Band',
      album: 'Almost Gone',
      price: 15,
      qty: 1,
      format: RecordFormat.CD,
      category: RecordCategory.ALTERNATIVE,
    };

    const createRecordResponse = await request(app.getHttpServer())
      .post('/v1/records')
      .send(createRecordDto)
      .expect(201);

    const recordId = createRecordResponse.body._id;
    recordIds.push(recordId);

    const response = await request(app.getHttpServer())
      .post('/v1/orders')
      .send({ recordId, quantity: 2 })
      .expect(400);

    expect(response.body).toHaveProperty(
      'message',
      'Insufficient stock. Available: 1, requested: 2',
    );
  });

  it('should support orders list/get/update/cancel admin flows', async () => {
    const createRecordResponse = await request(app.getHttpServer())
      .post('/v1/records')
      .send({
        artist: 'Admin Orders Band',
        album: 'Dashboard Ready',
        price: 40,
        qty: 3,
        format: RecordFormat.CD,
        category: RecordCategory.ROCK,
      })
      .expect(201);

    const recordId = createRecordResponse.body._id;
    recordIds.push(recordId);

    const createOrderResponse = await request(app.getHttpServer())
      .post('/v1/orders')
      .send({
        recordId,
        quantity: 1,
        source: 'admin',
        externalOrderId: `ADM-${Date.now()}`,
      })
      .expect(201);

    const orderId = createOrderResponse.body._id;
    orderIds.push(orderId);

    const listResponse = await request(app.getHttpServer())
      .get('/v1/orders?source=admin')
      .expect(200);

    expect(listResponse.body).toHaveProperty('items');
    expect(listResponse.body).toHaveProperty('meta');

    const getResponse = await request(app.getHttpServer())
      .get(`/v1/orders/${orderId}`)
      .expect(200);

    expect(getResponse.body).toHaveProperty('_id', orderId);
    expect(getResponse.body).toHaveProperty('status', 'created');

    const updateResponse = await request(app.getHttpServer())
      .patch(`/v1/orders/${orderId}`)
      .send({ notes: 'Packed for pickup' })
      .expect(200);

    expect(updateResponse.body).toHaveProperty('notes', 'Packed for pickup');

    const cancelResponse = await request(app.getHttpServer())
      .post(`/v1/orders/${orderId}/cancel`)
      .send({ reason: 'Customer request' })
      .expect(200);

    expect(cancelResponse.body).toHaveProperty('status', 'canceled');
    expect(cancelResponse.body).toHaveProperty(
      'cancelReason',
      'Customer request',
    );

    const recordListResponse = await request(app.getHttpServer())
      .get('/v1/records?artist=Admin Orders Band')
      .expect(200);

    expect(recordListResponse.body.items[0]).toHaveProperty('qty', 3);
  });

  afterEach(async () => {
    for (const id of orderIds) {
      await orderModel.findByIdAndDelete(id);
    }
    for (const id of recordIds) {
      await recordModel.findByIdAndDelete(id);
    }
  });

  afterAll(async () => {
    await app.close();
  });
});
