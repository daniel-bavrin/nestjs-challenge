import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { OrderSource, OrderStatus } from './order.enum';

@Schema({ timestamps: true })
export class Order extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Record', required: true })
  recordId: string;

  @Prop({ required: true, min: 1 })
  quantity: number;

  @Prop({ required: true, min: 0 })
  unitPrice: number;

  @Prop({ required: true, min: 0 })
  totalPrice: number;

  @Prop({ enum: OrderStatus, default: OrderStatus.CREATED, required: true })
  status: OrderStatus;

  @Prop({ enum: OrderSource, default: OrderSource.ADMIN, required: true })
  source: OrderSource;

  @Prop({ required: false })
  externalOrderId?: string;

  @Prop({ required: false })
  customerRef?: string;

  @Prop({ required: false })
  notes?: string;

  @Prop({ required: false })
  cancelReason?: string;

  createdAt: Date;

  updatedAt: Date;
}

export const OrderSchema = SchemaFactory.createForClass(Order);

OrderSchema.index({ recordId: 1, createdAt: -1 });
OrderSchema.index({ status: 1, createdAt: -1 });
OrderSchema.index({ source: 1, createdAt: -1 });
OrderSchema.index(
  { source: 1, externalOrderId: 1 },
  {
    name: 'uq_order_source_externalOrderId',
    unique: true,
    partialFilterExpression: { externalOrderId: { $type: 'string' } },
  },
);
