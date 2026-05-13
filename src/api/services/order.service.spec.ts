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
import { RecordService } from './record.service';

describe('OrderService', () => {
  let orderService: OrderService;
  let orderModel: Model<Order>;
  let recordModel: Model<Record>;
  let recordListCacheService: RecordListCacheService;
  let recordService: RecordService;

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
        {
          provide: RecordService,
          useValue: {
            adjustInventory: jest.fn(),
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
    recordService = module.get<RecordService>(RecordService);
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

    const recordResponse = {
      _id: request.recordId,
      price: 30,
      qty: 8,
      created: new Date('2026-01-01T00:00:00.000Z'),
      lastModified: new Date('2026-01-01T00:00:00.000Z'),
    } as any;

    jest
      .spyOn(recordService, 'adjustInventory')
      .mockResolvedValue(recordResponse);

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

    expect(recordService.adjustInventory).toHaveBeenCalledWith(
      request.recordId,
      -request.quantity,
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

    jest
      .spyOn(recordService, 'adjustInventory')
      .mockRejectedValue(new NotFoundException('Record not found'));

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

    jest
      .spyOn(recordService, 'adjustInventory')
      .mockRejectedValue(
        new BadRequestException(
          'Insufficient stock. Available: 1, requested: 2',
        ),
      );

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
    ).rejects.toThrow('Insufficient stock');
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

    const restockedRecord = {
      _id: 'r1',
      qty: 12,
      price: 30,
      created: new Date('2026-01-01T00:00:00.000Z'),
      lastModified: new Date('2026-01-01T02:00:00.000Z'),
    } as any;

    jest
      .spyOn(recordService, 'adjustInventory')
      .mockResolvedValue(restockedRecord);

    const result = await orderService.cancel('o1', {
      reason: 'Customer request',
    } as CancelOrderRequestDTO);

    expect(recordService.adjustInventory).toHaveBeenCalledWith('r1', 2);
    expect(result.status).toEqual(OrderStatus.CANCELED);
    expect(recordListCacheService.invalidateItem).not.toHaveBeenCalled();
  });

  it('throws ConflictException when canceling an already canceled order', async () => {
    jest.spyOn(orderModel, 'findById').mockReturnValue({
      exec: jest.fn().mockResolvedValue({ status: OrderStatus.CANCELED }),
    } as any);

    await expect(orderService.cancel('o1', {})).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('increases order quantity and debits inventory', async () => {
    jest.spyOn(orderModel, 'findById').mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: 'o1',
        recordId: 'r1',
        quantity: 2,
        unitPrice: 30,
        totalPrice: 60,
        status: OrderStatus.CREATED,
        source: OrderSource.ADMIN,
        save: jest.fn().mockResolvedValue({
          _id: 'o1',
          quantity: 3,
          unitPrice: 30,
          totalPrice: 90,
          status: OrderStatus.CREATED,
          source: OrderSource.ADMIN,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T01:00:00.000Z'),
        }),
      }),
    } as any);

    const updatedRecord = {
      _id: 'r1',
      qty: 9,
      price: 30,
      created: new Date('2026-01-01T00:00:00.000Z'),
      lastModified: new Date('2026-01-01T01:00:00.000Z'),
    } as any;

    jest
      .spyOn(recordService, 'adjustInventory')
      .mockResolvedValue(updatedRecord);

    const result = await orderService.updateQuantity('o1', 3);

    expect(recordService.adjustInventory).toHaveBeenCalledWith('r1', -1);
    expect(result.quantity).toBe(3);
    expect(result.totalPrice).toBe(90);
  });

  it('decreases order quantity and credits inventory', async () => {
    jest.spyOn(orderModel, 'findById').mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: 'o1',
        recordId: 'r1',
        quantity: 3,
        unitPrice: 30,
        totalPrice: 90,
        status: OrderStatus.CREATED,
        source: OrderSource.ADMIN,
        save: jest.fn().mockResolvedValue({
          _id: 'o1',
          quantity: 2,
          unitPrice: 30,
          totalPrice: 60,
          status: OrderStatus.CREATED,
          source: OrderSource.ADMIN,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T01:00:00.000Z'),
        }),
      }),
    } as any);

    const updatedRecord = {
      _id: 'r1',
      qty: 11,
      price: 30,
      created: new Date('2026-01-01T00:00:00.000Z'),
      lastModified: new Date('2026-01-01T01:00:00.000Z'),
    } as any;

    jest
      .spyOn(recordService, 'adjustInventory')
      .mockResolvedValue(updatedRecord);

    const result = await orderService.updateQuantity('o1', 2);

    expect(recordService.adjustInventory).toHaveBeenCalledWith('r1', 1);
    expect(result.quantity).toBe(2);
    expect(result.totalPrice).toBe(60);
  });

  it('throws BadRequestException when reducing quantity without sufficient inventory', async () => {
    jest.spyOn(orderModel, 'findById').mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: 'o1',
        recordId: 'r1',
        quantity: 5,
        status: OrderStatus.CREATED,
      }),
    } as any);

    jest
      .spyOn(recordService, 'adjustInventory')
      .mockRejectedValue(
        new BadRequestException(
          'Insufficient stock. Available: 1, requested: 4',
        ),
      );

    const error = await orderService.updateQuantity('o1', 1).catch((e) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.message).toContain('Insufficient stock');
  });

  it('throws NotFoundException when order not found for updateQuantity', async () => {
    jest.spyOn(orderModel, 'findById').mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    } as any);

    await expect(
      orderService.updateQuantity('missing', 2),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws ConflictException when updating quantity on immutable order', async () => {
    jest.spyOn(orderModel, 'findById').mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: 'o1',
        status: OrderStatus.CANCELED,
      }),
    } as any);

    await expect(orderService.updateQuantity('o1', 5)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
