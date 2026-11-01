import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import { useSyncStore } from '@/store/syncStore';
import type { ProductReturn } from '@/types';
import i18n from '@/i18n';

export function useReturns(): ProductReturn[] {
  return useLiveQuery(
    () =>
      db.returns
        .orderBy('date')
        .reverse()
        .filter((r) => !r.isArchived)
        .toArray(),
    [],
    [],
  );
}

export function useReturn(id: string): ProductReturn | undefined {
  return useLiveQuery(() => db.returns.get(id), [id]);
}

export async function addReturn(productReturn: ProductReturn): Promise<void> {
  const returnToSave: ProductReturn = {
    ...productReturn,
    isSynced: false,
    syncStatus: productReturn.returnType === 'to_factory' ? 'local_only' : 'pending',
  };

  await db.transaction('rw', [db.returns, db.products, db.drivers, db.syncQueue], async () => {
    await db.returns.add(returnToSave);

    if (productReturn.returnType === 'to_factory') {
      for (const item of productReturn.items) {
        const product = await db.products.where('barcode').equals(item.barcode).first();
        const available = product?.stockQuantity ?? 0;
        if (available < item.quantity) {
          throw new Error(
            i18n.t('returns.msgNotEnoughStockDetailed', {
              productName: item.productName || item.barcode,
              available,
              required: item.quantity,
              defaultValue: `Недостаточно товара «${item.productName || item.barcode}» на складе. Доступно: ${available} шт., требуется: ${item.quantity} шт.`,
            }),
          );
        }
      }
    }

    for (const item of productReturn.items) {
      const product = await db.products.where('barcode').equals(item.barcode).first();
      if (product) {
        const quantityChange =
          productReturn.returnType === 'from_driver' ? item.quantity : -item.quantity;
        await db.products.update(product.id, {
          stockQuantity: product.stockQuantity + quantityChange,
        });
      }
    }

    if (productReturn.returnType === 'from_driver' && productReturn.driverId) {
      const driver = await db.drivers.get(productReturn.driverId);
      if (driver) {
        await db.drivers.update(productReturn.driverId, {
          currentDebt: Math.max(0, driver.currentDebt - productReturn.totalAmount),
        });
      }
    }

    await useSyncStore.getState().addToQueue({
      action: 'CREATE_RETURN',
      payload: productReturn,
    });
  });
}
