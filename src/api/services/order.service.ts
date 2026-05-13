import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, FilterQuery, Model } from 'mongoose';
import { CancelOrderRequestDTO } from '../dtos/cancel-order.request.dto';
import { CreateOrderRequestDTO } from '../dtos/create-order.request.dto';
import { FindOrdersQueryDTO } from '../dtos/find-orders.query.dto';
import { UpdateOrderRequestDTO } from '../dtos/update-order.request.dto';
import { Order } from '../schemas/order.schema';
import { OrderSource, OrderStatus } from '../schemas/order.enum';
import { Record } from '../schemas/record.schema';
import { RecordListCacheService } from './record-list-cache.service';
import { RecordResponse, RecordService } from './record.service';

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

const ORDER_SORT_FIELDS: { [key: string]: string } = {
  status: 'status',
  source: 'source',
  created: 'createdAt',
  createdAt: 'createdAt',
  lastModified: 'updatedAt',
  updatedAt: 'updatedAt',
};

@Injectable()
export class OrderService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel('Order') private readonly orderModel: Model<Order>,
    @InjectModel('Record') private readonly recordModel: Model<Record>,
    private readonly recordListCacheService: RecordListCacheService,
    private readonly recordService: RecordService,
  ) {}

  async create(request: CreateOrderRequestDTO): Promise<OrderResponse> {
    return this.connection.transaction(async (session) => {
      if (request.externalOrderId) {
        const existingOrder = await this.findExistingExternalOrder(
          request,
          session,
        );

        if (existingOrder) {
          return this.mapTimestamps(existingOrder);
        }
      }

      const updatedRecord = await this.adjustInventory(
        String(request.recordId),
        -request.quantity,
        session,
      );

      const unitPrice = updatedRecord.price;
      const totalPrice = unitPrice * request.quantity;

      try {
        const createdOrder = await this.createOrder(
          {
            recordId: request.recordId,
            quantity: request.quantity,
            unitPrice,
            totalPrice,
            status: OrderStatus.CREATED,
            source: request.source ?? OrderSource.ADMIN,
            externalOrderId: request.externalOrderId,
            customerRef: request.customerRef,
            notes: request.notes,
          },
          session,
        );
        return this.mapTimestamps(createdOrder);
      } catch {
        throw new InternalServerErrorException('Failed to create order');
      }
    });
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
    return this.connection.transaction(async (session) => {
      const order = await this.findOrderById(id, session);
      if (!order) {
        throw new NotFoundException('Order not found');
      }

      if (!MUTABLE_STATUSES.includes(order.status)) {
        throw new ConflictException(
          'Order cannot be changed from its current status',
        );
      }

      if (request.status === OrderStatus.CANCELED) {
        return this.cancelInTransaction(order, {}, session);
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

      if (
        request.quantity !== undefined &&
        request.quantity !== order.quantity
      ) {
        await this.applyQuantityChange(order, request.quantity, session);
      }

      const updatedOrder = await this.saveOrder(order, session);
      return this.mapTimestamps(updatedOrder);
    });
  }

  async updateQuantity(
    id: string,
    newQuantity: number,
  ): Promise<OrderResponse> {
    return this.connection.transaction(async (session) => {
      const order = await this.findOrderById(id, session);
      if (!order) {
        throw new NotFoundException('Order not found');
      }

      if (!MUTABLE_STATUSES.includes(order.status)) {
        throw new ConflictException(
          'Order cannot be changed from its current status',
        );
      }

      const quantityDelta = await this.applyQuantityChange(
        order,
        newQuantity,
        session,
      );
      if (quantityDelta === 0) {
        return this.mapTimestamps(order);
      }

      const updatedOrder = await this.saveOrder(order, session);
      return this.mapTimestamps(updatedOrder);
    });
  }

  async cancel(
    id: string,
    request: CancelOrderRequestDTO,
  ): Promise<OrderResponse> {
    return this.connection.transaction(async (session) => {
      const order = await this.findOrderById(id, session);
      if (!order) {
        throw new NotFoundException('Order not found');
      }

      return this.cancelInTransaction(order, request, session);
    });
  }

  private async cancelInTransaction(
    order: Order,
    request: CancelOrderRequestDTO,
    session: ClientSession,
  ): Promise<OrderResponse> {
    if (order.status === OrderStatus.CANCELED) {
      throw new ConflictException('Order is already canceled');
    }

    if (order.status === OrderStatus.FULFILLED) {
      throw new ConflictException('Fulfilled orders cannot be canceled');
    }

    await this.adjustInventory(String(order.recordId), order.quantity, session);

    order.status = OrderStatus.CANCELED;
    order.cancelReason = request.reason;

    const canceledOrder = await this.saveOrder(order, session);
    return this.mapTimestamps(canceledOrder);
  }

  private async applyQuantityChange(
    order: Order,
    newQuantity: number,
    session?: ClientSession,
  ): Promise<number> {
    if (newQuantity === order.quantity) {
      return 0;
    }

    const quantityDelta = newQuantity - order.quantity;
    const updatedRecord = await this.adjustInventory(
      String(order.recordId),
      -quantityDelta,
      session,
    );

    order.quantity = newQuantity;
    order.unitPrice = updatedRecord.price;
    order.totalPrice = order.unitPrice * order.quantity;

    return quantityDelta;
  }

  private async createOrder(
    order: Partial<Order>,
    session?: ClientSession,
  ): Promise<Order> {
    if (!session) {
      return this.orderModel.create(order);
    }

    const [createdOrder] = await this.orderModel.create([order], { session });
    return createdOrder;
  }

  private saveOrder(order: Order, session?: ClientSession): Promise<Order> {
    if (!session) {
      return order.save();
    }

    return order.save({ session });
  }

  private adjustInventory(
    recordId: string,
    delta: number,
    session?: ClientSession,
  ): Promise<RecordResponse> {
    if (!session) {
      return this.recordService.adjustInventory(recordId, delta);
    }

    return this.recordService.adjustInventory(recordId, delta, session);
  }

  private findOrderById(
    id: string,
    session?: ClientSession,
  ): Promise<Order | null> {
    let query = this.orderModel.findById(id);

    if (session) {
      query = query.session(session);
    }

    return query.exec();
  }

  private findExistingExternalOrder(
    request: CreateOrderRequestDTO,
    session?: ClientSession,
  ): Promise<Order | null> {
    let query = this.orderModel.findOne({
      source: request.source ?? OrderSource.ADMIN,
      externalOrderId: request.externalOrderId,
    });

    if (session) {
      query = query.session(session);
    }

    return query.exec();
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
    const normalizedField = ORDER_SORT_FIELDS[rawField];

    if (!normalizedField) {
      return '-createdAt';
    }

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
