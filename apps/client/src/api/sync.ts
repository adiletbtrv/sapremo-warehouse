import type {
  Product,
  Driver,
  Order,
  Transaction,
  FactoryOrder,
  GoodsReceipt,
  ReceiptItem,
  ProductReturn,
  StockItem,
} from '@/types';
import { useAuthStore } from '@/store/authStore';
import { db } from '@/db/schema';
import { ApiProductSchema } from './parsers';
import {
  mergeFactoryOrders,
  mapApiFactoryOrder,
  getDeliveredFactoryOrderIds,
} from '@/utils/factoryOrderStatus';
import {
  mapApiProduct,
  mapApiOrder,
  mapFactoryOrderToReceipt,
  type RawApiProduct,
  type RawApiOrder,
} from './mappers';
import { roundCurrency } from '@/utils/money';
import { resolveLWWConflict } from '@/utils/conflictResolution';

interface ApiProduct {
  id?: string;
  barcode: string;
  name: string;
  /** factory-service returns pieces_per_box */
  pieces_per_box?: number;
  piecesPerBox?: number;
  boxQuantity?: number;
  /** factory-service returns expiry_date */
  expiry_date?: string;
  expirationDate?: string;
  /** factory-service returns batch_number */
  batch_number?: string;
  batchNumber?: string;
  /** factory-service returns factory_price */
  factory_price?: number | string;
  factoryPrice?: number | string;
  status: string;
  stockQuantity: number;
}

interface ApiDriver {
  id: string;
  fullName: string;
  /** drivers-service uses carNumber */
  carNumber?: string;
  vehicleNumber?: string;
  phone?: string;
  currentDebt?: number | string;
  totalDebt?: number | string;
}

interface ApiDriverDebt {
  driverId?: string;
  id?: string;
  fullName?: string;
  carNumber?: string;
  totalDebt?: number | string;
  currentDebt?: number | string;
  updatedAt?: string;
}

/** Shape returned by drivers-service for a single order item */
interface ApiOrderItem {
  id?: string;
  productId: string;
  requestedQty?: number;
  approvedQty?: number;
  qty?: number;
  /** drivers-service may return box count directly */
  box_count?: number;
  boxCount?: number;
}

/** Shape returned by drivers-service for a single order */
interface ApiOrder {
  id: string;
  driverId: string;
  warehouseId?: string;
  status: string;
  requestedAt?: string;
  createdAt?: string;
  date?: string;
  totalAmount?: number;
  comment?: string;
  items: ApiOrderItem[];
}

/** Spring-style paginated response from drivers-service */
interface SpringPage<T> {
  content: T[];
  totalElements?: number;
  totalPages?: number;
}

interface ApiTransaction {
  id: number | string;
  type: string;
  amount: number;
  paymentMethod: string;
  comment?: string;
  createdAt?: string;
  date?: string;
  driverId?: number | string;
}

interface ApiDriverPayment {
  id: string;
  driverId: string;
  amount: number;
  paymentMethod: string;
  comment?: string;
  receivedBy?: string;
  paidAt?: string;
  createdAt?: string;
}

export interface ApiFactoryOrder {
  id: string;
  warehouse_id?: string;
  warehouseId?: string;
  created_at?: string;
  createdAt?: string;
  date?: string;
  status: string;
  comment?: string;
  items: {
    id?: string;
    product_id?: string;
    productId?: string;
    productName?: string;
    quantity?: number;
    qty?: number;
  }[];
}

export interface ApiReturnItem {
  id?: string;
  productId?: string;
  product_id?: string;
  barcode?: string;
  productName?: string;
  name?: string;
  qtyBoxes?: number;
  quantityBoxes?: number;
  box_count?: number;
  boxCount?: number;
  qtyPieces?: number;
  quantityPieces?: number;
  quantity?: number;
  qty?: number;
  reason?: string;
}

export interface ApiReturn {
  id: string | number;
  returnType?: string;
  return_type?: string;
  driverId?: string | number;
  driver_id?: string | number;
  driverName?: string;
  date?: string;
  createdAt?: string;
  created_at?: string;
  totalAmount?: number;
  total_amount?: number;
  isArchived?: boolean;
  is_archived?: boolean;
  comment?: string;
  notes?: string;
  items?: ApiReturnItem[];
}

interface ApiDashboardSummary {
  cashBalance?: number;
  factoryDebt?: number;
  totalDriversDebt?: number;
  lowStockProducts?: number;
  newOrders?: number;
}

export interface ApiServerReceptionItem {
  id?: string;
  delivery_id?: string;
  product_id?: string;
  productId?: string;
  product_name?: string;
  productName?: string;
  product_barcode?: string;
  barcode?: string;
  expected_qty?: number;
  expectedQuantity?: number;
  actual_qty?: number;
  actualQuantity?: number;
  factory_price?: string | number;
  factoryPrice?: string | number;
  discrepancy_type?: string;
}

export interface ApiServerReception {
  id?: string;
  client_id?: string;
  clientId?: string;
  delivery_number?: string;
  deliveryNumber?: string;
  warehouse_order_id?: string;
  warehouseOrderId?: string;
  order_id?: string;
  orderId?: string;
  delivered_at?: string;
  deliveredAt?: string;
  created_at?: string;
  createdAt?: string;
  date?: string;
  status?: string;
  supplier_name?: string;
  supplierName?: string;
  total_amount?: string | number;
  totalAmount?: string | number;
  items?: ApiServerReceptionItem[];
}

export function mapApiServerReception(rec: ApiServerReception, products: Product[]): GoodsReceipt {
  const rawItems = Array.isArray(rec.items) ? rec.items : [];
  const items: ReceiptItem[] = rawItems.map((it) => {
    const itBarcode = String(it.product_barcode ?? it.barcode ?? '').trim();
    const itProdId = String(it.product_id ?? it.productId ?? '').trim();
    const prod = products.find(
      (p) =>
        (itBarcode && String(p.barcode).trim() === itBarcode) ||
        (itProdId && String(p.id).trim() === itProdId) ||
        (it.product_name && p.name.toLowerCase().trim() === it.product_name.toLowerCase().trim()),
    );
    const actualQuantity = Number(it.actual_qty ?? it.actualQuantity ?? it.expected_qty ?? 0);
    const expectedQuantity = Number(it.expected_qty ?? it.expectedQuantity ?? actualQuantity);
    const factoryPrice = Number(it.factory_price ?? it.factoryPrice ?? prod?.factoryPrice ?? 0);
    const pcsPerBox = prod?.boxQuantity && prod.boxQuantity > 0 ? prod.boxQuantity : 1;
    const quantityBoxes = Math.max(1, Math.ceil(actualQuantity / pcsPerBox));

    return {
      barcode: prod?.barcode ?? itBarcode ?? itProdId,
      productName: prod?.name ?? it.product_name ?? it.productName ?? 'Товар',
      quantityBoxes,
      expectedQuantity,
      actualQuantity,
      discrepancyType: (it.discrepancy_type ?? 'none') as ReceiptItem['discrepancyType'],
      factoryPrice,
    };
  });

  const totalAmount = Number(
    rec.total_amount ??
      rec.totalAmount ??
      items.reduce((s, it) => s + it.actualQuantity * it.factoryPrice, 0),
  );

  // Очищаем номер накладной от префикса 'offline-' и используем человекочитаемый номер
  const rawDelivNumber = String(rec.delivery_number ?? rec.deliveryNumber ?? '').trim();
  const cleanDelivNumber = rawDelivNumber.replace(/^offline-/, '');
  const rawClientId = String(rec.client_id ?? rec.clientId ?? '').trim();

  // Приоритет номера накладной: client_id -> clean delivery_number -> id
  const displayId =
    (rawClientId && !rawClientId.startsWith('offline-') ? rawClientId : '') ||
    cleanDelivNumber ||
    String(rec.id ?? crypto.randomUUID());

  const factoryOrderId =
    rec.warehouse_order_id ?? rec.warehouseOrderId ?? rec.order_id ?? rec.orderId ?? undefined;

  return {
    id: displayId,
    date: rec.delivered_at ?? rec.created_at ?? rec.createdAt ?? new Date().toISOString(),
    status: 'completed',
    supplierName: rec.supplier_name ?? rec.supplierName ?? 'Завод',
    totalAmount: roundCurrency(totalAmount),
    items,
    factoryOrderId: factoryOrderId ? String(factoryOrderId) : undefined,
    isSynced: true,
    syncStatus: 'synced',
  };
}

export function areReceiptsEquivalent(r1: GoodsReceipt, r2: GoodsReceipt): boolean {
  if (r1.id === r2.id) return true;
  if (r1.factoryOrderId && r2.factoryOrderId && r1.factoryOrderId === r2.factoryOrderId)
    return true;

  const amountDiff = Math.abs((Number(r1.totalAmount) || 0) - (Number(r2.totalAmount) || 0));
  if (amountDiff > 0.01) return false;

  const t1 = new Date(r1.date).getTime();
  const t2 = new Date(r2.date).getTime();
  const sameDate = isNaN(t1) || isNaN(t2) || Math.abs(t1 - t2) < 1000 * 60 * 60 * 24;
  if (!sameDate) return false;

  const items1 = Array.isArray(r1.items) ? r1.items : [];
  const items2 = Array.isArray(r2.items) ? r2.items : [];
  if (items1.length !== items2.length) return false;

  return items1.every((it1) =>
    items2.some(
      (it2) =>
        (it2.barcode === it1.barcode ||
          (it2.productName &&
            it1.productName &&
            it2.productName.trim().toLowerCase() === it1.productName.trim().toLowerCase())) &&
        Number(it2.actualQuantity) === Number(it1.actualQuantity),
    ),
  );
}

type PaginatedOrArray<T> = T[] | { results: T[]; count?: number } | SpringPage<T>;

const toArray = <T>(data: PaginatedOrArray<T> | null | undefined): T[] => {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if ('content' in data && Array.isArray(data.content)) {
    return data.content;
  }
  if ('results' in data && Array.isArray((data as { results: T[] }).results)) {
    return (data as { results: T[] }).results;
  }
  if ('data' in data && Array.isArray((data as { data: T[] }).data)) {
    return (data as { data: T[] }).data;
  }
  return [];
};

export const fetchInitialData = async () => {
  const { factoryClient, driversClient, warehouseClient } = await import('@/api/client');
  const user = useAuthStore.getState().user;
  const warehouseId = user?.warehouseId;
  const userRole = user?.role ?? '';
  const isAdmin = userRole === 'admin' || !warehouseId;

  const [
    productsRes,
    driversRes,
    debtsRes,
    ordersRes,
    txRes,
    driverPaymentsRes,
    factoryOrdersRes,
    inventoryRes,
    dashboardRes,
    returnsRes,
    receptionsRes,
  ] = await Promise.all([
    factoryClient.get<PaginatedOrArray<ApiProduct>>('/products/').catch(() =>
      factoryClient
        .get<PaginatedOrArray<ApiProduct>>('/products/', {
          params: { page: 1, page_size: 1000 },
        })
        .catch(() => ({ data: [] as ApiProduct[] })),
    ),
    driversClient
      .get<PaginatedOrArray<ApiDriver>>('', { params: { page: 0, size: 1000 } })
      .catch(() => ({ data: [] as ApiDriver[] })),
    isAdmin
      ? Promise.resolve({ data: [] as ApiDriverDebt[] })
      : driversClient
          .get<PaginatedOrArray<ApiDriverDebt>>('/debts', { params: { page: 0, size: 1000 } })
          .catch(() => ({ data: [] as ApiDriverDebt[] })),
    isAdmin
      ? Promise.resolve({ data: [] as ApiOrder[] })
      : driversClient
          .get<PaginatedOrArray<ApiOrder>>('/orders', {
            params: { page: 0, size: 1000 },
          })
          .catch(() => ({ data: [] as ApiOrder[] })),
    isAdmin
      ? Promise.resolve({ data: [] as ApiTransaction[] })
      : warehouseClient
          .get<PaginatedOrArray<ApiTransaction>>('/cashbox/transactions')
          .catch(() => ({ data: [] as ApiTransaction[] })),
    isAdmin
      ? Promise.resolve({ data: [] as ApiDriverPayment[] })
      : driversClient
          .get<PaginatedOrArray<ApiDriverPayment>>('/payments', {
            params: { page: 0, size: 1000 },
          })
          .catch(() => ({ data: [] as ApiDriverPayment[] })),
    factoryClient.get<PaginatedOrArray<ApiFactoryOrder>>('/warehouse-orders/').catch(() =>
      factoryClient
        .get<PaginatedOrArray<ApiFactoryOrder>>('/warehouse-orders/', {
          params: { page: 1, page_size: 1000 },
        })
        .catch(() => ({ data: [] as ApiFactoryOrder[] })),
    ),
    isAdmin
      ? Promise.resolve({ data: [] as StockItem[] })
      : warehouseClient
          .get<PaginatedOrArray<StockItem>>('/inventory')
          .catch(() => ({ data: [] as StockItem[] })),
    isAdmin
      ? Promise.resolve({ data: null as ApiDashboardSummary | null })
      : warehouseClient
          .get<ApiDashboardSummary>('/dashboard')
          .catch(() => ({ data: null as ApiDashboardSummary | null })),
    driversClient
      .get<PaginatedOrArray<ApiReturn>>('/returns', { params: { page: 0, size: 1000 } })
      .catch(() => ({ data: [] as ApiReturn[] })),
    factoryClient
      .get<PaginatedOrArray<ApiServerReception>>('/reception/')
      .catch(() =>
        factoryClient
          .get<PaginatedOrArray<ApiServerReception>>('/receptions/')
          .catch(() =>
            factoryClient
              .get<PaginatedOrArray<ApiServerReception>>('/deliveries/')
              .catch(() => ({ data: [] as ApiServerReception[] })),
          ),
      ),
  ]);

  const rawProducts = toArray(productsRes.data);
  const parsedProducts: ApiProduct[] = [];
  rawProducts.forEach((p) => {
    const parsed = ApiProductSchema.safeParse(p);
    if (parsed.success) {
      parsedProducts.push(parsed.data as ApiProduct);
    } else {
      parsedProducts.push(p as unknown as ApiProduct);
    }
  });

  const rawStock = toArray(inventoryRes.data);
  const stockByBarcode = new Map<string, StockItem>();
  const stockByProductId = new Map<string, StockItem>();
  const stockByName = new Map<string, StockItem>();

  rawStock.forEach((st) => {
    if (st.barcode) stockByBarcode.set(String(st.barcode).trim(), st);
    if (st.productId) stockByProductId.set(String(st.productId), st);
    if (st.productName) stockByName.set(st.productName.toLowerCase().trim(), st);
  });

  const localProducts = await db.products.toArray();
  const localProductById = new Map(localProducts.map((p) => [p.id, p]));
  const localProductByBarcode = new Map(localProducts.map((p) => [p.barcode, p]));

  const products: Product[] = parsedProducts.map((p) => {
    const st =
      (p.barcode ? stockByBarcode.get(p.barcode.trim()) : undefined) ??
      (p.id ? stockByProductId.get(p.id) : undefined) ??
      (p.name ? stockByName.get(p.name.toLowerCase().trim()) : undefined);

    const localP =
      (p.id ? localProductById.get(p.id) : undefined) ??
      (p.barcode ? localProductByBarcode.get(p.barcode) : undefined);

    return mapApiProduct(p as RawApiProduct, st, localP);
  });

  const rawDrivers = toArray(driversRes.data);
  const rawDebts = toArray(debtsRes.data);
  const debtsByDriverId = new Map<string, number>();

  rawDebts.forEach((debt) => {
    const dId = String(debt.driverId ?? debt.id ?? '').trim();
    if (dId) {
      const rawVal = Number(debt.totalDebt ?? debt.currentDebt ?? 0);
      const safeVal = Number.isFinite(rawVal) ? Math.max(0, rawVal) : 0;
      debtsByDriverId.set(dId, safeVal);
    }
  });

  // Получаем список ID водителей и заказов, по которым есть несинхронизированные операции
  const allSyncTasks = await db.syncQueue.toArray();
  const pendingDriverIds = new Set(
    allSyncTasks
      .map((t) => {
        if ('driverId' in t.payload) {
          return String(t.payload.driverId);
        }
        return null;
      })
      .filter(Boolean),
  );

  const queuedOrderIds = new Set(
    allSyncTasks
      .map((t) => {
        if (
          t.action === 'DISPATCH_ORDER' ||
          t.action === 'CREATE_ORDER' ||
          t.action === 'UPDATE_ORDER' ||
          t.action === 'MODIFY_ORDER'
        ) {
          return (t.payload as { id?: string })?.id;
        }
        return null;
      })
      .filter(Boolean),
  );

  const localOrders = await db.orders.toArray();
  const localOrdersMap = new Map(localOrders.map((o) => [o.id, o]));
  const localTransactions = await db.transactions.toArray();
  const initialLocalReturns = await db.returns.toArray();

  const drivers: Driver[] = await Promise.all(
    rawDrivers.map(async (d) => {
      const driverId = String(d.id);
      const serverDebt = debtsByDriverId.get(driverId) ?? Number(d.currentDebt ?? d.totalDebt ?? 0);
      let currentDebt = Number.isFinite(serverDebt) ? Math.max(0, serverDebt) : 0;

      if (pendingDriverIds.has(driverId)) {
        const localDriver = await db.drivers.get(driverId);
        if (localDriver && Number.isFinite(localDriver.currentDebt)) {
          currentDebt = localDriver.currentDebt;
        }
      } else if (currentDebt === 0) {
        const localDriver = await db.drivers.get(driverId);
        if (
          localDriver &&
          Number.isFinite(localDriver.currentDebt) &&
          localDriver.currentDebt > 0
        ) {
          currentDebt = localDriver.currentDebt;
        } else {
          // Вычисляем задолженность водителя по заказам, оплатам и возвратам
          const driverOrdersTotal = localOrders
            .filter(
              (o) =>
                o.driverId === driverId && (o.status === 'DISPATCHED' || o.status === 'CONFIRMED'),
            )
            .reduce((sum, o) => sum + (o.totalAmount || 0), 0);
          const driverPaymentsTotal = localTransactions
            .filter((t) => String(t.driverId) === driverId && t.type === 'driver_payment')
            .reduce((sum, t) => sum + (t.amount || 0), 0);
          const driverReturnsTotal = initialLocalReturns
            .filter((r) => String(r.driverId) === driverId && r.returnType === 'from_driver')
            .reduce((sum, r) => sum + (r.totalAmount || 0), 0);
          const calcDebt = Math.max(
            0,
            driverOrdersTotal - driverPaymentsTotal - driverReturnsTotal,
          );
          if (calcDebt > 0) {
            currentDebt = calcDebt;
          }
        }
      }

      return {
        id: driverId,
        fullName: d.fullName,
        carNumber: d.carNumber ?? d.vehicleNumber,
        vehicleNumber: d.carNumber ?? d.vehicleNumber,
        phone: d.phone,
        currentDebt,
      };
    }),
  );

  const rawOrders: ApiOrder[] = toArray(ordersRes.data);
  const mappedServerOrders: Order[] = rawOrders.map((o) =>
    mapApiOrder(o as unknown as RawApiOrder, products, drivers),
  );

  const orders: Order[] = mappedServerOrders.map((serverOrder) => {
    const local = localOrdersMap.get(serverOrder.id);
    if (!local) return serverOrder;

    const localItemsMatchServer =
      local.items.length === serverOrder.items.length &&
      local.items.every((localItem, index) => {
        const serverItem = serverOrder.items[index];
        return (
          localItem.barcode === serverItem?.barcode &&
          localItem.boxCount === serverItem?.boxCount &&
          localItem.quantity === serverItem?.quantity &&
          localItem.amount === serverItem?.amount
        );
      }) &&
      local.totalAmount === serverOrder.totalAmount;

    if (local.localUpdatedAt && !localItemsMatchServer) {
      const lww = resolveLWWConflict(local, serverOrder, queuedOrderIds.has(serverOrder.id));
      return lww.resolved;
    }

    // Если заказ локально уже выдан, модифицирован или находится в очереди синхронизации, сохраняем локальное состояние
    const isLocallyModified =
      local.status === 'DISPATCHED' ||
      local.status === 'MODIFIED' ||
      queuedOrderIds.has(serverOrder.id) ||
      (local.totalAmount !== undefined &&
        local.totalAmount > 0 &&
        Math.abs(local.totalAmount - (serverOrder.totalAmount ?? 0)) > 0.01);

    if (isLocallyModified) {
      const hasDefectiveItems = (local.items || []).some((it) => !it.boxCount || it.boxCount <= 0);
      return {
        ...local,
        ...serverOrder,
        status: local.status,
        invoiceNumber: local.invoiceNumber ?? serverOrder.invoiceNumber,
        date: local.date ?? serverOrder.date,
        localUpdatedAt: local.localUpdatedAt,
        items: hasDefectiveItems ? serverOrder.items : (local.items ?? serverOrder.items),
        totalAmount: local.totalAmount ?? serverOrder.totalAmount,
      };
    }
    return serverOrder;
  });

  // Сохраняем локальные заказы, которых еще нет на сервере
  localOrders.forEach((local) => {
    if (!orders.some((o) => o.id === local.id)) {
      orders.push(local);
    }
  });

  // Синхронизация приемок (receipts): объединяем серверные накладные с завода, локальные и завершенные заказы
  const rawServerReceptions = toArray(receptionsRes.data);
  const serverReceipts: GoodsReceipt[] = rawServerReceptions.map((rec) =>
    mapApiServerReception(rec as unknown as ApiServerReception, products),
  );

  const existingReceipts = await db.receipts.toArray();
  const staleLocalReceiptIds: string[] = [];

  // 1. Очищаем накопленные локальные дубликаты в базе данных
  const uniqueLocalReceipts: GoodsReceipt[] = [];
  existingReceipts.forEach((loc) => {
    const duplicate = uniqueLocalReceipts.find((u) => areReceiptsEquivalent(u, loc));
    if (duplicate) {
      const locIsUuid =
        loc.id.startsWith('op-') || loc.id.startsWith('offline-') || loc.id.length >= 32;
      const dupIsUuid =
        duplicate.id.startsWith('op-') ||
        duplicate.id.startsWith('offline-') ||
        duplicate.id.length >= 32;
      if (dupIsUuid && !locIsUuid) {
        staleLocalReceiptIds.push(duplicate.id);
        const idx = uniqueLocalReceipts.indexOf(duplicate);
        uniqueLocalReceipts[idx] = loc;
      } else {
        staleLocalReceiptIds.push(loc.id);
      }
    } else {
      uniqueLocalReceipts.push({
        ...loc,
        isSynced: loc.isSynced ?? true,
        syncStatus: loc.syncStatus ?? 'synced',
      });
    }
  });

  const receipts: GoodsReceipt[] = [...uniqueLocalReceipts];
  const existingReceiptIds = new Set(receipts.map((r) => r.id));

  // 2. Объединяем с серверными накладными от завода без дублирования
  serverReceipts.forEach((sr) => {
    const existingIndex = receipts.findIndex((r) => areReceiptsEquivalent(r, sr));
    if (existingIndex >= 0) {
      const existing = receipts[existingIndex];
      const srIsUuid =
        sr.id.startsWith('op-') || sr.id.startsWith('offline-') || sr.id.length >= 32;
      const finalId = srIsUuid ? existing.id : sr.id;

      if (sr.id !== finalId) {
        staleLocalReceiptIds.push(sr.id);
      }
      if (existing.id !== finalId) {
        staleLocalReceiptIds.push(existing.id);
      }

      receipts[existingIndex] = {
        ...existing,
        ...sr,
        id: finalId,
        factoryOrderId: existing.factoryOrderId ?? sr.factoryOrderId,
        isSynced: true,
        syncStatus: 'synced',
      };
    } else {
      receipts.push(sr);
      existingReceiptIds.add(sr.id);
    }
  });

  if (staleLocalReceiptIds.length > 0) {
    await db.receipts.bulkDelete(staleLocalReceiptIds);
  }

  const existingFactoryOrders = await db.factoryOrders.toArray();
  const factoryOrders: FactoryOrder[] = toArray(factoryOrdersRes.data).map((fo) =>
    mapApiFactoryOrder(fo, products),
  );
  const deliveredOrderIds = getDeliveredFactoryOrderIds(
    existingFactoryOrders,
    receipts,
    factoryOrders,
  );
  const mergedFactoryOrders = mergeFactoryOrders(
    factoryOrders,
    existingFactoryOrders,
    deliveredOrderIds,
  );

  mergedFactoryOrders.forEach((fo) => {
    const isCompleted = ['delivered', 'completed', 'accepted', 'approved'].includes(
      String(fo.status).toLowerCase(),
    );
    const alreadyPresent =
      existingReceiptIds.has(fo.id) ||
      receipts.some(
        (r) =>
          r.id === fo.id ||
          r.factoryOrderId === fo.id ||
          (Array.isArray(fo.items) &&
            Array.isArray(r.items) &&
            fo.items.length === r.items.length &&
            fo.items.every((fi) =>
              r.items.some(
                (ri) =>
                  (ri.barcode === fi.productId || ri.productName === fi.productName) &&
                  ri.quantityBoxes === fi.qty,
              ),
            )),
      );

    if (isCompleted && !alreadyPresent) {
      const generatedReceipt = mapFactoryOrderToReceipt(fo, products);
      generatedReceipt.isSynced = true;
      generatedReceipt.syncStatus = 'synced';
      receipts.push(generatedReceipt);
      existingReceiptIds.add(fo.id);
    }
  });

  const existingTransactions = await db.transactions.toArray();
  const existingTxMap = new Map(existingTransactions.map((t) => [String(t.id), t]));

  const rawDriverPayments = toArray(driverPaymentsRes.data);
  const rawTransactions = toArray(txRes.data);

  const ensureUtcIso = (dateStr?: string): string => {
    if (!dateStr) return new Date().toISOString();
    // Если сервер отдал ISO-строку без Z и без смещения (например "2026-08-17T19:13:18.823904"),
    // трактуем ее как UTC время, чтобы избежать 6-часового смещения при разборе в браузере
    if (!dateStr.endsWith('Z') && !dateStr.includes('+')) {
      return dateStr + 'Z';
    }
    return dateStr;
  };

  // 1. Формируем список оплат водителей из drivers-service (где точно известны driverId и fullName)
  const driverTxList: Transaction[] = rawDriverPayments.map((dp) => {
    const dId = String(dp.driverId ?? '').trim();
    const driver = drivers.find((d) => String(d.id) === dId);
    const rawMethod = (dp.paymentMethod ?? 'CASH').toLowerCase();
    const paymentMethod: Transaction['paymentMethod'] =
      rawMethod === 'transfer' ? 'transfer' : 'cash';
    const date = ensureUtcIso(dp.paidAt ?? dp.createdAt);

    return {
      id: String(dp.id),
      type: 'driver_payment',
      amount: Number(dp.amount) || 0,
      date,
      paymentMethod,
      driverId: dId || undefined,
      driverName: driver?.fullName,
      comment: dp.comment,
    };
  });

  // 2. Обрабатываем транзакции из warehouse-service и связываем дубликаты
  const usedWarehouseTxIds = new Set<string>();
  const finalTransactions: Transaction[] = [];

  // Добавляем платежи водителей и находим соответствующие записи склада по сумме, водителю и времени
  driverTxList.forEach((dpTx) => {
    const dpTime = new Date(dpTx.date).getTime();
    const dpAmount = Number(dpTx.amount) || 0;

    const match = rawTransactions.find((wt) => {
      if (usedWarehouseTxIds.has(String(wt.id))) return false;
      const rawType = (wt.type ?? '').toLowerCase();
      if (rawType === 'factory_payment' || rawType === 'payment_to_factory') return false;

      const wtAmount = Number(wt.amount) || 0;
      if (Math.abs(wtAmount - dpAmount) > 0.01) return false;

      if (wt.driverId && dpTx.driverId && String(wt.driverId) !== String(dpTx.driverId)) {
        return false;
      }

      const wtTime = new Date(ensureUtcIso(wt.createdAt ?? wt.date)).getTime();
      return isNaN(wtTime) || isNaN(dpTime) || Math.abs(wtTime - dpTime) < 1000 * 60 * 60 * 24;
    });

    if (match) {
      usedWarehouseTxIds.add(String(match.id));
      const comment = (match.comment?.trim() ? match.comment : dpTx.comment) ?? '';
      finalTransactions.push({
        ...dpTx,
        id: String(match.id) || dpTx.id,
        comment: comment || dpTx.comment,
      });
    } else {
      finalTransactions.push(dpTx);
    }
  });

  // 3. Добавляем оставшиеся транзакции склада (включая FACTORY_PAYMENT и архивные платежи)
  rawTransactions.forEach((wt) => {
    const wtId = String(wt.id);
    if (usedWarehouseTxIds.has(wtId)) return;

    const rawType = (wt.type ?? '').toLowerCase();
    const isFactory = rawType === 'factory_payment' || rawType === 'payment_to_factory';
    const date = ensureUtcIso(wt.createdAt ?? wt.date);
    const paymentMethod: Transaction['paymentMethod'] =
      wt.paymentMethod?.toLowerCase() === 'transfer' ? 'transfer' : 'cash';

    if (isFactory) {
      finalTransactions.push({
        id: wtId,
        amount: Number(wt.amount) || 0,
        date,
        type: 'factory_payment',
        paymentMethod,
        comment: wt.comment,
      });
    } else {
      const existing = existingTxMap.get(wtId);
      const driverId = wt.driverId ? String(wt.driverId) : existing?.driverId;
      const driverName = driverId
        ? (drivers.find((d) => String(d.id) === driverId)?.fullName ?? existing?.driverName)
        : existing?.driverName;

      finalTransactions.push({
        id: wtId,
        amount: Number(wt.amount) || 0,
        date,
        type: 'driver_payment',
        paymentMethod,
        driverId,
        driverName,
        comment: wt.comment ?? existing?.comment,
      });
    }
  });

  // 4. Сохраняем локальные транзакции, которых еще нет на сервере (например, созданные оффлайн или ожидающие синхронизации)
  const finalTxIds = new Set(finalTransactions.map((t) => String(t.id)));
  const staleLocalTxIds: string[] = [];
  existingTransactions.forEach((localTx) => {
    if (!localTx.id || finalTxIds.has(String(localTx.id))) return;

    const localAmount = Number(localTx.amount) || 0;
    const isAlreadyPresent = finalTransactions.some((ft) => {
      if (ft.type !== localTx.type) return false;
      if (Math.abs((Number(ft.amount) || 0) - localAmount) > 0.01) return false;
      if (localTx.driverId && ft.driverId && String(localTx.driverId) !== String(ft.driverId)) {
        return false;
      }
      const t1 = new Date(ft.date).getTime();
      const t2 = new Date(localTx.date).getTime();
      return isNaN(t1) || isNaN(t2) || Math.abs(t1 - t2) < 1000 * 60 * 60 * 24;
    });

    if (!isAlreadyPresent) {
      finalTransactions.push(localTx);
      finalTxIds.add(String(localTx.id));
    } else {
      staleLocalTxIds.push(String(localTx.id));
    }
  });

  if (staleLocalTxIds.length > 0) {
    await db.transactions.bulkDelete(staleLocalTxIds);
  }

  const transactions: Transaction[] = finalTransactions.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  // Синхронизация возвратов (returns): объединяем серверные с локальными
  const localReturns = await db.returns.toArray();
  const rawReturns: ApiReturn[] = toArray(returnsRes.data);
  const serverReturns: ProductReturn[] = rawReturns.map((r) => {
    const driverId = r.driverId ?? r.driver_id;
    const driver = drivers.find((d) => String(d.id) === String(driverId));
    const rawItems: ApiReturnItem[] = Array.isArray(r.items) ? r.items : [];
    const items = rawItems.map((it) => {
      const itProdId = String(it.productId ?? it.product_id ?? it.barcode ?? '').trim();
      const prod = products.find(
        (p) =>
          String(p.id).trim() === itProdId ||
          String(p.barcode).trim() === itProdId ||
          (it.barcode && String(p.barcode).trim() === String(it.barcode).trim()),
      );
      const qtyBoxes = Number(it.qtyBoxes ?? it.quantityBoxes ?? it.box_count ?? it.boxCount ?? 0);
      const qtyPieces = Number(it.qtyPieces ?? it.quantityPieces ?? it.quantity ?? it.qty ?? 0);
      const piecesPerBox = prod?.boxQuantity && prod.boxQuantity > 0 ? prod.boxQuantity : 1;
      const totalPieces = qtyPieces + qtyBoxes * piecesPerBox;
      const rawReason = String(it.reason ?? '')
        .toLowerCase()
        .trim();
      let reason: ProductReturn['items'][0]['reason'] = 'damaged';
      if (rawReason === 'not_sold' || rawReason === 'unsold' || rawReason.includes('продан')) {
        reason = 'unsold';
      } else if (rawReason === 'melted' || rawReason.includes('растая')) {
        reason = 'melted';
      } else if (
        rawReason === 'defective' ||
        rawReason === 'defect' ||
        rawReason.includes('брак') ||
        rawReason === 'spoiled' ||
        rawReason === 'expired'
      ) {
        reason = 'defective';
      } else if (rawReason === 'damaged' || rawReason.includes('поврежд')) {
        reason = 'damaged';
      } else if (rawReason === 'other' || rawReason.includes('друг')) {
        reason = 'other';
      }

      const resolvedBarcode = prod?.barcode ? prod.barcode : it.barcode ? it.barcode : itProdId;
      const resolvedProductName = prod?.name
        ? prod.name
        : it.productName
          ? it.productName
          : it.name
            ? it.name
            : 'Товар';

      const unitPrice = roundCurrency(prod?.factoryPrice ?? 0);
      const totalCost = roundCurrency(totalPieces * unitPrice);

      return {
        barcode: resolvedBarcode,
        productName: resolvedProductName,
        quantity: totalPieces > 0 ? totalPieces : (it.quantity ?? 1),
        boxCount:
          qtyBoxes > 0
            ? qtyBoxes
            : piecesPerBox > 0
              ? Number((totalPieces / piecesPerBox).toFixed(3))
              : 0,
        unitPrice,
        amount: totalCost,
        reason,
      };
    });

    return {
      id: String(r.id),
      returnType: (r.returnType ?? r.return_type ?? 'from_driver') as 'from_driver' | 'to_factory',
      driverId: driverId ? String(driverId) : undefined,
      driverName: driver?.fullName ?? r.driverName,
      date: ensureUtcIso(r.date ?? r.createdAt ?? r.created_at),
      totalAmount: Number(r.totalAmount ?? r.total_amount ?? 0),
      isArchived: Boolean(r.isArchived ?? r.is_archived ?? false),
      isSynced: true,
      syncStatus: 'synced' as const,
      notes: r.comment ?? r.notes,
      items,
    };
  });

  const returns: ProductReturn[] = [...serverReturns];
  const staleLocalReturnIds: string[] = [];
  localReturns.forEach((loc) => {
    if (!loc.id) return;
    if (returns.some((r) => r.id === loc.id)) return;

    const isConfirmedOnServer = returns.some((sr) => {
      if (sr.returnType !== loc.returnType) return false;
      if (loc.driverId && sr.driverId && String(loc.driverId) !== String(sr.driverId)) return false;
      if (Math.abs((Number(sr.totalAmount) || 0) - (Number(loc.totalAmount) || 0)) > 0.01)
        return false;
      const t1 = new Date(sr.date).getTime();
      const t2 = new Date(loc.date).getTime();
      return isNaN(t1) || isNaN(t2) || Math.abs(t1 - t2) < 1000 * 60 * 60 * 24;
    });

    if (!isConfirmedOnServer) {
      returns.push(loc);
    } else {
      staleLocalReturnIds.push(String(loc.id));
    }
  });

  if (staleLocalReturnIds.length > 0) {
    await db.returns.bulkDelete(staleLocalReturnIds);
  }

  const warnings: string[] = [];

  return {
    products,
    drivers,
    warnings,
    orders,
    transactions,
    factoryOrders: mergedFactoryOrders,
    receipts,
    returns,
    serverDashboard: dashboardRes?.data ?? null,
  };
};
