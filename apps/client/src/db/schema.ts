import Dexie, { type Table } from 'dexie';
import type {
  Product,
  Driver,
  Order,
  Transaction,
  SyncTask,
  GoodsReceipt,
  ProductReturn,
  ProductRetry,
  FactoryOrder,
  AuditLog,
  DashboardSummary,
} from '@/types';
import { handleDatabaseCorruption, restoreEmergencySyncQueue } from './recovery';
import { logger } from '@/utils/logger';

export interface StockBalanceRecord {
  barcode: string;
  quantity: number;
  updatedAt: string;
  version: number;
}

export class WarehouseDB extends Dexie {
  products!: Table<Product, string>;
  drivers!: Table<Driver, string>;
  orders!: Table<Order, string>;
  transactions!: Table<Transaction, string>;
  receipts!: Table<GoodsReceipt, string>;
  returns!: Table<ProductReturn, string>;
  syncQueue!: Table<SyncTask, number>;
  outbox_mutations!: Table<SyncTask, number>;
  stock!: Table<StockBalanceRecord, string>;
  productRetries!: Table<ProductRetry, number>;
  factoryOrders!: Table<FactoryOrder, string>;
  auditLogs!: Table<AuditLog, string>;
  dashboardSummary!: Table<DashboardSummary, string>;

  constructor() {
    super('WarehouseDB');

    this.version(1).stores({
      products: 'barcode, name, status, batchNumber',
      drivers: 'id, fullName',
      orders: 'id, driverId, date, status, invoiceNumber',
      transactions: 'id, type, date, driverId',
      receipts: 'id, date, status',
      returns: 'id, driverId, date',
      syncQueue: '++id, action, status, createdAt',
    });

    this.version(2).stores({
      productRetries: '++id, action, payload, createdAt',
    });

    this.version(3).stores({
      factoryOrders: 'id, date, status',
    });

    this.version(4)
      .stores({
        products: 'id, barcode, name, status, batchNumber',
        productRetries: '++id, action, status, createdAt',
      })
      .upgrade(async (tx) => {
        // SRE-01: Ensure all existing cached products have an id and default numeric values
        await tx
          .table('products')
          .toCollection()
          .modify((p: Record<string, unknown>) => {
            if (!p.id && p.barcode) {
              p.id = p.barcode;
            }
            if (p.stockQuantity === undefined || p.stockQuantity === null) {
              p.stockQuantity = 0;
            }
            if (p.boxQuantity === undefined || p.boxQuantity === null) {
              p.boxQuantity = 1;
            }
          });
      });

    this.version(5).stores({
      auditLogs: 'id, entityId, entityName, userId, createdAt',
    });

    this.version(6)
      .stores({
        syncQueue: '++id, action, status, userId, createdAt',
        productRetries: '++id, action, status, userId, createdAt',
      })
      .upgrade(async (tx) => {
        // SRE-01: Backfill userId if missing in pending sync queues
        await tx
          .table('syncQueue')
          .toCollection()
          .modify((task: Record<string, unknown>) => {
            if (!task.userId) {
              task.userId = 'legacy';
            }
          });
      });

    this.version(7).stores({
      dashboardSummary: 'id, updatedAt',
    });

    this.version(8)
      .stores({
        orders: 'id, driverId, date, status, invoiceNumber, updatedAt',
      })
      .upgrade(async (tx) => {
        // SRE-01: Schema evolution for orders
        await tx
          .table('orders')
          .toCollection()
          .modify((o: Record<string, unknown>) => {
            if (!o.updatedAt) {
              o.updatedAt = o.date || new Date().toISOString();
            }
          });
      });

    this.version(9).stores({
      outbox_mutations: '++id, action, status, userId, operationId, createdAt',
      stock: 'barcode, updatedAt, version',
    });
  }
}

export const db = new WarehouseDB();

export async function clearUserScopedData(): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.products,
      db.drivers,
      db.orders,
      db.transactions,
      db.receipts,
      db.returns,
      db.syncQueue,
      db.productRetries,
      db.factoryOrders,
      db.auditLogs,
      db.dashboardSummary,
    ],
    async () => {
      await Promise.all([
        db.products.clear(),
        db.drivers.clear(),
        db.orders.clear(),
        db.transactions.clear(),
        db.receipts.clear(),
        db.returns.clear(),
        db.syncQueue.clear(),
        db.productRetries.clear(),
        db.factoryOrders.clear(),
        db.auditLogs.clear(),
        db.dashboardSummary.clear(),
      ]);
    },
  );
}

/**
 * SEC-05: Cleans up audit logs older than the specified retention window (default: 30 days)
 * to prevent IndexedDB storage quota exhaustion.
 */
export async function pruneOldAuditLogs(days = 30): Promise<number> {
  try {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    return await db.auditLogs.where('createdAt').below(cutoffDate).delete();
  } catch (err) {
    logger.warn('[IndexedDB] Failed to prune old audit logs:', { error: err });
    return 0;
  }
}

const trackedTables = [
  'products',
  'drivers',
  'orders',
  'transactions',
  'receipts',
  'returns',
  'factoryOrders',
];

trackedTables.forEach((tableName) => {
  db.table(tableName).hook('creating', (primKey, obj) => {
    void import('@/utils/audit').then(({ createAuditRecord }) => {
      void createAuditRecord(tableName, primKey as string, null, obj);
    });
  });

  db.table(tableName).hook('updating', (modifications, primKey, obj) => {
    void import('@/utils/audit').then(({ createAuditRecord }) => {
      void createAuditRecord(tableName, primKey as string, obj, { ...obj, ...modifications });
    });
  });

  db.table(tableName).hook('deleting', (primKey, obj) => {
    void import('@/utils/audit').then(({ createAuditRecord }) => {
      void createAuditRecord(tableName, primKey as string, obj, null);
    });
  });
});

db.open()
  .then(async () => {
    await restoreEmergencySyncQueue(db);
  })
  .catch(async (err: Error) => {
    if (
      err.name === 'UpgradeError' ||
      err.name === 'DatabaseClosedError' ||
      err.message.includes('UpgradeError')
    ) {
      logger.error('Dexie UpgradeError detected. Triggering automated disaster recovery...', err);
      await handleDatabaseCorruption(err);
    }
  });
