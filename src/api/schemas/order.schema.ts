import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

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

  createdAt: Date;

  updatedAt: Date;
}

export const OrderSchema = SchemaFactory.createForClass(Order);

OrderSchema.index({ recordId: 1, createdAt: -1 });
