import http from 'http';
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import {
  store,
  generateValidEan13,
  generateCode128Barcode,
  type SkuRecord,
  type OrderItemRecord,
} from './data/seed.js';
import {
  networkDegradationMiddleware,
  getChaosConfig,
  updateChaosConfig,
} from './middleware/networkSimulator.js';
import { StompBroker } from './ws/stompBroker.js';

function createJwtToken(username: string, role = 'WAREHOUSE_MANAGER', warehouseId = store.warehouseId): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: 'usr-warehouse-01',
      username,
      role,
      warehouse_id: warehouseId,
      warehouseId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 86_400 * 7,
    })
  ).toString('base64url');
  const signature = Buffer.from('sapremo-showcase-hmac-sig').toString('base64url');
  return `${header}.${payload}.${signature}`;
}

export function createMockServer() {
  const app = express();
  const server = http.createServer(app);
  const stompBroker = new StompBroker(server, app);

  app.use(
    cors({
      origin: true,
      credentials: true,
      exposedHeaders: ['X-Simulated-Latency-Ms', 'X-Chaos-Drop-Rate'],
    })
  );
  app.use(express.json({ limit: '10mb' }));
  app.use(networkDegradationMiddleware);

  // ============================================================================
  // 1. HEALTH & CHAOS NETWORK DEGRADATION SIMULATOR ENDPOINTS
  // ============================================================================
  app.get(['/api/health', '/api/warehouse/health'], (_req: Request, res: Response) => {
    res.json({
      status: 'UP',
      service: 'sapremo-mock-gateway',
      skusCount: store.skus.size,
      binsCount: store.bins.size,
      batchesCount: store.batches.size,
      movementsCount: store.movements.length,
      wsConnectedClients: stompBroker.getConnectedClientsCount(),
      chaos: getChaosConfig(),
      timestamp: new Date().toISOString(),
    });
  });

  app.get(['/api/chaos/config', '/api/warehouse/chaos/config'], (_req: Request, res: Response) => {
    res.json(getChaosConfig());
  });

  app.post(['/api/chaos/config', '/api/warehouse/chaos/config'], (req: Request, res: Response) => {
    const updated = updateChaosConfig(req.body ?? {});
    res.json(updated);
  });

  // ============================================================================
  // 2. AUTHENTICATION ENDPOINTS
  // ============================================================================
  const loginHandler = (req: Request, res: Response) => {
    const { username = 'warehouse_admin' } = (req.body ?? {}) as {
      username?: string;
      password?: string;
    };
    const access = createJwtToken(username);
    const refresh = createJwtToken(username);
    res.json({
      access,
      refresh,
      user: {
        id: 'usr-warehouse-01',
        username,
        full_name: 'Администратор Склада (Терминал №1)',
        role: 'WAREHOUSE_MANAGER',
        warehouse_id: store.warehouseId,
        is_superuser: false,
      },
    });
  };

  app.post(
    ['/api/factory/auth/login', '/api/warehouse/auth/login', '/api/auth/login'],
    loginHandler
  );

  app.post(
    ['/api/factory/auth/refresh', '/api/warehouse/auth/refresh', '/api/auth/refresh'],
    (req: Request, res: Response) => {
      const access = createJwtToken('warehouse_admin');
      res.json({
        access,
        refresh: (req.body as { refresh?: string })?.refresh ?? access,
      });
    }
  );

  app.post(
    ['/api/factory/auth/register', '/api/warehouse/auth/register'],
    (req: Request, res: Response) => {
      const { username = 'new_operator', full_name = 'Оператор Склада' } = (req.body ?? {}) as {
        username?: string;
        full_name?: string;
      };
      res.status(201).json({
        id: `usr-${Date.now()}`,
        username,
        full_name,
        role: 'WAREHOUSE_MANAGER',
        warehouse_id: store.warehouseId,
      });
    }
  );

  // ============================================================================
  // 3. SKU CATALOG & PRODUCT CRUD (520+ SKUs, EAN-13, Code 128)
  // ============================================================================
  const listProductsHandler = (req: Request, res: Response) => {
    const search = String(req.query.search ?? '').trim().toLowerCase();
    const category = String(req.query.category ?? '').trim().toLowerCase();
    const barcode = String(req.query.barcode ?? '').trim();

    let list = Array.from(store.skus.values());

    if (barcode) {
      list = list.filter((p) => p.barcode === barcode || p.code128 === barcode);
    }
    if (category) {
      list = list.filter((p) => p.category.toLowerCase() === category);
    }
    if (search) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(search) ||
          p.barcode.includes(search) ||
          p.code128.toLowerCase().includes(search) ||
          p.batchNumber.toLowerCase().includes(search)
      );
    }

    const pageParam = req.query.page !== undefined ? Number(req.query.page) : undefined;
    const sizeParam =
      req.query.page_size !== undefined
        ? Number(req.query.page_size)
        : req.query.size !== undefined
          ? Number(req.query.size)
          : undefined;

    if (pageParam !== undefined && sizeParam !== undefined && sizeParam < 500) {
      const pageIndex = Math.max(0, pageParam > 0 && req.query.page_size ? pageParam - 1 : pageParam);
      const start = pageIndex * sizeParam;
      const sliced = list.slice(start, start + sizeParam);
      res.json({
        results: sliced,
        content: sliced,
        count: list.length,
        totalElements: list.length,
        totalPages: Math.ceil(list.length / sizeParam),
        page: pageParam,
        size: sizeParam,
      });
      return;
    }

    res.json(list);
  };

  app.get(
    [
      '/api/factory/products/',
      '/api/factory/products',
      '/api/warehouse/products',
      '/api/products',
    ],
    listProductsHandler
  );

  app.post(['/api/factory/products/', '/api/factory/products'], (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const nextIndex = store.skus.size + 1;
    const id = String(body.id ?? `sku-${String(nextIndex).padStart(4, '0')}`);
    const barcode = String(body.barcode ?? generateValidEan13(nextIndex));
    const code128 = String(body.code128 ?? generateCode128Barcode(nextIndex, 1));
    const ppb = Math.max(1, Number(body.pieces_per_box ?? body.boxQuantity ?? 24));
    const factoryPrice = Number(body.factory_price ?? body.factoryPrice ?? 40);
    const driverPrice = Number(body.dispatch_price ?? body.driverPrice ?? Math.round(factoryPrice * 1.15));
    const stockQuantity = Number(body.stockQuantity ?? 0);
    const quantityBoxes = Math.floor(stockQuantity / ppb);
    const expiry = String(
      body.expiry_date ??
        body.expirationDate ??
        new Date(Date.now() + 180 * 86_400_000).toISOString().split('T')[0]
    );
    const batchNumber = String(body.batch_number ?? body.batchNumber ?? `LOT-2026-${nextIndex}`);
    const nowIso = new Date().toISOString();

    const newSku: SkuRecord = {
      id,
      barcode,
      code128,
      name: String(body.name ?? `Новый товар #${nextIndex}`),
      category: String(body.category ?? 'Мороженое'),
      pieces_per_box: ppb,
      piecesPerBox: ppb,
      boxQuantity: ppb,
      expiry_date: expiry,
      expirationDate: expiry,
      batch_number: batchNumber,
      batchNumber,
      factory_price: factoryPrice,
      factoryPrice,
      driver_price: driverPrice,
      driverPrice,
      status: (body.status === 'inactive' ? 'inactive' : 'active') as 'active' | 'inactive',
      stockQuantity,
      quantityBoxes,
      quantityPieces: stockQuantity,
      binCode: 'A01-R01-S01-B01',
      aisle: 'A01',
      rack: 'R01',
      shelf: 'S01',
      bin: 'B01',
      minStockThreshold: ppb * 5,
      version: 1,
      updatedAt: nowIso,
    };

    store.skus.set(id, newSku);
    store.skusByBarcode.set(barcode, newSku);
    stompBroker.publish('/topic/inventory', {
      productId: id,
      barcode,
      quantity: stockQuantity,
      version: 1,
      updatedAt: nowIso,
    });
    res.status(201).json(newSku);
  });

  const updateProductHandler = (req: Request, res: Response) => {
    const id = req.params.id;
    const existing = store.skus.get(id) ?? store.skusByBarcode.get(id);
    if (!existing) {
      res.status(404).json({ message: `SKU ${id} not found` });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const ppb = Number(body.pieces_per_box ?? body.boxQuantity ?? existing.boxQuantity);
    const factoryPrice = Number(body.factory_price ?? body.factoryPrice ?? existing.factoryPrice);
    const nowIso = new Date().toISOString();

    const updated: SkuRecord = {
      ...existing,
      name: body.name !== undefined ? String(body.name) : existing.name,
      barcode: body.barcode !== undefined ? String(body.barcode) : existing.barcode,
      pieces_per_box: ppb,
      piecesPerBox: ppb,
      boxQuantity: ppb,
      factory_price: factoryPrice,
      factoryPrice,
      expiry_date:
        body.expiry_date !== undefined
          ? String(body.expiry_date)
          : body.expirationDate !== undefined
            ? String(body.expirationDate)
            : existing.expirationDate,
      expirationDate:
        body.expiry_date !== undefined
          ? String(body.expiry_date)
          : body.expirationDate !== undefined
            ? String(body.expirationDate)
            : existing.expirationDate,
      batch_number:
        body.batch_number !== undefined
          ? String(body.batch_number)
          : body.batchNumber !== undefined
            ? String(body.batchNumber)
            : existing.batchNumber,
      batchNumber:
        body.batch_number !== undefined
          ? String(body.batch_number)
          : body.batchNumber !== undefined
            ? String(body.batchNumber)
            : existing.batchNumber,
      status:
        body.status === 'inactive' || body.status === 'active'
          ? body.status
          : existing.status,
      version: existing.version + 1,
      updatedAt: nowIso,
    };

    store.skus.set(existing.id, updated);
    store.skusByBarcode.set(updated.barcode, updated);
    res.json(updated);
  };

  app.patch(['/api/factory/products/:id/', '/api/factory/products/:id'], updateProductHandler);
  app.put(['/api/factory/products/:id/', '/api/factory/products/:id'], updateProductHandler);

  app.delete(
    ['/api/factory/products/:id/', '/api/factory/products/:id'],
    (req: Request, res: Response) => {
      const id = req.params.id;
      const existing = store.skus.get(id) ?? store.skusByBarcode.get(id);
      if (existing) {
        store.skus.delete(existing.id);
        store.skusByBarcode.delete(existing.barcode);
      }
      res.status(204).send();
    }
  );

  // ============================================================================
  // 4. WAREHOUSE INVENTORY, RECEPTION, ADJUSTMENT, PALLET MOVEMENTS & TOPOLOGY
  // ============================================================================
  app.get(['/api/warehouse/inventory', '/api/inventory'], (_req: Request, res: Response) => {
    const stockItems = Array.from(store.skus.values()).map((sku) => ({
      productId: sku.id,
      barcode: sku.barcode,
      code128: sku.code128,
      productName: sku.name,
      quantityBoxes: sku.quantityBoxes,
      quantityPieces: sku.stockQuantity,
      piecesPerBox: sku.boxQuantity,
      binCode: sku.binCode,
      aisle: sku.aisle,
      rack: sku.rack,
      shelf: sku.shelf,
      bin: sku.bin,
      batchNumber: sku.batchNumber,
      expirationDate: sku.expirationDate,
      version: sku.version,
      updatedAt: sku.updatedAt,
    }));
    res.json(stockItems);
  });

  app.post(
    ['/api/warehouse/inventory/reception', '/api/inventory/reception'],
    (req: Request, res: Response) => {
      const idempotencyKey = String(req.headers['idempotency-key'] ?? '');
      if (idempotencyKey && store.idempotencyKeys.has(idempotencyKey)) {
        res.json(store.idempotencyKeys.get(idempotencyKey));
        return;
      }

      const rawBody = req.body as unknown;
      const itemsList = Array.isArray(rawBody)
        ? rawBody
        : Array.isArray((rawBody as { items?: unknown[] })?.items)
          ? ((rawBody as { items: unknown[] }).items)
          : [];

      const updatedItems: {
        productId: string;
        barcode: string;
        quantityBoxes: number;
        quantityPieces: number;
        version: number;
        updatedAt: string;
      }[] = [];

      const nowIso = new Date().toISOString();

      for (const rawItem of itemsList) {
        const item = rawItem as {
          productId?: string;
          barcode?: string;
          productName?: string;
          quantityBoxes?: number;
          quantityPieces?: number;
          piecesPerBox?: number;
          factoryPrice?: number;
        };

        const sku =
          (item.barcode ? store.skusByBarcode.get(String(item.barcode)) : undefined) ??
          (item.productId ? store.skus.get(String(item.productId)) : undefined);

        if (sku) {
          const ppb = sku.boxQuantity || item.piecesPerBox || 1;
          const addedBoxes = Number(item.quantityBoxes ?? 0);
          const addedLoosePieces = Number(item.quantityPieces ?? 0);
          const deltaPieces = addedBoxes * ppb + addedLoosePieces;

          sku.stockQuantity = Math.max(0, sku.stockQuantity + deltaPieces);
          sku.quantityPieces = sku.stockQuantity;
          sku.quantityBoxes = Math.floor(sku.stockQuantity / ppb);
          sku.version += 1;
          sku.updatedAt = nowIso;

          store.movements.unshift({
            id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            timestamp: nowIso,
            type: 'RECEPTION',
            skuId: sku.id,
            barcode: sku.barcode,
            productName: sku.name,
            batchNumber: sku.batchNumber,
            fromBin: null,
            toBin: sku.binCode,
            deltaBoxes: addedBoxes,
            deltaPieces,
            balanceAfterPieces: sku.stockQuantity,
            actor: 'warehouse_admin',
            operationId: idempotencyKey || `op-${Date.now()}`,
            comment: 'Приемка партии на склад',
          });

          const payload = {
            productId: sku.id,
            barcode: sku.barcode,
            quantityBoxes: sku.quantityBoxes,
            quantityPieces: sku.stockQuantity,
            quantity: sku.stockQuantity,
            version: sku.version,
            updatedAt: nowIso,
          };
          updatedItems.push(payload);
          stompBroker.publish('/topic/inventory', payload);
        }
      }

      stompBroker.publish('/topic/dashboard/update', { timestamp: nowIso });
      if (idempotencyKey) {
        store.idempotencyKeys.set(idempotencyKey, updatedItems);
      }
      res.status(200).json(updatedItems);
    }
  );

  app.post(
    ['/api/warehouse/inventory/adjust', '/api/inventory/adjust'],
    (req: Request, res: Response) => {
      const idempotencyKey = String(req.headers['idempotency-key'] ?? '');
      if (idempotencyKey && store.idempotencyKeys.has(idempotencyKey)) {
        res.json(store.idempotencyKeys.get(idempotencyKey));
        return;
      }

      const body = (req.body ?? {}) as {
        productId?: string;
        barcode?: string;
        quantityBoxes?: number;
        quantityPieces?: number;
        comment?: string;
      };

      const sku =
        (body.barcode ? store.skusByBarcode.get(String(body.barcode)) : undefined) ??
        (body.productId ? store.skus.get(String(body.productId)) : undefined);

      if (!sku) {
        res.status(404).json({ message: 'SKU not found in inventory' });
        return;
      }

      const ppb = sku.boxQuantity || 1;
      const newPieces =
        body.quantityPieces !== undefined
          ? Math.max(0, Number(body.quantityPieces))
          : Math.max(0, Number(body.quantityBoxes ?? 0) * ppb);
      const deltaPieces = newPieces - sku.stockQuantity;
      const deltaBoxes = Math.round(deltaPieces / ppb);
      const nowIso = new Date().toISOString();

      sku.stockQuantity = newPieces;
      sku.quantityPieces = newPieces;
      sku.quantityBoxes = Math.floor(newPieces / ppb);
      sku.version += 1;
      sku.updatedAt = nowIso;

      store.movements.unshift({
        id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: nowIso,
        type: 'ADJUSTMENT',
        skuId: sku.id,
        barcode: sku.barcode,
        productName: sku.name,
        batchNumber: sku.batchNumber,
        fromBin: sku.binCode,
        toBin: sku.binCode,
        deltaBoxes,
        deltaPieces,
        balanceAfterPieces: sku.stockQuantity,
        actor: 'warehouse_admin',
        operationId: idempotencyKey || `adj-${Date.now()}`,
        comment: body.comment ?? 'Инвентаризационная корректировка остатка',
      });

      const responsePayload = {
        productId: sku.id,
        barcode: sku.barcode,
        productName: sku.name,
        quantityBoxes: sku.quantityBoxes,
        quantityPieces: sku.stockQuantity,
        quantity: sku.stockQuantity,
        version: sku.version,
        updatedAt: nowIso,
      };

      stompBroker.publish('/topic/inventory', responsePayload);
      stompBroker.publish('/topic/dashboard/update', { timestamp: nowIso });

      if (sku.stockQuantity <= sku.minStockThreshold) {
        const alertPayload = {
          productId: sku.id,
          barcode: sku.barcode,
          productName: sku.name,
          currentQuantity: sku.stockQuantity,
          threshold: sku.minStockThreshold,
          timestamp: nowIso,
        };
        stompBroker.publish('/topic/alerts', alertPayload);
        stompBroker.publish('/topic/inventory/low-stock', alertPayload);
      }

      if (idempotencyKey) {
        store.idempotencyKeys.set(idempotencyKey, responsePayload);
      }
      res.json(responsePayload);
    }
  );

  // Pallet relocation between storage cells (Aisle/Rack/Shelf/Bin)
  app.post(
    ['/api/warehouse/inventory/move-pallet', '/api/inventory/move-pallet'],
    (req: Request, res: Response) => {
      const body = (req.body ?? {}) as {
        barcode?: string;
        productId?: string;
        fromBin?: string;
        toBin: string;
        boxes?: number;
        comment?: string;
      };

      const sku =
        (body.barcode ? store.skusByBarcode.get(String(body.barcode)) : undefined) ??
        (body.productId ? store.skus.get(String(body.productId)) : undefined);

      if (!sku) {
        res.status(404).json({ message: 'SKU not found for pallet movement' });
        return;
      }

      const targetBin = store.bins.get(body.toBin);
      if (!targetBin) {
        res.status(400).json({ message: `Target storage bin ${body.toBin} does not exist` });
        return;
      }

      const previousBinCode = body.fromBin ?? sku.binCode;
      const sourceBin = store.bins.get(previousBinCode);
      const movedBoxes = body.boxes !== undefined ? Number(body.boxes) : sku.quantityBoxes;

      if (sourceBin) {
        sourceBin.occupiedBoxes = Math.max(0, sourceBin.occupiedBoxes - movedBoxes);
      }
      targetBin.occupiedBoxes = Math.min(
        targetBin.capacityBoxes,
        targetBin.occupiedBoxes + movedBoxes
      );

      const nowIso = new Date().toISOString();
      sku.binCode = targetBin.code;
      sku.aisle = targetBin.aisle;
      sku.rack = targetBin.rack;
      sku.shelf = targetBin.shelf;
      sku.bin = targetBin.bin;
      sku.version += 1;
      sku.updatedAt = nowIso;

      const movement = {
        id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: nowIso,
        type: 'PALLET_MOVE' as const,
        skuId: sku.id,
        barcode: sku.barcode,
        productName: sku.name,
        batchNumber: sku.batchNumber,
        fromBin: previousBinCode,
        toBin: targetBin.code,
        deltaBoxes: movedBoxes,
        deltaPieces: movedBoxes * sku.boxQuantity,
        balanceAfterPieces: sku.stockQuantity,
        actor: 'warehouse_admin',
        operationId: `move-${Date.now()}`,
        comment: body.comment ?? `Перемещение паллеты ${previousBinCode} -> ${targetBin.code}`,
      };
      store.movements.unshift(movement);

      stompBroker.publish('/topic/inventory', {
        productId: sku.id,
        barcode: sku.barcode,
        quantity: sku.stockQuantity,
        binCode: sku.binCode,
        version: sku.version,
        updatedAt: nowIso,
      });

      res.json({
        sku,
        movement,
      });
    }
  );

  app.get(['/api/warehouse/bins', '/api/bins'], (_req: Request, res: Response) => {
    res.json(Array.from(store.bins.values()));
  });

  app.get(['/api/warehouse/batches', '/api/batches'], (_req: Request, res: Response) => {
    const sortedByFefo = Array.from(store.batches.values()).sort((a, b) =>
      a.expirationDate.localeCompare(b.expirationDate)
    );
    res.json(sortedByFefo);
  });

  app.get(['/api/warehouse/movements', '/api/movements'], (req: Request, res: Response) => {
    const limit = Math.min(500, Number(req.query.limit ?? 100));
    res.json(store.movements.slice(0, limit));
  });

  // ============================================================================
  // 5. DRIVERS, ORDERS, CONFIRMATION, MODIFICATION & DISPATCH
  // ============================================================================
  app.get(['/api/drivers', '/api/drivers/'], (_req: Request, res: Response) => {
    const driversList = Array.from(store.drivers.values());
    res.json({
      content: driversList,
      totalElements: driversList.length,
      totalPages: 1,
    });
  });

  app.post(['/api/drivers', '/api/drivers/'], (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const id = String(body.id ?? `drv-${String(store.drivers.size + 1).padStart(3, '0')}`);
    const carNumber = String(body.carNumber ?? body.vehicleNumber ?? '01 KG 999 AAA');
    const driver = {
      id,
      fullName: String(body.fullName ?? 'Водитель Экспедитор'),
      carNumber,
      vehicleNumber: carNumber,
      phone: String(body.phone ?? '+996 555 00-00-00'),
      currentDebt: 0,
      totalDebt: 0,
      updatedAt: new Date().toISOString(),
    };
    store.drivers.set(id, driver);
    res.status(201).json(driver);
  });

  app.delete(['/api/drivers/:id', '/api/drivers/:id/'], (req: Request, res: Response) => {
    store.drivers.delete(req.params.id);
    res.status(204).send();
  });

  app.get(['/api/drivers/debts', '/api/drivers/debts/'], (_req: Request, res: Response) => {
    const debts = Array.from(store.drivers.values()).map((d) => ({
      driverId: d.id,
      id: d.id,
      fullName: d.fullName,
      carNumber: d.carNumber,
      totalDebt: d.currentDebt,
      currentDebt: d.currentDebt,
      updatedAt: d.updatedAt,
    }));
    res.json({
      content: debts,
      totalElements: debts.length,
      totalPages: 1,
    });
  });

  app.get(['/api/drivers/orders', '/api/drivers/orders/'], (_req: Request, res: Response) => {
    const ordersList = Array.from(store.orders.values());
    res.json({
      content: ordersList,
      totalElements: ordersList.length,
      totalPages: 1,
    });
  });

  app.post(['/api/drivers/orders', '/api/drivers/orders/'], (req: Request, res: Response) => {
    const body = (req.body ?? {}) as {
      driverId?: string;
      comment?: string;
      items?: { productId?: string; barcode?: string; requestedQty?: number; boxCount?: number }[];
    };
    const driver =
      (body.driverId ? store.drivers.get(body.driverId) : undefined) ??
      Array.from(store.drivers.values())[0];

    const ordIdx = store.orders.size + 1;
    const orderId = `ORD-${1000 + ordIdx}`;
    const nowIso = new Date().toISOString();

    const items: OrderItemRecord[] = (body.items ?? []).map((it, idx) => {
      const sku =
        (it.productId ? store.skus.get(it.productId) : undefined) ??
        (it.barcode ? store.skusByBarcode.get(it.barcode) : undefined) ??
        Array.from(store.skus.values())[idx];
      const boxes = Math.max(1, Number(it.requestedQty ?? it.boxCount ?? 2));
      const pieces = boxes * sku.boxQuantity;
      const amount = pieces * sku.factoryPrice;
      return {
        id: `ord-item-${ordIdx}-${idx + 1}`,
        productId: sku.id,
        barcode: sku.barcode,
        productName: sku.name,
        requestedQty: boxes,
        approvedQty: boxes,
        qty: boxes,
        boxCount: boxes,
        quantity: pieces,
        pricePerBox: sku.factoryPrice * sku.boxQuantity,
        unitPrice: sku.factoryPrice,
        amount,
      };
    });

    const totalAmount = items.reduce((s, i) => s + i.amount, 0);
    const newOrder = {
      id: orderId,
      invoiceNumber: `INV-2026-${String(ordIdx).padStart(4, '0')}`,
      driverId: driver.id,
      driverName: driver.fullName,
      warehouseId: store.warehouseId,
      status: 'PENDING' as const,
      requestedAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
      date: nowIso,
      totalAmount,
      comment: body.comment ?? '',
      version: 1,
      items,
    };

    store.orders.set(orderId, newOrder);
    stompBroker.publish('/topic/orders/new', newOrder);
    stompBroker.publish('/topic/orders', newOrder);
    stompBroker.publish('/topic/dashboard/update', { timestamp: nowIso });
    res.status(201).json(newOrder);
  });

  app.post('/api/drivers/orders/:id/confirm', (req: Request, res: Response) => {
    const order = store.orders.get(req.params.id);
    if (!order) {
      res.status(404).json({ message: 'Order not found' });
      return;
    }
    const nowIso = new Date().toISOString();
    order.status = 'CONFIRMED';
    order.updatedAt = nowIso;
    order.version += 1;

    stompBroker.publish('/topic/orders/status', order);
    stompBroker.publish('/topic/orders/updated', order);
    stompBroker.publish('/topic/dashboard/update', { timestamp: nowIso });
    res.json(order);
  });

  app.post('/api/drivers/orders/:id/reject', (req: Request, res: Response) => {
    const order = store.orders.get(req.params.id);
    if (!order) {
      res.status(404).json({ message: 'Order not found' });
      return;
    }
    const nowIso = new Date().toISOString();
    order.status = 'REJECTED';
    order.comment = String((req.body as { comment?: string })?.comment ?? order.comment);
    order.updatedAt = nowIso;
    order.version += 1;

    stompBroker.publish('/topic/orders/status', order);
    stompBroker.publish('/topic/dashboard/update', { timestamp: nowIso });
    res.json(order);
  });

  app.post('/api/drivers/orders/:id/modify', (req: Request, res: Response) => {
    const order = store.orders.get(req.params.id);
    if (!order) {
      res.status(404).json({ message: 'Order not found' });
      return;
    }

    const body = (req.body ?? {}) as {
      totalAmount?: number;
      comment?: string;
      items?: { productId: string; requestedQty?: number; approvedQty?: number }[];
    };

    const nowIso = new Date().toISOString();
    if (Array.isArray(body.items) && body.items.length > 0) {
      order.items = body.items.map((it, idx) => {
        const sku =
          store.skus.get(String(it.productId)) ??
          store.skusByBarcode.get(String(it.productId)) ??
          Array.from(store.skus.values())[0];
        const boxes = Math.max(1, Number(it.approvedQty ?? it.requestedQty ?? 1));
        const pieces = boxes * sku.boxQuantity;
        const amount = pieces * sku.factoryPrice;
        return {
          id: `ord-item-mod-${idx + 1}`,
          productId: sku.id,
          barcode: sku.barcode,
          productName: sku.name,
          requestedQty: boxes,
          approvedQty: boxes,
          qty: boxes,
          boxCount: boxes,
          quantity: pieces,
          pricePerBox: sku.factoryPrice * sku.boxQuantity,
          unitPrice: sku.factoryPrice,
          amount,
        };
      });
    }

    order.totalAmount =
      body.totalAmount !== undefined
        ? Number(body.totalAmount)
        : order.items.reduce((s, i) => s + i.amount, 0);
    if (body.comment !== undefined) order.comment = body.comment;
    order.status = 'MODIFIED';
    order.updatedAt = nowIso;
    order.version += 1;

    stompBroker.publish('/topic/orders/updated', order);
    stompBroker.publish('/topic/dashboard/update', { timestamp: nowIso });
    res.json(order);
  });

  app.post('/api/drivers/orders/:id/dispatch', (req: Request, res: Response) => {
    const order = store.orders.get(req.params.id);
    if (!order) {
      res.status(404).json({ message: 'Order not found' });
      return;
    }

    const idempotencyKey = String(req.headers['idempotency-key'] ?? '');
    if (idempotencyKey && store.idempotencyKeys.has(idempotencyKey)) {
      res.json(store.idempotencyKeys.get(idempotencyKey));
      return;
    }

    const nowIso = new Date().toISOString();
    order.status = 'DISPATCHED';
    order.updatedAt = nowIso;
    order.version += 1;

    // Deduct stock and record movements
    for (const item of order.items) {
      const sku = store.skus.get(item.productId) ?? store.skusByBarcode.get(item.barcode);
      if (sku) {
        sku.stockQuantity = Math.max(0, sku.stockQuantity - item.quantity);
        sku.quantityPieces = sku.stockQuantity;
        sku.quantityBoxes = Math.floor(sku.stockQuantity / sku.boxQuantity);
        sku.version += 1;
        sku.updatedAt = nowIso;

        store.movements.unshift({
          id: `mov-disp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: nowIso,
          type: 'DISPATCH',
          skuId: sku.id,
          barcode: sku.barcode,
          productName: sku.name,
          batchNumber: sku.batchNumber,
          fromBin: sku.binCode,
          toBin: null,
          deltaBoxes: -item.boxCount,
          deltaPieces: -item.quantity,
          balanceAfterPieces: sku.stockQuantity,
          actor: 'warehouse_admin',
          operationId: idempotencyKey || `disp-${order.id}`,
          comment: `Отгрузка по заявке ${order.invoiceNumber} (${order.driverName})`,
        });

        stompBroker.publish('/topic/inventory', {
          productId: sku.id,
          barcode: sku.barcode,
          quantity: sku.stockQuantity,
          version: sku.version,
          updatedAt: nowIso,
        });
      }
    }

    // Update driver debt
    const driver = store.drivers.get(order.driverId);
    if (driver) {
      driver.currentDebt += order.totalAmount;
      driver.totalDebt = driver.currentDebt;
      driver.updatedAt = nowIso;
    }

    if (idempotencyKey) {
      store.idempotencyKeys.set(idempotencyKey, order);
    }

    stompBroker.publish('/topic/dispatch/created', order);
    stompBroker.publish('/topic/dashboard/update', { timestamp: nowIso });
    res.json(order);
  });

  // ============================================================================
  // 6. PAYMENTS, CASHBOX & RETURNS
  // ============================================================================
  app.get(['/api/drivers/payments', '/api/drivers/payments/'], (_req: Request, res: Response) => {
    const driverPayments = Array.from(store.transactions.values())
      .filter((t) => t.type === 'driver_payment')
      .map((t) => ({
        id: t.id,
        driverId: t.driverId ?? 'drv-001',
        amount: t.amount,
        paymentMethod: t.paymentMethod,
        comment: t.comment,
        paidAt: t.date,
        createdAt: t.createdAt,
      }));
    res.json({
      content: driverPayments,
      totalElements: driverPayments.length,
      totalPages: 1,
    });
  });

  app.get('/api/warehouse/cashbox/transactions', (_req: Request, res: Response) => {
    res.json(Array.from(store.transactions.values()));
  });

  app.post('/api/warehouse/cashbox/driver-payment', (req: Request, res: Response) => {
    const body = (req.body ?? {}) as {
      driverId?: string;
      amount?: number;
      paymentMethod?: 'CASH' | 'TRANSFER';
      comment?: string;
    };
    const driverId = String(body.driverId ?? 'drv-001');
    const amount = Math.max(0, Number(body.amount ?? 0));
    const driver = store.drivers.get(driverId);
    const nowIso = new Date().toISOString();

    if (driver) {
      driver.currentDebt = Math.max(0, driver.currentDebt - amount);
      driver.totalDebt = driver.currentDebt;
      driver.updatedAt = nowIso;
    }

    store.cashBalance += amount;
    const txId = `TX-2026-${String(store.transactions.size + 1).padStart(4, '0')}`;
    const tx = {
      id: txId,
      type: 'driver_payment' as const,
      amount,
      paymentMethod: (body.paymentMethod === 'TRANSFER' ? 'TRANSFER' : 'CASH') as
        | 'CASH'
        | 'TRANSFER',
      driverId,
      driverName: driver?.fullName ?? 'Водитель',
      comment: body.comment ?? 'Оплата от водителя в кассу склада',
      createdAt: nowIso,
      date: nowIso,
    };
    store.transactions.set(txId, tx);

    stompBroker.publish('/topic/dashboard/update', { timestamp: nowIso });
    res.status(201).json(tx);
  });

  app.post('/api/warehouse/cashbox/factory-payment', (req: Request, res: Response) => {
    const body = (req.body ?? {}) as {
      amount?: number;
      paymentMethod?: 'CASH' | 'TRANSFER';
      comment?: string;
    };
    const amount = Math.max(0, Number(body.amount ?? 0));
    const nowIso = new Date().toISOString();

    store.cashBalance = Math.max(0, store.cashBalance - amount);
    store.factoryDebt = Math.max(0, store.factoryDebt - amount);

    const txId = `TX-2026-${String(store.transactions.size + 1).padStart(4, '0')}`;
    const tx = {
      id: txId,
      type: 'factory_payment' as const,
      amount,
      paymentMethod: (body.paymentMethod === 'TRANSFER' ? 'TRANSFER' : 'CASH') as
        | 'CASH'
        | 'TRANSFER',
      comment: body.comment ?? 'Перевод денежных средств заводу',
      createdAt: nowIso,
      date: nowIso,
    };
    store.transactions.set(txId, tx);

    stompBroker.publish('/topic/dashboard/update', { timestamp: nowIso });
    res.status(201).json(tx);
  });

  app.get(['/api/drivers/returns', '/api/drivers/returns/'], (_req: Request, res: Response) => {
    const list = Array.from(store.returns.values());
    res.json({
      content: list,
      totalElements: list.length,
      totalPages: 1,
    });
  });

  const createReturnHandler = (req: Request, res: Response) => {
    const body = (req.body ?? {}) as {
      driverId?: string;
      driver_id?: string;
      totalAmount?: number;
      comment?: string;
      notes?: string;
      items?: {
        productId?: string;
        barcode?: string;
        qtyBoxes?: number;
        qtyPieces?: number;
        quantity?: number;
        reason?: string;
      }[];
    };

    const driverId = body.driverId ?? body.driver_id;
    const driver = driverId ? store.drivers.get(String(driverId)) : undefined;
    const nowIso = new Date().toISOString();
    const retId = `RET-2026-${String(store.returns.size + 1).padStart(3, '0')}`;

    const items = (body.items ?? []).map((it, idx) => {
      const sku =
        (it.barcode ? store.skusByBarcode.get(it.barcode) : undefined) ??
        (it.productId ? store.skus.get(it.productId) : undefined) ??
        Array.from(store.skus.values())[0];

      const qtyBoxes = Number(it.qtyBoxes ?? 1);
      const qtyPieces = Number(it.qtyPieces ?? 0);
      const totalQty = Number(it.quantity ?? qtyBoxes * sku.boxQuantity + qtyPieces);

      sku.stockQuantity += totalQty;
      sku.quantityPieces = sku.stockQuantity;
      sku.quantityBoxes = Math.floor(sku.stockQuantity / sku.boxQuantity);
      sku.version += 1;
      sku.updatedAt = nowIso;

      return {
        id: `ret-item-${retId}-${idx + 1}`,
        productId: sku.id,
        barcode: sku.barcode,
        productName: sku.name,
        qtyBoxes,
        qtyPieces,
        quantity: totalQty,
        reason: it.reason ?? 'NOT_SOLD',
      };
    });

    const totalAmount = Number(body.totalAmount ?? 0);
    if (driver && totalAmount > 0) {
      driver.currentDebt = Math.max(0, driver.currentDebt - totalAmount);
      driver.totalDebt = driver.currentDebt;
      driver.updatedAt = nowIso;
    }

    const record = {
      id: retId,
      returnType: (driverId ? 'from_driver' : 'to_factory') as 'from_driver' | 'to_factory',
      driverId: driverId ? String(driverId) : undefined,
      driverName: driver?.fullName,
      date: nowIso,
      createdAt: nowIso,
      totalAmount,
      comment: body.comment ?? body.notes ?? '',
      items,
    };

    store.returns.set(retId, record);
    stompBroker.publish('/topic/dashboard/update', { timestamp: nowIso });
    res.status(201).json(record);
  };

  app.post(
    [
      '/api/drivers/returns',
      '/api/drivers/returns/',
      '/api/warehouse/returns',
      '/api/warehouse/returns/',
      '/api/factory/returns/',
      '/api/factory/returns',
    ],
    createReturnHandler
  );

  // ============================================================================
  // 7. FACTORY ORDERS, RECEPTIONS, WAREHOUSES & DASHBOARD SUMMARY
  // ============================================================================
  app.get(
    ['/api/factory/warehouse-orders/', '/api/factory/warehouse-orders'],
    (_req: Request, res: Response) => {
      res.json(Array.from(store.factoryOrders.values()));
    }
  );

  app.post(
    ['/api/factory/warehouse-orders/', '/api/factory/warehouse-orders'],
    (req: Request, res: Response) => {
      const body = (req.body ?? {}) as {
        comment?: string;
        items?: { product_id?: string; productId?: string; qty?: number }[];
      };
      const idx = store.factoryOrders.size + 1;
      const id = `FO-2026-${String(idx).padStart(3, '0')}`;
      const nowIso = new Date().toISOString();

      const items = (body.items ?? []).map((it, i) => {
        const prodId = String(it.product_id ?? it.productId ?? '');
        const sku =
          store.skus.get(prodId) ??
          store.skusByBarcode.get(prodId) ??
          Array.from(store.skus.values())[i];
        const qty = Math.max(1, Number(it.qty ?? 10));
        return {
          id: `fo-item-${idx}-${i + 1}`,
          product_id: sku.id,
          productId: sku.id,
          productName: sku.name,
          qty,
          quantity: qty,
        };
      });

      const record = {
        id,
        orderNumber: id,
        warehouse_id: store.warehouseId,
        warehouseId: store.warehouseId,
        created_at: nowIso,
        createdAt: nowIso,
        date: nowIso,
        status: 'approved' as const,
        comment: body.comment ?? '',
        items,
      };
      store.factoryOrders.set(id, record);
      res.status(201).json(record);
    }
  );

  app.post(
    [
      '/api/factory/warehouse-orders/:id/confirm-delivery/',
      '/api/factory/warehouse-orders/:id/confirm-delivery',
    ],
    (req: Request, res: Response) => {
      const fo = store.factoryOrders.get(req.params.id);
      if (fo) {
        fo.status = 'delivered';
      }
      res.json(fo ?? { id: req.params.id, status: 'delivered' });
    }
  );

  app.patch(
    ['/api/factory/warehouse-orders/:id/', '/api/factory/warehouse-orders/:id'],
    (req: Request, res: Response) => {
      const fo = store.factoryOrders.get(req.params.id);
      if (fo && req.body?.status) {
        fo.status = req.body.status;
      }
      res.json(fo ?? { id: req.params.id, status: req.body?.status ?? 'delivered' });
    }
  );

  app.get(
    [
      '/api/factory/reception/',
      '/api/factory/reception',
      '/api/factory/receptions/',
      '/api/factory/receptions',
      '/api/factory/deliveries/',
      '/api/factory/deliveries',
    ],
    (_req: Request, res: Response) => {
      res.json(Array.from(store.receptions.values()));
    }
  );

  app.post(
    ['/api/factory/reception/offline', '/api/factory/reception/offline/'],
    (req: Request, res: Response) => {
      const body = (req.body ?? {}) as {
        clientId?: string;
        createdAt?: string;
        items?: { barcode?: string; actualQty?: number; factoryPrice?: string | number }[];
      };
      const nowIso = body.createdAt ?? new Date().toISOString();
      const recId = body.clientId ?? `REC-2026-${String(store.receptions.size + 1).padStart(3, '0')}`;

      const items = (body.items ?? []).map((it, idx) => {
        const sku =
          (it.barcode ? store.skusByBarcode.get(it.barcode) : undefined) ??
          Array.from(store.skus.values())[0];
        const actualQty = Number(it.actualQty ?? sku.boxQuantity);
        const factoryPrice = Number(it.factoryPrice ?? sku.factoryPrice);
        return {
          id: `rec-item-${recId}-${idx + 1}`,
          product_id: sku.id,
          product_name: sku.name,
          product_barcode: sku.barcode,
          expected_qty: actualQty,
          actual_qty: actualQty,
          factory_price: factoryPrice,
          discrepancy_type: 'none' as const,
        };
      });

      const totalAmount = items.reduce((s, i) => s + i.actual_qty * i.factory_price, 0);
      const record = {
        id: recId,
        client_id: recId,
        delivery_number: recId,
        delivered_at: nowIso,
        created_at: nowIso,
        status: 'completed',
        supplier_name: 'Центральный Завод Sapremo',
        total_amount: totalAmount,
        items,
      };
      store.receptions.set(recId, record);
      res.status(201).json(record);
    }
  );

  app.get(
    ['/api/factory/finance/debt-summary/', '/api/factory/finance/debt-summary'],
    (_req: Request, res: Response) => {
      res.json({
        total_debt: store.factoryDebt,
        total_shipped: 3_450_000,
        total_paid: 3_450_000 - store.factoryDebt,
      });
    }
  );

  app.get(
    ['/api/factory/warehouses/', '/api/factory/warehouses'],
    (_req: Request, res: Response) => {
      res.json([
        {
          id: store.warehouseId,
          name: 'Центральный Холодильный Терминал №1 (Бишкек)',
          city: 'Бишкек',
          is_active: true,
        },
        {
          id: 'wh-osh-02',
          name: 'Южный Распределительный Хаб №2 (Ош)',
          city: 'Ош',
          is_active: true,
        },
      ]);
    }
  );

  app.get('/api/warehouse/dashboard', (_req: Request, res: Response) => {
    const totalDriversDebt = Array.from(store.drivers.values()).reduce(
      (sum, d) => sum + d.currentDebt,
      0
    );
    const lowStockProducts = Array.from(store.skus.values()).filter(
      (s) => s.stockQuantity <= s.minStockThreshold
    ).length;
    const newOrders = Array.from(store.orders.values()).filter(
      (o) => o.status === 'PENDING'
    ).length;

    res.json({
      cashBalance: store.cashBalance,
      factoryDebt: store.factoryDebt,
      totalDriversDebt,
      lowStockProducts,
      newOrders,
      totalSkus: store.skus.size,
    });
  });

  return { app, server, stompBroker };
}

// Start server if invoked directly
const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('index.ts') || process.argv[1].endsWith('index.js'));

if (isDirectRun) {
  const PORT = Number(process.env.PORT ?? 3001);
  const { server } = createMockServer();
  server.listen(PORT, () => {
    console.log(
      `[Sapremo Mock Gateway] Running on http://localhost:${PORT} (SKUs: ${store.skus.size}, Bins: ${store.bins.size}, STOMP WS: ws://localhost:${PORT}/api/warehouse/ws)`
    );
  });
}

