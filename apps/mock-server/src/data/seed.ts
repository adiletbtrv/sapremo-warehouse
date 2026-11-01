/**
 * High-Fidelity In-Memory Warehouse Data Store & Deterministic Seed Engine
 *
 * Pre-populates:
 * - 520 SKUs with mathematically valid GS1 EAN-13 and Code 128 barcodes
 * - Hierarchical storage topology (Zone -> Aisle -> Rack -> Shelf -> Bin)
 * - Lot / Batch records with FEFO (First-Expired, First-Out) metadata
 * - Immutable Movement Ledger (RECEPTION, PALLET_MOVE, DISPATCH, ADJUSTMENT, RETURN)
 * - Drivers, Driver Orders, Factory Orders, Goods Receipts, Returns, and Cashbox Transactions
 */

export interface StorageBin {
  id: string;
  code: string;
  zone: 'DEEP_FREEZE_24C' | 'COLD_STORAGE_18C' | 'BUFFER_DISPATCH_14C';
  aisle: string;
  rack: string;
  shelf: string;
  bin: string;
  temperatureCelsius: number;
  capacityBoxes: number;
  occupiedBoxes: number;
}

export interface BatchLot {
  id: string;
  lotCode128: string;
  skuId: string;
  barcode: string;
  productName: string;
  batchNumber: string;
  manufacturedAt: string;
  expirationDate: string;
  binCode: string;
  quantityBoxes: number;
  quantityPieces: number;
}

export interface SkuRecord {
  id: string;
  barcode: string;
  code128: string;
  name: string;
  category: string;
  pieces_per_box: number;
  piecesPerBox: number;
  boxQuantity: number;
  expiry_date: string;
  expirationDate: string;
  batch_number: string;
  batchNumber: string;
  factory_price: number;
  factoryPrice: number;
  driver_price: number;
  driverPrice: number;
  status: 'active' | 'inactive';
  stockQuantity: number;
  quantityBoxes: number;
  quantityPieces: number;
  binCode: string;
  aisle: string;
  rack: string;
  shelf: string;
  bin: string;
  minStockThreshold: number;
  version: number;
  updatedAt: string;
}

export interface MovementLogEntry {
  id: string;
  timestamp: string;
  type:
    | 'RECEPTION'
    | 'PALLET_MOVE'
    | 'DISPATCH'
    | 'ADJUSTMENT'
    | 'RETURN_FROM_DRIVER'
    | 'RETURN_TO_FACTORY';
  skuId: string;
  barcode: string;
  productName: string;
  batchNumber: string;
  fromBin: string | null;
  toBin: string | null;
  deltaBoxes: number;
  deltaPieces: number;
  balanceAfterPieces: number;
  actor: string;
  operationId: string;
  comment?: string;
}

export interface DriverRecord {
  id: string;
  fullName: string;
  carNumber: string;
  vehicleNumber: string;
  phone: string;
  currentDebt: number;
  totalDebt: number;
  updatedAt: string;
}

export interface OrderItemRecord {
  id: string;
  productId: string;
  barcode: string;
  productName: string;
  requestedQty: number;
  approvedQty: number;
  qty: number;
  boxCount: number;
  quantity: number;
  pricePerBox: number;
  unitPrice: number;
  amount: number;
}

export interface OrderRecord {
  id: string;
  invoiceNumber: string;
  driverId: string;
  driverName: string;
  warehouseId: string;
  status: 'PENDING' | 'CONFIRMED' | 'MODIFIED' | 'DISPATCHED' | 'REJECTED';
  requestedAt: string;
  createdAt: string;
  updatedAt: string;
  date: string;
  totalAmount: number;
  comment: string;
  version: number;
  items: OrderItemRecord[];
}

export interface FactoryOrderRecord {
  id: string;
  orderNumber: string;
  warehouse_id: string;
  warehouseId: string;
  created_at: string;
  createdAt: string;
  date: string;
  status: 'pending' | 'approved' | 'shipped' | 'delivered';
  comment: string;
  items: {
    id: string;
    product_id: string;
    productId: string;
    productName: string;
    qty: number;
    quantity: number;
  }[];
}

export interface ReceptionRecord {
  id: string;
  client_id: string;
  delivery_number: string;
  warehouse_order_id?: string;
  delivered_at: string;
  created_at: string;
  status: string;
  supplier_name: string;
  total_amount: number;
  items: {
    id: string;
    product_id: string;
    product_name: string;
    product_barcode: string;
    expected_qty: number;
    actual_qty: number;
    factory_price: number;
    discrepancy_type: 'none' | 'shortage' | 'surplus' | 'damaged';
  }[];
}

export interface ReturnRecord {
  id: string;
  returnType: 'from_driver' | 'to_factory';
  driverId?: string;
  driverName?: string;
  date: string;
  createdAt: string;
  totalAmount: number;
  comment: string;
  items: {
    id: string;
    productId: string;
    barcode: string;
    productName: string;
    qtyBoxes: number;
    qtyPieces: number;
    quantity: number;
    reason: string;
  }[];
}

export interface TransactionRecord {
  id: string;
  type: 'driver_payment' | 'factory_payment';
  amount: number;
  paymentMethod: 'CASH' | 'TRANSFER';
  driverId?: string;
  driverName?: string;
  comment: string;
  createdAt: string;
  date: string;
}

/**
 * Computes the standard GS1 Modulo-10 check digit for a 12-digit EAN-13 prefix:
 *   c = (10 - ((sum_{i=1..12} w_i * d_i) mod 10)) mod 10, where w_i in {1, 3}
 */
export function computeEan13CheckDigit(twelveDigits: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = Number(twelveDigits[i]) || 0;
    const weight = i % 2 === 0 ? 1 : 3;
    sum += digit * weight;
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * Generates a valid 13-digit EAN-13 barcode from a numeric index (1-based).
 * Uses GS1 prefix 487 (Central Asia / Industrial showcase range).
 */
export function generateValidEan13(index: number): string {
  const prefix12 = `4870001${String(index).padStart(5, '0')}`;
  const checkDigit = computeEan13CheckDigit(prefix12);
  return `${prefix12}${checkDigit}`;
}

/**
 * Generates a valid Code 128 alphanumeric logistics barcode for pallet/batch tracking.
 */
export function generateCode128Barcode(index: number, batchSeq: number): string {
  return `C128-W01-SKU${String(index).padStart(4, '0')}-B${String(batchSeq).padStart(3, '0')}`;
}

const PRODUCT_LINES = [
  { prefix: 'Пломбир Классический', category: 'Вафельный стаканчик', basePrice: 28, ppb: 40 },
  { prefix: 'Эскимо в Бельгийском Шоколаде', category: 'Эскимо на палочке', basePrice: 45, ppb: 32 },
  { prefix: 'Рожок Гранд-Карамель', category: 'Сахарный рожок', basePrice: 52, ppb: 24 },
  { prefix: 'Сорбет Тропический Манго-Маракуйя', category: 'Сорбет', basePrice: 38, ppb: 36 },
  { prefix: 'Семейный Пломбир Ведерко 1кг', category: 'Семейный формат', basePrice: 210, ppb: 8 },
  { prefix: 'Фруктовый Лёд Цитрус-Мята', category: 'Фруктовый лёд', basePrice: 22, ppb: 50 },
  { prefix: 'Сэндвич-Брикет На Сливках', category: 'Брикет', basePrice: 36, ppb: 36 },
  { prefix: 'Торт-Мороженое Прага Премиум', category: 'Торты-мороженое', basePrice: 340, ppb: 6 },
  { prefix: 'Гастроемкость HoReCa Джелато 2.5кг', category: 'HoReCa', basePrice: 480, ppb: 4 },
  { prefix: 'Лакомка Взбитая Глазурь', category: 'Трубочка', basePrice: 42, ppb: 30 },
];

const FLAVOR_VARIANTS = [
  'Ваниль Мадагаскар',
  'Фисташка Иранская',
  'Клубника со Сливками',
  'Соленая Карамель',
  'Темный Шоколад 70%',
  'Лесной Орех Пралине',
  'Кокос и Миндаль',
  'Черника-Йогурт',
  'Крем-Брюле',
  'Тирамису Итальяно',
  'Вишня Амарена',
  'Банан-Шоколад',
  'Малиновый Чизкейк',
  'Зеленый Чай Матча',
  'Кленовый Сироп и Грецкий Орех',
  'Белый Шоколад и Маракуйя',
  'Двойной Эспрессо',
  'Пломбир ГОСТ 48%',
  'Смородина-Мята',
  'Страчателла с Крошкой',
  'Карамельный Попкорн',
  'Печенье Орео Кранч',
  'Ананас-Кокос Пина Колада',
  'Лимонный Тарт',
  'Медовик со Сметаной',
  'Панна Котта Лесные Ягоды',
];

const DRIVER_PROFILES = [
  { id: 'drv-001', fullName: 'Асанов Бакытбек Токтогулович', carNumber: '01 KG 771 AAA', phone: '+996 555 10-20-31' },
  { id: 'drv-002', fullName: 'Мамытов Эркинали Садыкович', carNumber: '01 KG 442 ABB', phone: '+996 555 10-20-32' },
  { id: 'drv-003', fullName: 'Жумабеков Нурлан Канатбекович', carNumber: '01 KG 889 ACD', phone: '+996 555 10-20-33' },
  { id: 'drv-004', fullName: 'Турсунов Алмазбек Исаевич', carNumber: '01 KG 312 AEF', phone: '+996 555 10-20-34' },
  { id: 'drv-005', fullName: 'Ибраимов Руслан Кубанычбекович', carNumber: '01 KG 505 AGH', phone: '+996 555 10-20-35' },
  { id: 'drv-006', fullName: 'Кадыров Данияр Болотович', carNumber: '01 KG 920 AJK', phone: '+996 555 10-20-36' },
  { id: 'drv-007', fullName: 'Сатыбалдиев Уланбек Аскарбекович', carNumber: '01 KG 118 ALM', phone: '+996 555 10-20-37' },
  { id: 'drv-008', fullName: 'Осмонов Тимур Маратович', carNumber: '01 KG 634 ANP', phone: '+996 555 10-20-38' },
  { id: 'drv-009', fullName: 'Абдыкадыров Мирлан Эмильевич', carNumber: '01 KG 207 AQR', phone: '+996 555 10-20-39' },
  { id: 'drv-010', fullName: 'Токтосунов Айбек Замирбекович', carNumber: '01 KG 419 AST', phone: '+996 555 10-20-40' },
  { id: 'drv-011', fullName: 'Курманбеков Азамат Талантбекович', carNumber: '01 KG 753 AUV', phone: '+996 555 10-20-41' },
  { id: 'drv-012', fullName: 'Эсенгулов Максат Рысбекович', carNumber: '01 KG 864 AWX', phone: '+996 555 10-20-42' },
  { id: 'drv-013', fullName: 'Бекболотов Канат Жолдошбекович', carNumber: '01 KG 591 AYZ', phone: '+996 555 10-20-43' },
  { id: 'drv-014', fullName: 'Шаршенов Чынгыз Муратович', carNumber: '01 KG 338 BAA', phone: '+996 555 10-20-44' },
  { id: 'drv-015', fullName: 'Дuisheev Кубатбек Нурбекович', carNumber: '01 KG 902 BBB', phone: '+996 555 10-20-45' },
  { id: 'drv-016', fullName: 'Султанов Эльдар Бектурович', carNumber: '01 KG 145 BCC', phone: '+996 555 10-20-46' },
];

export class InMemoryWarehouseStore {
  public readonly warehouseId = 'wh-bishkek-01';
  public bins: Map<string, StorageBin> = new Map();
  public skus: Map<string, SkuRecord> = new Map();
  public skusByBarcode: Map<string, SkuRecord> = new Map();
  public batches: Map<string, BatchLot> = new Map();
  public movements: MovementLogEntry[] = [];
  public drivers: Map<string, DriverRecord> = new Map();
  public orders: Map<string, OrderRecord> = new Map();
  public factoryOrders: Map<string, FactoryOrderRecord> = new Map();
  public receptions: Map<string, ReceptionRecord> = new Map();
  public returns: Map<string, ReturnRecord> = new Map();
  public transactions: Map<string, TransactionRecord> = new Map();
  public idempotencyKeys: Map<string, unknown> = new Map();
  public cashBalance = 485_200;
  public factoryDebt = 1_240_000;

  constructor() {
    this.seedAll();
  }

  public seedAll(): void {
    this.bins.clear();
    this.skus.clear();
    this.skusByBarcode.clear();
    this.batches.clear();
    this.movements = [];
    this.drivers.clear();
    this.orders.clear();
    this.factoryOrders.clear();
    this.receptions.clear();
    this.returns.clear();
    this.transactions.clear();
    this.idempotencyKeys.clear();

    const now = Date.now();

    // 1. Seed 130 Storage Bins (Aisle / Rack / Shelf / Bin)
    const binList: StorageBin[] = [];
    let binIndex = 0;
    for (let a = 1; a <= 5; a++) {
      for (let r = 1; r <= 4; r++) {
        for (let s = 1; s <= 3; s++) {
          for (let b = 1; b <= 3; b++) {
            binIndex++;
            const aisle = `A${String(a).padStart(2, '0')}`;
            const rack = `R${String(r).padStart(2, '0')}`;
            const shelf = `S${String(s).padStart(2, '0')}`;
            const bin = `B${String(b).padStart(2, '0')}`;
            const code = `${aisle}-${rack}-${shelf}-${bin}`;
            const zone: StorageBin['zone'] =
              a <= 2
                ? 'DEEP_FREEZE_24C'
                : a <= 4
                  ? 'COLD_STORAGE_18C'
                  : 'BUFFER_DISPATCH_14C';
            const temperatureCelsius =
              zone === 'DEEP_FREEZE_24C' ? -24 : zone === 'COLD_STORAGE_18C' ? -18 : -14;

            const storageBin: StorageBin = {
              id: `bin-${binIndex}`,
              code,
              zone,
              aisle,
              rack,
              shelf,
              bin,
              temperatureCelsius,
              capacityBoxes: 200,
              occupiedBoxes: 0,
            };
            this.bins.set(code, storageBin);
            binList.push(storageBin);
          }
        }
      }
    }

    // 2. Seed 520 Realistic SKUs with valid EAN-13 & Code 128 barcodes
    const TOTAL_SKUS = 520;
    for (let i = 1; i <= TOTAL_SKUS; i++) {
      const line = PRODUCT_LINES[(i - 1) % PRODUCT_LINES.length];
      const flavor = FLAVOR_VARIANTS[Math.floor((i - 1) / PRODUCT_LINES.length) % FLAVOR_VARIANTS.length];
      const weightGram = 70 + ((i * 15) % 130);
      const barcode = generateValidEan13(i);
      const code128 = generateCode128Barcode(i, (i % 45) + 1);
      const skuId = `sku-${String(i).padStart(4, '0')}`;
      const name = `${line.prefix} «${flavor}» ${weightGram}г (#${String(i).padStart(3, '0')})`;
      const ppb = line.ppb;
      const factoryPrice = line.basePrice + ((i * 3) % 17);
      const driverPrice = Math.round(factoryPrice * 1.15);

      // Deterministic stock quantities: make ~18 SKUs low-stock to showcase alerts
      const isLowStock = i % 29 === 0;
      const quantityBoxes = isLowStock ? (i % 3) + 1 : 12 + ((i * 7) % 85);
      const quantityPieces = quantityBoxes * ppb;

      const assignedBin = binList[(i - 1) % binList.length];
      assignedBin.occupiedBoxes = Math.min(
        assignedBin.capacityBoxes,
        assignedBin.occupiedBoxes + quantityBoxes
      );

      const batchNumber = `LOT-2026-${String((i % 90) + 101).padStart(3, '0')}`;
      const daysUntilExpiry = 45 + ((i * 11) % 300);
      const expirationDate = new Date(now + daysUntilExpiry * 86_400_000)
        .toISOString()
        .split('T')[0];
      const manufacturedAt = new Date(now - (30 + (i % 25)) * 86_400_000)
        .toISOString()
        .split('T')[0];
      const updatedAt = new Date(now - (i % 120) * 60_000).toISOString();

      const sku: SkuRecord = {
        id: skuId,
        barcode,
        code128,
        name,
        category: line.category,
        pieces_per_box: ppb,
        piecesPerBox: ppb,
        boxQuantity: ppb,
        expiry_date: expirationDate,
        expirationDate,
        batch_number: batchNumber,
        batchNumber,
        factory_price: factoryPrice,
        factoryPrice,
        driver_price: driverPrice,
        driverPrice,
        status: 'active',
        stockQuantity: quantityPieces,
        quantityBoxes,
        quantityPieces,
        binCode: assignedBin.code,
        aisle: assignedBin.aisle,
        rack: assignedBin.rack,
        shelf: assignedBin.shelf,
        bin: assignedBin.bin,
        minStockThreshold: ppb * 5,
        version: 1,
        updatedAt,
      };

      this.skus.set(skuId, sku);
      this.skusByBarcode.set(barcode, sku);

      const batchLot: BatchLot = {
        id: `lot-${String(i).padStart(4, '0')}`,
        lotCode128: code128,
        skuId,
        barcode,
        productName: name,
        batchNumber,
        manufacturedAt,
        expirationDate,
        binCode: assignedBin.code,
        quantityBoxes,
        quantityPieces,
      };
      this.batches.set(batchLot.id, batchLot);

      if (i <= 40) {
        this.movements.push({
          id: `mov-seed-${i}`,
          timestamp: new Date(now - (45 - i) * 3_600_000).toISOString(),
          type: i % 5 === 0 ? 'PALLET_MOVE' : 'RECEPTION',
          skuId,
          barcode,
          productName: name,
          batchNumber,
          fromBin: i % 5 === 0 ? 'A05-R01-S01-B01' : null,
          toBin: assignedBin.code,
          deltaBoxes: quantityBoxes,
          deltaPieces: quantityPieces,
          balanceAfterPieces: quantityPieces,
          actor: 'warehouse_admin',
          operationId: `op-seed-${i}`,
          comment:
            i % 5 === 0
              ? `Перемещение паллеты в ячейку ${assignedBin.code}`
              : `Первичная приемка партии ${batchNumber}`,
        });
      }
    }

    // 3. Seed 16 Drivers
    DRIVER_PROFILES.forEach((profile, idx) => {
      const debt = idx % 3 === 0 ? 0 : 14_500 + idx * 6_200;
      this.drivers.set(profile.id, {
        ...profile,
        vehicleNumber: profile.carNumber,
        currentDebt: debt,
        totalDebt: debt,
        updatedAt: new Date(now - idx * 1_800_000).toISOString(),
      });
    });

    // 4. Seed 24 Realistic Driver Orders
    const skuArray = Array.from(this.skus.values());
    const statuses: OrderRecord['status'][] = [
      'PENDING',
      'PENDING',
      'CONFIRMED',
      'CONFIRMED',
      'MODIFIED',
      'DISPATCHED',
    ];

    for (let ordIdx = 1; ordIdx <= 24; ordIdx++) {
      const driver = DRIVER_PROFILES[(ordIdx - 1) % DRIVER_PROFILES.length];
      const status = statuses[(ordIdx - 1) % statuses.length];
      const createdAt = new Date(now - (25 - ordIdx) * 3_600_000).toISOString();
      const itemCount = 2 + (ordIdx % 4);
      const items: OrderItemRecord[] = [];
      let totalAmount = 0;

      for (let k = 0; k < itemCount; k++) {
        const sku = skuArray[(ordIdx * 7 + k * 13) % skuArray.length];
        const boxes = 2 + ((ordIdx + k) % 6);
        const pieces = boxes * sku.boxQuantity;
        const unitPrice = sku.factoryPrice;
        const pricePerBox = unitPrice * sku.boxQuantity;
        const amount = pieces * unitPrice;
        totalAmount += amount;

        items.push({
          id: `ord-item-${ordIdx}-${k + 1}`,
          productId: sku.id,
          barcode: sku.barcode,
          productName: sku.name,
          requestedQty: boxes,
          approvedQty: boxes,
          qty: boxes,
          boxCount: boxes,
          quantity: pieces,
          pricePerBox,
          unitPrice,
          amount,
        });
      }

      const orderId = `ORD-${String(1000 + ordIdx)}`;
      this.orders.set(orderId, {
        id: orderId,
        invoiceNumber: `INV-2026-${String(ordIdx).padStart(4, '0')}`,
        driverId: driver.id,
        driverName: driver.fullName,
        warehouseId: this.warehouseId,
        status,
        requestedAt: createdAt,
        createdAt,
        updatedAt: createdAt,
        date: createdAt,
        totalAmount,
        comment: `Маршрутный лист №${ordIdx} (${driver.carNumber})`,
        version: 1,
        items,
      });
    }

    // 5. Seed 10 Factory Orders
    const factoryStatuses: FactoryOrderRecord['status'][] = [
      'pending',
      'approved',
      'shipped',
      'delivered',
    ];
    for (let fIdx = 1; fIdx <= 10; fIdx++) {
      const status = factoryStatuses[(fIdx - 1) % factoryStatuses.length];
      const createdAt = new Date(now - (12 - fIdx) * 7_200_000).toISOString();
      const items = [0, 1, 2].map((offset) => {
        const sku = skuArray[(fIdx * 11 + offset * 5) % skuArray.length];
        const qtyBoxes = 10 + ((fIdx + offset) % 15);
        return {
          id: `fo-item-${fIdx}-${offset + 1}`,
          product_id: sku.id,
          productId: sku.id,
          productName: sku.name,
          qty: qtyBoxes,
          quantity: qtyBoxes,
        };
      });

      const foId = `FO-2026-${String(fIdx).padStart(3, '0')}`;
      this.factoryOrders.set(foId, {
        id: foId,
        orderNumber: foId,
        warehouse_id: this.warehouseId,
        warehouseId: this.warehouseId,
        created_at: createdAt,
        createdAt,
        date: createdAt,
        status,
        comment: `Плановое пополнение холодильного терминала №${fIdx}`,
        items,
      });
    }

    // 6. Seed 8 Goods Receipts (Receptions)
    for (let rIdx = 1; rIdx <= 8; rIdx++) {
      const createdAt = new Date(now - (10 - rIdx) * 10_800_000).toISOString();
      const recItems = [0, 1, 2].map((offset) => {
        const sku = skuArray[(rIdx * 9 + offset * 3) % skuArray.length];
        const boxes = 10 + offset * 5;
        const pieces = boxes * sku.boxQuantity;
        return {
          id: `rec-item-${rIdx}-${offset + 1}`,
          product_id: sku.id,
          product_name: sku.name,
          product_barcode: sku.barcode,
          expected_qty: pieces,
          actual_qty: pieces,
          factory_price: sku.factoryPrice,
          discrepancy_type: 'none' as const,
        };
      });
      const totalAmount = recItems.reduce(
        (acc, it) => acc + it.actual_qty * it.factory_price,
        0
      );
      const recId = `REC-2026-${String(rIdx).padStart(3, '0')}`;
      this.receptions.set(recId, {
        id: recId,
        client_id: recId,
        delivery_number: recId,
        delivered_at: createdAt,
        created_at: createdAt,
        status: 'completed',
        supplier_name: 'Центральный Завод Sapremo',
        total_amount: totalAmount,
        items: recItems,
      });
    }

    // 7. Seed 6 Product Returns
    for (let retIdx = 1; retIdx <= 6; retIdx++) {
      const driver = DRIVER_PROFILES[(retIdx - 1) % DRIVER_PROFILES.length];
      const sku = skuArray[(retIdx * 17) % skuArray.length];
      const qtyBoxes = 1 + (retIdx % 3);
      const qtyPieces = qtyBoxes * sku.boxQuantity;
      const totalAmount = qtyPieces * sku.factoryPrice;
      const createdAt = new Date(now - (7 - retIdx) * 14_400_000).toISOString();
      const retId = `RET-2026-${String(retIdx).padStart(3, '0')}`;

      this.returns.set(retId, {
        id: retId,
        returnType: 'from_driver',
        driverId: driver.id,
        driverName: driver.fullName,
        date: createdAt,
        createdAt,
        totalAmount,
        comment: 'Возврат нереализованного остатка с маршрута',
        items: [
          {
            id: `ret-item-${retIdx}-1`,
            productId: sku.id,
            barcode: sku.barcode,
            productName: sku.name,
            qtyBoxes,
            qtyPieces: 0,
            quantity: qtyPieces,
            reason: 'NOT_SOLD',
          },
        ],
      });
    }

    // 8. Seed 16 Cashbox Transactions
    for (let txIdx = 1; txIdx <= 16; txIdx++) {
      const isFactory = txIdx % 5 === 0;
      const driver = DRIVER_PROFILES[(txIdx - 1) % DRIVER_PROFILES.length];
      const createdAt = new Date(now - (17 - txIdx) * 5_400_000).toISOString();
      const txId = `TX-2026-${String(txIdx).padStart(4, '0')}`;
      const amount = isFactory ? 85_000 + txIdx * 5_000 : 12_000 + txIdx * 1_500;

      this.transactions.set(txId, {
        id: txId,
        type: isFactory ? 'factory_payment' : 'driver_payment',
        amount,
        paymentMethod: txIdx % 3 === 0 ? 'TRANSFER' : 'CASH',
        driverId: isFactory ? undefined : driver.id,
        driverName: isFactory ? undefined : driver.fullName,
        comment: isFactory
          ? `Инкассация / перевод заводу по реестру №${txIdx}`
          : `Оплата путевого листа от водителя (${driver.carNumber})`,
        createdAt,
        date: createdAt,
      });
    }
  }
}

export const store = new InMemoryWarehouseStore();

