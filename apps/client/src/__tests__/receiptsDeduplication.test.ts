import { describe, it, expect } from 'vitest';
import type { GoodsReceipt, Product, FactoryOrder } from '@/types';
import { mapFactoryOrderToReceipt } from '@/api/mappers/receipt.mapper';

// Helper функции логики дедупликации поставок (такие же, как будут в sync.ts)
export function areReceiptsEquivalent(r1: GoodsReceipt, r2: GoodsReceipt): boolean {
  // 1. Прямое совпадение ID
  if (r1.id === r2.id) return true;

  // 2. Совпадение по factoryOrderId
  if (r1.factoryOrderId && r2.factoryOrderId && r1.factoryOrderId === r2.factoryOrderId) {
    return true;
  }

  // 3. Совпадение по сумме (с допуском 0.01 для float округлений)
  const amountDiff = Math.abs((Number(r1.totalAmount) || 0) - (Number(r2.totalAmount) || 0));
  if (amountDiff > 0.01) return false;

  // 4. Совпадение по дате (в пределах 24 часов)
  const t1 = new Date(r1.date).getTime();
  const t2 = new Date(r2.date).getTime();
  const sameDate = isNaN(t1) || isNaN(t2) || Math.abs(t1 - t2) < 1000 * 60 * 60 * 24;
  if (!sameDate) return false;

  // 5. Совпадение по позициям товаров (штрихкод и фактическое количество)
  const items1 = Array.isArray(r1.items) ? r1.items : [];
  const items2 = Array.isArray(r2.items) ? r2.items : [];
  if (items1.length !== items2.length) return false;

  return items1.every((it1) =>
    items2.some(
      (it2) =>
        (it2.barcode === it1.barcode ||
          (it2.productName &&
            it1.productName &&
            it2.productName.trim().toLowerCase() === it1.productName.trim().toLowerCase())) &&
        Number(it2.actualQuantity) === Number(it1.actualQuantity),
    ),
  );
}

export function deduplicateReceipts(
  existingReceipts: GoodsReceipt[],
  serverReceipts: GoodsReceipt[],
): {
  mergedReceipts: GoodsReceipt[];
  staleIdsToDelete: string[];
} {
  const staleIdsToDelete: string[] = [];
  const mergedReceipts: GoodsReceipt[] = [];

  // 1. Очищаем существующие локальные дубликаты
  const uniqueLocal: GoodsReceipt[] = [];
  for (const loc of existingReceipts) {
    const duplicate = uniqueLocal.find((u) => areReceiptsEquivalent(u, loc));
    if (duplicate) {
      // Сохраняем более красивый/человекочитаемый ID (не UUID)
      const locIsUuid = loc.id.length >= 32;
      const dupIsUuid = duplicate.id.length >= 32;
      if (dupIsUuid && !locIsUuid) {
        staleIdsToDelete.push(duplicate.id);
        const idx = uniqueLocal.indexOf(duplicate);
        uniqueLocal[idx] = loc;
      } else {
        staleIdsToDelete.push(loc.id);
      }
    } else {
      uniqueLocal.push({ ...loc });
    }
  }

  mergedReceipts.push(...uniqueLocal);

  // 2. Объединяем с серверными накладными
  for (const sr of serverReceipts) {
    const existingIndex = mergedReceipts.findIndex((r) => areReceiptsEquivalent(r, sr));
    if (existingIndex >= 0) {
      const existing = mergedReceipts[existingIndex];
      // Предпочитаем человекочитаемый номер накладной (например "1-1", "REC-001"), а не UUID от offline-приемки
      const srIsUuid =
        sr.id.startsWith('op-') || sr.id.startsWith('offline-') || sr.id.length >= 32;
      const finalId = srIsUuid ? existing.id : sr.id;

      if (sr.id !== finalId) {
        staleIdsToDelete.push(sr.id);
      }
      if (existing.id !== finalId) {
        staleIdsToDelete.push(existing.id);
      }

      mergedReceipts[existingIndex] = {
        ...existing,
        ...sr,
        id: finalId,
        factoryOrderId: existing.factoryOrderId ?? sr.factoryOrderId,
        isSynced: true,
        syncStatus: 'synced',
      };
    } else {
      mergedReceipts.push(sr);
    }
  }

  return { mergedReceipts, staleIdsToDelete };
}

describe('Receipts Deduplication & Synchronization', () => {
  const mockProducts: Product[] = [
    {
      id: 'prod-1',
      barcode: '8',
      name: 'Черника',
      boxQuantity: 12,
      factoryPrice: 150,
      driverPrice: 180,
      stockQuantity: 60,
      status: 'active',
      expirationDate: '2026-12-31',
      batchNumber: 'BATCH-001',
    },
  ];

  it('определяет эквивалентность локальной накладной ("1-1") и серверной накладной с UUID ("op-uuid-123")', () => {
    const localReceipt: GoodsReceipt = {
      id: '1-1',
      date: '2026-08-27',
      totalAmount: 9000,
      status: 'completed',
      supplierName: 'Завод',
      factoryOrderId: 'fo-uuid-order-1',
      items: [
        {
          barcode: '8',
          productName: 'Черника',
          quantityBoxes: 5,
          expectedQuantity: 60,
          actualQuantity: 60,
          discrepancyType: 'none',
          factoryPrice: 150,
        },
      ],
      isSynced: true,
    };

    const serverReceipt: GoodsReceipt = {
      id: 'op-uuid-1234-5678',
      date: '2026-08-27T17:46:47Z',
      totalAmount: 9000,
      status: 'completed',
      supplierName: 'Завод',
      // у FactoryDelivery нет поля factoryOrderId
      factoryOrderId: undefined,
      items: [
        {
          barcode: '8',
          productName: 'Черника',
          quantityBoxes: 5,
          expectedQuantity: 60,
          actualQuantity: 60,
          discrepancyType: 'none',
          factoryPrice: 150,
        },
      ],
      isSynced: true,
    };

    expect(areReceiptsEquivalent(localReceipt, serverReceipt)).toBe(true);
  });

  it('дедуплицирует локальную накладную и серверный ответ, сохраняя номер "1-1" и удаляя "op-uuid"', () => {
    const localReceipt: GoodsReceipt = {
      id: '1-1',
      date: '2026-08-27',
      totalAmount: 9000,
      status: 'completed',
      supplierName: 'Завод',
      factoryOrderId: 'fo-uuid-order-1',
      items: [
        {
          barcode: '8',
          productName: 'Черника',
          quantityBoxes: 5,
          expectedQuantity: 60,
          actualQuantity: 60,
          discrepancyType: 'none',
          factoryPrice: 150,
        },
      ],
    };

    const serverReceipt: GoodsReceipt = {
      id: 'op-uuid-1234-5678',
      date: '2026-08-27T17:46:47Z',
      totalAmount: 9000,
      status: 'completed',
      supplierName: 'Завод',
      items: [
        {
          barcode: '8',
          productName: 'Черника',
          quantityBoxes: 5,
          expectedQuantity: 60,
          actualQuantity: 60,
          discrepancyType: 'none',
          factoryPrice: 150,
        },
      ],
    };

    const { mergedReceipts, staleIdsToDelete } = deduplicateReceipts(
      [localReceipt],
      [serverReceipt],
    );

    // Должна остаться РОВНО ОДНА накладная
    expect(mergedReceipts).toHaveLength(1);
    // Номер накладной должен остаться "1-1"
    expect(mergedReceipts[0].id).toBe('1-1');
    expect(mergedReceipts[0].factoryOrderId).toBe('fo-uuid-order-1');
    // UUID сервера должен быть помечен на удаление
    expect(staleIdsToDelete).toContain('op-uuid-1234-5678');
  });

  it('очищает уже накопленные дубликаты в существующей базе данных', () => {
    const duplicate1: GoodsReceipt = {
      id: '1-1',
      date: '2026-08-27',
      totalAmount: 9000,
      status: 'completed',
      items: [
        {
          barcode: '8',
          productName: 'Черника',
          actualQuantity: 60,
          expectedQuantity: 60,
          discrepancyType: 'none',
          factoryPrice: 150,
        },
      ],
    };

    const duplicate2: GoodsReceipt = {
      id: 'op-already-saved-uuid',
      date: '2026-08-27T17:46:47Z',
      totalAmount: 9000,
      status: 'completed',
      items: [
        {
          barcode: '8',
          productName: 'Черника',
          actualQuantity: 60,
          expectedQuantity: 60,
          discrepancyType: 'none',
          factoryPrice: 150,
        },
      ],
    };

    const { mergedReceipts, staleIdsToDelete } = deduplicateReceipts([duplicate1, duplicate2], []);

    expect(mergedReceipts).toHaveLength(1);
    expect(mergedReceipts[0].id).toBe('1-1');
    expect(staleIdsToDelete).toContain('op-already-saved-uuid');
  });

  it('mapFactoryOrderToReceipt присваивает factoryOrderId: fo.id', () => {
    const fo: FactoryOrder = {
      id: 'fo-uuid-999',
      date: '2026-08-27',
      status: 'delivered',
      items: [{ productId: 'prod-1', productName: 'Черника', qty: 5 }],
    };

    const receipt = mapFactoryOrderToReceipt(fo, mockProducts);
    expect(receipt.factoryOrderId).toBe('fo-uuid-999');
  });
});
