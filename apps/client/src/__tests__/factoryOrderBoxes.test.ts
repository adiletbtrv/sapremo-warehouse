import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDeliveryFromFactoryOrder } from '@/hooks/useFactoryOrderDelivery';
import { generateFactoryOrderHtml } from '@/utils/printFactoryOrder';
import type { FactoryOrder, Product, GoodsReceipt } from '@/types';

interface MockStore {
  products: Product[];
  receipts: GoodsReceipt[];
  factoryOrders: FactoryOrder[];
  syncQueue: unknown[];
}

const initialStore: MockStore = {
  products: [],
  receipts: [],
  factoryOrders: [],
  syncQueue: [],
};

const globalStore: MockStore = { ...initialStore };

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
    orderBy: vi.fn(() => ({
      toArray: vi.fn(() => Promise.resolve([...globalStore[tableName]])),
    })),
    toArray: vi.fn(() => Promise.resolve([...globalStore[tableName]])),
  });

  return {
    db: {
      products: createTableMock('products'),
      receipts: createTableMock('receipts'),
      factoryOrders: createTableMock('factoryOrders'),
      syncQueue: createTableMock('syncQueue'),
      transaction: vi.fn(
        async (_mode: string, _tables: unknown, callback: () => Promise<unknown>) => {
          return await callback();
        },
      ),
    },
  };
});

vi.mock('@/store/syncStore', () => ({
  useSyncStore: {
    getState: () => ({
      addToQueue: vi.fn((task: unknown) => {
        globalStore.syncQueue.push(task);
        return Promise.resolve();
      }),
    }),
  },
}));

describe('Factory Order Box vs Pieces Calculation Tests (TDD)', () => {
  beforeEach(() => {
    globalStore.products = [
      {
        id: 'prod-uuid-1',
        barcode: '8',
        name: 'Пломбир Ванильный',
        boxQuantity: 20, // 20 шт в коробке
        factoryPrice: 150, // 150 сом за штуку
        stockQuantity: 100, // текущий остаток на складе в штуках
        status: 'active',
        expirationDate: '2026-12-31',
        batchNumber: 'B001',
      },
      {
        id: 'prod-uuid-2',
        barcode: '32123',
        name: 'Эскимо Шоколадное',
        boxQuantity: 10, // 10 шт в коробке
        factoryPrice: 80, // 80 сом за штуку
        stockQuantity: 50,
        status: 'active',
        expirationDate: '2026-12-31',
        batchNumber: 'B002',
      },
    ];
    globalStore.receipts = [];
    globalStore.factoryOrders = [];
    globalStore.syncQueue = [];
  });

  it('createDeliveryFromFactoryOrder: correctly resolves product by barcode and calculates pieces from boxes', async () => {
    const dummyOrder: FactoryOrder = {
      id: 'FO-BOX-TEST-1',
      orderNumber: 101,
      date: '2026-08-27T10:00:00.000Z',
      status: 'pending',
      items: [
        {
          productId: '8', // barcode used as productId
          productName: 'Пломбир Ванильный',
          qty: 12, // 12 КОРОБОК
        },
        {
          productId: '32123',
          productName: 'Эскимо Шоколадное',
          qty: 14, // 14 КОРОБОК
        },
      ],
    };

    await createDeliveryFromFactoryOrder({
      order: dummyOrder,
      invoiceNumber: 'INV-BOX-001',
      date: '2026-08-27',
      items: [
        { productId: '8', productName: 'Пломбир Ванильный', qty: 12 },
        { productId: '32123', productName: 'Эскимо Шоколадное', qty: 14 },
      ],
    });

    // 1. Поступление должно быть создано
    expect(globalStore.receipts.length).toBe(1);
    const receipt = globalStore.receipts[0];

    // Позиция 1: 12 коробок * 20 шт/кор = 240 шт
    const item1 = receipt.items.find((it) => it.barcode === '8');
    expect(item1).toBeDefined();
    expect(item1?.quantityBoxes).toBe(12);
    expect(item1?.actualQuantity).toBe(240); // 12 * 20
    expect(item1?.factoryPrice).toBe(150);

    // Позиция 2: 14 коробок * 10 шт/кор = 140 шт
    const item2 = receipt.items.find((it) => it.barcode === '32123');
    expect(item2).toBeDefined();
    expect(item2?.quantityBoxes).toBe(14);
    expect(item2?.actualQuantity).toBe(140); // 14 * 10
    expect(item2?.factoryPrice).toBe(80);

    // Общая стоимость: (240 * 150) + (140 * 80) = 36000 + 11200 = 47200 сом
    expect(receipt.totalAmount).toBe(47200);

    // Остатки на складе должны увеличиться на штуки (240 и 140), а НЕ на 12 и 14!
    const updatedProd1 = globalStore.products.find((p) => p.barcode === '8');
    expect(updatedProd1?.stockQuantity).toBe(100 + 240); // 340 шт

    const updatedProd2 = globalStore.products.find((p) => p.barcode === '32123');
    expect(updatedProd2?.stockQuantity).toBe(50 + 140); // 190 шт
  });

  it('printFactoryOrder: properly prints boxes without division by boxQuantity and calculates total sum in boxes * pieces * price', () => {
    const dummyOrder: FactoryOrder = {
      id: 'FO-PRINT-1',
      orderNumber: 202,
      date: '2026-08-27T10:00:00.000Z',
      status: 'pending',
      items: [
        {
          productId: 'prod-uuid-1',
          productName: 'Пломбир Ванильный',
          qty: 10, // 10 коробок
        },
      ],
    };

    const capturedHtml = generateFactoryOrderHtml(dummyOrder, globalStore.products, [dummyOrder]);

    // 10 коробок * 20 шт/кор = 200 шт. Цена за шт = 150 сом.
    // Стоимость = 200 * 150 = 30 000 сом.
    // Проверяем, что в HTML попало правильное число коробок (10), а не 0 или 1!
    expect(capturedHtml).toContain('10');
    // Проверяем, что есть колонка коробок (кор.)
    expect(capturedHtml).toContain('Количество<br/>коробок (кор.)');
    // Проверяем, что есть колонка всего (шт)
    expect(capturedHtml).toContain('Всего<br/>(шт)');
    // Проверяем, что общее количество штук = 200
    expect(capturedHtml).toContain('200');
    // Проверяем, что сумма строки и итого 30 000 (или форматированное 30 000), а не 1 500!
    expect(capturedHtml).toMatch(/30[\s\u00A0]?000/);
    expect(capturedHtml).not.toMatch(/>1[\s\u00A0]?500</);
  });
});
