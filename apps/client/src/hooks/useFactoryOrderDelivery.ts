import dayjs from 'dayjs';
import { db } from '@/db/schema';
import { useSyncStore } from '@/store/syncStore';
import type { FactoryOrder, GoodsReceipt, ReceiptItem } from '@/types';

export interface FactoryOrderDeliveryInput {
  order: FactoryOrder;
  invoiceNumber: string;
  date: string;
  items: { productId: string; productName: string; qty: number }[];
}

export async function createDeliveryFromFactoryOrder(
  input: FactoryOrderDeliveryInput,
): Promise<void> {
  const products = await db.products.filter((p) => !p.isArchived).toArray();

  const receiptItems: ReceiptItem[] = input.items.map((item) => {
    const idStr = String(item.productId ?? '').trim();
    const nameStr = String(item.productName ?? '')
      .trim()
      .toLowerCase();

    const product =
      products.find((p) => String(p.id).trim() === idStr) ??
      products.find((p) => String(p.barcode).trim() === idStr) ??
      (nameStr ? products.find((p) => p.name.trim().toLowerCase() === nameStr) : undefined);

    const piecesPerBox = product?.boxQuantity && product.boxQuantity > 0 ? product.boxQuantity : 1;
    const totalPieces = item.qty * piecesPerBox;

    return {
      barcode: product?.barcode ?? item.productId,
      productName: product?.name ?? item.productName,
      quantityBoxes: item.qty,
      expectedQuantity: totalPieces,
      actualQuantity: totalPieces,
      discrepancyType: 'none',
      factoryPrice: product?.factoryPrice ?? 0,
    };
  });

  const totalAmount = receiptItems.reduce(
    (sum, item) => sum + item.actualQuantity * item.factoryPrice,
    0,
  );

  const receipt: GoodsReceipt = {
    id: input.invoiceNumber,
    date: dayjs(input.date).format('YYYY-MM-DD'),
    items: receiptItems,
    totalAmount,
    status: 'completed',
    supplierName: 'Завод',
    factoryOrderId: input.order.id,
    isSynced: false,
    syncStatus: 'pending',
  };

  await db.transaction(
    'rw',
    [db.receipts, db.products, db.syncQueue, db.factoryOrders],
    async () => {
      await db.receipts.add(receipt);

      for (const item of receipt.items) {
        let liveProduct = await db.products.where('barcode').equals(item.barcode).first();
        if (!liveProduct) {
          liveProduct = await db.products.get(item.barcode);
        }
        if (!liveProduct) {
          const matching = products.find((p) => p.barcode === item.barcode);
          if (matching?.id) {
            liveProduct = await db.products.get(matching.id);
          }
        }
        if (liveProduct) {
          await db.products.update(liveProduct.id, {
            stockQuantity: (liveProduct.stockQuantity ?? 0) + item.actualQuantity,
          });
        }
      }

      await useSyncStore.getState().addToQueue({
        action: 'CREATE_RECEIPT',
        payload: receipt,
      });

      await db.factoryOrders.update(input.order.id, { status: 'delivered' });
    },
  );
}
