import { Test, TestingModule } from '@nestjs/testing';
import { OrderV1Controller } from './order.v1.controller';
import { CreateOrderRequestDTO } from '../dtos/create-order.request.dto';
import { OrderResponse, OrderService } from '../services/order.service';

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
});
