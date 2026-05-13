import { Test, TestingModule } from '@nestjs/testing';
import { OrderV1Controller } from './order.v1.controller';
import { CancelOrderRequestDTO } from '../dtos/cancel-order.request.dto';
import { CreateOrderRequestDTO } from '../dtos/create-order.request.dto';
import { FindOrdersQueryDTO } from '../dtos/find-orders.query.dto';
import { UpdateOrderRequestDTO } from '../dtos/update-order.request.dto';
import { OrderSource, OrderStatus } from '../schemas/order.enum';
import {
  OrderResponse,
  OrderService,
  PaginatedOrdersResponse,
} from '../services/order.service';

describe('OrderV1Controller', () => {
  let controller: OrderV1Controller;
  let orderService: OrderService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrderV1Controller],
      providers: [
        {
          provide: OrderService,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            cancel: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<OrderV1Controller>(OrderV1Controller);
    orderService = module.get<OrderService>(OrderService);
  });

  it('creates an order', async () => {
    const request: CreateOrderRequestDTO = {
      recordId: '6821b4fd25b68ab63ec4f9a5',
      quantity: 2,
    };

    const response: OrderResponse = {
      _id: 'o1',
      recordId: request.recordId,
      quantity: 2,
      unitPrice: 30,
      totalPrice: 60,
      status: OrderStatus.CREATED,
      source: OrderSource.ADMIN,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      created: new Date('2026-01-01T00:00:00.000Z'),
      lastModified: new Date('2026-01-01T00:00:00.000Z'),
    } as unknown as OrderResponse;

    jest.spyOn(orderService, 'create').mockResolvedValue(response);

    const result = await controller.create(request);

    expect(result).toEqual(response);
    expect(orderService.create).toHaveBeenCalledWith(request);
  });

  it('returns paginated order list', async () => {
    const query = new FindOrdersQueryDTO();
    query.status = OrderStatus.CREATED;

    const response: PaginatedOrdersResponse = {
      items: [],
      meta: {
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: false,
      },
    };

    jest.spyOn(orderService, 'findAll').mockResolvedValue(response);

    const result = await controller.findAll(query);

    expect(result).toEqual(response);
    expect(orderService.findAll).toHaveBeenCalledWith(query);
  });

  it('returns a single order by id', async () => {
    const response: OrderResponse = {
      _id: 'o1',
      recordId: '6821b4fd25b68ab63ec4f9a5',
      quantity: 2,
      unitPrice: 30,
      totalPrice: 60,
      status: OrderStatus.CREATED,
      source: OrderSource.ADMIN,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      created: new Date('2026-01-01T00:00:00.000Z'),
      lastModified: new Date('2026-01-01T00:00:00.000Z'),
    } as unknown as OrderResponse;

    jest.spyOn(orderService, 'findOne').mockResolvedValue(response);

    const result = await controller.findOne('o1');

    expect(result).toEqual(response);
    expect(orderService.findOne).toHaveBeenCalledWith('o1');
  });

  it('updates an order', async () => {
    const request: UpdateOrderRequestDTO = {
      status: OrderStatus.FULFILLED,
      notes: 'Packed',
    };
    const response: OrderResponse = {
      _id: 'o1',
      recordId: '6821b4fd25b68ab63ec4f9a5',
      quantity: 2,
      unitPrice: 30,
      totalPrice: 60,
      status: OrderStatus.FULFILLED,
      source: OrderSource.ADMIN,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T01:00:00.000Z'),
      created: new Date('2026-01-01T00:00:00.000Z'),
      lastModified: new Date('2026-01-01T01:00:00.000Z'),
    } as unknown as OrderResponse;

    jest.spyOn(orderService, 'update').mockResolvedValue(response);

    const result = await controller.update('o1', request);

    expect(result).toEqual(response);
    expect(orderService.update).toHaveBeenCalledWith('o1', request);
  });

  it('cancels an order', async () => {
    const request: CancelOrderRequestDTO = { reason: 'Customer changed mind' };
    const response: OrderResponse = {
      _id: 'o1',
      recordId: '6821b4fd25b68ab63ec4f9a5',
      quantity: 2,
      unitPrice: 30,
      totalPrice: 60,
      status: OrderStatus.CANCELED,
      source: OrderSource.ADMIN,
      cancelReason: 'Customer changed mind',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T01:00:00.000Z'),
      created: new Date('2026-01-01T00:00:00.000Z'),
      lastModified: new Date('2026-01-01T01:00:00.000Z'),
    } as unknown as OrderResponse;

    jest.spyOn(orderService, 'cancel').mockResolvedValue(response);

    const result = await controller.cancel('o1', request);

    expect(result).toEqual(response);
    expect(orderService.cancel).toHaveBeenCalledWith('o1', request);
  });
});
