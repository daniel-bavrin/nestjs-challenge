import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CancelOrderRequestDTO } from '../dtos/cancel-order.request.dto';
import { CreateOrderRequestDTO } from '../dtos/create-order.request.dto';
import { FindOrdersQueryDTO } from '../dtos/find-orders.query.dto';
import { UpdateOrderRequestDTO } from '../dtos/update-order.request.dto';
import { OrderSource, OrderStatus } from '../schemas/order.enum';
import { Order } from '../schemas/order.schema';
import { Record } from '../schemas/record.schema';
import { OrderService } from './order.service';
import { RecordListCacheService } from './record-list-cache.service';

describe('OrderService', () => {
  let orderService: OrderService;
  let orderModel: Model<Order>;
  let recordModel: Model<Record>;
  let recordListCacheService: RecordListCacheService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        {
          provide: getModelToken('Order'),
          useValue: {
            create: jest.fn(),
            findOne: jest.fn(),
            findById: jest.fn(),
            find: jest.fn(),
            countDocuments: jest.fn(),
          },
        },
        {
          provide: getModelToken('Record'),
          useValue: {
            findOneAndUpdate: jest.fn(),
            findOne: jest.fn(),
            updateOne: jest.fn(),
          },
        },
        {
          provide: RecordListCacheService,
          useValue: {
            invalidateItem: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    orderService = module.get<OrderService>(OrderService);
    orderModel = module.get<Model<Order>>(getModelToken('Order'));
    recordModel = module.get<Model<Record>>(getModelToken('Record'));
    recordListCacheService = module.get<RecordListCacheService>(
      RecordListCacheService,
    );
  });

  it('creates an order and atomically decrements stock when quantity is available', async () => {
    const request: CreateOrderRequestDTO = {
      recordId: '6821b4fd25b68ab63ec4f9a5',
      quantity: 2,
      source: OrderSource.ADMIN,
    };

    jest.spyOn(orderModel, 'findOne').mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    } as any);

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
      status: OrderStatus.CREATED,
      source: OrderSource.ADMIN,
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
      status: OrderStatus.CREATED,
      source: OrderSource.ADMIN,
      externalOrderId: undefined,
      customerRef: undefined,
      notes: undefined,
    });
    expect(result).toMatchObject({
      recordId: request.recordId,
      quantity: request.quantity,
      unitPrice: 30,
      totalPrice: 60,
    });
    expect(result).toHaveProperty('created');
    expect(result).toHaveProperty('lastModified');
    expect(recordListCacheService.invalidateItem).toHaveBeenCalledWith(
      request.recordId,
    );
  });

  it('returns existing order for duplicated source+externalOrderId request', async () => {
    const request: CreateOrderRequestDTO = {
      recordId: '6821b4fd25b68ab63ec4f9a5',
      quantity: 2,
      source: OrderSource.POS,
      externalOrderId: 'POS-001',
    };

    jest.spyOn(orderModel, 'findOne').mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: 'existing',
        status: OrderStatus.CREATED,
        source: OrderSource.POS,
        externalOrderId: 'POS-001',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    } as any);

    const result = await orderService.create(request);

    expect(result._id).toEqual('existing');
    expect(recordModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(orderModel.create).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when record does not exist', async () => {
    jest.spyOn(orderModel, 'findOne').mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    } as any);
    jest.spyOn(recordModel, 'findOneAndUpdate').mockResolvedValue(null);
    jest.spyOn(recordModel, 'findOne').mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    } as any);

    await expect(
      orderService.create({
        recordId: '6821b4fd25b68ab63ec4f9a5',
        quantity: 1,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws BadRequestException when stock is insufficient', async () => {
    jest.spyOn(orderModel, 'findOne').mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    } as any);
    jest.spyOn(recordModel, 'findOneAndUpdate').mockResolvedValue(null);
    jest.spyOn(recordModel, 'findOne').mockReturnValue({
      exec: jest.fn().mockResolvedValue({ qty: 1 }),
    } as any);

    await expect(
      orderService.create({
        recordId: '6821b4fd25b68ab63ec4f9a5',
        quantity: 2,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      orderService.create({
        recordId: '6821b4fd25b68ab63ec4f9a5',
        quantity: 2,
      }),
    ).rejects.toThrow('Insufficient stock. Available: 1, requested: 2');
  });

  it('returns paginated orders', async () => {
    const findChain = {
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([
        {
          _id: 'o1',
          status: OrderStatus.CREATED,
          source: OrderSource.ADMIN,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]),
    };

    jest.spyOn(orderModel, 'find').mockReturnValue(findChain as any);
    jest.spyOn(orderModel, 'countDocuments').mockReturnValue({
      exec: jest.fn().mockResolvedValue(1),
    } as any);

    const query = new FindOrdersQueryDTO();
    query.status = OrderStatus.CREATED;

    const result = await orderService.findAll(query);

    expect(orderModel.find).toHaveBeenCalledWith({
      status: OrderStatus.CREATED,
    });
    expect(result.meta.total).toBe(1);
    expect(result.items).toHaveLength(1);
  });

  it('returns single order by id', async () => {
    jest.spyOn(orderModel, 'findById').mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: 'o1',
        status: OrderStatus.CREATED,
        source: OrderSource.ADMIN,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    } as any);

    const result = await orderService.findOne('o1');

    expect(result._id).toEqual('o1');
  });

  it('throws NotFoundException on findOne when order missing', async () => {
    jest.spyOn(orderModel, 'findById').mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    } as any);

    await expect(orderService.findOne('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('updates mutable fields and allowed status transition', async () => {
    const save = jest.fn().mockResolvedValue({
      _id: 'o1',
      status: OrderStatus.FULFILLED,
      source: OrderSource.ADMIN,
      notes: 'Packed',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T01:00:00.000Z'),
    });

    jest.spyOn(orderModel, 'findById').mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: 'o1',
        status: OrderStatus.CREATED,
        source: OrderSource.ADMIN,
        save,
      }),
    } as any);

    const request: UpdateOrderRequestDTO = {
      status: OrderStatus.FULFILLED,
      notes: 'Packed',
    };

    const result = await orderService.update('o1', request);

    expect(result.status).toEqual(OrderStatus.FULFILLED);
    expect(save).toHaveBeenCalled();
  });

  it('throws ConflictException on invalid status transition', async () => {
    jest.spyOn(orderModel, 'findById').mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: 'o1',
        status: OrderStatus.FULFILLED,
        source: OrderSource.ADMIN,
        save: jest.fn(),
      }),
    } as any);

    await expect(
      orderService.update('o1', { status: OrderStatus.CREATED }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('cancels order and restocks inventory', async () => {
    const save = jest.fn().mockResolvedValue({
      _id: 'o1',
      status: OrderStatus.CANCELED,
      source: OrderSource.ADMIN,
      cancelReason: 'Customer request',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T02:00:00.000Z'),
    });

    jest.spyOn(orderModel, 'findById').mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: 'o1',
        recordId: 'r1',
        quantity: 2,
        status: OrderStatus.CREATED,
        source: OrderSource.ADMIN,
        save,
      }),
    } as any);

    jest.spyOn(recordModel, 'updateOne').mockReturnValue({
      exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    } as any);

    const result = await orderService.cancel('o1', {
      reason: 'Customer request',
    } as CancelOrderRequestDTO);

    expect(recordModel.updateOne).toHaveBeenCalledWith(
      { _id: 'r1', deletedAt: null },
      { $inc: { qty: 2 } },
    );
    expect(result.status).toEqual(OrderStatus.CANCELED);
    expect(recordListCacheService.invalidateItem).toHaveBeenCalledWith('r1');
  });

  it('throws ConflictException when canceling an already canceled order', async () => {
    jest.spyOn(orderModel, 'findById').mockReturnValue({
      exec: jest.fn().mockResolvedValue({ status: OrderStatus.CANCELED }),
    } as any);

    await expect(orderService.cancel('o1', {})).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
