import { describe, it, expect } from 'vitest';
import { calculateFactoryDebtSummary } from '@/hooks/useFactoryDebtSummary';
import type { GoodsReceipt, Transaction, FactoryOrder, Product } from '@/types';

describe('Factory Debt & Overpayment Logic', () => {
  it('calculates positive factory debt when goods received exceed payments made', () => {
    const products: Product[] = [
      {
        id: 'prod-1',
        name: 'Пломбир Ванильный',
        barcode: '111222333',
        stockQuantity: 100,
        factoryPrice: 40,
        boxQuantity: 20,
        expirationDate: '2026-12-31',
        batchNumber: 'B1',
        status: 'active',
        isArchived: false,
      },
    ];

    const receipts: GoodsReceipt[] = [
      {
        id: 'REC-1',
        date: new Date().toISOString(),
        items: [
          {
            barcode: '111222333',
            productName: 'Пломбир Ванильный',
            expectedQuantity: 100,
            actualQuantity: 100,
            discrepancyType: 'none',
            factoryPrice: 40,
          },
        ],
        totalAmount: 4000,
        status: 'completed',
        isArchived: false,
      },
    ];

    const transactions: Transaction[] = [
      {
        id: 'TX-1',
        type: 'factory_payment',
        amount: 1500,
        date: new Date().toISOString(),
        paymentMethod: 'cash',
        comment: 'Частичная оплата заводу',
        isArchived: false,
      },
    ];

    const summary = calculateFactoryDebtSummary(products, receipts, transactions, []);

    expect(summary.receivedAmount).toBe(4000);
    expect(summary.paidAmount).toBe(1500);
    expect(summary.debt).toBe(2500);
    expect(summary.isOverpaid).toBe(false);
    expect(summary.displayAmount).toBe(2500);
  });

  it('detects factory overpayment when payments made exceed goods received', () => {
    const products: Product[] = [
      {
        id: 'prod-1',
        name: 'Пломбир',
        barcode: '111222333',
        stockQuantity: 50,
        factoryPrice: 40,
        boxQuantity: 20,
        expirationDate: '2026-12-31',
        batchNumber: 'B1',
        status: 'active',
        isArchived: false,
      },
    ];

    const receipts: GoodsReceipt[] = [
      {
        id: 'REC-2',
        date: new Date().toISOString(),
        items: [
          {
            barcode: '111222333',
            productName: 'Пломбир',
            expectedQuantity: 50,
            actualQuantity: 50,
            discrepancyType: 'none',
            factoryPrice: 40,
          },
        ],
        totalAmount: 2000,
        status: 'completed',
        isArchived: false,
      },
    ];

    const transactions: Transaction[] = [
      {
        id: 'TX-2',
        type: 'factory_payment',
        amount: 5000,
        date: new Date().toISOString(),
        paymentMethod: 'transfer',
        comment: 'Авансовый платеж заводу',
        isArchived: false,
      },
    ];

    const summary = calculateFactoryDebtSummary(products, receipts, transactions, []);

    expect(summary.receivedAmount).toBe(2000);
    expect(summary.paidAmount).toBe(5000);
    expect(summary.debt).toBe(-3000);
    expect(summary.isOverpaid).toBe(true);
    expect(summary.displayAmount).toBe(3000);
  });

  it('accurately accounts for delivered factory orders when receipts are reconstructed', () => {
    const products: Product[] = [
      {
        id: 'prod-2',
        name: 'Эскимо',
        barcode: '999888777',
        stockQuantity: 50,
        factoryPrice: 50,
        boxQuantity: 10,
        expirationDate: '2026-12-31',
        batchNumber: 'B2',
        status: 'active',
        isArchived: false,
      },
    ];

    const factoryOrders: FactoryOrder[] = [
      {
        id: 'FO-100',
        date: new Date().toISOString(),
        status: 'approved',
        items: [
          {
            productId: 'prod-2',
            productName: 'Эскимо',
            qty: 4,
          },
        ],
        isArchived: false,
      },
    ];

    const summary = calculateFactoryDebtSummary(products, [], [], factoryOrders);

    expect(summary.receivedAmount).toBe(2000); // 4 boxes * 10 pcs * 50 som = 2000
    expect(summary.paidAmount).toBe(0);
    expect(summary.debt).toBe(2000);
    expect(summary.isOverpaid).toBe(false);
  });

  it('correctly reduces factory debt when goods are returned to factory', () => {
    const products: Product[] = [
      {
        id: 'prod-1',
        name: 'Пломбир',
        barcode: '111222333',
        stockQuantity: 100,
        factoryPrice: 40,
        boxQuantity: 20,
        expirationDate: '2026-12-31',
        batchNumber: 'B1',
        status: 'active',
        isArchived: false,
      },
    ];

    const receipts: GoodsReceipt[] = [
      {
        id: 'REC-1',
        date: new Date().toISOString(),
        items: [
          {
            barcode: '111222333',
            productName: 'Пломбир',
            expectedQuantity: 100,
            actualQuantity: 100,
            discrepancyType: 'none',
            factoryPrice: 40,
          },
        ],
        totalAmount: 4000,
        status: 'completed',
        isArchived: false,
      },
    ];

    const factoryReturns = [
      {
        id: 'RET-F1',
        returnType: 'to_factory' as const,
        date: new Date().toISOString(),
        items: [
          {
            barcode: '111222333',
            productName: 'Пломбир',
            quantity: 20,
            boxCount: 1,
            unitPrice: 40,
            amount: 800,
            reason: 'damaged' as const,
          },
        ],
        totalAmount: 800,
        isArchived: false,
        isSynced: true,
      },
    ];

    const summary = calculateFactoryDebtSummary(products, receipts, [], [], factoryReturns);

    expect(summary.receivedAmount).toBe(4000);
    expect(summary.paidAmount).toBe(0);
    expect(summary.debt).toBe(3200); // 4000 - 800 = 3200
  });
});
