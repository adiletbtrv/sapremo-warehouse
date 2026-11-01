import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import { useSyncStore } from '@/store/syncStore';
import type { GoodsReceipt } from '@/types';

export function useReceipts(): GoodsReceipt[] {
  return useLiveQuery(
    () =>
      db.receipts
        .orderBy('date')
        .reverse()
        .filter((r) => !r.isArchived)
        .toArray(),
    [],
    [],
  );
}

export function useReceipt(id: string): GoodsReceipt | undefined {
  return useLiveQuery(() => db.receipts.get(id), [id]);
}

export async function addReceipt(receipt: GoodsReceipt): Promise<void> {
  const receiptToSave: GoodsReceipt = {
    ...receipt,
    isSynced: false,
    syncStatus: 'pending',
  };

  await db.transaction('rw', db.receipts, db.products, db.syncQueue, async () => {
    await db.receipts.add(receiptToSave);

    for (const item of receipt.items) {
      const products = await db.products.where('barcode').equals(item.barcode).toArray();
      if (products.length > 0) {
        const target = products.find((p) => p.status === 'active') ?? products[0];
        await db.products.update(target.id, {
          stockQuantity: (target.stockQuantity || 0) + item.actualQuantity,
        });
      }
    }

    await useSyncStore.getState().addToQueue({
      action: 'CREATE_RECEIPT',
      payload: receipt,
    });
  });
}
