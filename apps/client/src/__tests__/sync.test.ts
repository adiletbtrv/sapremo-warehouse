import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSyncStore } from '../store/syncStore';
import { useAuthStore } from '../store/authStore';
import { db } from '../db/schema';
import { warehouseClient, driversClient } from '../api/client';
import { resolveLWWConflict } from '../utils/conflictResolution';
import type { SyncPayload, SyncTask, Order } from '../types';

const inMemoryQueue: SyncTask[] = [];
const inMemoryOutbox: SyncTask[] = [];
let autoIncrementId = 1;

vi.mock('../api/client', () => ({
  isTauri: false,
  warehouseClient: {
    post: vi.fn().mockResolvedValue({ data: [] }),
    get: vi.fn().mockResolvedValue({ data: [] }),
  },
  driversClient: {
    post: vi.fn().mockResolvedValue({ data: {} }),
    get: vi.fn().mockResolvedValue({ data: [] }),
  },
  factoryClient: {
    post: vi.fn().mockResolvedValue({ data: {} }),
    get: vi.fn().mockResolvedValue({ data: [] }),
  },
}));

vi.mock('../db/schema', () => ({
  db: {
    syncQueue: {
      add: vi.fn(async (task: SyncTask) => {
        const id = autoIncrementId++;
        inMemoryQueue.push({ ...task, id });
        return id;
      }),
      where: vi.fn((field: string) => ({
        equals: vi.fn((val: string) => ({
          toArray: vi.fn(async () =>
            inMemoryQueue.filter((t) => (t as unknown as Record<string, unknown>)[field] === val)
          ),
          sortBy: vi.fn(async () =>
            inMemoryQueue.filter((t) => (t as unknown as Record<string, unknown>)[field] === val)
          ),
        })),
      })),
      toArray: vi.fn(async () => [...inMemoryQueue]),
      update: vi.fn(async (id: number, changes: Partial<SyncTask>) => {
        const idx = inMemoryQueue.findIndex((t) => t.id === id);
        if (idx >= 0) {
          inMemoryQueue[idx] = { ...inMemoryQueue[idx], ...changes } as SyncTask;
          return 1;
        }
        return 0;
      }),
      delete: vi.fn(async (id: number) => {
        const idx = inMemoryQueue.findIndex((t) => t.id === id);
        if (idx >= 0) inMemoryQueue.splice(idx, 1);
      }),
    },
    outbox_mutations: {
      put: vi.fn(async (task: SyncTask) => {
        const existingIdx = inMemoryOutbox.findIndex((t) => t.id === task.id);
        if (existingIdx >= 0) {
          inMemoryOutbox[existingIdx] = { ...task };
        } else {
          inMemoryOutbox.push({ ...task });
        }
        return task.id ?? 0;
      }),
      update: vi.fn(async (id: number, changes: Partial<SyncTask>) => {
        const idx = inMemoryOutbox.findIndex((t) => t.id === id);
        if (idx >= 0) {
          inMemoryOutbox[idx] = { ...inMemoryOutbox[idx], ...changes } as SyncTask;
          return 1;
        }
        return 0;
      }),
      delete: vi.fn(async (id: number) => {
        const idx = inMemoryOutbox.findIndex((t) => t.id === id);
        if (idx >= 0) inMemoryOutbox.splice(idx, 1);
      }),
    },
    products: {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          first: vi.fn().mockResolvedValue({
            id: 'sku-0001',
            barcode: '4870001000013',
            name: 'Пломбир Классический',
            boxQuantity: 40,
            factoryPrice: 28,
          }),
        })),
      })),
      get: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue(1),
    },
    productRetries: {
      where: vi.fn().mockReturnThis(),
      equals: vi.fn().mockReturnThis(),
      sortBy: vi.fn().mockResolvedValue([]),
      toArray: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue(1),
      delete: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

describe('Offline-First Outbox Sync Queue & LWW Conflict Resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inMemoryQueue.length = 0;
    inMemoryOutbox.length = 0;
    autoIncrementId = 1;
    useAuthStore.setState({
      token: 'test-jwt-token',
      refreshToken: 'test-refresh-token',
      user: {
        id: 'usr-warehouse-01',
        username: 'warehouse_admin',
        fullName: 'Warehouse Admin',
        role: 'WAREHOUSE_MANAGER',
        warehouseId: 'wh-bishkek-01',
      },
    });
    useSyncStore.setState({ isOnline: true, isSyncing: false });
  });

  it('accumulates mutations in outbox_mutations and syncQueue while offline and flushes all in FIFO order when online', async () => {
    // 1. Switch client to OFFLINE state
    useSyncStore.setState({ isOnline: false });

    const adjustTask: SyncPayload = {
      action: 'ADJUST_STOCK',
      payload: { barcode: '4870001000013', quantityPieces: 240, quantityBoxes: 6, isNew: false },
    };

    const confirmOrderTask: SyncPayload = {
      action: 'UPDATE_ORDER',
      payload: {
        id: 'ORD-1001',
        driverId: 'drv-001',
        driverName: 'Асанов Бакытбек',
        status: 'CONFIRMED',
        date: '2026-11-01T10:00:00.000Z',
        totalAmount: 11200,
        items: [],
      } as Order,
    };

    await useSyncStore.getState().addToQueue(adjustTask, 'op-adjust-1');
    await useSyncStore.getState().addToQueue(confirmOrderTask, 'op-confirm-2');

    // Verify tasks accumulated locally in both syncQueue and outbox_mutations while offline
    expect(inMemoryQueue).toHaveLength(2);
    expect(inMemoryOutbox).toHaveLength(2);
    expect(inMemoryOutbox[0].operationId).toBe('op-adjust-1');
    expect(inMemoryOutbox[1].operationId).toBe('op-confirm-2');
    expect(vi.mocked(warehouseClient.post)).not.toHaveBeenCalled();
    expect(vi.mocked(driversClient.post)).not.toHaveBeenCalled();

    // 2. Restore network connectivity (offline -> online)
    useSyncStore.getState().setOnlineStatus(true);

    // Wait for asynchronous outbox flush to complete
    await vi.waitFor(() => {
      expect(inMemoryQueue).toHaveLength(0);
      expect(inMemoryOutbox).toHaveLength(0);
    });

    // Verify backend endpoints were invoked with exact Idempotency-Key headers
    expect(vi.mocked(warehouseClient.post)).toHaveBeenCalledWith(
      '/inventory/adjust',
      expect.objectContaining({
        barcode: '4870001000013',
        quantityPieces: 240,
        warehouseId: 'wh-bishkek-01',
      }),
      expect.objectContaining({
        headers: { 'Idempotency-Key': 'op-adjust-1' },
      })
    );

    expect(vi.mocked(driversClient.post)).toHaveBeenCalledWith(
      '/orders/ORD-1001/confirm',
      undefined,
      expect.objectContaining({
        headers: { 'Idempotency-Key': 'op-confirm-2' },
      })
    );
  });

  it('deduplicates identical pending mutations in the offline outbox queue', async () => {
    useSyncStore.setState({ isOnline: false });

    const payload: SyncPayload = {
      action: 'ADJUST_STOCK',
      payload: { barcode: '4870001000013', quantityPieces: 120, isNew: false },
    };

    await useSyncStore.getState().addToQueue(payload, 'op-dup-1');
    await useSyncStore.getState().addToQueue(payload, 'op-dup-2');

    expect(inMemoryQueue).toHaveLength(1);
    expect(vi.mocked(db.syncQueue.add)).toHaveBeenCalledTimes(1);
  });

  it('resolves conflicts deterministically using Last-Write-Wins (LWW) and Entity Version Vectors', () => {
    const staleServerOrder = {
      id: 'ORD-1005',
      status: 'PENDING',
      totalAmount: 5000,
      updatedAt: '2026-11-01T10:00:00.000Z',
      version: 1,
    };

    const newerLocalOrder = {
      id: 'ORD-1005',
      status: 'MODIFIED',
      totalAmount: 6400,
      localUpdatedAt: '2026-11-01T10:05:00.000Z',
      updatedAt: '2026-11-01T10:00:00.000Z',
      version: 2,
    };

    // Case 1: Local timestamp is newer -> Local wins via LWW
    const resLocal = resolveLWWConflict(newerLocalOrder, staleServerOrder, false);
    expect(resLocal.winner).toBe('local');
    expect(resLocal.strategy).toBe('lww-timestamp');
    expect(resLocal.resolved.status).toBe('MODIFIED');
    expect(resLocal.resolved.totalAmount).toBe(6400);
    expect(resLocal.mergedVersion).toBe(2);

    // Case 2: Remote timestamp is newer and no pending outbox lock -> Remote wins via LWW
    const newerServerOrder = {
      ...staleServerOrder,
      status: 'DISPATCHED',
      updatedAt: '2026-11-01T10:15:00.000Z',
      version: 3,
    };
    const resRemote = resolveLWWConflict(newerLocalOrder, newerServerOrder, false);
    expect(resRemote.winner).toBe('remote');
    expect(resRemote.strategy).toBe('lww-timestamp');
    expect(resRemote.resolved.status).toBe('DISPATCHED');
    expect(resRemote.mergedVersion).toBe(3);

    // Case 3: Pending outbox mutation lock overrides even if remote clock is ahead
    const resLocked = resolveLWWConflict(newerLocalOrder, newerServerOrder, true);
    expect(resLocked.winner).toBe('local');
    expect(resLocked.strategy).toBe('pending-outbox-lock');
    expect(resLocked.resolved.status).toBe('MODIFIED');

    // Case 4: Equal timestamps with higher remote version vector -> Version vector wins
    const sameTimeLocal = {
      id: 'ORD-1009',
      status: 'CONFIRMED',
      updatedAt: '2026-11-01T12:00:00.000Z',
      version: 2,
    };
    const sameTimeRemoteHigherVersion = {
      id: 'ORD-1009',
      status: 'DISPATCHED',
      updatedAt: '2026-11-01T12:00:00.000Z',
      version: 4,
    };
    const resVersion = resolveLWWConflict(sameTimeLocal, sameTimeRemoteHigherVersion, false);
    expect(resVersion.winner).toBe('remote');
    expect(resVersion.strategy).toBe('version-vector');
    expect(resVersion.resolved.status).toBe('DISPATCHED');
    expect(resVersion.mergedVersion).toBe(4);
  });
});
