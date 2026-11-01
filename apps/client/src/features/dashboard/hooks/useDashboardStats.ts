import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import { LOW_STOCK_BOX_THRESHOLD } from '@/constants';
import { toBoxes } from '@/utils/inventory';
import type { TopProduct, TopDriver } from '../types';

export function useDashboardStats() {
  return useLiveQuery(
    async () => {
      try {
        const [
          products,
          drivers,
          pendingOrders,
          allIssuedOrders,
          receipts,
          transactions,
          factoryOrders,
          returns,
          serverSummary,
        ] = await Promise.all([
          db.products.filter((p) => !p.isArchived && p.status !== 'inactive').toArray(),
          db.drivers.filter((d) => !d.isArchived).toArray(),
          db.orders
            .filter((o) => (o.status === 'NEW' || o.status === 'MODIFIED') && !o.isArchived)
            .toArray(),
          db.orders
            .filter((o) => ['CONFIRMED', 'DISPATCHED'].includes(o.status) && !o.isArchived)
            .toArray(),
          db.receipts.filter((r) => !r.isArchived).toArray(),
          db.transactions.filter((t) => !t.isArchived).toArray(),
          db.factoryOrders.filter((fo) => !fo.isArchived).toArray(),
          db.returns.filter((r) => !r.isArchived).toArray(),
          db.dashboardSummary.get('current'),
        ]);

        const productByBarcode = new Map(products.map((p) => [p.barcode, p]));
        const productById = new Map(products.map((p) => [p.id, p]));

        const stockItems = products
          .filter((p) => (p.stockQuantity ?? 0) > 0)
          .reduce((acc, p) => acc + toBoxes(p), 0);

        const lowStockProducts = products.filter((p) => toBoxes(p) <= LOW_STOCK_BOX_THRESHOLD);

        const lowStockAlerts = lowStockProducts.length;
        const totalDriverDebt = drivers.reduce((acc, d) => acc + d.currentDebt, 0);

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
            ['approved', 'completed', 'delivered', 'accepted'].includes(
              String(fo.status).toLowerCase(),
            ),
          )
          .reduce((acc, fo) => {
            return (
              acc +
              (fo.items || []).reduce((s, item) => {
                const prod =
                  productById.get(item.productId) ??
                  products.find((p) => p.name === item.productName);
                const price = prod?.factoryPrice ?? 0;
                const piecesPerBox =
                  prod?.boxQuantity && prod.boxQuantity > 0 ? prod.boxQuantity : 1;
                const totalPieces = (item.qty ?? 0) * piecesPerBox;
                return s + totalPieces * price;
              }, 0)
            );
          }, 0);

        const totalReceiptsAmount = Math.max(receiptsAmount, factoryDeliveredAmount);

        let driverPayments = 0;
        let factoryPayments = 0;
        transactions.forEach((t) => {
          if (t.type === 'driver_payment') driverPayments += t.amount || 0;
          else if (t.type === 'factory_payment') factoryPayments += t.amount || 0;
        });

        const productMap = new Map<string, { name: string; qty: number; amount: number }>();
        allIssuedOrders.forEach((order) => {
          (order.items || []).forEach((item) => {
            const prod = productByBarcode.get(item.barcode);
            const boxQty =
              item.boxCount > 0
                ? item.boxCount
                : prod?.boxQuantity && prod.boxQuantity > 0
                  ? Math.floor(item.quantity / prod.boxQuantity)
                  : item.quantity;
            const prev = productMap.get(item.barcode) ?? {
              name: item.productName,
              qty: 0,
              amount: 0,
            };
            productMap.set(item.barcode, {
              name: item.productName,
              qty: prev.qty + boxQty,
              amount: prev.amount + (item.amount || 0),
            });
          });
        });
        const topProducts: TopProduct[] = Array.from(productMap.values())
          .sort((a, b) => b.qty - a.qty)
          .map((p, i) => ({ rank: i + 1, ...p }));

        const driverMap = new Map<string, TopDriver>();

        drivers.forEach((d) => {
          driverMap.set(d.id, {
            driverId: d.id,
            name: d.fullName,
            vehicleNumber: d.vehicleNumber ?? '—',
            qty: 0,
            amount: 0,
          });
        });

        allIssuedOrders.forEach((order) => {
          const prev = driverMap.get(order.driverId) ?? {
            driverId: order.driverId,
            name: order.driverName,
            vehicleNumber: order.vehicleNumber ?? '—',
            qty: 0,
            amount: 0,
          };
          const orderQty = (order.items || []).reduce((s, i) => {
            const prod = productByBarcode.get(i.barcode);
            const boxQty =
              i.boxCount > 0
                ? i.boxCount
                : prod?.boxQuantity && prod.boxQuantity > 0
                  ? Math.floor(i.quantity / prod.boxQuantity)
                  : i.quantity;
            return s + boxQty;
          }, 0);
          driverMap.set(order.driverId, {
            ...prev,
            qty: prev.qty + orderQty,
            amount: prev.amount + (order.totalAmount || 0),
          });
        });
        const topDrivers: TopDriver[] = Array.from(driverMap.values()).sort(
          (a, b) => b.amount - a.amount || b.qty - a.qty,
        );

        // Server wins: используем серверные агрегаты из db.dashboardSummary если они ненулевые,
        // либо агрегируем по реальным синхронизированным данным водителей/накладных
        const returnsToFactoryAmount = returns
          .filter((r) => r.returnType === 'to_factory')
          .reduce((acc, r) => acc + (r.totalAmount || 0), 0);

        const localFactoryDebt = totalReceiptsAmount - factoryPayments - returnsToFactoryAmount;
        const localCashBalance = driverPayments - factoryPayments;

        // Если у водителей в базе currentDebt равен 0 (из-за перетирания сервером),
        // рассчитываем реальный математический долг по выданным заказам, оплатам и возвратам
        const calculatedDriversDebt = drivers.reduce((acc, d) => {
          if (d.currentDebt > 0) return acc + d.currentDebt;
          const driverOrdersTotal = allIssuedOrders
            .filter((o) => o.driverId === d.id)
            .reduce((sum, o) => sum + (o.totalAmount || 0), 0);
          const driverPaymentsTotal = transactions
            .filter((t) => String(t.driverId) === d.id && t.type === 'driver_payment')
            .reduce((sum, t) => sum + (t.amount || 0), 0);
          const driverReturnsTotal = returns
            .filter((r) => String(r.driverId) === d.id && r.returnType === 'from_driver')
            .reduce((sum, r) => sum + (r.totalAmount || 0), 0);
          return acc + Math.max(0, driverOrdersTotal - driverPaymentsTotal - driverReturnsTotal);
        }, 0);

        const effectiveTotalDriverDebt = Math.max(totalDriverDebt, calculatedDriversDebt);

        const isNonZeroFiniteNumber = (value: unknown): value is number =>
          typeof value === 'number' && Number.isFinite(value) && value !== 0;

        const factoryDebt = isNonZeroFiniteNumber(serverSummary?.factoryDebt)
          ? serverSummary.factoryDebt
          : localFactoryDebt;

        const cashBalance = isNonZeroFiniteNumber(serverSummary?.cashBalance)
          ? serverSummary.cashBalance
          : localCashBalance;

        const driverDebt = isNonZeroFiniteNumber(serverSummary?.totalDriversDebt)
          ? serverSummary.totalDriversDebt
          : effectiveTotalDriverDebt;

        return {
          isInitialized: true,
          stockItems,
          activeDrivers: drivers.length,
          totalDriverDebt: driverDebt,
          lowStockAlerts,
          cashBalance,
          factoryDebt,
          pendingOrders,
          topProducts,
          topDrivers,
          lowStockProducts,
          error: undefined,
        };
      } catch (err) {
        console.error('[useDashboardStats] Failed to compute stats', err);
        return {
          isInitialized: true,
          stockItems: 0,
          activeDrivers: 0,
          totalDriverDebt: 0,
          lowStockAlerts: 0,
          cashBalance: 0,
          factoryDebt: 0,
          pendingOrders: [],
          topProducts: [],
          topDrivers: [],
          lowStockProducts: [],
          error: err instanceof Error ? err : new Error(String(err)),
        };
      }
    },
    [],
    {
      isInitialized: false,
      stockItems: 0,
      activeDrivers: 0,
      totalDriverDebt: 0,
      lowStockAlerts: 0,
      cashBalance: 0,
      factoryDebt: 0,
      pendingOrders: [],
      topProducts: [],
      topDrivers: [],
      lowStockProducts: [],
      error: undefined,
    },
  );
}
