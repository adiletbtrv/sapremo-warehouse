import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adjustWarehouseStock } from '../hooks/useStock';
import { db } from '../db/schema';
import { useSyncStore } from '../store/syncStore';
import type { GoodsReceipt, InventoryReceptionPayload, Product } from '../types';

vi.mock('../db/schema', () => {
  const mockProductFirst = vi.fn();
  return {
    db: {
      products: {
        get: vi.fn(),
        where: vi.fn().mockReturnValue({
          equals: vi.fn().mockReturnValue({
            first: mockProductFirst,
          }),
        }),
        equals: vi.fn().mockReturnThis(),
        first: mockProductFirst,
        update: vi.fn().mockResolvedValue(1),
        toArray: vi.fn().mockResolvedValue([]),
      },
      syncQueue: {
        add: vi.fn().mockResolvedValue(1),
        where: vi.fn().mockReturnThis(),
        equals: vi.fn().mockReturnThis(),
        sortBy: vi.fn().mockResolvedValue([]),
        toArray: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue(1),
        delete: vi.fn().mockResolvedValue(undefined),
      },
      productRetries: {
        where: vi.fn().mockReturnThis(),
        equals: vi.fn().mockReturnThis(),
        sortBy: vi.fn().mockResolvedValue([]),
        toArray: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue(1),
        delete: vi.fn().mockResolvedValue(undefined),
      },
      transaction: vi.fn(async (...args: unknown[]) => {
        const callback = args[args.length - 1];
        if (typeof callback === 'function') {
          return await (callback as () => Promise<unknown>)();
        }
      }),
    },
  };
});

describe('Inventory Stock Synchronization & Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSyncStore.setState({ isOnline: true, isSyncing: false });
  });

  describe('adjustWarehouseStock', () => {
    it('correctly calculates pieces from boxes using product boxQuantity', async () => {
      const mockProduct: Partial<Product> = {
        id: 'prod-101',
        barcode: '4700010010015',
        name: 'Пломбир Ванильный',
        boxQuantity: 24,
        stockQuantity: 48,
      };

      vi.mocked(db.products.get).mockResolvedValue(mockProduct as Product);

      await adjustWarehouseStock({
        productId: 'prod-101',
        barcode: '4700010010015',
        quantityBoxes: 10,
        comment: 'Пополнение коробок',
      });

      // 10 boxes * 24 pcs = 240 pieces
      expect(db.products.update).toHaveBeenCalledWith('prod-101', {
        stockQuantity: 240,
      });

      expect(db.syncQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ADJUST_STOCK',
          payload: {
            productId: 'prod-101',
            barcode: '4700010010015',
            quantityBoxes: 10,
            comment: 'Пополнение коробок',
          },
        }),
      );
    });

    it('handles stock removal (zeroing quantity) safely', async () => {
      const mockProduct: Partial<Product> = {
        id: 'prod-102',
        barcode: '4700010010022',
        name: 'Эскимо Шоколадное',
        boxQuantity: 12,
        stockQuantity: 60,
      };

      vi.mocked(db.products.where).mockReturnValue({
        equals: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(mockProduct as Product),
        }),
      } as unknown as ReturnType<typeof db.products.where>);

      await adjustWarehouseStock({
        barcode: '4700010010022',
        quantityBoxes: 0,
        quantityPieces: 0,
        comment: 'Списание товара со склада',
      });

      expect(db.products.update).toHaveBeenCalledWith('prod-102', {
        stockQuantity: 0,
      });
    });

    it('prevents negative stock quantities and clamps to zero', async () => {
      const mockProduct: Partial<Product> = {
        id: 'prod-103',
        barcode: '4700010010039',
        name: 'Мороженое Рожок',
        boxQuantity: 10,
        stockQuantity: 20,
      };

      vi.mocked(db.products.get).mockResolvedValue(mockProduct as Product);

      await adjustWarehouseStock({
        productId: 'prod-103',
        quantityPieces: -50,
      });

      expect(db.products.update).toHaveBeenCalledWith('prod-103', {
        stockQuantity: 0,
      });
    });
  });

  describe('Reception payload mapping', () => {
    it('maps goods receipt to InventoryReceptionPayload format correctly', () => {
      const receipt: GoodsReceipt = {
        id: 'REC-20260818-01',
        date: '2026-08-18',
        supplierName: 'Завод Sapremo',
        status: 'completed',
        totalAmount: 13000,
        items: [
          {
            barcode: '4700010010015',
            productName: 'Пломбир Ванильный',
            expectedQuantity: 200,
            actualQuantity: 200,
            discrepancyType: 'none',
            factoryPrice: 65,
          },
        ],
      };

      const piecesPerBox = 20;
      const expectedBoxes = Math.floor(receipt.items[0].actualQuantity / piecesPerBox);

      const payload: InventoryReceptionPayload = {
        warehouseId: 'wh-uuid-1',
        deliveryNumber: receipt.id,
        comment: receipt.supplierName,
        items: [
          {
            barcode: receipt.items[0].barcode,
            productName: receipt.items[0].productName,
            quantityBoxes: expectedBoxes,
            quantityPieces: receipt.items[0].actualQuantity % piecesPerBox,
            piecesPerBox,
            factoryPrice: receipt.items[0].factoryPrice,
          },
        ],
      };

      expect(payload.deliveryNumber).toBe('REC-20260818-01');
      expect(payload.items[0].quantityBoxes).toBe(10);
      expect(payload.items[0].quantityPieces).toBe(0); // 200 шт = ровно 10 коробок, остаток штук = 0
      expect(payload.items[0].factoryPrice).toBe(65);
    });
  });
});
