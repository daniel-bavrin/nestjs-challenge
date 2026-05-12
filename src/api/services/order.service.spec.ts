import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateOrderRequestDTO } from '../dtos/create-order.request.dto';
import { Order } from '../schemas/order.schema';
import { Record } from '../schemas/record.schema';
import { OrderService } from './order.service';

describe('OrderService', () => {
  let orderService: OrderService;
  let orderModel: Model<Order>;
  let recordModel: Model<Record>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        {
          provide: getModelToken('Order'),
          useValue: {
            create: jest.fn(),
          },
        },
        {
          provide: getModelToken('Record'),
          useValue: {
            findOneAndUpdate: jest.fn(),
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();

    orderService = module.get<OrderService>(OrderService);
    orderModel = module.get<Model<Order>>(getModelToken('Order'));
    recordModel = module.get<Model<Record>>(getModelToken('Record'));
  });

  it('creates an order and atomically decrements stock when quantity is available', async () => {
    const request: CreateOrderRequestDTO = {
      recordId: '6821b4fd25b68ab63ec4f9a5',
      quantity: 2,
    };

    jest.spyOn(recordModel, 'findOneAndUpdate').mockResolvedValue({
      _id: request.recordId,
      price: 30,
      qty: 8,
    } as unknown as Record);

    jest.spyOn(orderModel as any, 'create').mockResolvedValue({
      _id: 'o1',
      recordId: request.recordId,
      quantity: request.quantity,
      unitPrice: 30,
      totalPrice: 60,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    } as unknown as Order);

    const result = await orderService.create(request);

    expect(recordModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: request.recordId,
        deletedAt: null,
        qty: { $gte: request.quantity },
      },
      {
        $inc: { qty: -request.quantity },
      },
      {
        new: true,
      },
    );
    expect(orderModel.create).toHaveBeenCalledWith({
      recordId: request.recordId,
      quantity: request.quantity,
      unitPrice: 30,
      totalPrice: 60,
    });
    expect(result).toMatchObject({
      recordId: request.recordId,
      quantity: request.quantity,
      unitPrice: 30,
      totalPrice: 60,
    });
    expect(result).toHaveProperty('created');
    expect(result).toHaveProperty('lastModified');
  });

  it('throws NotFoundException when record does not exist', async () => {
    jest.spyOn(recordModel, 'findOneAndUpdate').mockResolvedValue(null);
    jest.spyOn(recordModel, 'findOne').mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    } as any);

    await expect(
      orderService.create({ recordId: '6821b4fd25b68ab63ec4f9a5', quantity: 1 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws BadRequestException when stock is insufficient', async () => {
    jest.spyOn(recordModel, 'findOneAndUpdate').mockResolvedValue(null);
    jest.spyOn(recordModel, 'findOne').mockReturnValue({
      exec: jest.fn().mockResolvedValue({ qty: 1 }),
    } as any);

    await expect(
      orderService.create({ recordId: '6821b4fd25b68ab63ec4f9a5', quantity: 2 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      orderService.create({ recordId: '6821b4fd25b68ab63ec4f9a5', quantity: 2 }),
    ).rejects.toThrow('Insufficient stock. Available: 1, requested: 2');
  });
});
