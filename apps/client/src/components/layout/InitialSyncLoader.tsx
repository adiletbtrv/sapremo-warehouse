import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Typography, Button, App } from 'antd';
import { db } from '@/db/schema';
import { useAuthStore } from '@/store/authStore';
import i18n from '@/i18n';
import { fetchInitialData } from '@/api/sync';
import { mergeServerOrders } from '@/db/repository';
import Lottie from 'lottie-react';
import loadingAnimation from '../../../assets/anims/loading-spinner.json';
import errorAnimation from '../../../assets/anims/error-x.json';

const { Title, Text } = Typography;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(
      () => reject(new Error('Local database persistence timed out')),
      timeoutMs,
    );

    promise.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

interface Props {
  children: React.ReactNode;
}

export default function InitialSyncLoader({ children }: Props) {
  const [forceOffline, setForceOffline] = useState(false);
  const [isPersisting, setIsPersisting] = useState(false);
  const [persistError, setPersistError] = useState<Error | null>(null);
  const [persistedData, setPersistedData] = useState<typeof data>(undefined);
  const persistenceRunRef = useRef(0);

  const user = useAuthStore((state) => state.user);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['initial-sync', user?.id],
    queryFn: fetchInitialData,
    staleTime: Infinity,
    retry: false,
  });

  const { message } = App.useApp();

  useEffect(() => {
    if (data) {
      const runId = ++persistenceRunRef.current;
      setIsPersisting(true);
      setPersistError(null);
      setPersistedData(undefined);

      // Server wins: сохраняем серверные агрегаты в типизированную таблицу Dexie
      if (data.warnings?.includes('network_error')) {
        void message.warning(
          i18n.t(
            'common.offlineCacheMessage',
            'Не удалось получить данные с сервера завода - работаем с кешем.',
          ),
          5,
        );
      }

      const syncToDexie = async () => {
        try {
          await withTimeout(
            (async () => {
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

              const productCount = await db.products.count();
              if (productCount === 0) {
                await db.transaction('rw', db.products, async () => {
                  if (data.products?.length) await db.products.bulkPut(data.products);
                });
              }

              await db.transaction('rw', db.drivers, async () => {
                if (data.drivers?.length) await db.drivers.bulkPut(data.drivers);
              });

              await mergeServerOrders(data.orders ?? []);

              await db.transaction('rw', [db.transactions, db.factoryOrders], async () => {
                if (data.transactions?.length) await db.transactions.bulkPut(data.transactions);
                if (data.factoryOrders?.length) await db.factoryOrders.bulkPut(data.factoryOrders);
              });
            })(),
            15_000,
          );

          if (persistenceRunRef.current === runId) setPersistedData(data);
        } catch (error) {
          if (persistenceRunRef.current === runId) {
            setPersistError(error instanceof Error ? error : new Error(String(error)));
          }
        } finally {
          if (persistenceRunRef.current === runId) setIsPersisting(false);
        }
      };
      void syncToDexie();

      return () => {
        if (persistenceRunRef.current === runId) {
          persistenceRunRef.current += 1;
          setIsPersisting(false);
        }
      };
    }
  }, [data, message]);

  if (isLoading && !forceOffline) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-main, #f0f2f5)',
        }}
      >
        <Lottie animationData={loadingAnimation} style={{ width: 150, height: 150 }} />
        <Title level={4} style={{ marginTop: 24 }}>
          Синхронизация данных...
        </Title>
        <Text type="secondary">Загрузка справочников товаров и водителей с сервера.</Text>
        <Button type="default" onClick={() => setForceOffline(true)} style={{ marginTop: 24 }}>
          Продолжить в офлайн-режиме
        </Button>
      </div>
    );
  }

  if ((isError || persistError) && !forceOffline) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-main, #f0f2f5)',
        }}
      >
        <Lottie animationData={errorAnimation} style={{ width: 150, height: 150 }} loop={false} />
        <Title level={4} type="danger" style={{ marginTop: 24 }}>
          Ошибка синхронизации
        </Title>
        <Text style={{ marginBottom: 24 }}>
          {(persistError ?? error) instanceof Error
            ? (persistError ?? error)?.message
            : 'Неизвестная ошибка'}
        </Text>
        <Button type="primary" onClick={() => setForceOffline(true)}>
          Продолжить в офлайн-режиме
        </Button>
      </div>
    );
  }

  if ((isPersisting || (data !== undefined && persistedData !== data)) && !forceOffline) {
    return (
      <div style={{ padding: 24 }}>
        <Text>Сохранение синхронизированных данных...</Text>
      </div>
    );
  }

  return <>{children}</>;
}
