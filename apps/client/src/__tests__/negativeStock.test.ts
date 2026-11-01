import { describe, it, expect } from 'vitest';

interface StockItem {
  id: string;
  barcode: string;
  name: string;
  stockQuantity: number;
}

interface OrderItem {
  barcode: string;
  productName?: string;
  quantity: number;
}

function findMatchingStock(
  stock: StockItem[],
  barcodeOrId: string,
  productName?: string,
): StockItem[] {
  let matched = stock.filter((p) => p.barcode === barcodeOrId);
  if (matched.length === 0) {
    matched = stock.filter((p) => p.id === barcodeOrId);
  }
  if (matched.length === 0 && productName) {
    matched = stock.filter((p) => p.name.trim().toLowerCase() === productName.trim().toLowerCase());
  }
  return matched;
}

function validateStockAvailability(
  stock: StockItem[],
  orderItems: OrderItem[],
): { valid: boolean; error?: string } {
  for (const item of orderItems) {
    const matchingProducts = findMatchingStock(stock, item.barcode, item.productName);
    const totalAvailable = matchingProducts.reduce((sum, p) => sum + (p.stockQuantity || 0), 0);
    if (totalAvailable < item.quantity) {
      return {
        valid: false,
        error: `Недостаточно товара «${item.productName ?? item.barcode}» на складе. Доступно: ${totalAvailable} шт., требуется: ${item.quantity} шт.`,
      };
    }
  }
  return { valid: true };
}

describe('Negative stock prevention validation', () => {
  const inventory: StockItem[] = [
    { id: 'uuid-1', barcode: '4870001', name: 'Пломбир ванильный', stockQuantity: 20 },
    { id: 'uuid-2', barcode: '4870001', name: 'Пломбир ванильный', stockQuantity: 30 },
    { id: 'uuid-3', barcode: '4870002', name: 'Эскимо шоколадное', stockQuantity: 10 },
  ];

  it('allows issuance when available inventory is sufficient by barcode', () => {
    const items: OrderItem[] = [
      { barcode: '4870001', productName: 'Пломбир ванильный', quantity: 45 },
      { barcode: '4870002', productName: 'Эскимо шоколадное', quantity: 10 },
    ];
    const result = validateStockAvailability(inventory, items);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('allows issuance when order item references product by UUID or name fallback', () => {
    const items: OrderItem[] = [
      { barcode: 'uuid-3', productName: 'Эскимо шоколадное', quantity: 10 },
    ];
    const result = validateStockAvailability(inventory, items);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('rejects issuance when requested quantity exceeds available inventory', () => {
    const items: OrderItem[] = [
      { barcode: '4870001', productName: 'Пломбир ванильный', quantity: 60 },
    ];
    const result = validateStockAvailability(inventory, items);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Недостаточно товара');
    expect(result.error).toContain('Доступно: 50 шт., требуется: 60 шт.');
  });

  it('rejects issuance when product is completely absent from inventory', () => {
    const items: OrderItem[] = [
      { barcode: '9999999', productName: 'Новое мороженое', quantity: 5 },
    ];
    const result = validateStockAvailability(inventory, items);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Доступно: 0 шт., требуется: 5 шт.');
  });
});
