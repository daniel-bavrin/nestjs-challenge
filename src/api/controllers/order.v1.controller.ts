import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { CancelOrderRequestDTO } from '../dtos/cancel-order.request.dto';
import { CreateOrderRequestDTO } from '../dtos/create-order.request.dto';
import { FindOrdersQueryDTO } from '../dtos/find-orders.query.dto';
import { UpdateOrderRequestDTO } from '../dtos/update-order.request.dto';
import {
  OrderResponse,
  OrderService,
  PaginatedOrdersResponse,
} from '../services/order.service';

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

  @Get()
  @ApiOperation({ summary: 'List orders with optional filters' })
  @ApiResponse({ status: 200, description: 'Paginated order list' })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'source', required: false, type: String })
  @ApiQuery({ name: 'recordId', required: false, type: String })
  @ApiQuery({ name: 'externalOrderId', required: false, type: String })
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'sort', required: false, type: String })
  async findAll(@Query() query: FindOrdersQueryDTO): Promise<PaginatedOrdersResponse> {
    return this.orderService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order details by id' })
  @ApiResponse({ status: 200, description: 'Order details' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async findOne(@Param('id') id: string): Promise<OrderResponse> {
    return this.orderService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update mutable order fields' })
  @ApiResponse({ status: 200, description: 'Order updated' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @ApiResponse({ status: 409, description: 'Invalid state transition' })
  async update(
    @Param('id') id: string,
    @Body() request: UpdateOrderRequestDTO,
  ): Promise<OrderResponse> {
    return this.orderService.update(id, request);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel an order and restock inventory' })
  @ApiResponse({ status: 200, description: 'Order canceled' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @ApiResponse({ status: 409, description: 'Order cannot be canceled' })
  async cancel(
    @Param('id') id: string,
    @Body() request: CancelOrderRequestDTO,
  ): Promise<OrderResponse> {
    return this.orderService.cancel(id, request);
  }
}
