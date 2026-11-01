import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import { kickSync, useSyncStore } from '@/store/syncStore';
import type { Order, OrderStatus, Product } from '@/types';
import dayjs from 'dayjs';

export function useOrders(status?: OrderStatus): Order[] {
  return useLiveQuery(
    async () => {
      if (status) {
        return await db.orders
          .orderBy('date')
          .reverse()
          .filter((o) => o.status === status)
          .limit(200)
          .filter((o) => !o.isArchived)
          .toArray();
      } else {
        return await db.orders
          .orderBy('date')
          .reverse()
          .filter((o) => !o.isArchived)
          .limit(200)
          .toArray();
      }
    },
    [status],
    [],
  );
}

export function useOrder(id: string): Order | undefined {
  return useLiveQuery(() => db.orders.get(id), [id]);
}

export async function approveOrder(orderId: string): Promise<void> {
  await db.transaction('rw', [db.orders, db.syncQueue], async () => {
    await db.orders.update(orderId, { status: 'CONFIRMED' });

    const updatedOrder = await db.orders.get(orderId);

    if (updatedOrder) {
      await useSyncStore.getState().addToQueue({ action: 'UPDATE_ORDER', payload: updatedOrder });
    }
  });
  kickSync();
}

export async function rejectOrder(orderId: string): Promise<void> {
  await db.transaction('rw', [db.orders, db.syncQueue], async () => {
    await db.orders.update(orderId, { status: 'REJECTED' });

    const updatedOrder = await db.orders.get(orderId);

    if (updatedOrder) {
      await useSyncStore.getState().addToQueue({ action: 'UPDATE_ORDER', payload: updatedOrder });
    }
  });
  kickSync();
}

async function findProductsForOrderItem(
  barcodeOrId: string,
  productName?: string,
): Promise<Product[]> {
  let products = await db.products.where('barcode').equals(barcodeOrId).toArray();
  if (products.length === 0) {
    const byId = await db.products.get(barcodeOrId);
    if (byId) products = [byId];
  }
  if (products.length === 0 && productName) {
    products = await db.products
      .filter((p) => p.name.trim().toLowerCase() === productName.trim().toLowerCase())
      .toArray();
  }
  return products;
}

export async function issueOrder(order: Order): Promise<void> {
  await db.transaction('rw', [db.orders, db.products, db.drivers, db.syncQueue], async () => {
    const currentOrder = (await db.orders.get(order.id)) ?? order;
    if (currentOrder.status === 'DISPATCHED') {
      throw new Error('Товар по этой заявке уже выдан!');
    }

    // Если в очереди уже есть активная задача со статусом pending, блокируем параллельную отправку
    const activePendingTask = await db.syncQueue
      .filter(
        (t) =>
          t.status === 'pending' &&
          (t.action === 'DISPATCH_ORDER' || t.action === 'CREATE_ORDER') &&
          (t.payload as { id?: string })?.id === currentOrder.id,
      )
      .first();

    if (activePendingTask) {
      throw new Error('Заявка уже находится в процессе выдачи!');
    }

    // Удаляем старые неудачные (failed) задачи по этой заявке, чтобы заменить новой попыткой
    const oldFailedTasks = await db.syncQueue
      .filter(
        (t) =>
          t.status === 'failed' &&
          (t.action === 'DISPATCH_ORDER' || t.action === 'CREATE_ORDER') &&
          (t.payload as { id?: string })?.id === currentOrder.id,
      )
      .toArray();

    for (const failedTask of oldFailedTasks) {
      if (failedTask.id !== undefined) {
        await db.syncQueue.delete(failedTask.id);
      }
    }

    // 1. Проверка достаточности остатков перед списанием
    for (const item of currentOrder.items) {
      const products = await findProductsForOrderItem(item.barcode, item.productName);
      const totalAvailable = products.reduce((sum, p) => sum + (p.stockQuantity ?? 0), 0);
      if (totalAvailable < item.quantity) {
        throw new Error(
          `Недостаточно товара «${item.productName || item.barcode}» на складе. Доступно: ${totalAvailable} шт., требуется: ${item.quantity} шт.`,
        );
      }
    }

    // 2. Списание по FIFO (по сроку годности)
    for (const item of currentOrder.items) {
      const products = await findProductsForOrderItem(item.barcode, item.productName);

      products.sort((a, b) => {
        const timeA = a.expirationDate ? new Date(a.expirationDate).getTime() : Infinity;
        const timeB = b.expirationDate ? new Date(b.expirationDate).getTime() : Infinity;
        return timeA - timeB;
      });

      let remainingQuantity = item.quantity;
      for (const product of products) {
        if (remainingQuantity <= 0) break;

        const deduct = Math.min(product.stockQuantity, remainingQuantity);
        if (deduct > 0) {
          await db.products.update(product.id, {
            stockQuantity: product.stockQuantity - deduct,
          });
          remainingQuantity -= deduct;
        }
      }
    }

    const driver = await db.drivers.get(currentOrder.driverId);
    if (driver) {
      await db.drivers.update(currentOrder.driverId, {
        currentDebt: Math.max(0, (driver.currentDebt || 0) + currentOrder.totalAmount),
      });
    }

    let invoiceNumber = currentOrder.invoiceNumber;
    if (!invoiceNumber) {
      const datePart = dayjs().format('YYMMDD');
      const randomPart = Math.floor(1000 + Math.random() * 9000);
      invoiceNumber = `INV-${datePart}-${randomPart}`;
    }

    await db.orders.update(currentOrder.id, {
      status: 'DISPATCHED',
      invoiceNumber,
      date: dayjs().toISOString(),
    });

    const updatedOrder = await db.orders.get(currentOrder.id);

    if (updatedOrder) {
      await useSyncStore.getState().addToQueue({ action: 'DISPATCH_ORDER', payload: updatedOrder });
    }
  });

  kickSync();
}
