import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import { roundCurrency } from '@/utils/money';
import type { Product, GoodsReceipt, Transaction, FactoryOrder, ProductReturn } from '@/types';

export interface FactoryDebtSummary {
  receivedAmount: number;
  paidAmount: number;
  debt: number;
  isOverpaid: boolean;
  displayAmount: number;
  isLoading?: boolean;
}

export function calculateFactoryDebtSummary(
  products: Product[] = [],
  receipts: GoodsReceipt[] = [],
  transactions: Transaction[] = [],
  factoryOrders: FactoryOrder[] = [],
  returns: ProductReturn[] = [],
): Omit<FactoryDebtSummary, 'isLoading'> {
  const productById = new Map(products.map((p) => [p.id, p]));

  const receiptsAmount = receipts.reduce(
    (acc, r) =>
      acc +
      (r.items || []).reduce(
        (s, item) => s + (item.actualQuantity || 0) * (item.factoryPrice || 0),
        0,
      ),
    0,
  );

  const factoryDeliveredAmount = factoryOrders
    .filter((fo) =>
      ['approved', 'completed', 'delivered', 'accepted'].includes(String(fo.status).toLowerCase()),
    )
    .reduce((acc, fo) => {
      return (
        acc +
        (fo.items || []).reduce((s, item) => {
          const prod =
            productById.get(item.productId) ?? products.find((p) => p.name === item.productName);
          const price = prod?.factoryPrice ?? 0;
          const piecesPerBox = prod?.boxQuantity && prod.boxQuantity > 0 ? prod.boxQuantity : 1;
          const totalPieces = (item.qty ?? 0) * piecesPerBox;
          return s + totalPieces * price;
        }, 0)
      );
    }, 0);

  const receivedAmount = roundCurrency(Math.max(receiptsAmount, factoryDeliveredAmount));

  let paidAmount = 0;
  transactions.forEach((t) => {
    if (t.type === 'factory_payment') {
      paidAmount += t.amount || 0;
    }
  });
  paidAmount = roundCurrency(paidAmount);

  const returnsToFactoryAmount = returns
    .filter((r) => r.returnType === 'to_factory' && !r.isArchived)
    .reduce((acc, r) => acc + (r.totalAmount || 0), 0);

  const debt = roundCurrency(receivedAmount - paidAmount - returnsToFactoryAmount);
  const isOverpaid = debt < 0;
  const displayAmount = roundCurrency(Math.abs(debt));

  return {
    receivedAmount,
    paidAmount,
    debt,
    isOverpaid,
    displayAmount,
  };
}

export function useFactoryDebtSummary(): FactoryDebtSummary {
  const summary = useLiveQuery(async () => {
    const [products, receipts, transactions, factoryOrders, returns, serverSummary] =
      await Promise.all([
        db.products.filter((p) => !p.isArchived).toArray(),
        db.receipts.filter((r) => !r.isArchived).toArray(),
        db.transactions.filter((t) => !t.isArchived).toArray(),
        db.factoryOrders.filter((fo) => !fo.isArchived).toArray(),
        db.returns.filter((r) => !r.isArchived).toArray(),
        db.dashboardSummary.get('current'),
      ]);

    const localSummary = calculateFactoryDebtSummary(
      products,
      receipts,
      transactions,
      factoryOrders,
      returns,
    );

    // Server wins: если на сервере есть ненулевое значение factoryDebt, используем его;
    // иначе используем точный расчет по накладным/заявкам/транзакциям из базы
    if (
      serverSummary &&
      typeof serverSummary.factoryDebt === 'number' &&
      Number.isFinite(serverSummary.factoryDebt) &&
      serverSummary.factoryDebt !== 0
    ) {
      const serverDebt = serverSummary.factoryDebt;
      const isOverpaid = serverDebt < 0;
      return {
        receivedAmount: localSummary.receivedAmount,
        paidAmount: localSummary.paidAmount,
        debt: serverDebt,
        isOverpaid,
        displayAmount: roundCurrency(Math.abs(serverDebt)),
      };
    }

    return localSummary;
  }, []);

  return {
    receivedAmount: summary?.receivedAmount ?? 0,
    paidAmount: summary?.paidAmount ?? 0,
    debt: summary?.debt ?? 0,
    isOverpaid: summary?.isOverpaid ?? false,
    displayAmount: summary?.displayAmount ?? 0,
    isLoading: summary === undefined,
  };
}
