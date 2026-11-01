import { describe, it, expect } from 'vitest';
import type { GoodsReceipt, Product } from '@/types';

// Helper, проверяющий формирование payload приёмки в складской бэкенд
export function buildWarehouseReceptionItems(receipt: GoodsReceipt, products: Product[]) {
  const prodMap = new Map(products.map((p) => [p.barcode, p]));

  return receipt.items.map((item) => {
    const localProduct = prodMap.get(item.barcode);
    const piecesPerBox =
      localProduct?.boxQuantity && localProduct.boxQuantity > 0 ? localProduct.boxQuantity : 1;

    // В бэкенде Warehouse-back (Spring Boot):
    // quantityBoxes — это количество ЦЕЛЫХ коробок
    // quantityPieces — это ШТУЧНЫЙ ОСТАТОК сверх целых коробок (loose pieces)
    // Формула бэкенда: totalPieces = quantityBoxes * piecesPerBox + quantityPieces
    // Если передать quantityBoxes: 5 и quantityPieces: 60, бэкенд начислит:
    // 5 * 12 + 60 = 120 штук (задвоение прихода)!
    const boxes = Math.floor(item.actualQuantity / piecesPerBox);
    const loosePieces = item.actualQuantity % piecesPerBox;

    return {
      productId: localProduct?.id,
      barcode: item.barcode,
      productName: item.productName ?? localProduct?.name,
      quantityBoxes: boxes,
      quantityPieces: loosePieces,
      piecesPerBox,
      factoryPrice: item.factoryPrice ?? localProduct?.factoryPrice ?? 0,
    };
  });
}

// Helper разбора ответа бэкенда InventoryDto в локальный stockQuantity (в штуках)
export function parseServerInventoryStock(item: {
  quantityBoxes?: number;
  quantityPieces?: number;
  piecesPerBox?: number;
}): number {
  const ppb = item.piecesPerBox && item.piecesPerBox > 0 ? item.piecesPerBox : 1;
  const boxes = item.quantityBoxes ?? 0;
  const loose = item.quantityPieces ?? 0;

  // Если сервер вернул quantityPieces >= boxes * ppb (как в текущем ответе сервера, где pieces = 72 при 6 коробках),
  // то pieces уже содержит суммарное количество штук.
  // Иначе суммируем целые коробки и штучный остаток.
  if (loose >= boxes * ppb && loose > 0) {
    return loose;
  }
  return boxes * ppb + loose;
}

describe('Inventory Reception Boxes & Pieces calculation (TDD)', () => {
  const testProduct: Product = {
    id: 'prod-chernika-uuid',
    barcode: '8',
    name: 'Черника',
    boxQuantity: 12, // 12 шт в коробке
    factoryPrice: 150,
    driverPrice: 180,
    stockQuantity: 12, // на складе уже была 1 коробка (12 шт)
    status: 'active',
    expirationDate: '2026-12-31',
    batchNumber: 'BATCH-001',
  };

  it('формирует корректный payload приёмки 5 коробок (60 шт): boxes=5, pieces=0 (не 60!)', () => {
    const receipt: GoodsReceipt = {
      id: 'REC-TEST-1',
      factoryOrderId: 'FO-TEST-1',
      date: new Date().toISOString(),
      status: 'completed',
      items: [
        {
          barcode: '8',
          productName: 'Черника',
          quantityBoxes: 5,
          expectedQuantity: 60,
          actualQuantity: 60, // 5 коробок * 12 шт = 60 шт
          discrepancyType: 'none',
          factoryPrice: 150,
        },
      ],
      totalAmount: 9000,
    };

    const items = buildWarehouseReceptionItems(receipt, [testProduct]);

    expect(items).toHaveLength(1);
    expect(items[0].quantityBoxes).toBe(5);
    // КРИТИЧНО: quantityPieces должен быть 0 (остаток неполной коробки),
    // а НЕ 60, иначе бэкенд начислит 5 коробок + 60 штук = 10 коробок!
    expect(items[0].quantityPieces).toBe(0);
    expect(items[0].piecesPerBox).toBe(12);
  });

  it('корректно обрабатывает неполные коробки: 5 коробок и 5 штук (65 шт) -> boxes=5, pieces=5', () => {
    const receipt: GoodsReceipt = {
      id: 'REC-TEST-2',
      date: new Date().toISOString(),
      status: 'completed',
      items: [
        {
          barcode: '8',
          productName: 'Черника',
          quantityBoxes: 5,
          expectedQuantity: 65,
          actualQuantity: 65, // 5 коробок * 12 + 5 шт = 65 шт
          discrepancyType: 'none',
          factoryPrice: 150,
        },
      ],
      totalAmount: 9750,
    };

    const items = buildWarehouseReceptionItems(receipt, [testProduct]);

    expect(items[0].quantityBoxes).toBe(5);
    expect(items[0].quantityPieces).toBe(5);
  });

  it('парсит ответ сервера с суммарным остатком (6 коробок / 72 шт) без искажения остатка', () => {
    // Ответ сервера из лога пользователя:
    // { quantityBoxes: 6, quantityPieces: 72, piecesPerBox: 12 }
    const serverResponseItem = {
      barcode: '8',
      quantityBoxes: 6,
      quantityPieces: 72,
      piecesPerBox: 12,
    };

    const stockPcs = parseServerInventoryStock(serverResponseItem);
    expect(stockPcs).toBe(72); // 6 коробок * 12 шт = 72 шт
  });

  it('парсит ответ сервера с разделенными полями (boxes=6, loose=3) -> 75 шт', () => {
    const serverResponseItem = {
      barcode: '8',
      quantityBoxes: 6,
      quantityPieces: 3,
      piecesPerBox: 12,
    };

    const stockPcs = parseServerInventoryStock(serverResponseItem);
    expect(stockPcs).toBe(75); // 6 * 12 + 3 = 75 шт
  });
});
