import type {
  FactoryOrder,
  FactoryOrderItem,
  FactoryOrderStatus,
  GoodsReceipt,
  Product,
} from '@/types';

export interface ApiFactoryOrderInput {
  id?: string;
  warehouse_id?: string;
  warehouseId?: string;
  created_at?: string;
  createdAt?: string;
  date?: string;
  status?: string;
  comment?: string;
  items?: {
    id?: string;
    product_id?: string;
    productId?: string;
    productName?: string;
    quantity?: number;
    qty?: number;
  }[];
}

export function normalizeFactoryOrderStatus(status: string | undefined): FactoryOrderStatus {
  const normalized = String(status ?? 'pending')
    .toLowerCase()
    .trim();

  if (
    normalized === 'approved' ||
    normalized === 'одобрено' ||
    normalized === 'accepted' ||
    normalized === 'shipped' ||
    normalized === 'отгружено' ||
    normalized === 'ready' ||
    normalized === 'готово' ||
    normalized === 'in_transit' ||
    normalized === 'в пути'
  ) {
    return 'approved';
  }
  if (
    normalized === 'rejected' ||
    normalized === 'отклонено' ||
    normalized === 'cancelled' ||
    normalized === 'отменено'
  ) {
    return 'rejected';
  }
  if (
    normalized === 'delivered' ||
    normalized === 'поставлено' ||
    normalized === 'completed' ||
    normalized === 'выполнено' ||
    normalized === 'done' ||
    normalized === 'принято'
  ) {
    return 'delivered';
  }
  return 'pending';
}

export function canCreateDeliveryFromOrder(status: FactoryOrderStatus): boolean {
  return status !== 'delivered' && status !== 'rejected';
}

export function enrichFactoryOrderItems(
  items: FactoryOrderItem[],
  products: Product[],
): FactoryOrderItem[] {
  return items.map((item) => {
    const product =
      products.find((p) => p.id === item.productId) ??
      products.find((p) => p.barcode === item.productId) ??
      products.find((p) => p.name === item.productName);

    return {
      ...item,
      productId: product?.id ?? item.productId,
      productName: product?.name ?? item.productName ?? item.productId,
    };
  });
}

export function mapApiFactoryOrder(fo: ApiFactoryOrderInput, products: Product[]): FactoryOrder {
  return {
    id: fo.id ? String(fo.id) : crypto.randomUUID(),
    warehouseId: fo.warehouse_id ?? fo.warehouseId,
    date: fo.created_at ?? fo.createdAt ?? fo.date ?? new Date().toISOString(),
    status: normalizeFactoryOrderStatus(fo.status),
    comment: fo.comment,
    items: enrichFactoryOrderItems(
      (fo.items ?? []).map((i) => ({
        id: i.id ? String(i.id) : undefined,
        productId: String(i.product_id ?? i.productId ?? ''),
        productName: i.productName,
        qty: Number(i.qty ?? i.quantity ?? 0),
      })),
      products,
    ),
  };
}

export function getDeliveredFactoryOrderIds(
  localOrders: FactoryOrder[],
  receipts: GoodsReceipt[],
  serverOrders: FactoryOrder[] = [],
): Set<string> {
  const ids = new Set<string>();

  for (const order of localOrders) {
    if (order.status === 'delivered') {
      ids.add(order.id);
    }
  }

  for (const order of serverOrders) {
    if (order.status === 'delivered') {
      ids.add(order.id);
    }
  }

  for (const receipt of receipts) {
    if (receipt.factoryOrderId) {
      ids.add(receipt.factoryOrderId);
    }
    if (receipt.id) {
      ids.add(receipt.id);
    }
  }

  // Эвристическое сопоставление приемок и заявок по позициям
  const allOrders = [...localOrders, ...serverOrders];
  for (const receipt of receipts) {
    if (!receipt.items || receipt.items.length === 0) continue;

    const matchedOrder = allOrders.find((order) => {
      if (ids.has(order.id)) return false;
      if (!order.items || order.items.length !== receipt.items.length) return false;

      const matchAll = order.items.every((oItem) => {
        const rItem = receipt.items.find(
          (ri) =>
            ri.barcode === oItem.productId ||
            (oItem.productName && ri.productName.toLowerCase() === oItem.productName.toLowerCase()),
        );
        if (!rItem) return false;

        const fallbackBoxQty =
          rItem.expectedQuantity > 0 ? Math.ceil(rItem.expectedQuantity / 12) : 0;
        const boxQty = rItem.quantityBoxes ?? fallbackBoxQty;
        return (
          Number(oItem.qty) === Number(boxQty) ||
          Number(oItem.qty) === Number(rItem.actualQuantity) ||
          Number(oItem.qty) === Number(rItem.expectedQuantity)
        );
      });

      return matchAll;
    });

    if (matchedOrder) {
      ids.add(matchedOrder.id);
      receipt.factoryOrderId = matchedOrder.id;
    }
  }

  return ids;
}

export function mergeFactoryOrders(
  serverOrders: FactoryOrder[],
  localOrders: FactoryOrder[],
  deliveredOrderIds = new Set<string>(),
): FactoryOrder[] {
  const localMap = new Map(localOrders.map((o) => [o.id, o]));
  const matchedLocalIds = new Set<string>();

  const merged: FactoryOrder[] = serverOrders.map((serverOrder) => {
    let local = localMap.get(serverOrder.id);

    if (!local) {
      local = localOrders.find((loc) => {
        if (matchedLocalIds.has(loc.id)) return false;
        if ((loc.comment ?? '') !== (serverOrder.comment ?? '')) return false;
        if (loc.items.length !== serverOrder.items.length) return false;
        const itemsMatch = loc.items.every((locItem) => {
          const sItem = serverOrder.items.find(
            (si) =>
              si.productId === locItem.productId ||
              (locItem.productName && si.productName === locItem.productName),
          );
          return sItem && Number(sItem.qty) === Number(locItem.qty);
        });
        if (!itemsMatch) return false;

        if (loc.date && serverOrder.date) {
          const t1 = new Date(loc.date).getTime();
          const t2 = new Date(serverOrder.date).getTime();
          if (!isNaN(t1) && !isNaN(t2) && Math.abs(t1 - t2) > 1000 * 60 * 60 * 24) {
            return false;
          }
        }
        return true;
      });
    }

    if (local) {
      matchedLocalIds.add(local.id);
    }

    const isDelivered =
      local?.status === 'delivered' ||
      serverOrder.status === 'delivered' ||
      deliveredOrderIds.has(serverOrder.id) ||
      (local ? deliveredOrderIds.has(local.id) : false);

    return {
      ...serverOrder,
      date: serverOrder.date ?? local?.date ?? serverOrder.date,
      orderNumber: local?.orderNumber ?? serverOrder.orderNumber,
      createdByName: local?.createdByName ?? serverOrder.createdByName,
      status: isDelivered ? ('delivered' as const) : serverOrder.status,
    };
  });

  const serverIds = new Set(serverOrders.map((o) => o.id));
  for (const local of localOrders) {
    if (!serverIds.has(local.id) && !matchedLocalIds.has(local.id)) {
      merged.push(local);
    }
  }

  return merged;
}
