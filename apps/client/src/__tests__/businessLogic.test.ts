/**
 * Юнит-тесты для критической финансовой бизнес-логики
 *
 * Тестируем pure-функции и алгоритмы без Dexie/React зависимостей
 * Ошибки в этих алгоритмах = реальные финансовые потери для Sapremo
 *
 * Покрытие:
 *  1. FIFO списание остатков по сроку годности
 *  2. Расчет долга водителя при выдаче товара
 *  3. Баланс кассы (приходы от водителей минус платежи заводу)
 *  4. Валидация схемы платежной формы (Zod)
 *  5. Создание задачи синхронизации (syncTask type-safety)
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import type { SyncPayload, SyncTask } from '@/types';

function applyFifoDeduction(
  products: { id: string; barcode: string; expirationDate: string; stockQuantity: number }[],
  requestedQty: number,
): { id: string; deduct: number }[] {
  const sorted = [...products].sort(
    (a, b) => new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime(),
  );

  const result: { id: string; deduct: number }[] = [];
  let remaining = requestedQty;

  for (const product of sorted) {
    if (remaining <= 0) break;
    const deduct = Math.min(product.stockQuantity, remaining);
    if (deduct > 0) {
      result.push({ id: product.id, deduct });
      remaining -= deduct;
    }
  }

  return result;
}

describe('FIFO: списание остатков по сроку годности', () => {
  const batch1 = { id: 'p1', barcode: 'B001', expirationDate: '2026-06-01', stockQuantity: 50 };
  const batch2 = { id: 'p2', barcode: 'B001', expirationDate: '2026-12-01', stockQuantity: 100 };
  const batch3 = { id: 'p3', barcode: 'B001', expirationDate: '2026-03-01', stockQuantity: 30 };

  it('должен списывать сначала с самым ранним сроком годности', () => {
    const result = applyFifoDeduction([batch1, batch2, batch3], 30);

    expect(result[0]).toEqual({ id: 'p3', deduct: 30 });
    expect(result).toHaveLength(1);
  });

  it('должен списывать с нескольких партий если одной не хватает', () => {
    const result = applyFifoDeduction([batch1, batch2, batch3], 60);

    expect(result[0]).toEqual({ id: 'p3', deduct: 30 });
    expect(result[1]).toEqual({ id: 'p1', deduct: 30 });
    expect(result).toHaveLength(2);
  });

  it('должен списать всё доступное количество если заявка больше запасов', () => {
    const result = applyFifoDeduction([batch3], 999);
    expect(result[0]).toEqual({ id: 'p3', deduct: 30 });
  });

  it('не должен ничего списывать при нулевом количестве на складе', () => {
    const emptyBatch = {
      id: 'p_empty',
      barcode: 'B001',
      expirationDate: '2026-01-01',
      stockQuantity: 0,
    };
    const result = applyFifoDeduction([emptyBatch], 10);
    expect(result).toHaveLength(0);
  });

  it('не должен списывать при запросе 0 единиц', () => {
    const result = applyFifoDeduction([batch1], 0);
    expect(result).toHaveLength(0);
  });

  it('должен корректно обрабатывать пустой список партий', () => {
    const result = applyFifoDeduction([], 100);
    expect(result).toHaveLength(0);
  });
});

function calculateNewDriverDebt(currentDebt: number, orderAmount: number): number {
  return (currentDebt || 0) + orderAmount;
}

describe('Долг водителя: расчет при выдаче товара', () => {
  it('должен правильно прибавлять долг к существующему', () => {
    expect(calculateNewDriverDebt(15400, 3480)).toBe(18880);
  });

  it('должен корректно работать с нулевым начальным долгом', () => {
    expect(calculateNewDriverDebt(0, 5000)).toBe(5000);
  });

  it('должен корректно работать когда currentDebt не определен', () => {
    expect(calculateNewDriverDebt(undefined as unknown as number, 2000)).toBe(2000);
  });

  it('результат должен быть больше чем был долг до выдачи', () => {
    const before = 10000;
    const result = calculateNewDriverDebt(before, 5000);
    expect(result).toBeGreaterThan(before);
  });
});

function calculateCashBalance(
  transactions: { type: 'driver_payment' | 'factory_payment'; amount: number }[],
): { cashBalance: number; driverPayments: number; factoryPayments: number } {
  let driverPayments = 0;
  let factoryPayments = 0;

  transactions.forEach((t) => {
    if (t.type === 'driver_payment') driverPayments += t.amount;
    else if (t.type === 'factory_payment') factoryPayments += t.amount;
  });

  return {
    cashBalance: driverPayments - factoryPayments,
    driverPayments,
    factoryPayments,
  };
}

describe('Баланс кассы: расчет из транзакций', () => {
  it('должен правильно считать баланс при смешанных транзакциях', () => {
    const txs = [
      { type: 'driver_payment' as const, amount: 150000 },
      { type: 'driver_payment' as const, amount: 50000 },
      { type: 'factory_payment' as const, amount: 80000 },
    ];
    const result = calculateCashBalance(txs);
    expect(result.driverPayments).toBe(200000);
    expect(result.factoryPayments).toBe(80000);
    expect(result.cashBalance).toBe(120000);
  });

  it('должен вернуть 0 при пустом списке транзакций', () => {
    const result = calculateCashBalance([]);
    expect(result.cashBalance).toBe(0);
    expect(result.driverPayments).toBe(0);
    expect(result.factoryPayments).toBe(0);
  });

  it('должен вернуть отрицательный баланс если выплатили заводу больше чем получили', () => {
    const txs = [
      { type: 'driver_payment' as const, amount: 10000 },
      { type: 'factory_payment' as const, amount: 50000 },
    ];
    const result = calculateCashBalance(txs);
    expect(result.cashBalance).toBe(-40000);
  });

  it('должен суммировать все платежи от водителей', () => {
    const txs = [
      { type: 'driver_payment' as const, amount: 1000 },
      { type: 'driver_payment' as const, amount: 2000 },
      { type: 'driver_payment' as const, amount: 3000 },
    ];
    const result = calculateCashBalance(txs);
    expect(result.driverPayments).toBe(6000);
    expect(result.factoryPayments).toBe(0);
  });
});

const paymentSchema = z.object({
  amount: z.number({ message: 'Введите сумму оплаты' }).min(1, 'Сумма должна быть больше 0'),
  date: z.string().min(1, 'Выберите дату'),
  paymentMethod: z.enum(['cash', 'transfer'], {
    message: 'Выберите способ оплаты',
  }),
  comment: z.string().optional(),
});

describe('Zod валидация: форма приема платежа от водителя', () => {
  it('должен принять корректные данные с комментарием', () => {
    const valid = {
      amount: 5000,
      date: '2026-06-25',
      paymentMethod: 'cash' as const,
      comment: 'Аванс за июнь',
    };
    expect(() => paymentSchema.parse(valid)).not.toThrow();
  });

  it('должен принять платеж без комментария (поле optional)', () => {
    const valid = { amount: 1000, date: '2026-06-25', paymentMethod: 'transfer' as const };
    expect(() => paymentSchema.parse(valid)).not.toThrow();
  });

  it('должен отклонить нулевую сумму', () => {
    const invalid = { amount: 0, date: '2026-06-25', paymentMethod: 'cash' };
    const result = paymentSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Сумма должна быть больше 0');
    }
  });

  it('должен отклонить отрицательную сумму', () => {
    const result = paymentSchema.safeParse({
      amount: -100,
      date: '2026-06-25',
      paymentMethod: 'cash',
    });
    expect(result.success).toBe(false);
  });

  it('должен отклонить неверный способ оплаты и метод card', () => {
    const result = paymentSchema.safeParse({
      amount: 1000,
      date: '2026-06-25',
      paymentMethod: 'card',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Выберите способ оплаты');
    }
  });

  it('должен принять допустимые методы оплаты (cash, transfer)', () => {
    const methods = ['cash', 'transfer'] as const;
    methods.forEach((method) => {
      const result = paymentSchema.safeParse({
        amount: 100,
        date: '2026-06-25',
        paymentMethod: method,
      });
      expect(result.success).toBe(true);
    });
  });

  it('должен отклонить строку вместо числа в поле amount', () => {
    const result = paymentSchema.safeParse({
      amount: '5000',
      date: '2026-06-25',
      paymentMethod: 'cash',
    });
    expect(result.success).toBe(false);
  });
});

function createSyncTask(payload: SyncPayload, now = new Date().toISOString()): SyncTask {
  return {
    ...payload,
    createdAt: now,
    status: 'pending',
    retryCount: 0,
  };
}

describe('SyncTask: создание и структура задачи синхронизации', () => {
  it('должен создать задачу со статусом pending и retryCount=0', () => {
    const payload: SyncPayload = {
      action: 'CREATE_PAYMENT',
      payload: {
        id: 'tx_test',
        amount: 5000,
        date: '2026-06-25T10:00:00Z',
        type: 'driver_payment',
        paymentMethod: 'cash',
        driverId: 'driver_1',
        driverName: 'Иванов Алмаз',
      },
    };
    const task = createSyncTask(payload, '2026-06-25T10:00:00Z');

    expect(task.action).toBe('CREATE_PAYMENT');
    expect(task.status).toBe('pending');
    expect(task.retryCount).toBe(0);
    expect(task.createdAt).toBe('2026-06-25T10:00:00Z');
    expect(task.id).toBeUndefined();
  });

  it('должен сохранять все поля payload неизменными', () => {
    const payload: SyncPayload = {
      action: 'UPDATE_ORDER',
      payload: { id: 'order_1', status: 'CONFIRMED' },
    };
    const task = createSyncTask(payload);
    expect(task.payload).toMatchObject({ id: 'order_1', status: 'CONFIRMED' });
  });

  it('должен иметь корректный формат createdAt (ISO 8601)', () => {
    const payload: SyncPayload = {
      action: 'CREATE_RECEIPT',
      payload: {
        id: 'r1',
        date: '2026-06-25',
        items: [],
        totalAmount: 0,
        status: 'completed',
      },
    };
    const task = createSyncTask(payload);
    expect(() => new Date(task.createdAt)).not.toThrow();
    expect(new Date(task.createdAt).getTime()).not.toBeNaN();
  });
});

function reconcileDriverDebt(
  driverId: string,
  rawDriverDebt: number | undefined,
  serverDebtFromDebtsEndpoint: number | undefined,
  localDebt: number | undefined,
  hasPendingSyncTasks: boolean,
): number {
  if (hasPendingSyncTasks && localDebt !== undefined && Number.isFinite(localDebt)) {
    return localDebt;
  }
  if (serverDebtFromDebtsEndpoint !== undefined && Number.isFinite(serverDebtFromDebtsEndpoint)) {
    return Math.max(0, serverDebtFromDebtsEndpoint);
  }
  const fallback = Number(rawDriverDebt ?? 0);
  if (localDebt !== undefined && localDebt > 0 && fallback === 0) {
    return localDebt;
  }
  return Number.isFinite(fallback) ? Math.max(0, fallback) : 0;
}

describe('Синхронизация долгов водителей (Reconciliation)', () => {
  it('должен использовать долг из /api/drivers/debts когда он доступен', () => {
    const debt = reconcileDriverDebt('d1', 0, 247764, 0, false);
    expect(debt).toBe(247764);
  });

  it('должен сохранять локальный долг при наличии незавершенных задач в syncQueue (Offline Mutex)', () => {
    const debt = reconcileDriverDebt('d1', 0, 247764, 150000, true);
    expect(debt).toBe(150000);
  });

  it('должен использовать локальный сохраненный долг если эндпоинт долгов недоступен и сервер вернул 0', () => {
    const debt = reconcileDriverDebt('d1', 0, undefined, 50000, false);
    expect(debt).toBe(50000);
  });

  it('должен защищать от отрицательных и нечисловых значений долга', () => {
    expect(reconcileDriverDebt('d1', -100, -500, undefined, false)).toBe(0);
    expect(reconcileDriverDebt('d1', NaN, NaN, undefined, false)).toBe(0);
  });
});

describe('Возвраты: расчет коробок, штук и суммы', () => {
  const mockProduct = {
    id: 'p1',
    barcode: 'BARCODE_1',
    name: 'Мороженое Пломбир',
    boxQuantity: 12,
    factoryPrice: 150,
  };

  function calculateReturnItem(boxCount: number, loosePieces: number, product: typeof mockProduct) {
    const piecesPerBox = product.boxQuantity || 1;
    const totalPieces = boxCount * piecesPerBox + loosePieces;
    const amount = totalPieces * product.factoryPrice;
    return { totalPieces, amount };
  }

  it('должен корректно рассчитывать 1 коробку и 0 отдельных штук (12 шт = 1800 сом)', () => {
    const { totalPieces, amount } = calculateReturnItem(1, 0, mockProduct);
    expect(totalPieces).toBe(12);
    expect(amount).toBe(1800);
  });

  it('должен корректно рассчитывать 2 коробки и 3 отдельных штуки (27 шт = 4050 сом)', () => {
    const { totalPieces, amount } = calculateReturnItem(2, 3, mockProduct);
    expect(totalPieces).toBe(27);
    expect(amount).toBe(4050);
  });

  it('должен корректно рассчитывать 0 коробок и 5 отдельных штук (5 шт = 750 сом)', () => {
    const { totalPieces, amount } = calculateReturnItem(0, 5, mockProduct);
    expect(totalPieces).toBe(5);
    expect(amount).toBe(750);
  });
});

describe('Заявки на завод: заказ в коробках и расчет поставки', () => {
  const mockProduct = {
    id: 'p2',
    barcode: 'BARCODE_2',
    name: 'Эскимо Шоколадное',
    boxQuantity: 24,
    factoryPrice: 50,
  };

  it('должен рассчитывать 5 коробок как 120 штук на сумму 6000 сом', () => {
    const orderedBoxes = 5;
    const totalPieces = orderedBoxes * mockProduct.boxQuantity;
    const totalSum = totalPieces * mockProduct.factoryPrice;

    expect(totalPieces).toBe(120);
    expect(totalSum).toBe(6000);
  });
});
