import type { Order, OrderItem, Product, Driver } from '@/types';
import { mapApiOrderStatus } from '@/types';
import { roundCurrency } from '@/utils/money';

export interface RawApiOrderItem {
  id?: string;
  productId?: string;
  product_id?: string;
  barcode?: string;
  name?: string;
  productName?: string;
  product_name?: string;
  requestedQty?: number;
  approvedQty?: number;
  quantity?: number;
  qty?: number;
  box_count?: number;
  boxCount?: number;
  unitPrice?: number;
  unit_price?: number;
  price?: number;
  amount?: number;
}

export interface RawApiOrder {
  id: string;
  driverId: string;
  warehouseId?: string;
  status: string;
  requestedAt?: string;
  createdAt?: string;
  date?: string;
  totalAmount?: number;
  comment?: string;
  items: RawApiOrderItem[];
}

/**
 * Pure mapper: Transforms raw API order from drivers-service into strongly-typed frontend Order entity.
 */
export function mapApiOrder(raw: RawApiOrder, products: Product[], drivers: Driver[]): Order {
  const driver = drivers.find((d) => String(d.id) === String(raw.driverId));
  const rawTotalAmount = raw.totalAmount != null ? roundCurrency(raw.totalAmount) : undefined;

  const items: OrderItem[] = (raw.items || []).map((i) => {
    const rawProdId = String(i.productId ?? i.product_id ?? i.barcode ?? i.id ?? '').trim();
    const rawBarcode = String(i.barcode ?? '').trim();
    const rawName = String(i.productName ?? i.product_name ?? i.name ?? '').trim();

    const product = products.find((p) => {
      if (
        rawProdId &&
        (String(p.id).trim() === rawProdId || String(p.barcode).trim() === rawProdId)
      )
        return true;
      if (rawBarcode && String(p.barcode).trim() === rawBarcode) return true;
      if (rawName && p.name.toLowerCase().trim() === rawName.toLowerCase()) return true;
      return false;
    });

    const rawQty = i.approvedQty ?? i.requestedQty ?? i.quantity ?? i.qty ?? 0;
    const unitPrice = roundCurrency(
      i.unitPrice ?? i.unit_price ?? i.price ?? product?.driverPrice ?? product?.factoryPrice ?? 0,
    );
    const piecesPerBox = product?.boxQuantity && product.boxQuantity > 0 ? product.boxQuantity : 1;
    const rawBoxCount = i.box_count ?? i.boxCount;

    // В мобильном приложении водителей и на бэкенде DriversApp заявки ВСЕГДА формируются в коробках!
    let boxCount = 0;
    let quantity = 0;

    if (rawBoxCount != null && rawBoxCount > 0) {
      boxCount = Math.round(rawBoxCount);
      quantity = boxCount * piecesPerBox;
    } else if (i.requestedQty != null || i.approvedQty != null) {
      // requestedQty / approvedQty из Drivers API — это всегда количество коробок
      boxCount = Math.round(rawQty);
      quantity = boxCount * piecesPerBox;
    } else if (rawQty > 0) {
      if (rawQty > piecesPerBox && rawQty % piecesPerBox === 0) {
        quantity = rawQty;
        boxCount = Math.round(rawQty / piecesPerBox);
      } else {
        boxCount = Math.round(rawQty);
        quantity = boxCount * piecesPerBox;
      }
    }

    const computedAmount = roundCurrency(quantity * unitPrice);
    const amount = i.amount != null && i.amount > 0 ? roundCurrency(i.amount) : computedAmount;
    const resolvedName =
      product?.name ??
      (rawName && !rawName.includes('-')
        ? rawName
        : (product?.name ?? (rawName ? rawName : rawProdId)));
    const resolvedBarcode = product?.barcode
      ? product.barcode
      : rawBarcode
        ? rawBarcode
        : rawProdId;

    return {
      barcode: resolvedBarcode,
      productName: resolvedName,
      quantity,
      boxCount,
      unitPrice,
      amount,
    };
  });

  const computedTotal = roundCurrency(items.reduce((sum, it) => sum + it.amount, 0));
  const totalAmount = rawTotalAmount ?? computedTotal;

  return {
    id: raw.id,
    driverId: raw.driverId,
    driverName: driver?.fullName ?? raw.driverId,
    vehicleNumber: driver?.vehicleNumber ?? driver?.carNumber,
    date: raw.requestedAt ?? raw.createdAt ?? raw.date ?? new Date().toISOString(),
    status: mapApiOrderStatus(raw.status),
    totalAmount,
    notes: raw.comment,
    items,
  };
}
