import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { CancelOrderRequestDTO } from '../dtos/cancel-order.request.dto';
import { CreateOrderRequestDTO } from '../dtos/create-order.request.dto';
import { FindOrdersQueryDTO } from '../dtos/find-orders.query.dto';
import { UpdateOrderRequestDTO } from '../dtos/update-order.request.dto';
import { Order } from '../schemas/order.schema';
import { OrderSource, OrderStatus } from '../schemas/order.enum';
import { Record } from '../schemas/record.schema';
import { RecordListCacheService } from './record-list-cache.service';

export interface OrderResponse extends Order {
  created: Date;
  lastModified: Date;
}

export interface PaginatedOrdersMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface PaginatedOrdersResponse {
  items: OrderResponse[];
  meta: PaginatedOrdersMeta;
}

const MUTABLE_STATUSES: OrderStatus[] = [
  OrderStatus.CREATED,
  OrderStatus.FULFILLED,
];

@Injectable()
export class OrderService {
  constructor(
    @InjectModel('Order') private readonly orderModel: Model<Order>,
    @InjectModel('Record') private readonly recordModel: Model<Record>,
    private readonly recordListCacheService: RecordListCacheService,
  ) {}

  async create(request: CreateOrderRequestDTO): Promise<OrderResponse> {
    if (request.externalOrderId) {
      const existingOrder = await this.orderModel
        .findOne({
          source: request.source ?? OrderSource.ADMIN,
          externalOrderId: request.externalOrderId,
        })
        .exec();

      if (existingOrder) {
        return this.mapTimestamps(existingOrder);
      }
    }

    const updatedRecord = await this.recordModel.findOneAndUpdate(
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

    if (!updatedRecord) {
      const existingRecord = await this.recordModel
        .findOne({ _id: request.recordId, deletedAt: null })
        .exec();

      if (!existingRecord) {
        throw new NotFoundException('Record not found');
      }

      throw new BadRequestException(
        `Insufficient stock. Available: ${existingRecord.qty}, requested: ${request.quantity}`,
      );
    }

    const unitPrice = updatedRecord.price;
    const totalPrice = unitPrice * request.quantity;

    let createdOrder: Order;

    try {
      createdOrder = await this.orderModel.create({
        recordId: request.recordId,
        quantity: request.quantity,
        unitPrice,
        totalPrice,
        status: OrderStatus.CREATED,
        source: request.source ?? OrderSource.ADMIN,
        externalOrderId: request.externalOrderId,
        customerRef: request.customerRef,
        notes: request.notes,
      });
    } catch {
      await this.recordModel
        .updateOne(
          { _id: request.recordId, deletedAt: null },
          { $inc: { qty: request.quantity } },
        )
        .exec();
      throw new InternalServerErrorException('Failed to create order');
    }

    await this.recordListCacheService.invalidateItem(String(request.recordId));

    return this.mapTimestamps(createdOrder);
  }

  async findAll(query: FindOrdersQueryDTO): Promise<PaginatedOrdersResponse> {
    const filter = this.buildFilter(query);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const sort = this.resolveSortField(query.sort);
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.orderModel.find(filter).sort(sort).skip(skip).limit(limit).exec(),
      this.orderModel.countDocuments(filter).exec(),
    ]);

    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    return {
      items: items.map((item) => this.mapTimestamps(item)),
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  async findOne(id: string): Promise<OrderResponse> {
    const order = await this.orderModel.findById(id).exec();
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return this.mapTimestamps(order);
  }

  async update(
    id: string,
    request: UpdateOrderRequestDTO,
  ): Promise<OrderResponse> {
    const order = await this.orderModel.findById(id).exec();
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (!MUTABLE_STATUSES.includes(order.status)) {
      throw new ConflictException(
        'Order cannot be changed from its current status',
      );
    }

    if (request.status === OrderStatus.CANCELED) {
      return this.cancel(id, {});
    }

    if (
      request.status &&
      !this.isAllowedTransition(order.status, request.status)
    ) {
      throw new ConflictException(
        `Invalid status transition from ${order.status} to ${request.status}`,
      );
    }

    if (request.status) {
      order.status = request.status;
    }

    if (request.customerRef !== undefined) {
      order.customerRef = request.customerRef;
    }

    if (request.notes !== undefined) {
      order.notes = request.notes;
    }

    const updatedOrder = await order.save();
    return this.mapTimestamps(updatedOrder);
  }

  async cancel(
    id: string,
    request: CancelOrderRequestDTO,
  ): Promise<OrderResponse> {
    const order = await this.orderModel.findById(id).exec();
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status === OrderStatus.CANCELED) {
      throw new ConflictException('Order is already canceled');
    }

    if (order.status === OrderStatus.FULFILLED) {
      throw new ConflictException('Fulfilled orders cannot be canceled');
    }

    const restockResult = await this.recordModel
      .updateOne(
        {
          _id: order.recordId,
          deletedAt: null,
        },
        {
          $inc: { qty: order.quantity },
        },
      )
      .exec();

    if (restockResult.modifiedCount !== 1) {
      throw new BadRequestException(
        'Associated record not available for restock',
      );
    }

    order.status = OrderStatus.CANCELED;
    order.cancelReason = request.reason;

    const canceledOrder = await order.save();

    await this.recordListCacheService.invalidateItem(String(order.recordId));

    return this.mapTimestamps(canceledOrder);
  }

  private buildFilter(query: FindOrdersQueryDTO): FilterQuery<Order> {
    const filter: FilterQuery<Order> = {};

    if (query.status) {
      filter.status = query.status;
    }

    if (query.source) {
      filter.source = query.source;
    }

    if (query.recordId) {
      filter.recordId = query.recordId;
    }

    if (query.externalOrderId) {
      filter.externalOrderId = query.externalOrderId;
    }

    if (query.from || query.to) {
      filter.createdAt = {};

      if (query.from) {
        filter.createdAt.$gte = new Date(query.from);
      }

      if (query.to) {
        filter.createdAt.$lte = new Date(query.to);
      }
    }

    return filter;
  }

  private resolveSortField(sort?: string): string {
    if (!sort) {
      return '-createdAt';
    }

    const descending = sort.startsWith('-');
    const rawField = descending ? sort.slice(1) : sort;

    const normalizedField =
      rawField === 'created'
        ? 'createdAt'
        : rawField === 'lastModified'
          ? 'updatedAt'
          : rawField;

    return descending ? `-${normalizedField}` : normalizedField;
  }

  private isAllowedTransition(
    current: OrderStatus,
    next: OrderStatus,
  ): boolean {
    if (current === next) {
      return true;
    }

    return current === OrderStatus.CREATED && next === OrderStatus.FULFILLED;
  }

  private mapTimestamps(order: Order): OrderResponse {
    const output = order.toObject
      ? (order.toObject() as OrderResponse)
      : (order as OrderResponse);

    output.created = output.createdAt;
    output.lastModified = output.updatedAt;

    return output;
  }
}
