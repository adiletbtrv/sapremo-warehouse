import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { pullSync } from '@/hooks/useBackgroundSync';
import { createDeliveryFromFactoryOrder } from '@/hooks/useFactoryOrderDelivery';
import { calculateFactoryDebtSummary } from '@/hooks/useFactoryDebtSummary';
import { approveOrder, rejectOrder, issueOrder } from '@/hooks/useOrders';
import { useAuthStore } from '@/store/authStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import { kickSync } from '@/store/syncStore';
import { db } from '@/db/schema';
import type {
  FactoryOrder,
  Product,
  GoodsReceipt,
  Transaction,
  Order,
  ProductReturn,
} from '@/types';

// Track STOMP client instances created by useWebSocket
let lastCreatedStompClient: {
  activate: () => void;
  deactivate: () => Promise<void>;
  onWebSocketClose?: () => void;
} | null = null;

vi.mock('@stomp/stompjs', () => ({
  Client: class {
    activate = vi.fn();
    deactivate = vi.fn().mockResolvedValue(undefined);
    subscribe = vi.fn();
    constructor() {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      lastCreatedStompClient = this;
    }
  },
}));

vi.mock('sockjs-client', () => ({
  default: vi.fn(),
}));

vi.mock('@/store/syncStore', () => ({
  useSyncStore: {
    getState: () => ({
      isOnline: true,
      processQueue: vi.fn().mockResolvedValue(undefined),
      processProductRetries: vi.fn().mockResolvedValue(undefined),
      setOnlineStatus: vi.fn(),
      addToQueue: vi.fn().mockResolvedValue(undefined),
    }),
  },
  kickSync: vi.fn(),
  retryFailedSyncs: vi.fn().mockResolvedValue({ success: 1, failed: 0 }),
  cancelFailedPayment: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/api/sync', () => ({
  fetchInitialData: vi.fn().mockResolvedValue({
    products: [
      {
        id: 'prod-srv-1',
        barcode: 'BAR-1',
        name: 'Серверный Товар',
        stockQuantity: 10,
        boxQuantity: 10,
        expirationDate: '2026-12-31',
        batchNumber: 'BATCH-001',
        factoryPrice: 100,
        status: 'active',
      },
    ],
    drivers: [{ id: 'drv-srv-1', fullName: 'Серверный Водитель', currentDebt: 0 }],
    orders: [],
    transactions: [
      {
        id: 'tx-srv-1',
        type: 'driver_payment',
        amount: 1500,
        date: '2026-08-20',
        paymentMethod: 'cash',
      },
    ],
    factoryOrders: [{ id: 'fo-srv-1', status: 'pending', items: [], date: '2026-08-20' }],
    receipts: [],
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

vi.mock('antd', () => ({
  App: {
    useApp: () => ({
      notification: {
        info: vi.fn(),
        warning: vi.fn(),
        error: vi.fn(),
      },
    }),
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key,
  }),
}));

// In-memory Mock for Dexie
interface MockDBStore {
  products: Product[];
  receipts: GoodsReceipt[];
  transactions: Transaction[];
  factoryOrders: FactoryOrder[];
  orders: Order[];
  returns: ProductReturn[];
  syncQueue: Record<string, unknown>[];
  auditLogs: unknown[];
  productRetries: unknown[];
  drivers: unknown[];
  dashboardSummary: unknown[];
}

const inMemoryDB: MockDBStore = {
  products: [],
  receipts: [],
  transactions: [],
  factoryOrders: [],
  orders: [],
  returns: [],
  syncQueue: [],
  auditLogs: [],
  productRetries: [],
  drivers: [],
  dashboardSummary: [],
};

vi.mock('@/db/schema', () => {
  const createTable = <K extends keyof MockDBStore>(table: K) => ({
    get: vi.fn((id: string) => {
      const arr = inMemoryDB[table] as { id?: string }[];
      return Promise.resolve(arr.find((item) => item.id === id));
    }),
    add: vi.fn((item: MockDBStore[K][number]) => {
      (inMemoryDB[table] as unknown[]).push(item);
      return Promise.resolve(1);
    }),
    put: vi.fn((item: MockDBStore[K][number]) => {
      const arr = inMemoryDB[table] as { id?: string }[];
      const withId = item as { id?: string };
      const idx = arr.findIndex((x) => x.id === withId.id);
      if (idx >= 0) arr[idx] = item as { id?: string };
      else arr.push(item as { id?: string });
      return Promise.resolve(withId.id ?? 1);
    }),
    bulkPut: vi.fn((items: MockDBStore[K][number][]) => {
      items.forEach((item) => {
        const arr = inMemoryDB[table] as { id?: string }[];
        const withId = item as { id?: string };
        const idx = arr.findIndex((x) => x.id === withId.id);
        if (idx >= 0) arr[idx] = item as { id?: string };
        else arr.push(item as { id?: string });
      });
      return Promise.resolve();
    }),
    update: vi.fn((id: string, changes: Partial<MockDBStore[K][number]>) => {
      const arr = inMemoryDB[table] as { id?: string }[];
      const idx = arr.findIndex((x) => x.id === id);
      if (idx >= 0) {
        arr[idx] = { ...arr[idx], ...changes };
      }
      return Promise.resolve(1);
    }),
    delete: vi.fn((id: string | number) => {
      const arr = inMemoryDB[table] as { id?: string | number }[];
      inMemoryDB[table] = arr.filter((x) => x.id !== id) as unknown as MockDBStore[K];
      return Promise.resolve();
    }),
    clear: vi.fn(() => {
      inMemoryDB[table] = [] as unknown as MockDBStore[K];
      return Promise.resolve();
    }),
    where: vi.fn((key: string) => ({
      equals: vi.fn((val: unknown) => ({
        first: vi.fn(() => {
          const arr = inMemoryDB[table] as Record<string, unknown>[];
          return Promise.resolve(arr.find((x) => x[key] === val));
        }),
        toArray: vi.fn(() => {
          const arr = inMemoryDB[table] as Record<string, unknown>[];
          return Promise.resolve(arr.filter((x) => x[key] === val));
        }),
      })),
    })),
    filter: vi.fn((predicate?: (item: unknown) => boolean) => ({
      toArray: vi.fn(() => {
        const arr = inMemoryDB[table] as unknown[];
        return Promise.resolve(predicate ? arr.filter(predicate) : arr);
      }),
      first: vi.fn(() => {
        const arr = inMemoryDB[table] as unknown[];
        const filtered = predicate ? arr.filter(predicate) : arr;
        return Promise.resolve(filtered[0]);
      }),
    })),
  });

  const dbMock = {
    products: createTable('products'),
    receipts: createTable('receipts'),
    transactions: createTable('transactions'),
    factoryOrders: createTable('factoryOrders'),
    orders: createTable('orders'),
    returns: createTable('returns'),
    syncQueue: createTable('syncQueue'),
    auditLogs: createTable('auditLogs'),
    productRetries: createTable('productRetries'),
    drivers: createTable('drivers'),
    dashboardSummary: createTable('dashboardSummary'),
    transaction: vi.fn(
      async (_mode: string, _tables: unknown, callback: () => Promise<unknown>) => {
        return await callback();
      },
    ),
  };

  return {
    db: dbMock,
    clearUserScopedData: vi.fn(async () => {
      await dbMock.products.clear();
      await dbMock.drivers.clear();
      await dbMock.orders.clear();
      await dbMock.transactions.clear();
      await dbMock.receipts.clear();
      await dbMock.returns.clear();
      await dbMock.syncQueue.clear();
      await dbMock.productRetries.clear();
      await dbMock.factoryOrders.clear();
      await dbMock.auditLogs.clear();
      await dbMock.dashboardSummary.clear();
    }),
  };
});

describe('Static Analysis Defect Verification & Concurrency Tests', () => {
  beforeEach(() => {
    inMemoryDB.products = [];
    inMemoryDB.receipts = [];
    inMemoryDB.transactions = [];
    inMemoryDB.factoryOrders = [];
    inMemoryDB.orders = [];
    inMemoryDB.returns = [];
    inMemoryDB.syncQueue = [];
    inMemoryDB.auditLogs = [];
    inMemoryDB.productRetries = [];
    inMemoryDB.drivers = [];
    lastCreatedStompClient = null;
    vi.clearAllMocks();
  });

  it('[DEFECT-CONC-01] pullSync does NOT delete pending offline transactions via clear()', async () => {
    // 1. Arrange: local offline transaction exists
    inMemoryDB.transactions.push({
      id: 'tx-local-offline',
      type: 'factory_payment',
      amount: 4200,
      date: new Date().toISOString(),
      paymentMethod: 'cash',
    });

    // 2. Act: pullSync executes with server data
    await pullSync();

    // 3. Assert: local offline transaction was NOT wiped out by clear()
    const localTx = inMemoryDB.transactions.find((t) => t.id === 'tx-local-offline');
    const serverTx = inMemoryDB.transactions.find((t) => t.id === 'tx-srv-1');

    expect(localTx).toBeDefined();
    expect(localTx?.amount).toBe(4200);
    expect(serverTx).toBeDefined();
  });

  it('[DEFECT-CONC-02] createDeliveryFromFactoryOrder reads live product inside transaction boundary', async () => {
    // 1. Arrange: product in DB has stockQuantity 100
    inMemoryDB.products.push({
      id: 'prod-live-1',
      barcode: 'BAR-LIVE-1',
      name: 'Кока Кола 1л',
      stockQuantity: 100,
      boxQuantity: 12,
      factoryPrice: 50,
      expirationDate: '2026-12-31',
      batchNumber: 'BATCH-001',
      status: 'active',
    });

    const deliveryInput = {
      order: {
        id: 'fo-101',
        orderNumber: 1,
        date: '2026-08-20',
        status: 'approved',
        items: [],
      } as unknown as FactoryOrder,
      invoiceNumber: 'INV-DELIVERY-1',
      date: '2026-08-20',
      items: [{ productId: 'prod-live-1', productName: 'Кока Кола 1л', qty: 5 }], // 5 boxes * 12 = 60 pcs
    };

    // 2. Act
    await createDeliveryFromFactoryOrder(deliveryInput);

    // 3. Assert: live product received 60 pieces -> 160 total
    const updatedProd = inMemoryDB.products.find((p) => p.id === 'prod-live-1');
    expect(updatedProd?.stockQuantity).toBe(160);
    expect(inMemoryDB.receipts.length).toBe(1);
    expect(inMemoryDB.receipts[0].totalAmount).toBe(3000); // 60 * 50
  });

  it('[DEFECT-RES-01] useWebSocket cleans up window online event listener on unmount', () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

    useAuthStore.setState({ token: 'mock-jwt-token' });

    const { unmount } = renderHook(() => useWebSocket());

    // Simulate connection retries reaching MAX_RETRIES to register 'online' listener
    act(() => {
      for (let i = 0; i < 11; i++) {
        lastCreatedStompClient?.onWebSocketClose?.();
      }
    });

    expect(addEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function), {
      once: true,
    });

    unmount();

    // Ensure online event listener is cleanly removed on component unmount
    expect(removeEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));

    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
  });

  it('[DEFECT-SEC-01] useAuthStore.logout(true) purges all cache tables including factoryOrders, auditLogs, productRetries', async () => {
    inMemoryDB.factoryOrders.push({
      id: 'fo-old',
      orderNumber: 1,
      date: '',
      status: 'pending',
      items: [],
    });
    inMemoryDB.auditLogs.push({ id: 'log-1' });
    inMemoryDB.productRetries.push({ id: 1 });

    await useAuthStore.getState().logout(true);

    // Wait microtask queue for dynamic import
    await new Promise((r) => setTimeout(r, 50));

    expect(db.factoryOrders.clear).toHaveBeenCalled();
    expect(db.auditLogs.clear).toHaveBeenCalled();
    expect(db.productRetries.clear).toHaveBeenCalled();
  });

  it('[DEFECT-ARITH-01] calculateFactoryDebtSummary avoids IEEE-754 floating point precision drift', () => {
    const products: Product[] = [];
    const receipts: GoodsReceipt[] = [
      {
        id: 'r1',
        date: '2026-08-20',
        totalAmount: 1000.2,
        status: 'completed',
        items: [
          {
            barcode: 'b1',
            productName: 'p1',
            expectedQuantity: 1,
            actualQuantity: 1,
            discrepancyType: 'none',
            factoryPrice: 1000.2,
          },
        ],
      },
    ];
    const transactions: Transaction[] = [
      {
        id: 't1',
        type: 'factory_payment',
        amount: 1000.1,
        date: '2026-08-20',
        paymentMethod: 'cash',
      },
    ];

    const summary = calculateFactoryDebtSummary(products, receipts, transactions, []);

    // 1000.20 - 1000.10 in raw JS = 0.09999999999990905
    // With roundCurrency it must be exact 0.1
    expect(summary.debt).toBe(0.1);
    expect(summary.displayAmount).toBe(0.1);
    expect(summary.isOverpaid).toBe(false);
  });

  it('[DEFECT-CONC-03] approveOrder, rejectOrder, and issueOrder trigger immediate kickSync()', async () => {
    inMemoryDB.orders.push({
      id: 'ord-101',
      driverId: 'drv-1',
      driverName: 'Тест Водитель',
      date: '2026-08-20',
      status: 'NEW',
      items: [
        {
          barcode: 'b1',
          productName: 'Товар 1',
          quantity: 5,
          boxCount: 1,
          unitPrice: 100,
          amount: 500,
        },
      ],
      totalAmount: 500,
    });
    inMemoryDB.products.push({
      id: 'p1',
      barcode: 'b1',
      name: 'Товар 1',
      stockQuantity: 50,
      boxQuantity: 10,
      factoryPrice: 80,
      expirationDate: '2026-12-31',
      batchNumber: 'BATCH-001',
      status: 'active',
    });

    await approveOrder('ord-101');
    expect(kickSync).toHaveBeenCalledTimes(1);

    await rejectOrder('ord-101');
    expect(kickSync).toHaveBeenCalledTimes(2);

    await issueOrder(inMemoryDB.orders[0]);
    expect(kickSync).toHaveBeenCalledTimes(3);
  });
});
