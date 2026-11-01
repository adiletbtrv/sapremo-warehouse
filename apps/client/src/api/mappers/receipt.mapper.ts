import type { FactoryOrder, GoodsReceipt, Product, ReceiptItem } from '@/types';
import { roundCurrency } from '@/utils/money';

/**
 * Pure mapper: Converts completed factory order delivery into a GoodsReceipt entity.
 */
export function mapFactoryOrderToReceipt(fo: FactoryOrder, products: Product[]): GoodsReceipt {
  const items: ReceiptItem[] = (fo.items || []).map((it) => {
    const prod = products.find(
      (p) => p.id === it.productId || p.name === it.productName || p.barcode === it.productId,
    );
    const qty = it.qty ?? 0;
    const factoryPrice = roundCurrency(prod?.factoryPrice ?? 0);

    return {
      id: crypto.randomUUID(),
      barcode: prod?.barcode ?? '',
      productName: prod?.name ?? it.productName ?? 'Товар',
      expectedQuantity: qty,
      actualQuantity: qty,
      discrepancyType: 'none' as const,
      factoryPrice,
    };
  });

  const totalAmount = roundCurrency(
    items.reduce((sum, item) => sum + item.actualQuantity * item.factoryPrice, 0),
  );

  return {
    id: fo.id,
    date: fo.date,
    items,
    totalAmount,
    status: 'completed',
    supplierName: 'Завод',
    factoryOrderId: fo.id,
  };
}
