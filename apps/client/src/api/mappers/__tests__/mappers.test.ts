import { describe, it, expect } from 'vitest';
import { mapApiProduct, type RawApiProduct } from '../product.mapper';
import { mapApiOrder, type RawApiOrder } from '../order.mapper';
import { mapFactoryOrderToReceipt } from '../receipt.mapper';
import { mapApiServerReception } from '@/api/sync';
import { getDeliveredFactoryOrderIds, mergeFactoryOrders } from '@/utils/factoryOrderStatus';
import type { Driver, FactoryOrder, GoodsReceipt, Product, StockItem } from '@/types';

describe('Centralized DTO Mappers', () => {
  describe('product.mapper', () => {
    it('correctly maps snake_case fields and trims strings', () => {
      const raw: RawApiProduct = {
        id: 'prod-1',
        barcode: '  470001  ',
        name: '  Пряники «Северные»  ',
        pieces_per_box: 24,
        expiry_date: '2026-12-31',
        batch_number: 'BATCH-99',
        factory_price: '150.50',
        status: 'active',
        stockQuantity: 100,
      };

      const result = mapApiProduct(raw);

      expect(result).toEqual({
        id: 'prod-1',
        barcode: '470001',
        name: 'Пряники «Северные»',
        boxQuantity: 24,
        expirationDate: '2026-12-31',
        batchNumber: 'BATCH-99',
        factoryPrice: 150.5,
        status: 'active',
        stockQuantity: 100,
      });
    });

    it('correctly merges stock item pieces and boxes', () => {
      const raw: RawApiProduct = {
        id: 'prod-2',
        barcode: '470002',
        name: 'Кекс «Столичный»',
        piecesPerBox: 12,
        factoryPrice: 45,
      };

      const stock: StockItem = {
        id: 1,
        productId: 2,
        productName: 'Кекс «Столичный»',
        barcode: '470002',
        piecesPerBox: 12,
        quantityBoxes: 5,
        quantityPieces: 60,
        driverPrice: 55,
        updatedAt: '2026-08-19',
      };

      const result = mapApiProduct(raw, stock);
      expect(result.stockQuantity).toBe(60);
      expect(result.boxQuantity).toBe(12);
    });

    it('falls back to local product stock when server stock is missing', () => {
      const raw: RawApiProduct = {
        id: 'prod-3',
        barcode: '470003',
        name: 'Печенье',
      };

      const local: Product = {
        id: 'prod-3',
        barcode: '470003',
        name: 'Печенье',
        boxQuantity: 10,
        expirationDate: '',
        batchNumber: '',
        factoryPrice: 20,
        status: 'active',
        stockQuantity: 42,
      };

      const result = mapApiProduct(raw, undefined, local);
      expect(result.stockQuantity).toBe(42);
    });
  });

  describe('order.mapper', () => {
    const mockProducts: Product[] = [
      {
        id: 'p-1',
        barcode: 'BAR-1',
        name: 'Кола 1.5л',
        boxQuantity: 6,
        expirationDate: '',
        batchNumber: '',
        factoryPrice: 50,
        status: 'active',
        stockQuantity: 100,
      },
    ];

    const mockDrivers: Driver[] = [
      {
        id: 'drv-1',
        fullName: 'Азамат Ибраимов',
        carNumber: '01KG123ABC',
        vehicleNumber: '01KG123ABC',
        currentDebt: 500,
      },
    ];

    it('maps raw order and resolves driver information and item totals', () => {
      const rawOrder: RawApiOrder = {
        id: 'order-101',
        driverId: 'drv-1',
        status: 'NEW',
        comment: 'Доставить до обеда',
        requestedAt: '2026-08-19T10:00:00Z',
        items: [
          {
            productId: 'p-1',
            approvedQty: 3, // 3 boxes * 6 pcs = 18 pcs
          },
        ],
      };

      const result = mapApiOrder(rawOrder, mockProducts, mockDrivers);

      expect(result.id).toBe('order-101');
      expect(result.driverName).toBe('Азамат Ибраимов');
      expect(result.vehicleNumber).toBe('01KG123ABC');
      expect(result.status).toBe('NEW');
      expect(result.notes).toBe('Доставить до обеда');
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual({
        barcode: 'BAR-1',
        productName: 'Кола 1.5л',
        quantity: 18,
        boxCount: 3, // 3 boxes
        unitPrice: 50,
        amount: 900, // 18 * 50 = 900
      });
      expect(result.totalAmount).toBe(900);
    });

    it('handles missing driver gracefully and falls back to driverId', () => {
      const rawOrder: RawApiOrder = {
        id: 'order-102',
        driverId: 'unknown-drv',
        status: 'CONFIRMED',
        items: [],
      };

      const result = mapApiOrder(rawOrder, mockProducts, mockDrivers);
      expect(result.driverName).toBe('unknown-drv');
      expect(result.vehicleNumber).toBeUndefined();
    });

    it('correctly maps box quantities to total pieces when server totalAmount indicates driver ordered in boxes', () => {
      const blueberryProduct: Product = {
        id: 'p-blueberry',
        barcode: 'BAR-BLUEBERRY',
        name: 'Черника',
        boxQuantity: 12,
        expirationDate: '',
        batchNumber: '',
        factoryPrice: 150,
        status: 'active',
        stockQuantity: 100,
      };

      const rawOrder: RawApiOrder = {
        id: 'order-amir',
        driverId: 'drv-1',
        status: 'CONFIRMED',
        totalAmount: 5400, // 3 boxes * 12 pcs * 150 som = 5400 som
        items: [
          {
            productId: 'p-blueberry',
            requestedQty: 3, // driver specified 3 boxes
          },
        ],
      };

      const result = mapApiOrder(rawOrder, [blueberryProduct], mockDrivers);
      expect(result.totalAmount).toBe(5400);
      expect(result.items[0].boxCount).toBe(3);
      expect(result.items[0].quantity).toBe(36); // 3 * 12 = 36 pcs
      expect(result.items[0].amount).toBe(5400); // 36 * 150 = 5400 som
    });

    it('correctly maps multi-item order in boxes with exact total 17400 som', () => {
      const testProducts: Product[] = [
        {
          id: 'p-vinograd',
          barcode: 'BAR-VIN',
          name: 'Виноград',
          boxQuantity: 12,
          expirationDate: '',
          batchNumber: '',
          driverPrice: 150,
          factoryPrice: 150,
          status: 'active',
          stockQuantity: 100,
        },
        {
          id: 'p-ananas',
          barcode: 'BAR-ANA',
          name: 'Ананас',
          boxQuantity: 14,
          expirationDate: '',
          batchNumber: '',
          driverPrice: 150,
          factoryPrice: 150,
          status: 'active',
          stockQuantity: 100,
        },
        {
          id: 'p-abrikos',
          barcode: 'BAR-ABR',
          name: 'Абрикос',
          boxQuantity: 14,
          expirationDate: '',
          batchNumber: '',
          driverPrice: 150,
          factoryPrice: 150,
          status: 'active',
          stockQuantity: 100,
        },
        {
          id: 'p-klubnika',
          barcode: 'BAR-KLU',
          name: 'Клубника',
          boxQuantity: 12,
          expirationDate: '',
          batchNumber: '',
          driverPrice: 150,
          factoryPrice: 150,
          status: 'active',
          stockQuantity: 100,
        },
      ];

      const rawOrder: RawApiOrder = {
        id: 'order-multi',
        driverId: 'drv-1',
        status: 'NEW',
        totalAmount: 17400,
        items: [
          { productId: 'p-vinograd', requestedQty: 3 },
          { productId: 'p-ananas', requestedQty: 2 },
          { productId: 'p-abrikos', requestedQty: 2 },
          { productId: 'p-klubnika', requestedQty: 2 },
        ],
      };

      const result = mapApiOrder(rawOrder, testProducts, mockDrivers);
      expect(result.totalAmount).toBe(17400);
      expect(result.items).toHaveLength(4);
      // Виноград: 3 кор * 12 шт * 150 = 5400
      expect(result.items[0].boxCount).toBe(3);
      expect(result.items[0].quantity).toBe(36);
      expect(result.items[0].amount).toBe(5400);
      // Ананас: 2 кор * 14 шт * 150 = 4200
      expect(result.items[1].boxCount).toBe(2);
      expect(result.items[1].quantity).toBe(28);
      expect(result.items[1].amount).toBe(4200);
      // Абрикос: 2 кор * 14 шт * 150 = 4200
      expect(result.items[2].boxCount).toBe(2);
      expect(result.items[2].quantity).toBe(28);
      expect(result.items[2].amount).toBe(4200);
      // Клубника: 2 кор * 12 шт * 150 = 3600
      expect(result.items[3].boxCount).toBe(2);
      expect(result.items[3].quantity).toBe(24);
      expect(result.items[3].amount).toBe(3600);
    });
  });

  describe('receipt.mapper', () => {
    const mockProducts: Product[] = [
      {
        id: 'p-10',
        barcode: 'BAR-10',
        name: 'Сок Яблочный',
        boxQuantity: 12,
        expirationDate: '',
        batchNumber: '',
        factoryPrice: 80,
        status: 'active',
        stockQuantity: 50,
      },
    ];

    it('maps completed factory order to GoodsReceipt entity', () => {
      const fo: FactoryOrder = {
        id: 'FO-555',
        date: '2026-08-19',
        status: 'delivered',
        items: [
          {
            productId: 'p-10',
            productName: 'Сок Яблочный',
            qty: 24,
          },
        ],
      };

      const result = mapFactoryOrderToReceipt(fo, mockProducts);

      expect(result.id).toBe('FO-555');
      expect(result.status).toBe('completed');
      expect(result.supplierName).toBe('Завод');
      expect(result.items).toHaveLength(1);
      expect(result.items[0].barcode).toBe('BAR-10');
      expect(result.items[0].expectedQuantity).toBe(24);
      expect(result.items[0].actualQuantity).toBe(24);
      expect(result.items[0].factoryPrice).toBe(80);
      expect(result.totalAmount).toBe(1920); // 24 * 80
    });
  });

  describe('mapApiServerReception & getDeliveredFactoryOrderIds', () => {
    const mockProducts: Product[] = [
      {
        id: 'p-1',
        barcode: 'BAR-1',
        name: 'Мороженое Виноград',
        boxQuantity: 12,
        expirationDate: '',
        batchNumber: '',
        factoryPrice: 100,
        status: 'active',
        stockQuantity: 50,
      },
    ];

    it('cleans offline- prefix from delivery_number and prioritizes client_id', () => {
      const reception = mapApiServerReception(
        {
          id: 'server-uuid-123',
          client_id: 'REC-20260821-9999',
          delivery_number: 'offline-REC-20260821-9999',
          delivered_at: '2026-08-21T10:00:00Z',
          warehouse_order_id: 'fo-123',
          items: [
            {
              product_id: 'p-1',
              expected_qty: 36,
              actual_qty: 36,
              factory_price: 100,
            },
          ],
        },
        mockProducts,
      );

      expect(reception.id).toBe('REC-20260821-9999');
      expect(reception.factoryOrderId).toBe('fo-123');
      expect(reception.items[0].quantityBoxes).toBe(3); // 36 / 12 = 3 boxes
      expect(reception.totalAmount).toBe(3600);
    });

    it('matches delivered factory order heuristically by items when factoryOrderId is not returned', () => {
      const serverOrder: FactoryOrder = {
        id: 'fo-server-1',
        date: '2026-08-21',
        status: 'pending',
        items: [{ productId: 'p-1', productName: 'Мороженое Виноград', qty: 3 }],
      };

      const serverReceipt: GoodsReceipt = {
        id: 'REC-20260821-9999',
        date: '2026-08-21',
        status: 'completed',
        supplierName: 'Завод',
        totalAmount: 3600,
        items: [
          {
            barcode: 'BAR-1',
            productName: 'Мороженое Виноград',
            quantityBoxes: 3,
            expectedQuantity: 36,
            actualQuantity: 36,
            discrepancyType: 'none',
            factoryPrice: 100,
          },
        ],
      };

      const deliveredIds = getDeliveredFactoryOrderIds([], [serverReceipt], [serverOrder]);
      expect(deliveredIds.has('fo-server-1')).toBe(true);

      const merged = mergeFactoryOrders([serverOrder], [], deliveredIds);
      expect(merged[0].status).toBe('delivered');
    });
  });
});
