import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateOrderRequestDTO } from '../dtos/create-order.request.dto';
import { Order } from '../schemas/order.schema';
import { Record } from '../schemas/record.schema';

export interface OrderResponse extends Order {
  created: Date;
  lastModified: Date;
}

@Injectable()
export class OrderService {
  constructor(
    @InjectModel('Order') private readonly orderModel: Model<Order>,
    @InjectModel('Record') private readonly recordModel: Model<Record>,
  ) {}

  async create(request: CreateOrderRequestDTO): Promise<OrderResponse> {
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

    const createdOrder = await this.orderModel.create({
      recordId: request.recordId,
      quantity: request.quantity,
      unitPrice,
      totalPrice,
    });

    return this.mapTimestamps(createdOrder);
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
