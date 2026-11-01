import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import type { Driver } from '@/types';
import { usePaginatedQuery, type PaginatedResult } from './usePaginatedQuery';
import { driversClient } from '@/api/client';

export function useDriversPaginated(page: number, pageSize: number): PaginatedResult<Driver> {
  const result = usePaginatedQuery(db.drivers, pageSize, undefined, 'fullName');

  if (result.page !== page) result.setPage(page);
  if (result.pageSize !== pageSize) result.setPageSize(pageSize);

  return result;
}

export function useDrivers(): Driver[] {
  return useLiveQuery(
    () =>
      db.drivers
        .orderBy('fullName')
        .filter((d) => !d.isArchived)
        .toArray(),
    [],
    [],
  );
}

export function useDriver(id: string): Driver | undefined {
  return useLiveQuery(() => db.drivers.get(id), [id]);
}

export interface DriverCreatePayload {
  fullName: string;
  carNumber: string;
  phone: string;
  password: string;
  warehouseId: string;
}

/**
 * Создаёт водителя на сервере (POST /api/drivers) и сохраняет локально в IndexedDB.
 */
export async function createDriver(payload: DriverCreatePayload): Promise<Driver> {
  const { data } = await driversClient.post<Driver>('', payload);
  const driver: Driver = {
    ...data,
    carNumber: data.carNumber ?? data.vehicleNumber ?? '',
    vehicleNumber: data.carNumber ?? data.vehicleNumber ?? '',
    currentDebt: 0,
  };
  await db.drivers.put(driver);
  return driver;
}

interface DriverDebtItem {
  driverId: string;
  totalDebt: number;
}

type DebtsResponse = DriverDebtItem[] | { content?: DriverDebtItem[] };

/**
 * Получает актуальный долг водителя с бэкенда (GET /api/drivers/debts) и обновляет IndexedDB.
 */
export async function fetchDriverDebt(driverId: string): Promise<number> {
  try {
    const { data } = await driversClient.get<DebtsResponse>('/debts', {
      params: { size: 1000 },
    });

    const debts: DriverDebtItem[] = Array.isArray(data)
      ? data
      : Array.isArray(data?.content)
        ? data.content
        : [];

    const matched = debts.find((d) => String(d.driverId) === String(driverId));
    if (matched && Number.isFinite(matched.totalDebt)) {
      const debt = Math.max(0, Number(matched.totalDebt));
      await db.drivers.update(driverId, { currentDebt: debt });
      return debt;
    }
  } catch {
    // В случае офлайна или сетевой ошибки возвращаем локальное значение
  }

  const local = await db.drivers.get(driverId);
  return local?.currentDebt ?? 0;
}
