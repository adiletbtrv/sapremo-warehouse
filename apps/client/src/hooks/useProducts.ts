import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import { factoryClient } from '@/api/client';
import { kickSync } from '@/store/syncStore';
import type { Product } from '@/types';
import type { AxiosError } from 'axios';
import { usePaginatedQuery, type PaginatedResult } from './usePaginatedQuery';
import i18n from '@/i18n';

function translateBackendError(msg: string): string {
  if (!msg)
    return i18n.t('products.msgUnknownServerError', { defaultValue: 'Неизвестная ошибка сервера' });
  const m = msg.toLowerCase();
  if (m.includes('internal server error'))
    return i18n.t('products.msgInternalServerError', {
      defaultValue: 'Внутренняя ошибка сервера (500)',
    });
  if (m.includes('validation error'))
    return i18n.t('products.msgValidationError', { defaultValue: 'Ошибка валидации данных' });
  if (m.includes('not found'))
    return i18n.t('products.msgNotFoundServer', { defaultValue: 'Товар не найден на сервере' });
  if (m.includes('token_not_valid') || m.includes('token'))
    return i18n.t('products.msgTokenInvalid', {
      defaultValue: 'Ошибка авторизации (токен недействителен)',
    });
  return msg;
}

export function useProductsPaginated(
  page: number,
  pageSize: number,
  search = '',
  status = 'all',
): PaginatedResult<Product> {
  const filterFn = (p: Product) => {
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q || p.name.toLowerCase().includes(q) || p.barcode.toLowerCase().includes(q);
    const matchesStatus = status === 'all' ? p.status !== 'inactive' : p.status === status;
    return matchesSearch && matchesStatus;
  };

  const result = usePaginatedQuery(db.products, pageSize, filterFn, 'name');

  if (result.page !== page) result.setPage(page);
  if (result.pageSize !== pageSize) result.setPageSize(pageSize);

  return result;
}

export function useProducts(): Product[] {
  return useLiveQuery(() => db.products.filter((p) => !p.isArchived).toArray(), [], []);
}

export function useProduct(id: string): Product | undefined {
  return useLiveQuery(() => db.products.get(id), [id]);
}

export function useLowStockProducts(threshold = 10): Product[] {
  return useLiveQuery(
    () => db.products.filter((p) => p.stockQuantity <= threshold && !p.isArchived).toArray(),
    [threshold],
    [],
  );
}

/** Convert internal Product to factory-service snake_case schema */
function toFactoryPayload(product: Partial<Product> & { barcode?: string; name?: string }) {
  const payload: Record<string, unknown> = {
    barcode: product.barcode ?? '',
    name: product.name ?? '',
    pieces_per_box: product.boxQuantity ?? 1,
    factory_price: String(product.factoryPrice ?? 0),
    dispatch_price: String(product.driverPrice ?? product.factoryPrice ?? 0),
    status: product.status ?? 'active',
    batch_number: product.batchNumber ?? 'BATCH-1',
    expiry_date:
      product.expirationDate ??
      new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  };
  return payload;
}

/** Convert partial internal Product to factory-service selective patch payload */
function toFactoryPatchPayload(changes: Partial<Product>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (changes.barcode !== undefined) payload.barcode = changes.barcode;
  if (changes.name !== undefined) payload.name = changes.name;
  if (changes.boxQuantity !== undefined) payload.pieces_per_box = changes.boxQuantity;
  if (changes.factoryPrice !== undefined) payload.factory_price = String(changes.factoryPrice);
  if (changes.driverPrice !== undefined) {
    payload.dispatch_price = String(changes.driverPrice);
  } else if (changes.factoryPrice !== undefined) {
    payload.dispatch_price = String(changes.factoryPrice);
  }
  if (changes.status !== undefined) payload.status = changes.status;
  if (changes.batchNumber !== undefined) payload.batch_number = changes.batchNumber;
  if (changes.expirationDate !== undefined) payload.expiry_date = changes.expirationDate;
  return payload;
}

export async function addProduct(product: Product): Promise<void> {
  const existingBarcode = await db.products.where('barcode').equals(product.barcode).first();
  if (existingBarcode) {
    throw new Error(
      i18n.t('products.msgBarcodeExists', {
        barcode: product.barcode,
        name: existingBarcode.name,
        defaultValue: `Товар со штрих-кодом «${product.barcode}» уже существует: «${existingBarcode.name}»`,
      }),
    );
  }

  const existing = await db.products.get(product.id);
  if (existing) {
    throw new Error(
      i18n.t('products.msgIdExists', {
        id: product.id,
        defaultValue: `Товар с ID ${product.id} уже существует`,
      }),
    );
  }

  await db.products.add(product);

  try {
    const response = await factoryClient.post<{ id: string }>(
      '/products/',
      toFactoryPayload(product),
    );

    if (response.data?.id && response.data.id !== product.id) {
      await db.products.delete(product.id);
      await db.products.add({ ...product, id: response.data.id });
    }
  } catch (err: unknown) {
    const status = (err as AxiosError)?.response?.status;

    if (status === 403) {
      await db.products.delete(product.id);
      throw new Error(
        i18n.t('products.msgForbidden', {
          defaultValue: 'Нет прав доступа. Данные не синхронизированы.',
        }),
      );
    }

    const isNetworkError =
      !err || (typeof err === 'object' && 'isAxiosError' in err && (!status || status >= 500));

    if (isNetworkError) {
      await db.productRetries.add({
        action: 'POST',
        payload: product,
        createdAt: new Date().toISOString(),
        status: 'pending',
        retryCount: 0,
      });
      kickSync();
    } else {
      await db.products.delete(product.id);
    }
    const backendMsg = ((err as AxiosError)?.response?.data as Record<string, unknown>)?.error
      ? ((
          ((err as AxiosError)?.response?.data as Record<string, unknown>)?.error as Record<
            string,
            unknown
          >
        )?.message as string)
      : undefined;
    throw new Error(
      isNetworkError
        ? i18n.t('products.msgNetworkSavedLocally', {
            defaultValue: 'Нет сети. Товар сохранён локально и будет отправлен позже.',
          })
        : `${i18n.t('products.msgServerError', { defaultValue: 'Ошибка сервера' })}: ${translateBackendError(backendMsg ?? '')}`,
    );
  }
}

export async function updateProduct(id: string, changes: Partial<Product>): Promise<void> {
  await db.products.update(id, changes);
  const updatedProduct = await db.products.get(id);

  try {
    const patchPayload = toFactoryPatchPayload(changes);
    if (Object.keys(patchPayload).length > 0) {
      await factoryClient.patch(`/products/${id}/`, patchPayload);
    }
  } catch (err: unknown) {
    const status = (err as AxiosError)?.response?.status;

    if (status === 403) {
      throw new Error(
        i18n.t('products.msgForbidden', {
          defaultValue: 'Нет прав доступа. Данные не синхронизированы.',
        }),
      );
    }

    if (status === 404 && updatedProduct) {
      try {
        const postRes = await factoryClient.post<{ id: string }>(
          '/products/',
          toFactoryPayload(updatedProduct),
        );
        if (postRes.data?.id && postRes.data.id !== id) {
          await db.products.delete(id);
          await db.products.add({ ...updatedProduct, id: postRes.data.id });
        }
        return;
      } catch {
        await db.productRetries.add({
          action: 'POST',
          payload: updatedProduct,
          createdAt: new Date().toISOString(),
          status: 'pending',
          retryCount: 0,
        });
        kickSync();
        return;
      }
    }

    const isNetworkError =
      !err || (typeof err === 'object' && 'isAxiosError' in err && (!status || status >= 500));

    if (isNetworkError) {
      await db.productRetries.add({
        action: 'PATCH',
        payload: { id, ...changes },
        createdAt: new Date().toISOString(),
        status: 'pending',
        retryCount: 0,
      });
      kickSync();
    }
    const backendMsg = ((err as AxiosError)?.response?.data as Record<string, unknown>)?.error
      ? ((
          ((err as AxiosError)?.response?.data as Record<string, unknown>)?.error as Record<
            string,
            unknown
          >
        )?.message as string)
      : undefined;
    throw new Error(
      isNetworkError
        ? i18n.t('products.msgNetworkChangesSavedLocally', {
            defaultValue: 'Нет сети. Изменения сохранены локально.',
          })
        : `${i18n.t('products.msgServerError', { defaultValue: 'Ошибка сервера' })}: ${translateBackendError(backendMsg ?? '')}`,
    );
  }
}

export async function deleteProduct(id: string): Promise<void> {
  await db.products.update(id, { isArchived: true, status: 'inactive' });

  try {
    await factoryClient.delete(`/products/${id}/`);
  } catch (err: unknown) {
    const status = (err as AxiosError)?.response?.status;

    if (status === 403) {
      throw new Error(
        i18n.t('products.msgForbidden', {
          defaultValue: 'Нет прав доступа. Данные не синхронизированы.',
        }),
      );
    }

    const isNetworkError =
      !err || (typeof err === 'object' && 'isAxiosError' in err && (!status || status >= 500));

    if (isNetworkError) {
      await db.productRetries.add({
        action: 'DELETE',
        payload: { id },
        createdAt: new Date().toISOString(),
        status: 'pending',
        retryCount: 0,
      });
      kickSync();
    }
    const backendMsg = ((err as AxiosError)?.response?.data as Record<string, unknown>)?.error
      ? ((
          ((err as AxiosError)?.response?.data as Record<string, unknown>)?.error as Record<
            string,
            unknown
          >
        )?.message as string)
      : undefined;
    throw new Error(
      isNetworkError
        ? i18n.t('products.msgNetworkDeleteSavedLocally', {
            defaultValue: 'Нет сети. Удаление сохранено локально.',
          })
        : `${i18n.t('products.msgServerError', { defaultValue: 'Ошибка сервера' })}: ${translateBackendError(backendMsg ?? '')}`,
    );
  }
}
