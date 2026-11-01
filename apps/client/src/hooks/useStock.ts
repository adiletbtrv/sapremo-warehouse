import { useQuery } from '@tanstack/react-query';
import { warehouseClient } from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import { useSyncStore } from '@/store/syncStore';
import { db } from '@/db/schema';
import type { StockItem, InventoryAdjustPayload } from '@/types';

export function useStock() {
  const warehouseId = useAuthStore((s) => s.user?.warehouseId);
  return useQuery<StockItem[]>({
    queryKey: ['stock', warehouseId],
    queryFn: async () => {
      const res = await warehouseClient.get<StockItem[]>('/inventory');
      return res.data ?? [];
    },
    retry: 1,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/**
 * Асинхронно обновляет остатки товара в локальной IndexedDB и ставит задачу
 * синхронизации в очередь для отправки на Warehouse-back.
 */
export async function adjustWarehouseStock(payload: InventoryAdjustPayload): Promise<void> {
  const { barcode, productId, quantityBoxes, quantityPieces } = payload;
  await db.transaction('rw', db.products, db.syncQueue, async () => {
    let product = productId ? await db.products.get(productId) : null;
    if (!product && barcode) {
      product = await db.products.where('barcode').equals(barcode).first();
    }

    if (product) {
      const piecesPerBox = product.boxQuantity ?? 1;
      const totalPieces =
        quantityPieces ?? (quantityBoxes !== undefined ? quantityBoxes * piecesPerBox : 0);

      await db.products.update(product.id, {
        stockQuantity: Math.max(0, totalPieces),
      });
    }

    await useSyncStore.getState().addToQueue({
      action: 'ADJUST_STOCK',
      payload,
    });
  });
}
