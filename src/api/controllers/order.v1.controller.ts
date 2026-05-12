import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CreateOrderRequestDTO } from '../dtos/create-order.request.dto';
import { OrderResponse, OrderService } from '../services/order.service';

@Controller('v1/orders')
export class OrderV1Controller {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new order' })
  @ApiResponse({ status: 201, description: 'Order successfully created' })
  @ApiResponse({ status: 400, description: 'Insufficient stock' })
  @ApiResponse({ status: 404, description: 'Record not found' })
  async create(@Body() request: CreateOrderRequestDTO): Promise<OrderResponse> {
    return this.orderService.create(request);
  }
}
