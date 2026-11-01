import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TFunction } from 'i18next';
import { inPeriod } from '@/features/reports/period';
import { getPaymentSchema } from '@/features/payments/payment.schema';
import { mapApiProduct } from '@/api/mappers/product.mapper';
import { addReturn } from '@/hooks/useReturns';
import { createDeliveryFromFactoryOrder } from '@/hooks/useFactoryOrderDelivery';
import { addProduct, updateProduct, deleteProduct } from '@/hooks/useProducts';
import { factoryClient } from '@/api/client';
import { db } from '@/db/schema';
import type { FactoryOrder, Product, ProductReturn, GoodsReceipt, Driver } from '@/types';

interface MockStore {
  products: Product[];
  receipts: GoodsReceipt[];
  returns: ProductReturn[];
  drivers: Driver[];
  syncQueue: unknown[];
  productRetries: unknown[];
  factoryOrders: FactoryOrder[];
}

const initialStore: MockStore = {
  products: [],
  receipts: [],
  returns: [],
  drivers: [],
  syncQueue: [],
  productRetries: [],
  factoryOrders: [],
};

const globalStore: MockStore = { ...initialStore };

// Mock the Dexie DB for unit isolation
vi.mock('@/db/schema', () => {
  const createTableMock = <K extends keyof MockStore>(tableName: K) => ({
    get: vi.fn((id: string) => {
      const list = globalStore[tableName] as { id?: string }[];
      return Promise.resolve(list.find((item) => item.id === id));
    }),
    add: vi.fn((item: MockStore[K][number]) => {
      (globalStore[tableName] as unknown[]).push(item);
      const withId = item as { id?: string };
      return Promise.resolve(withId.id ?? globalStore[tableName].length);
    }),
    update: vi.fn((id: string, changes: Partial<MockStore[K][number]>) => {
      const list = globalStore[tableName] as { id?: string }[];
      const idx = list.findIndex((item) => item.id === id);
      if (idx !== -1) {
        list[idx] = { ...list[idx], ...changes };
      }
      return Promise.resolve(1);
    }),
    delete: vi.fn((id: string) => {
      const list = globalStore[tableName] as { id?: string }[];
      globalStore[tableName] = list.filter((item) => item.id !== id) as unknown as MockStore[K];
      return Promise.resolve();
    }),
    clear: vi.fn(() => {
      globalStore[tableName] = [] as unknown as MockStore[K];
      return Promise.resolve();
    }),
    filter: vi.fn((fn: (item: MockStore[K][number]) => boolean) => ({
      toArray: vi.fn(() => Promise.resolve(globalStore[tableName].filter(fn))),
    })),
    where: vi.fn((field: string) => ({
      equals: vi.fn((val: unknown) => ({
        first: vi.fn(() => {
          const list = globalStore[tableName] as Record<string, unknown>[];
          return Promise.resolve(list.find((item) => item[field] === val));
        }),
        toArray: vi.fn(() => {
          const list = globalStore[tableName] as Record<string, unknown>[];
          return Promise.resolve(list.filter((item) => item[field] === val));
        }),
      })),
    })),
    toArray: vi.fn(() => Promise.resolve([...globalStore[tableName]])),
  });

  return {
    db: {
      products: createTableMock('products'),
      receipts: createTableMock('receipts'),
      returns: createTableMock('returns'),
      drivers: createTableMock('drivers'),
      syncQueue: createTableMock('syncQueue'),
      productRetries: createTableMock('productRetries'),
      factoryOrders: createTableMock('factoryOrders'),
      transaction: vi.fn((...args: unknown[]) => {
        const callback = args[args.length - 1];
        if (typeof callback === 'function') {
          return (callback as () => Promise<void>)();
        }
        return Promise.resolve();
      }),
    },
  };
});

const createTestProduct = (
  id: string,
  barcode: string,
  name: string,
  stockQuantity = 0,
  boxQuantity = 10,
  factoryPrice = 100,
): Product => ({
  id,
  barcode,
  name,
  boxQuantity,
  stockQuantity,
  factoryPrice,
  status: 'active',
  expirationDate: '2027-01-01',
  batchNumber: 'BATCH-1',
});

describe('Enterprise Defect Remediations', () => {
  beforeEach(() => {
    globalStore.products = [];
    globalStore.receipts = [];
    globalStore.returns = [];
    globalStore.drivers = [];
    globalStore.syncQueue = [];
    globalStore.productRetries = [];
    globalStore.factoryOrders = [];
    vi.restoreAllMocks();
  });

  describe('Bug 3.2: Period ISO Date Filtering', () => {
    it('correctly matches end-date ISO-8601 timestamps in period boundary', () => {
      const period = { start: '2026-08-10', end: '2026-08-17' };
      expect(inPeriod('2026-08-17T14:30:00.000Z', period)).toBe(true);
      expect(inPeriod('2026-08-17T23:59:59.999Z', period)).toBe(true);
      expect(inPeriod('2026-08-10T00:00:00.000Z', period)).toBe(true);
      expect(inPeriod('2026-08-18T00:00:01.000Z', period)).toBe(false);
      expect(inPeriod('2026-08-09T23:59:59.000Z', period)).toBe(false);
    });
  });

  describe('Bug 3.1: Factory Payment Schema vs Cash Balance', () => {
    it('allows recording factory payments when cashBalance is 0 or uninitialized', () => {
      const dummyT = ((key: string, def?: string) => def ?? key) as unknown as TFunction;
      const schema = getPaymentSchema('factory_payment', dummyT, 0);

      const result = schema.safeParse({
        amount: 50000,
        date: new Date(),
        paymentMethod: 'transfer',
        comment: 'Оплата сырья заводу',
      });

      expect(result.success).toBe(true);
    });

    it('rejects card paymentMethod and accepts cash and transfer', () => {
      const dummyT = ((key: string, def?: string) => def ?? key) as unknown as TFunction;
      const schema = getPaymentSchema('driver_payment', dummyT, 10000);

      const cardResult = schema.safeParse({
        amount: 1000,
        date: new Date(),
        paymentMethod: 'card',
        driverId: 'drv-1',
      });
      expect(cardResult.success).toBe(false);

      const cashResult = schema.safeParse({
        amount: 1000,
        date: new Date(),
        paymentMethod: 'cash',
        driverId: 'drv-1',
      });
      expect(cashResult.success).toBe(true);

      const transferResult = schema.safeParse({
        amount: 1000,
        date: new Date(),
        paymentMethod: 'transfer',
        driverId: 'drv-1',
      });
      expect(transferResult.success).toBe(true);
    });
  });

  describe('Bug 2.3: Product Mapper Box Quantity Fallback', () => {
    it('ensures boxQuantity defaults to at least 1 piece per box', () => {
      const product = mapApiProduct({
        id: 'prod-test-1',
        barcode: '1234567890123',
        name: 'Тестовый товар',
        factory_price: 150,
      });

      expect(product.boxQuantity).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Bug 2.2: Stock Validation on Factory Returns', () => {
    it('throws error and blocks to_factory return if available stock is insufficient', async () => {
      await db.products.add(createTestProduct('prod-ret-1', 'BAR-RET-1', 'Товар на возврат', 5));

      const invalidReturn: ProductReturn = {
        id: 'ret-1',
        date: '2026-08-20',
        returnType: 'to_factory',
        totalAmount: 1000,
        items: [
          {
            barcode: 'BAR-RET-1',
            productName: 'Товар на возврат',
            quantity: 10, // Available is only 5
            boxCount: 1,
            unitPrice: 100,
            amount: 1000,
            reason: 'defective',
          },
        ],
      };

      await expect(addReturn(invalidReturn)).rejects.toThrow(/Недостаточно товара/);

      const productInDb = await db.products.get('prod-ret-1');
      expect(productInDb?.stockQuantity).toBe(5); // Stock must remain unmodified
    });

    it('successfully deducts stock when sufficient inventory is available for factory return', async () => {
      await db.products.add(createTestProduct('prod-ret-2', 'BAR-RET-2', 'Товар на возврат', 20));

      const validReturn: ProductReturn = {
        id: 'ret-2',
        date: '2026-08-20',
        returnType: 'to_factory',
        totalAmount: 500,
        items: [
          {
            barcode: 'BAR-RET-2',
            productName: 'Товар на возврат',
            quantity: 5,
            boxCount: 1,
            unitPrice: 100,
            amount: 500,
            reason: 'defective',
          },
        ],
      };

      await addReturn(validReturn);

      const productInDb = await db.products.get('prod-ret-2');
      expect(productInDb?.stockQuantity).toBe(15);
    });
  });

  describe('Bug 1.6: Atomic Factory Order Delivery Creation', () => {
    it('atomically creates receipt, updates stock and sets factory order delivered', async () => {
      await db.products.add(
        createTestProduct('prod-fo-1', 'BAR-FO-1', 'Товар с завода', 50, 10, 200),
      );

      const dummyOrder: FactoryOrder = {
        id: 'FO-999',
        orderNumber: 999,
        date: '2026-08-20',
        status: 'approved',
        items: [{ productId: 'prod-fo-1', productName: 'Товар с завода', qty: 2 }],
      };

      await db.factoryOrders.add(dummyOrder);

      await createDeliveryFromFactoryOrder({
        order: dummyOrder,
        invoiceNumber: 'INV-FO-999',
        date: '2026-08-20',
        items: [{ productId: 'prod-fo-1', productName: 'Товар с завода', qty: 2 }],
      });

      const receipt = await db.receipts.get('INV-FO-999');
      expect(receipt).toBeDefined();
      expect(receipt?.totalAmount).toBe(4000);

      const updatedOrder = await db.factoryOrders.get('FO-999');
      expect(updatedOrder?.status).toBe('delivered');

      const updatedProduct = await db.products.get('prod-fo-1');
      // Initial 50 + (2 boxes * 10 pcs) = 70
      expect(updatedProduct?.stockQuantity).toBe(70);
    });
  });

  describe('Bug 1.7: Product Mutations 403 Forbidden Handling', () => {
    it('throws descriptive error on 403 Forbidden during addProduct', async () => {
      vi.spyOn(factoryClient, 'post').mockRejectedValueOnce({
        response: { status: 403 },
      });

      await expect(
        addProduct(createTestProduct('prod-403-1', 'BAR-403-1', 'Запрещённый товар', 0, 1, 100)),
      ).rejects.toThrow(/Нет прав доступа|Access denied/);

      const inDb = await db.products.get('prod-403-1');
      expect(inDb).toBeUndefined(); // Rolled back from local DB
    });

    it('throws descriptive error on 403 Forbidden during updateProduct', async () => {
      await db.products.add(
        createTestProduct('prod-403-2', 'BAR-403-2', 'Товар до обновления', 0, 1, 100),
      );

      vi.spyOn(factoryClient, 'patch').mockRejectedValueOnce({
        response: { status: 403 },
      });

      await expect(updateProduct('prod-403-2', { name: 'Обновлённое имя' })).rejects.toThrow(
        /Нет прав доступа|Access denied/,
      );
    });

    it('throws descriptive error on 403 Forbidden during deleteProduct', async () => {
      await db.products.add(
        createTestProduct('prod-403-3', 'BAR-403-3', 'Товар на удаление', 0, 1, 100),
      );

      vi.spyOn(factoryClient, 'delete').mockRejectedValueOnce({
        response: { status: 403 },
      });

      await expect(deleteProduct('prod-403-3')).rejects.toThrow(/Нет прав доступа|Access denied/);
    });
  });
});
