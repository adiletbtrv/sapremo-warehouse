import { create } from 'zustand';
import { db } from '@/db/schema';
import type {
  SyncTask,
  SyncPayload,
  InventoryReceptionItem,
  InventoryAdjustPayload,
} from '@/types';
import { mapReturnReason } from '@/types';
import { warehouseClient, driversClient, factoryClient } from '@/api/client';
import { roundCurrency } from '@/utils/money';
import { mapApiError } from '@/utils/errorMapper';
import { useAuthStore } from '@/store/authStore';
import { logger } from '@/utils/logger';

interface SyncState {
  isOnline: boolean;
  isSyncing: boolean;
  setOnlineStatus: (status: boolean) => void;
  addToQueue: (taskPayload: SyncPayload, operationId?: string) => Promise<void>;
  processQueue: () => Promise<void>;
  processProductRetries: () => Promise<void>;
}

let isProcessingQueueMutex = false;
const PROCESSING_LEASE_MS = 5 * 60_000;

async function recoverExpiredTasks(): Promise<void> {
  const cutoff = Date.now() - PROCESSING_LEASE_MS;
  try {
    const processingTasks = await db.syncQueue.where('status').equals('processing').toArray();
    for (const task of processingTasks) {
      const startedAt = task.processingAt ? Date.parse(task.processingAt) : 0;
      if (!startedAt || startedAt < cutoff) {
        if (task.id !== undefined) {
          await db.syncQueue.update(task.id, {
            status: 'pending',
            processingAt: undefined,
            lastError: 'Recovered after expired processing lease',
          });
        }
      }
    }
  } catch {
    // Ignore if table query fails
  }
}

export const useSyncStore = create<SyncState>((set, get) => ({
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  isSyncing: false,

  setOnlineStatus: (status: boolean) => {
    set({ isOnline: status });
    if (status) {
      void get().processQueue();
      void get().processProductRetries();
    }
  },

  addToQueue: async (taskPayload: SyncPayload, operationId?: string) => {
    const user = useAuthStore.getState().user;
    const currentUserId =
      user?.id ?? (import.meta.env.MODE === 'test' ? 'test-user-id' : undefined);
    if (!currentUserId && import.meta.env.MODE !== 'test') {
      throw new Error('Cannot enqueue a mutation without an authenticated user');
    }

    // Prevent adding duplicate tasks to the sync queue
    const rawQueue = await db.syncQueue.toArray();
    const existing = rawQueue.find(
      (t) =>
        t.action === taskPayload.action &&
        (t.status === 'pending' || t.status === 'processing') &&
        JSON.stringify({ action: t.action, payload: t.payload }) ===
          JSON.stringify({ action: taskPayload.action, payload: taskPayload.payload }),
    );

    if (existing) {
      logger.warn(`[SyncStore] Duplicate task ${taskPayload.action} already in queue. Skipping.`);
      return;
    }

    const task: SyncTask = {
      ...taskPayload,
      userId: user?.id ?? currentUserId ?? 'test-user-id',
      warehouseId: user?.warehouseId ?? null,
      operationId: operationId ?? crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      status: 'pending',
      retryCount: 0,
    };

    const insertedId = await db.syncQueue.add(task);
    try {
      await db.outbox_mutations?.put({ ...task, id: insertedId });
    } catch {
      // Optional outbox mirror table
    }

    if (get().isOnline) {
      void get().processQueue();
      kickSync();
    }
  },

  processQueue: async () => {
    const { isOnline } = get();

    if (!isOnline || isProcessingQueueMutex) return;
    isProcessingQueueMutex = true;
    set({ isSyncing: true });

    try {
      const { useAuthStore } = await import('@/store/authStore');
      const authState = useAuthStore.getState();
      const user = authState.user;
      const whId = user?.warehouseId;
      const currentUserId = user?.id;
      const currentWarehouseId = user?.warehouseId ?? null;

      if (!whId) {
        logger.warn('[SyncStore] User has no warehouseId. Sync operations might fail.');
      }

      await recoverExpiredTasks();
      const rawTasks = await db.syncQueue.where('status').equals('pending').toArray();
      const userTasks = rawTasks.filter(
        (task) => task.userId === currentUserId && task.warehouseId === currentWarehouseId,
      );
      const tasks = userTasks.sort((a, b) => {
        const timeDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        if (timeDiff !== 0) return timeDiff;
        return (a.id ?? 0) - (b.id ?? 0);
      });

      const MAX_RETRIES = 5;
      const BACKOFF_DELAYS = [1000, 2000, 5000, 15000, 30000];

      for (const task of tasks) {
        if (task.id !== undefined) {
          const processingAt = new Date().toISOString();
          await db.syncQueue.update(task.id, {
            status: 'processing',
            processingAt,
          });
          try {
            await db.outbox_mutations?.update(task.id, {
              status: 'processing',
              processingAt,
            });
          } catch {
            // Optional outbox mirror table
          }
        }
        try {
          switch (task.action) {
            case 'UPDATE_ORDER':
            case 'MODIFY_ORDER': {
              const order = task.payload;
              if (task.action === 'UPDATE_ORDER' && order.status === 'CONFIRMED') {
                try {
                  await driversClient.post(`/orders/${order.id}/confirm`, undefined, {
                    headers: { 'Idempotency-Key': task.operationId ?? `sync-${task.id}` },
                  });
                } catch (confirmErr: unknown) {
                  const status = (confirmErr as { response?: { status?: number } })?.response
                    ?.status;
                  if (status === 409) {
                    logger.info(
                      `[SyncStore] Order ${order.id} is already CONFIRMED on backend (409 Conflict ignored, idempotent success).`,
                    );
                  } else {
                    throw confirmErr;
                  }
                }
              } else if (task.action === 'UPDATE_ORDER' && order.status === 'REJECTED') {
                await driversClient.post(
                  `/orders/${order.id}/reject`,
                  { comment: order.notes ?? '' },
                  { headers: { 'Idempotency-Key': task.operationId ?? `sync-${task.id}` } },
                );
              } else {
                const mappedModifyItems = await Promise.all(
                  (order.items ?? []).map(async (i) => {
                    const product = await db.products.where('barcode').equals(i.barcode).first();
                    const pcsPerBox =
                      product?.boxQuantity && product.boxQuantity > 0 ? product.boxQuantity : 1;
                    const boxCount =
                      i.boxCount != null && i.boxCount > 0
                        ? Math.round(i.boxCount)
                        : (i.quantity ?? 0) > 0
                          ? Math.max(1, Math.round(i.quantity / pcsPerBox))
                          : 1;
                    return {
                      productId: product?.id ?? i.barcode,
                      requestedQty: boxCount,
                      approvedQty: boxCount,
                    };
                  }),
                );

                await driversClient.post(
                  `/orders/${order.id}/modify`,
                  {
                    totalAmount: roundCurrency(order.totalAmount ?? 0),
                    comment: order.notes ?? '',
                    items: mappedModifyItems,
                  },
                  { headers: { 'Idempotency-Key': task.operationId ?? `sync-${task.id}` } },
                );
              }
              break;
            }
            case 'DISPATCH_ORDER':
            case 'CREATE_ORDER': {
              const order = task.payload;
              try {
                await driversClient.post(`/orders/${order.id}/dispatch`, undefined, {
                  headers: { 'Idempotency-Key': task.operationId ?? `sync-${task.id}` },
                });
              } catch (dispatchErr: unknown) {
                const axiosErr = dispatchErr as {
                  response?: {
                    status?: number;
                    data?: {
                      code?: string;
                      message?: string;
                      errorDetail?: { code?: string; message?: string };
                    };
                  };
                  message?: string;
                };
                const respData = axiosErr.response?.data;
                const errCode = respData?.code ?? respData?.errorDetail?.code;
                const status = axiosErr.response?.status;

                if (
                  errCode === 'debt_not_found' ||
                  (status === 404 && JSON.stringify(respData ?? '').includes('debt_not_found'))
                ) {
                  logger.warn(
                    `[SyncStore] Driver debt account not found for order ${order.id} (debt_not_found). Preserving local dispatch and marking task for retry.`,
                  );
                  if (task.id !== undefined) {
                    await db.syncQueue.update(task.id, {
                      status: 'failed',
                      lastError: 'У водителя не открыт счет взаиморасчетов (debt_not_found)',
                    });
                  }
                  continue;
                }
                throw dispatchErr;
              }
              break;
            }
            case 'CREATE_PAYMENT': {
              const transaction = task.payload;
              const rawMethod = (transaction.paymentMethod ?? '').toUpperCase();
              const method: string = rawMethod === 'TRANSFER' ? 'TRANSFER' : 'CASH';
              if (transaction.type === 'driver_payment') {
                try {
                  const res = await warehouseClient.post<Record<string, unknown>>(
                    '/cashbox/driver-payment',
                    {
                      driverId: transaction.driverId,
                      amount: roundCurrency(transaction.amount),
                      paymentMethod: method,
                      comment: transaction.comment ?? null,
                    },
                    { headers: { 'Idempotency-Key': task.operationId ?? `sync-${task.id}` } },
                  );
                  const resData = res?.data;
                  const rawId =
                    resData?.id ??
                    resData?.transactionId ??
                    (resData?.transaction as { id?: unknown })?.id;
                  const serverId = rawId ? String(rawId) : undefined;
                  if (serverId && transaction.id && serverId !== transaction.id) {
                    await db.transaction('rw', db.transactions, async () => {
                      const existing = await db.transactions.get(transaction.id);
                      if (existing) {
                        await db.transactions.delete(transaction.id);
                        await db.transactions.put({ ...existing, id: serverId });
                      }
                    });
                  }
                } catch (paymentErr: unknown) {
                  const axiosErr = paymentErr as {
                    response?: {
                      status?: number;
                      data?: {
                        error?: string;
                        code?: string;
                        message?: string;
                      };
                    };
                    message?: string;
                  };
                  const respData = axiosErr.response?.data;
                  const errMsg = String(
                    respData?.error ?? respData?.message ?? axiosErr.message ?? '',
                  );

                  if (
                    errMsg.includes('drivers-service отклонил платеж') ||
                    errMsg.includes('404') ||
                    errMsg.includes('debt_not_found')
                  ) {
                    logger.warn(
                      `[SyncStore] Driver debt account missing for payment ${transaction.id}. Retrying.`,
                    );
                    if (task.id !== undefined) {
                      await db.syncQueue.update(task.id, {
                        status: 'failed',
                        lastError: 'У водителя не открыт счет взаиморасчетов (debt_not_found)',
                      });
                    }
                    continue;
                  }
                  throw paymentErr;
                }
              } else if (transaction.type === 'factory_payment') {
                const res = await warehouseClient.post<Record<string, unknown>>(
                  '/cashbox/factory-payment',
                  {
                    amount: roundCurrency(transaction.amount),
                    paymentMethod: method,
                    comment: transaction.comment ?? null,
                  },
                  { headers: { 'Idempotency-Key': task.operationId ?? `sync-${task.id}` } },
                );
                const resData = res?.data;
                const rawId =
                  resData?.id ??
                  resData?.transactionId ??
                  (resData?.transaction as { id?: unknown })?.id;
                const serverId = rawId ? String(rawId) : undefined;
                if (serverId && transaction.id && serverId !== transaction.id) {
                  await db.transaction('rw', db.transactions, async () => {
                    const existing = await db.transactions.get(transaction.id);
                    if (existing) {
                      await db.transactions.delete(transaction.id);
                      await db.transactions.put({ ...existing, id: serverId });
                    }
                  });
                }
              }
              break;
            }
            case 'CREATE_RETURN': {
              const ret = task.payload;
              if (ret.returnType === 'from_driver') {
                if (!ret.driverId) {
                  logger.warn(`[SyncStore] Driver ID is missing for return ${ret.id}`);
                  if (task.id !== undefined) {
                    await db.syncQueue.update(task.id, {
                      status: 'failed',
                      lastError: 'Не указан водитель для возврата',
                    });
                  }
                  break;
                }
                const mappedReturnItems = await Promise.all(
                  ret.items.map(async (i) => {
                    const product = await db.products.where('barcode').equals(i.barcode).first();
                    const piecesPerBox =
                      product?.boxQuantity && product.boxQuantity > 0 ? product.boxQuantity : 1;
                    const boxCount = i.boxCount ?? 0;
                    const totalQty = (i.quantity ?? 0) > 0 ? i.quantity : boxCount * piecesPerBox;
                    const loosePieces = Math.max(0, totalQty - boxCount * piecesPerBox);
                    return {
                      productId: product?.id ?? i.barcode,
                      product_id: product?.id ?? i.barcode,
                      barcode: i.barcode,
                      qtyBoxes: boxCount,
                      quantityBoxes: boxCount,
                      box_count: boxCount,
                      boxCount,
                      qtyPieces: boxCount > 0 ? loosePieces : totalQty,
                      quantityPieces: boxCount > 0 ? loosePieces : totalQty,
                      quantity: totalQty,
                      qty: totalQty,
                      reason: mapReturnReason(i.reason),
                    };
                  }),
                );

                const payload = {
                  driverId: ret.driverId,
                  driver_id: ret.driverId,
                  warehouseId: whId,
                  warehouse_id: whId,
                  totalAmount: Math.max(roundCurrency(ret.totalAmount), 0.01),
                  total_amount: Math.max(roundCurrency(ret.totalAmount), 0.01),
                  comment: ret.notes ?? '',
                  notes: ret.notes ?? '',
                  items: mappedReturnItems,
                };

                let res: { data?: { id?: string | number } } | undefined;
                try {
                  res = await driversClient.post<{ id?: string | number }>('/returns', payload, {
                    headers: { 'Idempotency-Key': ret.id },
                  });
                } catch (err1) {
                  try {
                    res = await driversClient.post<{ id?: string | number }>('/returns/', payload, {
                      headers: { 'Idempotency-Key': ret.id },
                    });
                  } catch (err2) {
                    try {
                      res = await warehouseClient.post<{ id?: string | number }>(
                        '/returns',
                        payload,
                      );
                    } catch (err3) {
                      try {
                        res = await warehouseClient.post<{ id?: string | number }>(
                          '/returns/',
                          payload,
                        );
                      } catch {
                        throw err1;
                      }
                    }
                  }
                }

                const serverReturnId = res?.data?.id ? String(res.data.id) : undefined;
                await db.transaction('rw', db.returns, async () => {
                  const existing = await db.returns.get(ret.id);
                  if (existing) {
                    if (serverReturnId && serverReturnId !== ret.id) {
                      await db.returns.delete(ret.id);
                      await db.returns.put({
                        ...existing,
                        id: serverReturnId,
                        syncStatus: 'synced',
                        isSynced: true,
                      });
                    } else {
                      await db.returns.update(ret.id, { syncStatus: 'synced', isSynced: true });
                    }
                  }
                });
              } else if (ret.returnType === 'to_factory') {
                try {
                  const factoryItems = ret.items.map((i) => ({
                    barcode: i.barcode,
                    qty: i.quantity,
                    box_count: i.boxCount,
                    reason: mapReturnReason(i.reason),
                  }));
                  await factoryClient.post('/returns/', {
                    warehouseId: whId,
                    warehouse_id: whId,
                    items: factoryItems,
                    comment: ret.notes ?? '',
                  });
                  await db.returns.update(ret.id, { syncStatus: 'synced', isSynced: true });
                } catch (factoryErr) {
                  logger.info(
                    `[SyncStore] Return to factory ${ret.id} recorded locally in warehouse stock:`,
                    { error: factoryErr },
                  );
                  await db.returns.update(ret.id, { syncStatus: 'local_only', isSynced: true });
                }
              }
              break;
            }
            case 'CREATE_RECEIPT': {
              const receipt = task.payload;

              // 1. Пополнение остатков в базе склада (Warehouse-back PostgreSQL)
              const warehouseItems: InventoryReceptionItem[] = await Promise.all(
                receipt.items.map(async (item) => {
                  const localProduct = await db.products
                    .where('barcode')
                    .equals(item.barcode)
                    .first();
                  const piecesPerBox =
                    localProduct?.boxQuantity && localProduct.boxQuantity > 0
                      ? localProduct.boxQuantity
                      : 1;
                  const boxes = Math.floor(item.actualQuantity / piecesPerBox);
                  const loosePieces = item.actualQuantity % piecesPerBox;
                  return {
                    productId: localProduct?.id,
                    barcode: item.barcode,
                    productName: item.productName ?? localProduct?.name,
                    quantityBoxes: boxes,
                    quantityPieces: loosePieces,
                    piecesPerBox,
                    factoryPrice: item.factoryPrice ?? localProduct?.factoryPrice ?? 0,
                  };
                }),
              );

              // Backend /inventory/reception ожидает List<ReceptionItemRequest> напрямую
              try {
                const res = await warehouseClient.post<
                  {
                    barcode?: string;
                    quantityPieces?: number;
                    quantityBoxes?: number;
                  }[]
                >('/inventory/reception', warehouseItems, {
                  headers: { 'Idempotency-Key': task.operationId ?? `sync-${task.id}` },
                });
                if (res.data && Array.isArray(res.data)) {
                  for (const item of res.data) {
                    if (item.barcode) {
                      const p = await db.products.where('barcode').equals(item.barcode).first();
                      if (p) {
                        const ppb = p.boxQuantity && p.boxQuantity > 0 ? p.boxQuantity : 1;
                        const srvBoxes = item.quantityBoxes ?? 0;
                        const srvPieces = item.quantityPieces ?? 0;
                        const totalPcs =
                          srvPieces >= srvBoxes * ppb && srvPieces > 0
                            ? srvPieces
                            : srvBoxes * ppb + srvPieces;
                        await db.products.update(p.id, { stockQuantity: totalPcs });
                      }
                    }
                  }
                }
              } catch (recErr: unknown) {
                const status = (recErr as { response?: { status?: number } })?.response?.status;
                if (status === 400) {
                  // Fallback если бэкенд обернут в объект
                  await warehouseClient.post(
                    '/inventory/reception',
                    {
                      warehouseId: whId,
                      deliveryNumber: receipt.id,
                      comment: receipt.supplierName ?? 'Поставка с завода',
                      items: warehouseItems,
                    },
                    { headers: { 'Idempotency-Key': task.operationId ?? `sync-${task.id}` } },
                  );
                } else {
                  throw recErr;
                }
              }

              // 2. Отправка в сервис завода (Factory-back) по стандарту OfflineReceptionSerializer
              try {
                const factoryItems = receipt.items.map((i) => ({
                  barcode: i.barcode,
                  actualQty: i.actualQuantity,
                  factoryPrice: String(i.factoryPrice ?? 0),
                }));

                const operationId = task.operationId ?? `sync-${task.id}`;
                await factoryClient.post(
                  '/reception/offline',
                  {
                    clientId: operationId,
                    warehouseId: whId,
                    createdAt: receipt.date
                      ? new Date(receipt.date).toISOString()
                      : new Date().toISOString(),
                    items: factoryItems,
                  },
                  { headers: { 'Idempotency-Key': operationId } },
                );
              } catch (factoryErr) {
                await db.receipts.update(receipt.id, { syncStatus: 'failed', isSynced: false });
                throw factoryErr;
              }

              // 3. Статус связанной заявки завода
              // В сервисе завода факт получения фиксируется через OfflineReception.
              // На стороне склада гарантируем локальное состояние 'delivered'.
              if (receipt.factoryOrderId) {
                await db.factoryOrders.update(receipt.factoryOrderId, { status: 'delivered' });
              }

              await db.receipts.update(receipt.id, { syncStatus: 'synced', isSynced: true });
              break;
            }
            case 'ADJUST_STOCK': {
              const adjustPayload = task.payload;
              const payloadWithWh: InventoryAdjustPayload = {
                ...adjustPayload,
                warehouseId: adjustPayload.warehouseId ?? whId,
              };

              const targetPieces = adjustPayload.quantityPieces ?? 0;
              const targetBoxes = adjustPayload.quantityBoxes ?? 0;
              const isAdjustingToZero = targetPieces === 0 && targetBoxes === 0;

              let needsReception = Boolean(adjustPayload.isNew && !isAdjustingToZero);

              if (!needsReception) {
                try {
                  await warehouseClient.post('/inventory/adjust', payloadWithWh, {
                    headers: { 'Idempotency-Key': task.operationId ?? `sync-${task.id}` },
                  });
                } catch (adjustErr: unknown) {
                  const status = (adjustErr as { response?: { status?: number } })?.response
                    ?.status;
                  if (status === 404 && isAdjustingToZero) {
                    logger.info(
                      `[SyncStore] Product ${adjustPayload.productId ?? adjustPayload.barcode} not in warehouse backend stock when adjusting to 0 (already 0). Completed.`,
                    );
                    break;
                  } else if (status === 404 || status === 405 || status === 400) {
                    if (!isAdjustingToZero) {
                      needsReception = true;
                    } else {
                      break;
                    }
                  } else {
                    throw adjustErr;
                  }
                }
              }

              if (needsReception) {
                const prod = adjustPayload.barcode
                  ? await db.products.where('barcode').equals(adjustPayload.barcode).first()
                  : adjustPayload.productId
                    ? await db.products.get(adjustPayload.productId)
                    : null;

                const piecesPerBox =
                  prod?.boxQuantity && prod.boxQuantity > 0 ? prod.boxQuantity : 1;
                const totalTargetPcs =
                  adjustPayload.quantityPieces ?? (adjustPayload.quantityBoxes ?? 0) * piecesPerBox;
                const boxes =
                  adjustPayload.quantityBoxes ?? Math.floor(totalTargetPcs / piecesPerBox);
                const loosePieces = totalTargetPcs % piecesPerBox;

                if (boxes <= 0 && loosePieces <= 0) {
                  break;
                }

                const receptionItems: InventoryReceptionItem[] = [
                  {
                    productId: adjustPayload.productId ?? prod?.id,
                    barcode: adjustPayload.barcode ?? prod?.barcode ?? '',
                    productName: prod?.name ?? 'Товар',
                    quantityBoxes: boxes,
                    quantityPieces: loosePieces,
                    piecesPerBox,
                    factoryPrice: prod?.factoryPrice ?? 0,
                  },
                ];

                try {
                  const res = await warehouseClient.post<
                    {
                      barcode?: string;
                      quantityPieces?: number;
                      quantityBoxes?: number;
                    }[]
                  >('/inventory/reception', receptionItems, {
                    headers: { 'Idempotency-Key': task.operationId ?? `sync-${task.id}` },
                  });
                  if (res.data && Array.isArray(res.data)) {
                    for (const item of res.data) {
                      if (item.barcode) {
                        const p = await db.products.where('barcode').equals(item.barcode).first();
                        if (p) {
                          const ppb = p.boxQuantity && p.boxQuantity > 0 ? p.boxQuantity : 1;
                          const srvBoxes = item.quantityBoxes ?? 0;
                          const srvPieces = item.quantityPieces ?? 0;
                          const totalPcs =
                            srvPieces >= srvBoxes * ppb && srvPieces > 0
                              ? srvPieces
                              : srvBoxes * ppb + srvPieces;
                          await db.products.update(p.id, { stockQuantity: totalPcs });
                        }
                      }
                    }
                  }
                } catch (recFallbackErr: unknown) {
                  const status = (recFallbackErr as { response?: { status?: number } })?.response
                    ?.status;
                  if (status === 400) {
                    await warehouseClient.post(
                      '/inventory/reception',
                      {
                        warehouseId: whId,
                        deliveryNumber: 'ADJUST-' + Date.now(),
                        comment: adjustPayload.comment ?? 'Первичный ввод / корректировка остатка',
                        items: receptionItems,
                      },
                      { headers: { 'Idempotency-Key': task.operationId ?? `sync-${task.id}` } },
                    );
                  } else {
                    throw recFallbackErr;
                  }
                }
              }
              break;
            }
            case 'CREATE_FACTORY_ORDER': {
              const factoryOrder = task.payload;
              const { useAuthStore } = await import('@/store/authStore');
              const warehouseId = useAuthStore.getState().user?.warehouseId;

              const validWarehouseId =
                warehouseId && warehouseId !== '00000000-0000-0000-0000-000000000001'
                  ? warehouseId
                  : undefined;

              const body: Record<string, unknown> = {
                items: factoryOrder.items.map((i: { productId?: string; qty?: number }) => ({
                  product_id: i.productId,
                  qty: i.qty,
                })),
                comment: factoryOrder.comment ?? '',
              };
              if (validWarehouseId) body.warehouse_id = validWarehouseId;

              const res = await factoryClient.post<{ id?: string | number }>(
                '/warehouse-orders/',
                body,
                { headers: { 'Idempotency-Key': task.operationId ?? `sync-${task.id}` } },
              );
              const serverId = res?.data?.id ? String(res.data.id) : undefined;
              await db.transaction('rw', db.factoryOrders, async () => {
                const existing = await db.factoryOrders.get(factoryOrder.id);
                if (existing) {
                  if (serverId && serverId !== factoryOrder.id) {
                    await db.factoryOrders.delete(factoryOrder.id);
                    await db.factoryOrders.put({
                      ...existing,
                      id: serverId,
                      syncStatus: 'synced',
                      isSynced: true,
                    });
                  } else {
                    await db.factoryOrders.update(factoryOrder.id, {
                      syncStatus: 'synced',
                      isSynced: true,
                    });
                  }
                }
              });
              break;
            }
          }

          if (task.id !== undefined) {
            await db.syncQueue.delete(task.id);
            try {
              await db.outbox_mutations?.delete(task.id);
            } catch {
              // Optional outbox mirror table
            }
          }
        } catch (err: unknown) {
          if (task.id !== undefined) {
            const axiosErr = err as {
              message?: string;
              response?: { status: number };
              code?: string;
            };
            const message = axiosErr.message ?? 'Unknown error';

            const status = axiosErr.response?.status;
            const isClient403 = status === 403;
            const isClientError = status !== undefined && status >= 400 && status < 500;
            const isServerError = status !== undefined && status >= 500;
            const isNetworkError =
              axiosErr.response === undefined &&
              (axiosErr.code === 'ERR_NETWORK' ||
                axiosErr.code === 'ECONNABORTED' ||
                axiosErr.message?.startsWith('Network Error'));

            const nextRetryCount = (task.retryCount ?? 0) + 1;
            const isMaxRetriesExceeded = nextRetryCount >= MAX_RETRIES;

            const detailedMessage = mapApiError(err);

            const markEntityFailed = async () => {
              try {
                if (task.action === 'CREATE_RECEIPT') {
                  await db.receipts.update(task.payload.id, {
                    syncStatus: 'failed',
                    isSynced: false,
                  });
                } else if (task.action === 'CREATE_RETURN') {
                  await db.returns.update(task.payload.id, {
                    syncStatus: 'failed',
                    isSynced: false,
                  });
                } else if (task.action === 'CREATE_FACTORY_ORDER') {
                  await db.factoryOrders.update(task.payload.id, {
                    syncStatus: 'failed',
                    isSynced: false,
                  });
                }
              } catch {
                // ignore
              }
            };

            if (isClient403) {
              await db.syncQueue.update(task.id, {
                retryCount: nextRetryCount,
                status: isMaxRetriesExceeded ? 'failed' : 'pending',
                lastError: isMaxRetriesExceeded
                  ? `Max retries exceeded (Dead-letter queue): 403 Forbidden (Requires backend role sync)`
                  : `Waiting for backend role synchronization (403 Forbidden): ${detailedMessage || message}`,
              });
              if (isMaxRetriesExceeded) {
                await markEntityFailed();
              }
              continue;
            } else if (isClientError) {
              await db.syncQueue.update(task.id, {
                status: 'failed',
                lastError: detailedMessage || `Client Error ${status}: ${message}`,
              });
              await markEntityFailed();
              continue;
            } else if (isServerError || isNetworkError) {
              await db.syncQueue.update(task.id, {
                retryCount: nextRetryCount,
                status: isMaxRetriesExceeded ? 'failed' : 'pending',
                lastError: isMaxRetriesExceeded
                  ? `Max retries exceeded (Dead-letter queue): ${detailedMessage || message}`
                  : `Network/Server Error (${nextRetryCount}/${MAX_RETRIES}): ${detailedMessage || message}`,
              });

              if (isMaxRetriesExceeded) {
                await markEntityFailed();
              } else {
                const delay =
                  BACKOFF_DELAYS[Math.min(nextRetryCount - 1, BACKOFF_DELAYS.length - 1)];
                setTimeout(() => {
                  void kickSync();
                }, delay);
              }

              if (isNetworkError) {
                break;
              } else {
                continue;
              }
            } else {
              await db.syncQueue.update(task.id, {
                status: 'failed',
                lastError: detailedMessage || `App Error: ${message}`,
              });
              await markEntityFailed();
              continue;
            }
          } else {
            break;
          }
        }
      }
    } finally {
      isProcessingQueueMutex = false;
      set({ isSyncing: false });
    }
  },

  processProductRetries: async () => {
    const { isOnline } = get();
    if (!isOnline) return;

    try {
      const { useAuthStore } = await import('@/store/authStore');
      const currentUserId = useAuthStore.getState().user?.id;

      const rawRetries = await db.productRetries
        .where('status')
        .equals('pending')
        .sortBy('createdAt');
      const retries = rawRetries.filter((task) => !task.userId || task.userId === currentUserId);

      for (const task of retries) {
        try {
          switch (task.action) {
            case 'POST': {
              const p = task.payload;
              const response = await factoryClient.post<{ id: string }>('/products/', {
                barcode: p.barcode,
                name: p.name,
                pieces_per_box: p.boxQuantity ?? 1,
                expiry_date:
                  p.expirationDate ??
                  new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                batch_number: p.batchNumber ?? 'BATCH-1',
                factory_price: String(p.factoryPrice ?? 0),
                dispatch_price: String(p.driverPrice ?? p.factoryPrice ?? 0),
                status: p.status ?? 'active',
              });
              if (response.data?.id && response.data.id !== p.id) {
                await db.products.delete(p.id);
                await db.products.add({
                  ...p,
                  id: response.data.id,
                  stockQuantity: (p as unknown as { stockQuantity?: number }).stockQuantity ?? 0,
                });
              }
              break;
            }
            case 'PATCH':
            case 'PUT': {
              const { id, ...changes } = task.payload;

              const fullProduct = await db.products.get(id);
              const snakeChanges: Record<string, unknown> = {};
              const source = fullProduct ?? changes;
              if (source.boxQuantity !== undefined)
                snakeChanges.pieces_per_box = source.boxQuantity;
              if (source.expirationDate !== undefined)
                snakeChanges.expiry_date = source.expirationDate;
              if (source.batchNumber !== undefined) snakeChanges.batch_number = source.batchNumber;
              if (source.factoryPrice !== undefined)
                snakeChanges.factory_price = String(source.factoryPrice);
              if (source.barcode !== undefined) snakeChanges.barcode = source.barcode;
              if (source.name !== undefined) snakeChanges.name = source.name;
              if (source.status !== undefined) snakeChanges.status = source.status;
              await factoryClient.patch(`/products/${id}/`, snakeChanges);
              break;
            }
            case 'DELETE':
              await factoryClient.delete(`/products/${task.payload.id}/`);
              break;
          }

          if (task.id !== undefined) {
            await db.productRetries.delete(task.id);
          }
        } catch (err: unknown) {
          if (task.id !== undefined) {
            const axiosErr = err as { message?: string; response?: { status: number } };
            const message = axiosErr.message ?? 'Unknown error';
            const isClientError =
              axiosErr.response !== undefined &&
              axiosErr.response.status >= 400 &&
              axiosErr.response.status < 500;

            if (isClientError) {
              await db.productRetries.update(task.id, {
                status: 'failed',
                lastError: `Client Error ${axiosErr.response!.status}: ${message}`,
              });
              continue;
            } else {
              await db.productRetries.update(task.id, {
                retryCount: (task.retryCount || 0) + 1,
                status: (task.retryCount || 0) >= 4 ? 'failed' : 'pending',
                lastError: message,
              });
              break;
            }
          } else {
            break;
          }
        }
      }
    } catch {
      // Ошибка чтения очереди повторов — не критична
    }
  },
}));

let kickSyncTimer: ReturnType<typeof setTimeout> | null = null;

export const kickSync = (): void => {
  if (kickSyncTimer) {
    clearTimeout(kickSyncTimer);
  }
  kickSyncTimer = setTimeout(() => {
    const store = useSyncStore.getState();
    if (!store.isOnline) return;
    void store.processQueue();
    void store.processProductRetries();
  }, 1000); // 1-second debounce
};

export interface RetrySyncResult {
  success: number;
  failed: number;
  lastError?: string;
}

export const retryFailedSyncs = async (): Promise<RetrySyncResult> => {
  const { db } = await import('@/db/schema');
  const initialFailed = await db.syncQueue.where('status').equals('failed').toArray();
  await db.syncQueue.where('status').equals('failed').modify({ status: 'pending', retryCount: 0 });

  const store = useSyncStore.getState();
  if (store.isOnline) {
    await store.processQueue();
    await store.processProductRetries();
  }

  const remainingFailed = await db.syncQueue.where('status').equals('failed').toArray();
  const failedCount = remainingFailed.length;
  const successCount = Math.max(0, initialFailed.length - failedCount);
  return {
    success: successCount,
    failed: failedCount,
    lastError: remainingFailed[0]?.lastError,
  };
};

export const cancelFailedPayment = async (taskId?: number): Promise<void> => {
  const { db } = await import('@/db/schema');
  if (taskId !== undefined) {
    const task = await db.syncQueue.get(taskId);
    if (task && task.action === 'CREATE_PAYMENT') {
      const tx = task.payload;
      await db.transaction('rw', [db.transactions, db.drivers, db.syncQueue], async () => {
        if (tx?.id) {
          await db.transactions.delete(tx.id);
        }
        if (tx?.type === 'driver_payment' && tx.driverId) {
          const driver = await db.drivers.get(tx.driverId);
          if (driver) {
            await db.drivers.update(tx.driverId, {
              currentDebt: (driver.currentDebt || 0) + (tx.amount || 0),
            });
          }
        }
        await db.syncQueue.delete(taskId);
      });
      return;
    }
    await db.syncQueue.delete(taskId);
    return;
  }

  const failedPayments = await db.syncQueue
    .where('action')
    .equals('CREATE_PAYMENT')
    .and((t) => t.status === 'failed')
    .toArray();

  for (const task of failedPayments) {
    if (task.id !== undefined) {
      await cancelFailedPayment(task.id);
    }
  }
};

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => useSyncStore.getState().setOnlineStatus(true));
  window.addEventListener('offline', () => useSyncStore.getState().setOnlineStatus(false));
}
