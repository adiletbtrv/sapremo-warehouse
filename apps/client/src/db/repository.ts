import { db } from '@/db/schema';
import { createAuditRecord } from '@/utils/audit';
import type { Order } from '@/types';

// prettier-ignore
type DbTable =
  | 'products'
  | 'drivers'
  | 'orders'
  | 'transactions'
  | 'receipts'
  | 'returns'
  | 'factoryOrders';

function sameOrderContent(left: Order, right: Order): boolean {
  return (
    left.totalAmount === right.totalAmount &&
    left.items.length === right.items.length &&
    left.items.every((item, index) => {
      const other = right.items[index];
      return (
        item.barcode === other?.barcode &&
        item.boxCount === other?.boxCount &&
        item.quantity === other?.quantity &&
        item.amount === other?.amount
      );
    })
  );
}

export async function mergeServerOrders(serverOrders: Order[]): Promise<void> {
  await db.transaction('rw', db.orders, async () => {
    for (const serverOrder of serverOrders) {
      const localOrder = await db.orders.get(serverOrder.id);

      if (
        localOrder?.localUpdatedAt &&
        !sameOrderContent(localOrder, serverOrder) &&
        (localOrder.status === 'MODIFIED' ||
          localOrder.status === 'DISPATCHED' ||
          localOrder.status === 'REJECTED')
      ) {
        continue;
      }

      await db.orders.put(serverOrder);
    }
  });
}

/**
 * Saves a record to the database and automatically creates an audit log
 */
export async function saveEntity<T extends { id: string }>(
  tableName: DbTable,
  entity: T,
): Promise<void> {
  const table = db.table(tableName);
  const oldRecord = (await table.get(entity.id)) as T | undefined;

  await table.put(entity);
  createAuditRecord(tableName, entity.id, oldRecord ?? null, entity);
}

/**
 * Performs a soft delete by setting `isArchived: true` and logs it
 */
export async function softDeleteEntity(tableName: DbTable, id: string): Promise<void> {
  const table = db.table(tableName);
  const oldRecord = (await table.get(id)) as Record<string, unknown> | undefined;

  if (!oldRecord) {
    console.warn(`Cannot soft-delete: Record ${id} not found in ${tableName}`);
    return;
  }

  const updatedRecord = { ...oldRecord, isArchived: true };
  await table.put(updatedRecord);
  createAuditRecord(tableName, id, oldRecord, updatedRecord);
}
