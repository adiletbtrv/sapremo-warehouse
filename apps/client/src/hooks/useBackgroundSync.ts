import { useEffect } from 'react';
import { useSyncStore } from '@/store/syncStore';
import { fetchInitialData } from '@/api/sync';
import { db } from '@/db/schema';
import { mergeServerOrders } from '@/db/repository';
import { logger } from '@/utils/logger';

const POLLING_INTERVAL_MS = 10_000;

let activePull: Promise<void> | null = null;
let pullRequestedWhileActive = false;

async function runPullSync(): Promise<void> {
  const store = useSyncStore.getState();

  if (!store.isOnline) {
    try {
      await fetchInitialData();
      store.setOnlineStatus(true);
    } catch {
      return;
    }
  }

  try {
    await store.processQueue();
  } catch (error) {
    logger.error('[BackgroundSync] Failed to process sync queue:', error);
  }

  try {
    await store.processProductRetries();
  } catch (error) {
    logger.error('[BackgroundSync] Failed to process product retries:', error);
  }

  try {
    const data = await fetchInitialData();

    if (data.serverDashboard) {
      await db.dashboardSummary.put({
        id: 'current',
        cashBalance: data.serverDashboard.cashBalance,
        factoryDebt: data.serverDashboard.factoryDebt,
        totalDriversDebt: data.serverDashboard.totalDriversDebt,
        lowStockProducts: data.serverDashboard.lowStockProducts,
        newOrders: data.serverDashboard.newOrders,
        updatedAt: new Date().toISOString(),
      });
    }

    await db.transaction('rw', [db.products, db.drivers], async () => {
      if (data.products?.length) await db.products.bulkPut(data.products);
      if (data.drivers?.length) await db.drivers.bulkPut(data.drivers);
    });

    await mergeServerOrders(data.orders ?? []);

    await db.transaction(
      'rw',
      [db.transactions, db.factoryOrders, db.receipts, db.returns],
      async () => {
        if (data.transactions?.length) await db.transactions.bulkPut(data.transactions);
        if (data.factoryOrders?.length) {
          const newOrderIds = new Set(data.factoryOrders.map((order) => order.id));
          const existingOrders = await db.factoryOrders.toArray();
          const staleIds = existingOrders
            .filter((order) => !newOrderIds.has(order.id) && !order.id.startsWith('local-'))
            .map((order) => order.id);

          if (staleIds.length > 0) {
            await db.factoryOrders.bulkDelete(staleIds);
          }

          await db.factoryOrders.bulkPut(data.factoryOrders);
        }
        if (data.receipts?.length) await db.receipts.bulkPut(data.receipts);
        if (data.returns?.length) await db.returns.bulkPut(data.returns);
      },
    );
  } catch {
    // Sync error will retry on the next trigger.
  }
}

export function pullSync(): Promise<void> {
  if (activePull) {
    pullRequestedWhileActive = true;
    return activePull;
  }

  activePull = (async () => {
    do {
      pullRequestedWhileActive = false;
      await runPullSync();
    } while (pullRequestedWhileActive);
  })().finally(() => {
    activePull = null;
    pullRequestedWhileActive = false;
  });

  return activePull;
}

export function useBackgroundSync() {
  useEffect(() => {
    void pullSync();

    const intervalId = setInterval(() => {
      void pullSync();
    }, POLLING_INTERVAL_MS);

    const handleActiveSync = () => {
      if (document.visibilityState === 'visible') {
        void pullSync();
      }
    };

    window.addEventListener('visibilitychange', handleActiveSync);
    window.addEventListener('focus', handleActiveSync);
    window.addEventListener('online', handleActiveSync);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('visibilitychange', handleActiveSync);
      window.removeEventListener('focus', handleActiveSync);
      window.removeEventListener('online', handleActiveSync);
    };
  }, []);
}
