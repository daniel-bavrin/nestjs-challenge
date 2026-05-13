import { OrderSource, OrderStatus } from './order.enum';
import { OrderSchema } from './order.schema';

describe('OrderSchema', () => {
  it('defines defaults and enum constraints for status/source', () => {
    const statusPath = OrderSchema.path('status');
    const sourcePath = OrderSchema.path('source');

    expect(statusPath.options.default).toBe(OrderStatus.CREATED);
    expect(sourcePath.options.default).toBe(OrderSource.ADMIN);
    expect(statusPath.options.enum).toEqual(OrderStatus);
    expect(sourcePath.options.enum).toEqual(OrderSource);
  });

  it('registers expected indexes', () => {
    const indexes = OrderSchema.indexes();

    expect(indexes).toEqual(
      expect.arrayContaining([
        [{ recordId: 1, createdAt: -1 }, expect.objectContaining({})],
        [{ status: 1, createdAt: -1 }, expect.objectContaining({})],
        [{ source: 1, createdAt: -1 }, expect.objectContaining({})],
        [
          { source: 1, externalOrderId: 1 },
          expect.objectContaining({
            name: 'uq_order_source_externalOrderId',
            unique: true,
            partialFilterExpression: { externalOrderId: { $type: 'string' } },
          }),
        ],
      ]),
    );
  });
});
