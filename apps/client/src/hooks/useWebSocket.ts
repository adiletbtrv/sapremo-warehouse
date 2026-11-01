import { useEffect, useRef, useState } from 'react';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { useTranslation } from 'react-i18next';
import { isNativeTauri } from '@/adapters/nativeAdapter';
import { db } from '@/db/schema';
import { useAuthStore } from '@/store/authStore';
import { pullSync } from './useBackgroundSync';

const MAX_RETRIES = 10;
const REVIVE_INTERVAL_MS = 10_000;

function resolveSockJsEndpoint(): string {
  const configured = import.meta.env.VITE_WS_URL as string | undefined;

  if (configured) {
    if (configured.startsWith('ws://')) {
      return configured.replace(/^ws:\/\//, 'http://');
    }
    if (configured.startsWith('wss://')) {
      return configured.replace(/^wss:\/\//, 'https://');
    }
    if (configured.startsWith('http://') || configured.startsWith('https://')) {
      return configured;
    }
    const path = configured.startsWith('/') ? configured : `/${configured}`;
    return `${window.location.protocol}//${window.location.host}${path}`;
  }

  if (isNativeTauri()) {
    return (
      (import.meta.env.TAURI_ENV_WAREHOUSE_WS_URL as string | undefined) ??
      'http://localhost:3001/api/warehouse/ws'
    );
  }

  return `${window.location.protocol}//${window.location.host}/api/warehouse/ws`;
}

export function useWebSocket() {
  const { t } = useTranslation();
  const [isConnected, setIsConnected] = useState(false);
  const queryClient = useQueryClient();
  const { notification } = App.useApp();
  const retriesRef = useRef(0);
  const stompClientRef = useRef<Client | null>(null);
  const reviveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onlineListenerRef = useRef<(() => void) | null>(null);

  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const warehouseId = user?.warehouseId;

  useEffect(() => {
    if (!token) return;

    const socketUrl = resolveSockJsEndpoint();

    const handleOrderEvent = (msg?: { body?: string }) => {
      void pullSync();
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });

      if (msg?.body) {
        try {
          const payload = JSON.parse(msg.body) as {
            driverId?: string | number;
            driverName?: string;
          };
          void (async () => {
            let driverName = payload.driverName;
            if (!driverName && payload.driverId) {
              const driver = await db.drivers.get(String(payload.driverId));
              driverName = driver?.fullName;
            }
            notification.info({
              message: t('ws.newOrderTitle', { defaultValue: 'Новая заявка от водителя' }),
              description: driverName
                ? t('ws.newOrderDescWithName', {
                    name: driverName,
                    defaultValue: `${driverName} отправил заявку на товар`,
                  })
                : t('ws.newOrderDesc', {
                    defaultValue: 'Поступила новая заявка от водителя в реальном времени',
                  }),
              placement: 'topRight',
              duration: 4,
            });
          })();
        } catch {
          // Ignored if payload is not JSON
        }
      }
    };

    const handleInventoryEvent = (msg?: { body?: string }) => {
      if (msg?.body) {
        try {
          const payload = JSON.parse(msg.body) as {
            barcode?: string;
            productId?: string;
            quantity?: number;
            updatedAt?: string;
            version?: number;
          };
          if (payload.barcode && typeof payload.quantity === 'number') {
            void db.stock?.put({
              barcode: payload.barcode,
              quantity: payload.quantity,
              updatedAt: payload.updatedAt ?? new Date().toISOString(),
              version: payload.version ?? 1,
            });
            void db.products
              .where('barcode')
              .equals(payload.barcode)
              .modify({ stockQuantity: payload.quantity });
          }
        } catch {
          // Fallback to full pullSync below
        }
      }
      void pullSync();
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    };

    const handleAlertEvent = (msg: { body: string }) => {
      void (async () => {
        try {
          const payload = JSON.parse(msg.body) as {
            productId?: string | number;
            barcode?: string;
            title?: string;
            message?: string;
          };
          const lookupKey = String(payload.barcode ?? payload.productId ?? '');
          const product = lookupKey
            ? ((await db.products.get(lookupKey)) ??
              (await db.products.where('barcode').equals(lookupKey).first()))
            : undefined;

          notification.warning({
            message:
              payload.title ??
              t('ws.lowStockTitle', { defaultValue: 'Низкий остаток товара' }),
            description:
              payload.message ??
              (product
                ? t('ws.lowStockDescWithProduct', {
                    name: product.name,
                    barcode: product.barcode,
                    defaultValue: `Товар «${product.name}» (${product.barcode}) достиг критического остатка`,
                  })
                : t('ws.lowStockDesc', {
                    defaultValue: 'Обнаружен критически низкий остаток товара',
                  })),
            placement: 'bottomRight',
          });
        } catch {
          notification.warning({
            message: t('ws.lowStockTitle', { defaultValue: 'Низкий остаток товара' }),
            description: t('ws.lowStockDesc', {
              defaultValue: 'Обнаружен критически низкий остаток товара',
            }),
            placement: 'bottomRight',
          });
        }
      })();
    };

    const createClient = () => {
      const stompClient = new Client({
        webSocketFactory: () =>
          new SockJS(socketUrl, null, {
            transports: ['websocket', 'xhr-streaming', 'xhr-polling'],
          }),
        connectHeaders: {
          Authorization: `Bearer ${token}`,
          ...(warehouseId ? { 'X-Warehouse-Id': warehouseId } : {}),
        },
        debug: () => undefined,
        reconnectDelay: 3000,
        heartbeatIncoming: 4000,
        heartbeatOutgoing: 4000,
      });

      stompClient.onConnect = () => {
        retriesRef.current = 0;
        setIsConnected(true);

        void pullSync();

        // 1. Real-time inventory balance stream (/topic/inventory)
        stompClient.subscribe('/topic/inventory', handleInventoryEvent);

        // 2. Real-time warehouse alerts & low-stock stream (/topic/alerts & /topic/inventory/low-stock)
        stompClient.subscribe('/topic/alerts', handleAlertEvent);
        stompClient.subscribe('/topic/inventory/low-stock', handleAlertEvent);

        // 3. Dashboard & KPI updates
        stompClient.subscribe('/topic/dashboard/update', () => {
          void queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
          void pullSync();
        });

        // 4. Driver orders stream
        stompClient.subscribe('/topic/orders/new', handleOrderEvent);
        stompClient.subscribe('/topic/orders/updated', handleOrderEvent);
        stompClient.subscribe('/topic/orders/status', handleOrderEvent);
        stompClient.subscribe('/topic/orders', handleOrderEvent);

        if (warehouseId && warehouseId !== '00000000-0000-0000-0000-000000000001') {
          stompClient.subscribe(`/topic/warehouse/${warehouseId}/orders`, handleOrderEvent);
          stompClient.subscribe(`/topic/orders/${warehouseId}`, handleOrderEvent);
        }

        // 5. Goods dispatch confirmations
        stompClient.subscribe('/topic/dispatch/created', () => {
          void pullSync();
          void queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
        });
      };

      stompClient.onStompError = () => {
        setIsConnected(false);
      };

      stompClient.onWebSocketClose = () => {
        setIsConnected(false);
        retriesRef.current += 1;

        if (retriesRef.current >= MAX_RETRIES) {
          void stompClient.deactivate();

          const tryRevive = () => {
            if (!navigator.onLine) return;
            retriesRef.current = 0;
            const newClient = createClient();
            stompClientRef.current = newClient;
            newClient.activate();
          };

          reviveTimerRef.current = setTimeout(tryRevive, REVIVE_INTERVAL_MS);
          if (onlineListenerRef.current) {
            window.removeEventListener('online', onlineListenerRef.current);
          }
          onlineListenerRef.current = tryRevive;
          window.addEventListener('online', tryRevive, { once: true });
        }
      };

      return stompClient;
    };

    const stompClient = createClient();
    stompClientRef.current = stompClient;
    stompClient.activate();

    return () => {
      if (reviveTimerRef.current) clearTimeout(reviveTimerRef.current);
      if (onlineListenerRef.current) {
        window.removeEventListener('online', onlineListenerRef.current);
        onlineListenerRef.current = null;
      }
      void stompClientRef.current?.deactivate();
    };
  }, [queryClient, notification, token, warehouseId, t]);

  return { isConnected };
}
