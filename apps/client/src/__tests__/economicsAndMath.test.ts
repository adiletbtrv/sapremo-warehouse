import { describe, it, expect } from 'vitest';
import { roundCurrency } from '@/utils/money';
import { calculateFactoryDebtSummary } from '@/hooks/useFactoryDebtSummary';
import { toBoxes } from '@/utils/inventory';
import type { Product, GoodsReceipt, Transaction, ProductReturn } from '@/types';

describe('Warehouse Economics and Mathematical Calculations', () => {
  describe('1. Box and Piece Unit Conversions', () => {
    it('accurately converts loose pieces to box counts according to boxQuantity', () => {
      const product: Product = {
        id: 'p-1',
        name: 'Пломбир Шоколадный',
        barcode: '470000001',
        stockQuantity: 116,
        factoryPrice: 150,
        boxQuantity: 12,
        expirationDate: '2026-12-31',
        batchNumber: 'B1',
        status: 'active',
        isArchived: false,
      };

      // 116 pieces with 12 pcs/box = 9 boxes (108 pcs) + 8 loose pieces
      const boxes = toBoxes(product);
      expect(boxes).toBe(9); // Math.floor(116 / 12) = 9 full boxes
    });

    it('handles products with single piece per box or undefined boxQuantity', () => {
      const product: Product = {
        id: 'p-2',
        name: 'Торт мороженое',
        barcode: '470000002',
        stockQuantity: 15,
        factoryPrice: 500,
        boxQuantity: 1,
        expirationDate: '2026-12-31',
        batchNumber: 'B2',
        status: 'active',
        isArchived: false,
      };

      expect(toBoxes(product)).toBe(15);
    });

    it('calculates total order value correctly when order is counted in boxes', () => {
      const product: Product = {
        id: 'p-1',
        name: 'Эскимо',
        barcode: '470000003',
        stockQuantity: 200,
        factoryPrice: 35, // 35 som per piece
        boxQuantity: 20, // 20 pcs per box -> 700 som per box
        expirationDate: '2026-12-31',
        batchNumber: 'B3',
        status: 'active',
        isArchived: false,
      };

      const requestedBoxes = 5;
      const totalPieces = requestedBoxes * product.boxQuantity;
      const boxPrice = roundCurrency(product.boxQuantity * product.factoryPrice);
      const totalAmountByBoxes = roundCurrency(requestedBoxes * boxPrice);
      const totalAmountByPieces = roundCurrency(totalPieces * product.factoryPrice);

      expect(totalPieces).toBe(100);
      expect(boxPrice).toBe(700);
      expect(totalAmountByBoxes).toBe(3500);
      expect(totalAmountByPieces).toBe(3500);
    });
  });

  describe('2. Driver Financial Lifecycle (Order -> Payment -> Return -> Debt)', () => {
    it('correctly tracks driver debt through complete lifecycle', () => {
      let driverDebt = 0;

      // 1. Driver takes order: 9 boxes of ice cream (12 pcs/box, 150 som/piece = 1800 som/box)
      const orderAmount = roundCurrency(9 * 12 * 150); // 16,200 som
      driverDebt = roundCurrency(driverDebt + orderAmount);
      expect(driverDebt).toBe(16200);

      // 2. Driver makes partial payment: 10,000 som
      const paymentAmount = 10000;
      driverDebt = roundCurrency(driverDebt - paymentAmount);
      expect(driverDebt).toBe(6200);

      // 3. Driver returns unsold 1 box (12 pcs * 150 = 1800 som) and 2 damaged pieces (2 * 150 = 300 som)
      const returnPieces = 1 * 12 + 2; // 14 pieces
      const returnAmount = roundCurrency(returnPieces * 150); // 2100 som
      driverDebt = roundCurrency(driverDebt - returnAmount);
      expect(driverDebt).toBe(4100);

      // 4. Driver makes final settlement payment: 4100 som
      driverDebt = roundCurrency(driverDebt - 4100);
      expect(driverDebt).toBe(0);
    });

    it('correctly records driver overpayment (negative debt)', () => {
      let driverDebt = 5000;
      const payment = 6000;
      driverDebt = roundCurrency(driverDebt - payment);

      expect(driverDebt).toBe(-1000);
      expect(driverDebt < 0).toBe(true);
    });
  });

  describe('3. Factory Financial Lifecycle (Reception -> Payment -> Return -> Debt)', () => {
    it('accurately computes factory debt with multiple products, payments and returns', () => {
      const products: Product[] = [
        {
          id: 'prod-a',
          name: 'Рожок Клубничный',
          barcode: '470001',
          stockQuantity: 300,
          factoryPrice: 45.5,
          boxQuantity: 24,
          expirationDate: '2026-12-31',
          batchNumber: 'FA1',
          status: 'active',
          isArchived: false,
        },
        {
          id: 'prod-b',
          name: 'Стаканчик Пломбир',
          barcode: '470002',
          stockQuantity: 500,
          factoryPrice: 28.25,
          boxQuantity: 30,
          expirationDate: '2026-12-31',
          batchNumber: 'FB1',
          status: 'active',
          isArchived: false,
        },
      ];

      // Reception 1: 10 boxes of Prod A (240 pcs * 45.5 = 10,920 som) + 15 boxes of Prod B (450 pcs * 28.25 = 12,712.50 som)
      const receipts: GoodsReceipt[] = [
        {
          id: 'REC-100',
          date: '2026-08-20T10:00:00Z',
          items: [
            {
              barcode: '470001',
              productName: 'Рожок Клубничный',
              expectedQuantity: 240,
              actualQuantity: 240,
              discrepancyType: 'none',
              factoryPrice: 45.5,
            },
            {
              barcode: '470002',
              productName: 'Стаканчик Пломбир',
              expectedQuantity: 450,
              actualQuantity: 450,
              discrepancyType: 'none',
              factoryPrice: 28.25,
            },
          ],
          totalAmount: 23632.5,
          status: 'completed',
          isArchived: false,
        },
      ];

      // Factory payment: 15,000 som
      const transactions: Transaction[] = [
        {
          id: 'TX-F1',
          type: 'factory_payment',
          amount: 15000,
          date: '2026-08-20T14:00:00Z',
          paymentMethod: 'transfer',
          isArchived: false,
        },
      ];

      // Factory return ( брак на завод ): 2 boxes of Prod A (48 pcs * 45.5 = 2184 som)
      const returns: ProductReturn[] = [
        {
          id: 'RET-F100',
          returnType: 'to_factory',
          date: '2026-08-21T09:00:00Z',
          items: [
            {
              barcode: '470001',
              productName: 'Рожок Клубничный',
              quantity: 48,
              boxCount: 2,
              unitPrice: 45.5,
              amount: 2184,
              reason: 'defective',
            },
          ],
          totalAmount: 2184,
          isArchived: false,
          isSynced: true,
        },
      ];

      const summary = calculateFactoryDebtSummary(products, receipts, transactions, [], returns);

      expect(summary.receivedAmount).toBe(23632.5);
      expect(summary.paidAmount).toBe(15000);
      // Debt = 23632.50 - 15000 - 2184 = 6448.50 som
      expect(summary.debt).toBe(6448.5);
      expect(summary.isOverpaid).toBe(false);
      expect(summary.displayAmount).toBe(6448.5);
    });
  });

  describe('4. Cashbox Financial Invariants', () => {
    it('maintains strict cash balance across diverse transactions', () => {
      let cashBalance = 0;

      const transactions: { type: string; amount: number }[] = [
        { type: 'driver_payment', amount: 5400.5 },
        { type: 'driver_payment', amount: 12100.25 },
        { type: 'income', amount: 500 },
        { type: 'factory_payment', amount: 10000 },
        { type: 'expense', amount: 350.75 },
      ];

      transactions.forEach((t) => {
        if (t.type === 'driver_payment' || t.type === 'income') {
          cashBalance = roundCurrency(cashBalance + t.amount);
        } else if (t.type === 'factory_payment' || t.type === 'expense') {
          cashBalance = roundCurrency(cashBalance - t.amount);
        }
      });

      // Total in: 5400.50 + 12100.25 + 500 = 18000.75
      // Total out: 10000 + 350.75 = 10350.75
      // Net balance: 7650.00
      expect(cashBalance).toBe(7650);
    });

    it('prevents standard IEEE-754 floating point arithmetic errors in currency rounding', () => {
      // 0.1 + 0.2 in JS is 0.30000000000000004
      const floatSum = 0.1 + 0.2;
      expect(floatSum).not.toBe(0.3);
      expect(roundCurrency(floatSum)).toBe(0.3);

      // (19.99 * 3) = 59.970000000000006
      expect(roundCurrency(19.99 * 3)).toBe(59.97);

      // (100.05 - 100.00) = 0.05000000000000426
      expect(roundCurrency(100.05 - 100.0)).toBe(0.05);
    });
  });
});
