// src/index.ts
import http from "http";
import express from "express";
import cors from "cors";

// src/data/seed.ts
function computeEan13CheckDigit(twelveDigits) {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = Number(twelveDigits[i]) || 0;
    const weight = i % 2 === 0 ? 1 : 3;
    sum += digit * weight;
  }
  return (10 - sum % 10) % 10;
}
function generateValidEan13(index) {
  const prefix12 = `4870001${String(index).padStart(5, "0")}`;
  const checkDigit = computeEan13CheckDigit(prefix12);
  return `${prefix12}${checkDigit}`;
}
function generateCode128Barcode(index, batchSeq) {
  return `C128-W01-SKU${String(index).padStart(4, "0")}-B${String(batchSeq).padStart(3, "0")}`;
}
var PRODUCT_LINES = [
  { prefix: "\u041F\u043B\u043E\u043C\u0431\u0438\u0440 \u041A\u043B\u0430\u0441\u0441\u0438\u0447\u0435\u0441\u043A\u0438\u0439", category: "\u0412\u0430\u0444\u0435\u043B\u044C\u043D\u044B\u0439 \u0441\u0442\u0430\u043A\u0430\u043D\u0447\u0438\u043A", basePrice: 28, ppb: 40 },
  { prefix: "\u042D\u0441\u043A\u0438\u043C\u043E \u0432 \u0411\u0435\u043B\u044C\u0433\u0438\u0439\u0441\u043A\u043E\u043C \u0428\u043E\u043A\u043E\u043B\u0430\u0434\u0435", category: "\u042D\u0441\u043A\u0438\u043C\u043E \u043D\u0430 \u043F\u0430\u043B\u043E\u0447\u043A\u0435", basePrice: 45, ppb: 32 },
  { prefix: "\u0420\u043E\u0436\u043E\u043A \u0413\u0440\u0430\u043D\u0434-\u041A\u0430\u0440\u0430\u043C\u0435\u043B\u044C", category: "\u0421\u0430\u0445\u0430\u0440\u043D\u044B\u0439 \u0440\u043E\u0436\u043E\u043A", basePrice: 52, ppb: 24 },
  { prefix: "\u0421\u043E\u0440\u0431\u0435\u0442 \u0422\u0440\u043E\u043F\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u041C\u0430\u043D\u0433\u043E-\u041C\u0430\u0440\u0430\u043A\u0443\u0439\u044F", category: "\u0421\u043E\u0440\u0431\u0435\u0442", basePrice: 38, ppb: 36 },
  { prefix: "\u0421\u0435\u043C\u0435\u0439\u043D\u044B\u0439 \u041F\u043B\u043E\u043C\u0431\u0438\u0440 \u0412\u0435\u0434\u0435\u0440\u043A\u043E 1\u043A\u0433", category: "\u0421\u0435\u043C\u0435\u0439\u043D\u044B\u0439 \u0444\u043E\u0440\u043C\u0430\u0442", basePrice: 210, ppb: 8 },
  { prefix: "\u0424\u0440\u0443\u043A\u0442\u043E\u0432\u044B\u0439 \u041B\u0451\u0434 \u0426\u0438\u0442\u0440\u0443\u0441-\u041C\u044F\u0442\u0430", category: "\u0424\u0440\u0443\u043A\u0442\u043E\u0432\u044B\u0439 \u043B\u0451\u0434", basePrice: 22, ppb: 50 },
  { prefix: "\u0421\u044D\u043D\u0434\u0432\u0438\u0447-\u0411\u0440\u0438\u043A\u0435\u0442 \u041D\u0430 \u0421\u043B\u0438\u0432\u043A\u0430\u0445", category: "\u0411\u0440\u0438\u043A\u0435\u0442", basePrice: 36, ppb: 36 },
  { prefix: "\u0422\u043E\u0440\u0442-\u041C\u043E\u0440\u043E\u0436\u0435\u043D\u043E\u0435 \u041F\u0440\u0430\u0433\u0430 \u041F\u0440\u0435\u043C\u0438\u0443\u043C", category: "\u0422\u043E\u0440\u0442\u044B-\u043C\u043E\u0440\u043E\u0436\u0435\u043D\u043E\u0435", basePrice: 340, ppb: 6 },
  { prefix: "\u0413\u0430\u0441\u0442\u0440\u043E\u0435\u043C\u043A\u043E\u0441\u0442\u044C HoReCa \u0414\u0436\u0435\u043B\u0430\u0442\u043E 2.5\u043A\u0433", category: "HoReCa", basePrice: 480, ppb: 4 },
  { prefix: "\u041B\u0430\u043A\u043E\u043C\u043A\u0430 \u0412\u0437\u0431\u0438\u0442\u0430\u044F \u0413\u043B\u0430\u0437\u0443\u0440\u044C", category: "\u0422\u0440\u0443\u0431\u043E\u0447\u043A\u0430", basePrice: 42, ppb: 30 }
];
var FLAVOR_VARIANTS = [
  "\u0412\u0430\u043D\u0438\u043B\u044C \u041C\u0430\u0434\u0430\u0433\u0430\u0441\u043A\u0430\u0440",
  "\u0424\u0438\u0441\u0442\u0430\u0448\u043A\u0430 \u0418\u0440\u0430\u043D\u0441\u043A\u0430\u044F",
  "\u041A\u043B\u0443\u0431\u043D\u0438\u043A\u0430 \u0441\u043E \u0421\u043B\u0438\u0432\u043A\u0430\u043C\u0438",
  "\u0421\u043E\u043B\u0435\u043D\u0430\u044F \u041A\u0430\u0440\u0430\u043C\u0435\u043B\u044C",
  "\u0422\u0435\u043C\u043D\u044B\u0439 \u0428\u043E\u043A\u043E\u043B\u0430\u0434 70%",
  "\u041B\u0435\u0441\u043D\u043E\u0439 \u041E\u0440\u0435\u0445 \u041F\u0440\u0430\u043B\u0438\u043D\u0435",
  "\u041A\u043E\u043A\u043E\u0441 \u0438 \u041C\u0438\u043D\u0434\u0430\u043B\u044C",
  "\u0427\u0435\u0440\u043D\u0438\u043A\u0430-\u0419\u043E\u0433\u0443\u0440\u0442",
  "\u041A\u0440\u0435\u043C-\u0411\u0440\u044E\u043B\u0435",
  "\u0422\u0438\u0440\u0430\u043C\u0438\u0441\u0443 \u0418\u0442\u0430\u043B\u044C\u044F\u043D\u043E",
  "\u0412\u0438\u0448\u043D\u044F \u0410\u043C\u0430\u0440\u0435\u043D\u0430",
  "\u0411\u0430\u043D\u0430\u043D-\u0428\u043E\u043A\u043E\u043B\u0430\u0434",
  "\u041C\u0430\u043B\u0438\u043D\u043E\u0432\u044B\u0439 \u0427\u0438\u0437\u043A\u0435\u0439\u043A",
  "\u0417\u0435\u043B\u0435\u043D\u044B\u0439 \u0427\u0430\u0439 \u041C\u0430\u0442\u0447\u0430",
  "\u041A\u043B\u0435\u043D\u043E\u0432\u044B\u0439 \u0421\u0438\u0440\u043E\u043F \u0438 \u0413\u0440\u0435\u0446\u043A\u0438\u0439 \u041E\u0440\u0435\u0445",
  "\u0411\u0435\u043B\u044B\u0439 \u0428\u043E\u043A\u043E\u043B\u0430\u0434 \u0438 \u041C\u0430\u0440\u0430\u043A\u0443\u0439\u044F",
  "\u0414\u0432\u043E\u0439\u043D\u043E\u0439 \u042D\u0441\u043F\u0440\u0435\u0441\u0441\u043E",
  "\u041F\u043B\u043E\u043C\u0431\u0438\u0440 \u0413\u041E\u0421\u0422 48%",
  "\u0421\u043C\u043E\u0440\u043E\u0434\u0438\u043D\u0430-\u041C\u044F\u0442\u0430",
  "\u0421\u0442\u0440\u0430\u0447\u0430\u0442\u0435\u043B\u043B\u0430 \u0441 \u041A\u0440\u043E\u0448\u043A\u043E\u0439",
  "\u041A\u0430\u0440\u0430\u043C\u0435\u043B\u044C\u043D\u044B\u0439 \u041F\u043E\u043F\u043A\u043E\u0440\u043D",
  "\u041F\u0435\u0447\u0435\u043D\u044C\u0435 \u041E\u0440\u0435\u043E \u041A\u0440\u0430\u043D\u0447",
  "\u0410\u043D\u0430\u043D\u0430\u0441-\u041A\u043E\u043A\u043E\u0441 \u041F\u0438\u043D\u0430 \u041A\u043E\u043B\u0430\u0434\u0430",
  "\u041B\u0438\u043C\u043E\u043D\u043D\u044B\u0439 \u0422\u0430\u0440\u0442",
  "\u041C\u0435\u0434\u043E\u0432\u0438\u043A \u0441\u043E \u0421\u043C\u0435\u0442\u0430\u043D\u043E\u0439",
  "\u041F\u0430\u043D\u043D\u0430 \u041A\u043E\u0442\u0442\u0430 \u041B\u0435\u0441\u043D\u044B\u0435 \u042F\u0433\u043E\u0434\u044B"
];
var DRIVER_PROFILES = [
  { id: "drv-001", fullName: "\u0410\u0441\u0430\u043D\u043E\u0432 \u0411\u0430\u043A\u044B\u0442\u0431\u0435\u043A \u0422\u043E\u043A\u0442\u043E\u0433\u0443\u043B\u043E\u0432\u0438\u0447", carNumber: "01 KG 771 AAA", phone: "+996 555 10-20-31" },
  { id: "drv-002", fullName: "\u041C\u0430\u043C\u044B\u0442\u043E\u0432 \u042D\u0440\u043A\u0438\u043D\u0430\u043B\u0438 \u0421\u0430\u0434\u044B\u043A\u043E\u0432\u0438\u0447", carNumber: "01 KG 442 ABB", phone: "+996 555 10-20-32" },
  { id: "drv-003", fullName: "\u0416\u0443\u043C\u0430\u0431\u0435\u043A\u043E\u0432 \u041D\u0443\u0440\u043B\u0430\u043D \u041A\u0430\u043D\u0430\u0442\u0431\u0435\u043A\u043E\u0432\u0438\u0447", carNumber: "01 KG 889 ACD", phone: "+996 555 10-20-33" },
  { id: "drv-004", fullName: "\u0422\u0443\u0440\u0441\u0443\u043D\u043E\u0432 \u0410\u043B\u043C\u0430\u0437\u0431\u0435\u043A \u0418\u0441\u0430\u0435\u0432\u0438\u0447", carNumber: "01 KG 312 AEF", phone: "+996 555 10-20-34" },
  { id: "drv-005", fullName: "\u0418\u0431\u0440\u0430\u0438\u043C\u043E\u0432 \u0420\u0443\u0441\u043B\u0430\u043D \u041A\u0443\u0431\u0430\u043D\u044B\u0447\u0431\u0435\u043A\u043E\u0432\u0438\u0447", carNumber: "01 KG 505 AGH", phone: "+996 555 10-20-35" },
  { id: "drv-006", fullName: "\u041A\u0430\u0434\u044B\u0440\u043E\u0432 \u0414\u0430\u043D\u0438\u044F\u0440 \u0411\u043E\u043B\u043E\u0442\u043E\u0432\u0438\u0447", carNumber: "01 KG 920 AJK", phone: "+996 555 10-20-36" },
  { id: "drv-007", fullName: "\u0421\u0430\u0442\u044B\u0431\u0430\u043B\u0434\u0438\u0435\u0432 \u0423\u043B\u0430\u043D\u0431\u0435\u043A \u0410\u0441\u043A\u0430\u0440\u0431\u0435\u043A\u043E\u0432\u0438\u0447", carNumber: "01 KG 118 ALM", phone: "+996 555 10-20-37" },
  { id: "drv-008", fullName: "\u041E\u0441\u043C\u043E\u043D\u043E\u0432 \u0422\u0438\u043C\u0443\u0440 \u041C\u0430\u0440\u0430\u0442\u043E\u0432\u0438\u0447", carNumber: "01 KG 634 ANP", phone: "+996 555 10-20-38" },
  { id: "drv-009", fullName: "\u0410\u0431\u0434\u044B\u043A\u0430\u0434\u044B\u0440\u043E\u0432 \u041C\u0438\u0440\u043B\u0430\u043D \u042D\u043C\u0438\u043B\u044C\u0435\u0432\u0438\u0447", carNumber: "01 KG 207 AQR", phone: "+996 555 10-20-39" },
  { id: "drv-010", fullName: "\u0422\u043E\u043A\u0442\u043E\u0441\u0443\u043D\u043E\u0432 \u0410\u0439\u0431\u0435\u043A \u0417\u0430\u043C\u0438\u0440\u0431\u0435\u043A\u043E\u0432\u0438\u0447", carNumber: "01 KG 419 AST", phone: "+996 555 10-20-40" },
  { id: "drv-011", fullName: "\u041A\u0443\u0440\u043C\u0430\u043D\u0431\u0435\u043A\u043E\u0432 \u0410\u0437\u0430\u043C\u0430\u0442 \u0422\u0430\u043B\u0430\u043D\u0442\u0431\u0435\u043A\u043E\u0432\u0438\u0447", carNumber: "01 KG 753 AUV", phone: "+996 555 10-20-41" },
  { id: "drv-012", fullName: "\u042D\u0441\u0435\u043D\u0433\u0443\u043B\u043E\u0432 \u041C\u0430\u043A\u0441\u0430\u0442 \u0420\u044B\u0441\u0431\u0435\u043A\u043E\u0432\u0438\u0447", carNumber: "01 KG 864 AWX", phone: "+996 555 10-20-42" },
  { id: "drv-013", fullName: "\u0411\u0435\u043A\u0431\u043E\u043B\u043E\u0442\u043E\u0432 \u041A\u0430\u043D\u0430\u0442 \u0416\u043E\u043B\u0434\u043E\u0448\u0431\u0435\u043A\u043E\u0432\u0438\u0447", carNumber: "01 KG 591 AYZ", phone: "+996 555 10-20-43" },
  { id: "drv-014", fullName: "\u0428\u0430\u0440\u0448\u0435\u043D\u043E\u0432 \u0427\u044B\u043D\u0433\u044B\u0437 \u041C\u0443\u0440\u0430\u0442\u043E\u0432\u0438\u0447", carNumber: "01 KG 338 BAA", phone: "+996 555 10-20-44" },
  { id: "drv-015", fullName: "\u0414uisheev \u041A\u0443\u0431\u0430\u0442\u0431\u0435\u043A \u041D\u0443\u0440\u0431\u0435\u043A\u043E\u0432\u0438\u0447", carNumber: "01 KG 902 BBB", phone: "+996 555 10-20-45" },
  { id: "drv-016", fullName: "\u0421\u0443\u043B\u0442\u0430\u043D\u043E\u0432 \u042D\u043B\u044C\u0434\u0430\u0440 \u0411\u0435\u043A\u0442\u0443\u0440\u043E\u0432\u0438\u0447", carNumber: "01 KG 145 BCC", phone: "+996 555 10-20-46" }
];
var InMemoryWarehouseStore = class {
  warehouseId = "wh-bishkek-01";
  bins = /* @__PURE__ */ new Map();
  skus = /* @__PURE__ */ new Map();
  skusByBarcode = /* @__PURE__ */ new Map();
  batches = /* @__PURE__ */ new Map();
  movements = [];
  drivers = /* @__PURE__ */ new Map();
  orders = /* @__PURE__ */ new Map();
  factoryOrders = /* @__PURE__ */ new Map();
  receptions = /* @__PURE__ */ new Map();
  returns = /* @__PURE__ */ new Map();
  transactions = /* @__PURE__ */ new Map();
  idempotencyKeys = /* @__PURE__ */ new Map();
  cashBalance = 485200;
  factoryDebt = 124e4;
  constructor() {
    this.seedAll();
  }
  seedAll() {
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
    const binList = [];
    let binIndex = 0;
    for (let a = 1; a <= 5; a++) {
      for (let r = 1; r <= 4; r++) {
        for (let s = 1; s <= 3; s++) {
          for (let b = 1; b <= 3; b++) {
            binIndex++;
            const aisle = `A${String(a).padStart(2, "0")}`;
            const rack = `R${String(r).padStart(2, "0")}`;
            const shelf = `S${String(s).padStart(2, "0")}`;
            const bin = `B${String(b).padStart(2, "0")}`;
            const code = `${aisle}-${rack}-${shelf}-${bin}`;
            const zone = a <= 2 ? "DEEP_FREEZE_24C" : a <= 4 ? "COLD_STORAGE_18C" : "BUFFER_DISPATCH_14C";
            const temperatureCelsius = zone === "DEEP_FREEZE_24C" ? -24 : zone === "COLD_STORAGE_18C" ? -18 : -14;
            const storageBin = {
              id: `bin-${binIndex}`,
              code,
              zone,
              aisle,
              rack,
              shelf,
              bin,
              temperatureCelsius,
              capacityBoxes: 200,
              occupiedBoxes: 0
            };
            this.bins.set(code, storageBin);
            binList.push(storageBin);
          }
        }
      }
    }
    const TOTAL_SKUS = 520;
    for (let i = 1; i <= TOTAL_SKUS; i++) {
      const line = PRODUCT_LINES[(i - 1) % PRODUCT_LINES.length];
      const flavor = FLAVOR_VARIANTS[Math.floor((i - 1) / PRODUCT_LINES.length) % FLAVOR_VARIANTS.length];
      const weightGram = 70 + i * 15 % 130;
      const barcode = generateValidEan13(i);
      const code128 = generateCode128Barcode(i, i % 45 + 1);
      const skuId = `sku-${String(i).padStart(4, "0")}`;
      const name = `${line.prefix} \xAB${flavor}\xBB ${weightGram}\u0433 (#${String(i).padStart(3, "0")})`;
      const ppb = line.ppb;
      const factoryPrice = line.basePrice + i * 3 % 17;
      const driverPrice = Math.round(factoryPrice * 1.15);
      const isLowStock = i % 29 === 0;
      const quantityBoxes = isLowStock ? i % 3 + 1 : 12 + i * 7 % 85;
      const quantityPieces = quantityBoxes * ppb;
      const assignedBin = binList[(i - 1) % binList.length];
      assignedBin.occupiedBoxes = Math.min(
        assignedBin.capacityBoxes,
        assignedBin.occupiedBoxes + quantityBoxes
      );
      const batchNumber = `LOT-2026-${String(i % 90 + 101).padStart(3, "0")}`;
      const daysUntilExpiry = 45 + i * 11 % 300;
      const expirationDate = new Date(now + daysUntilExpiry * 864e5).toISOString().split("T")[0];
      const manufacturedAt = new Date(now - (30 + i % 25) * 864e5).toISOString().split("T")[0];
      const updatedAt = new Date(now - i % 120 * 6e4).toISOString();
      const sku = {
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
        status: "active",
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
        updatedAt
      };
      this.skus.set(skuId, sku);
      this.skusByBarcode.set(barcode, sku);
      const batchLot = {
        id: `lot-${String(i).padStart(4, "0")}`,
        lotCode128: code128,
        skuId,
        barcode,
        productName: name,
        batchNumber,
        manufacturedAt,
        expirationDate,
        binCode: assignedBin.code,
        quantityBoxes,
        quantityPieces
      };
      this.batches.set(batchLot.id, batchLot);
      if (i <= 40) {
        this.movements.push({
          id: `mov-seed-${i}`,
          timestamp: new Date(now - (45 - i) * 36e5).toISOString(),
          type: i % 5 === 0 ? "PALLET_MOVE" : "RECEPTION",
          skuId,
          barcode,
          productName: name,
          batchNumber,
          fromBin: i % 5 === 0 ? "A05-R01-S01-B01" : null,
          toBin: assignedBin.code,
          deltaBoxes: quantityBoxes,
          deltaPieces: quantityPieces,
          balanceAfterPieces: quantityPieces,
          actor: "warehouse_admin",
          operationId: `op-seed-${i}`,
          comment: i % 5 === 0 ? `\u041F\u0435\u0440\u0435\u043C\u0435\u0449\u0435\u043D\u0438\u0435 \u043F\u0430\u043B\u043B\u0435\u0442\u044B \u0432 \u044F\u0447\u0435\u0439\u043A\u0443 ${assignedBin.code}` : `\u041F\u0435\u0440\u0432\u0438\u0447\u043D\u0430\u044F \u043F\u0440\u0438\u0435\u043C\u043A\u0430 \u043F\u0430\u0440\u0442\u0438\u0438 ${batchNumber}`
        });
      }
    }
    DRIVER_PROFILES.forEach((profile, idx) => {
      const debt = idx % 3 === 0 ? 0 : 14500 + idx * 6200;
      this.drivers.set(profile.id, {
        ...profile,
        vehicleNumber: profile.carNumber,
        currentDebt: debt,
        totalDebt: debt,
        updatedAt: new Date(now - idx * 18e5).toISOString()
      });
    });
    const skuArray = Array.from(this.skus.values());
    const statuses = [
      "PENDING",
      "PENDING",
      "CONFIRMED",
      "CONFIRMED",
      "MODIFIED",
      "DISPATCHED"
    ];
    for (let ordIdx = 1; ordIdx <= 24; ordIdx++) {
      const driver = DRIVER_PROFILES[(ordIdx - 1) % DRIVER_PROFILES.length];
      const status = statuses[(ordIdx - 1) % statuses.length];
      const createdAt = new Date(now - (25 - ordIdx) * 36e5).toISOString();
      const itemCount = 2 + ordIdx % 4;
      const items = [];
      let totalAmount = 0;
      for (let k = 0; k < itemCount; k++) {
        const sku = skuArray[(ordIdx * 7 + k * 13) % skuArray.length];
        const boxes = 2 + (ordIdx + k) % 6;
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
          amount
        });
      }
      const orderId = `ORD-${String(1e3 + ordIdx)}`;
      this.orders.set(orderId, {
        id: orderId,
        invoiceNumber: `INV-2026-${String(ordIdx).padStart(4, "0")}`,
        driverId: driver.id,
        driverName: driver.fullName,
        warehouseId: this.warehouseId,
        status,
        requestedAt: createdAt,
        createdAt,
        updatedAt: createdAt,
        date: createdAt,
        totalAmount,
        comment: `\u041C\u0430\u0440\u0448\u0440\u0443\u0442\u043D\u044B\u0439 \u043B\u0438\u0441\u0442 \u2116${ordIdx} (${driver.carNumber})`,
        version: 1,
        items
      });
    }
    const factoryStatuses = [
      "pending",
      "approved",
      "shipped",
      "delivered"
    ];
    for (let fIdx = 1; fIdx <= 10; fIdx++) {
      const status = factoryStatuses[(fIdx - 1) % factoryStatuses.length];
      const createdAt = new Date(now - (12 - fIdx) * 72e5).toISOString();
      const items = [0, 1, 2].map((offset) => {
        const sku = skuArray[(fIdx * 11 + offset * 5) % skuArray.length];
        const qtyBoxes = 10 + (fIdx + offset) % 15;
        return {
          id: `fo-item-${fIdx}-${offset + 1}`,
          product_id: sku.id,
          productId: sku.id,
          productName: sku.name,
          qty: qtyBoxes,
          quantity: qtyBoxes
        };
      });
      const foId = `FO-2026-${String(fIdx).padStart(3, "0")}`;
      this.factoryOrders.set(foId, {
        id: foId,
        orderNumber: foId,
        warehouse_id: this.warehouseId,
        warehouseId: this.warehouseId,
        created_at: createdAt,
        createdAt,
        date: createdAt,
        status,
        comment: `\u041F\u043B\u0430\u043D\u043E\u0432\u043E\u0435 \u043F\u043E\u043F\u043E\u043B\u043D\u0435\u043D\u0438\u0435 \u0445\u043E\u043B\u043E\u0434\u0438\u043B\u044C\u043D\u043E\u0433\u043E \u0442\u0435\u0440\u043C\u0438\u043D\u0430\u043B\u0430 \u2116${fIdx}`,
        items
      });
    }
    for (let rIdx = 1; rIdx <= 8; rIdx++) {
      const createdAt = new Date(now - (10 - rIdx) * 108e5).toISOString();
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
          discrepancy_type: "none"
        };
      });
      const totalAmount = recItems.reduce(
        (acc, it) => acc + it.actual_qty * it.factory_price,
        0
      );
      const recId = `REC-2026-${String(rIdx).padStart(3, "0")}`;
      this.receptions.set(recId, {
        id: recId,
        client_id: recId,
        delivery_number: recId,
        delivered_at: createdAt,
        created_at: createdAt,
        status: "completed",
        supplier_name: "\u0426\u0435\u043D\u0442\u0440\u0430\u043B\u044C\u043D\u044B\u0439 \u0417\u0430\u0432\u043E\u0434 Sapremo",
        total_amount: totalAmount,
        items: recItems
      });
    }
    for (let retIdx = 1; retIdx <= 6; retIdx++) {
      const driver = DRIVER_PROFILES[(retIdx - 1) % DRIVER_PROFILES.length];
      const sku = skuArray[retIdx * 17 % skuArray.length];
      const qtyBoxes = 1 + retIdx % 3;
      const qtyPieces = qtyBoxes * sku.boxQuantity;
      const totalAmount = qtyPieces * sku.factoryPrice;
      const createdAt = new Date(now - (7 - retIdx) * 144e5).toISOString();
      const retId = `RET-2026-${String(retIdx).padStart(3, "0")}`;
      this.returns.set(retId, {
        id: retId,
        returnType: "from_driver",
        driverId: driver.id,
        driverName: driver.fullName,
        date: createdAt,
        createdAt,
        totalAmount,
        comment: "\u0412\u043E\u0437\u0432\u0440\u0430\u0442 \u043D\u0435\u0440\u0435\u0430\u043B\u0438\u0437\u043E\u0432\u0430\u043D\u043D\u043E\u0433\u043E \u043E\u0441\u0442\u0430\u0442\u043A\u0430 \u0441 \u043C\u0430\u0440\u0448\u0440\u0443\u0442\u0430",
        items: [
          {
            id: `ret-item-${retIdx}-1`,
            productId: sku.id,
            barcode: sku.barcode,
            productName: sku.name,
            qtyBoxes,
            qtyPieces: 0,
            quantity: qtyPieces,
            reason: "NOT_SOLD"
          }
        ]
      });
    }
    for (let txIdx = 1; txIdx <= 16; txIdx++) {
      const isFactory = txIdx % 5 === 0;
      const driver = DRIVER_PROFILES[(txIdx - 1) % DRIVER_PROFILES.length];
      const createdAt = new Date(now - (17 - txIdx) * 54e5).toISOString();
      const txId = `TX-2026-${String(txIdx).padStart(4, "0")}`;
      const amount = isFactory ? 85e3 + txIdx * 5e3 : 12e3 + txIdx * 1500;
      this.transactions.set(txId, {
        id: txId,
        type: isFactory ? "factory_payment" : "driver_payment",
        amount,
        paymentMethod: txIdx % 3 === 0 ? "TRANSFER" : "CASH",
        driverId: isFactory ? void 0 : driver.id,
        driverName: isFactory ? void 0 : driver.fullName,
        comment: isFactory ? `\u0418\u043D\u043A\u0430\u0441\u0441\u0430\u0446\u0438\u044F / \u043F\u0435\u0440\u0435\u0432\u043E\u0434 \u0437\u0430\u0432\u043E\u0434\u0443 \u043F\u043E \u0440\u0435\u0435\u0441\u0442\u0440\u0443 \u2116${txIdx}` : `\u041E\u043F\u043B\u0430\u0442\u0430 \u043F\u0443\u0442\u0435\u0432\u043E\u0433\u043E \u043B\u0438\u0441\u0442\u0430 \u043E\u0442 \u0432\u043E\u0434\u0438\u0442\u0435\u043B\u044F (${driver.carNumber})`,
        createdAt,
        date: createdAt
      });
    }
  }
};
var store = new InMemoryWarehouseStore();

// src/middleware/networkSimulator.ts
var state = {
  enabled: process.env.MOCK_CHAOS_ENABLED !== "false",
  minLatencyMs: Number(process.env.MOCK_LATENCY_MIN_MS ?? 50),
  maxLatencyMs: Number(process.env.MOCK_LATENCY_MAX_MS ?? 300),
  dropRate: Number(process.env.MOCK_DROP_RATE ?? 0),
  flappingMode: process.env.MOCK_FLAPPING_MODE === "true",
  flapIntervalMs: Number(process.env.MOCK_FLAP_INTERVAL_MS ?? 15e3)
};
function getChaosConfig() {
  return { ...state };
}
function updateChaosConfig(patch) {
  if (typeof patch.enabled === "boolean") state.enabled = patch.enabled;
  if (typeof patch.minLatencyMs === "number" && patch.minLatencyMs >= 0) {
    state.minLatencyMs = patch.minLatencyMs;
  }
  if (typeof patch.maxLatencyMs === "number" && patch.maxLatencyMs >= state.minLatencyMs) {
    state.maxLatencyMs = patch.maxLatencyMs;
  }
  if (typeof patch.dropRate === "number") {
    state.dropRate = Math.max(0, Math.min(1, patch.dropRate));
  }
  if (typeof patch.flappingMode === "boolean") {
    state.flappingMode = patch.flappingMode;
  }
  if (typeof patch.flapIntervalMs === "number" && patch.flapIntervalMs >= 1e3) {
    state.flapIntervalMs = patch.flapIntervalMs;
  }
  return getChaosConfig();
}
function networkDegradationMiddleware(req, res, next) {
  if (req.path.includes("/health") || req.path.includes("/chaos/config") || req.path.endsWith("/ws/info")) {
    next();
    return;
  }
  if (!state.enabled) {
    next();
    return;
  }
  const headerLatency = req.headers["x-chaos-latency-ms"];
  const minMs = state.minLatencyMs;
  const maxMs = Math.max(minMs, state.maxLatencyMs);
  const simulatedDelayMs = headerLatency !== void 0 ? Math.max(0, Number(headerLatency) || 0) : Math.floor(minMs + Math.random() * (maxMs - minMs + 1));
  const headerDropRate = req.headers["x-chaos-drop-rate"];
  let effectiveDropRate = headerDropRate !== void 0 ? Number(headerDropRate) : state.dropRate;
  if (state.flappingMode) {
    const cyclePhase = Math.floor(Date.now() / state.flapIntervalMs) % 2;
    if (cyclePhase === 1) {
      effectiveDropRate = Math.max(effectiveDropRate, 0.85);
    }
  }
  const shouldDrop = effectiveDropRate > 0 && Math.random() < effectiveDropRate;
  setTimeout(() => {
    res.setHeader("X-Simulated-Latency-Ms", String(simulatedDelayMs));
    res.setHeader("X-Chaos-Drop-Rate", String(effectiveDropRate));
    if (shouldDrop) {
      res.status(503).json({
        code: "NETWORK_FLAP_SIMULATED",
        message: "Simulated network degradation / packet loss (503 Service Unavailable)",
        simulatedLatencyMs: simulatedDelayMs,
        dropRate: effectiveDropRate,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
      return;
    }
    next();
  }, simulatedDelayMs);
}

// src/ws/stompBroker.ts
import { WebSocketServer, WebSocket } from "ws";
function parseStompFrame(raw) {
  const cleaned = raw.replace(/\0+$/, "");
  if (!cleaned.trim()) return null;
  const dividerIndex = cleaned.indexOf("\n\n");
  const headerPart = dividerIndex >= 0 ? cleaned.slice(0, dividerIndex) : cleaned;
  const bodyPart = dividerIndex >= 0 ? cleaned.slice(dividerIndex + 2) : "";
  const lines = headerPart.split(/\r?\n/);
  const command = (lines[0] ?? "").trim().toUpperCase();
  if (!command) return null;
  const headers = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      headers[key] = value;
    }
  }
  return { command, headers, body: bodyPart };
}
function serializeStompFrame(command, headers, body = "") {
  const headerLines = Object.entries(headers).map(([k, v]) => `${k}:${v}`).join("\n");
  return `${command}
${headerLines}

${body}\0`;
}
var StompBroker = class {
  wss;
  sessions = /* @__PURE__ */ new Map();
  messageCounter = 1;
  constructor(server, app2) {
    const sockJsInfoHandler = (_req, res) => {
      res.setHeader("Access-Control-Allow-Origin", _req.headers.origin || "*");
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Cache-Control", "no-store, no-cache, no-transform, must-revalidate, max-age=0");
      res.status(200).json({
        websocket: true,
        origins: ["*:*"],
        cookie_needed: false,
        entropy: Math.floor(Math.random() * 2e9)
      });
    };
    app2.get("/api/warehouse/ws/info", sockJsInfoHandler);
    app2.get("/ws/info", sockJsInfoHandler);
    this.wss = new WebSocketServer({ noServer: true });
    server.on("upgrade", (request, socket, head) => {
      const url = request.url ?? "";
      if (url.startsWith("/api/warehouse/ws") || url.startsWith("/ws")) {
        this.wss.handleUpgrade(request, socket, head, (ws) => {
          this.wss.emit("connection", ws, request);
        });
      } else {
        socket.destroy();
      }
    });
    this.wss.on("connection", (ws, req) => {
      const url = req.url ?? "";
      const isSockJs = /\/[^/]+\/[^/]+\/websocket(?:\?.*)?$/.test(url);
      const sessionId = `stomp-sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const session = {
        id: sessionId,
        ws,
        isSockJs,
        subscriptions: /* @__PURE__ */ new Map()
      };
      this.sessions.set(sessionId, session);
      if (isSockJs) {
        this.sendRaw(session, "o");
        session.heartbeatTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            this.sendRaw(session, "h");
          }
        }, 15e3);
      } else {
        session.heartbeatTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            this.sendRaw(session, "\n");
          }
        }, 15e3);
      }
      ws.on("message", (data) => {
        const rawStr = typeof data === "string" ? data : data.toString("utf8");
        this.handleIncomingPayload(session, rawStr);
      });
      ws.on("close", () => {
        if (session.heartbeatTimer) clearInterval(session.heartbeatTimer);
        this.sessions.delete(sessionId);
      });
      ws.on("error", () => {
        if (session.heartbeatTimer) clearInterval(session.heartbeatTimer);
        this.sessions.delete(sessionId);
      });
    });
  }
  sendRaw(session, data) {
    if (session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(data);
    }
  }
  sendStompFrame(session, command, headers, body = "") {
    const frame = serializeStompFrame(command, headers, body);
    if (session.isSockJs) {
      this.sendRaw(session, `a${JSON.stringify([frame])}`);
    } else {
      this.sendRaw(session, frame);
    }
  }
  handleIncomingPayload(session, rawStr) {
    if (!rawStr || rawStr === "\n" || rawStr === "\r\n") return;
    let payloads = [rawStr];
    if (session.isSockJs) {
      try {
        const parsed = JSON.parse(rawStr);
        if (Array.isArray(parsed)) {
          payloads = parsed.map(String);
        } else if (typeof parsed === "string") {
          payloads = [parsed];
        }
      } catch {
        return;
      }
    }
    for (const item of payloads) {
      const frame = parseStompFrame(item);
      if (!frame) continue;
      switch (frame.command) {
        case "CONNECT":
        case "STOMP": {
          this.sendStompFrame(session, "CONNECTED", {
            version: "1.2",
            "heart-beat": "4000,4000",
            server: "Sapremo-Mock-STOMP/1.2",
            session: session.id
          });
          break;
        }
        case "SUBSCRIBE": {
          const subId = frame.headers["id"] ?? `sub-${session.subscriptions.size + 1}`;
          const destination = frame.headers["destination"] ?? "";
          if (destination) {
            session.subscriptions.set(subId, { id: subId, destination });
          }
          if (frame.headers["receipt"]) {
            this.sendStompFrame(session, "RECEIPT", {
              "receipt-id": frame.headers["receipt"]
            });
          }
          break;
        }
        case "UNSUBSCRIBE": {
          const subId = frame.headers["id"];
          if (subId) {
            session.subscriptions.delete(subId);
          }
          break;
        }
        case "SEND": {
          const destination = frame.headers["destination"];
          if (destination) {
            let parsedBody = frame.body;
            try {
              parsedBody = JSON.parse(frame.body);
            } catch {
            }
            this.publish(destination, parsedBody);
          }
          break;
        }
        case "DISCONNECT": {
          if (frame.headers["receipt"]) {
            this.sendStompFrame(session, "RECEIPT", {
              "receipt-id": frame.headers["receipt"]
            });
          }
          session.ws.close();
          break;
        }
      }
    }
  }
  /**
   * Publishes an event payload to all STOMP subscribers listening on `destination`.
   */
  publish(destination, payload) {
    const body = typeof payload === "string" ? payload : JSON.stringify(payload);
    const msgId = `msg-${this.messageCounter++}`;
    for (const session of this.sessions.values()) {
      for (const sub of session.subscriptions.values()) {
        if (sub.destination === destination) {
          this.sendStompFrame(
            session,
            "MESSAGE",
            {
              subscription: sub.id,
              "message-id": msgId,
              destination,
              "content-type": "application/json"
            },
            body
          );
        }
      }
    }
  }
  getConnectedClientsCount() {
    return this.sessions.size;
  }
};

// src/index.ts
function createJwtToken(username, role = "WAREHOUSE_MANAGER", warehouseId = store.warehouseId) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: "usr-warehouse-01",
      username,
      role,
      warehouse_id: warehouseId,
      warehouseId,
      iat: Math.floor(Date.now() / 1e3),
      exp: Math.floor(Date.now() / 1e3) + 86400 * 7
    })
  ).toString("base64url");
  const signature = Buffer.from("sapremo-showcase-hmac-sig").toString("base64url");
  return `${header}.${payload}.${signature}`;
}
function createMockServer() {
  const app2 = express();
  const server = http.createServer(app2);
  const stompBroker = new StompBroker(server, app2);
  app2.use(
    cors({
      origin: true,
      credentials: true,
      exposedHeaders: ["X-Simulated-Latency-Ms", "X-Chaos-Drop-Rate"]
    })
  );
  app2.use(express.json({ limit: "10mb" }));
  app2.use(networkDegradationMiddleware);
  app2.get(["/", "/api"], (_req, res) => {
    res.json({
      status: "UP",
      service: "sapremo-mock-gateway",
      version: "1.0.0",
      description: "Sapremo Cold-Chain WMS Mock Gateway",
      totalSkus: store.skus.size,
      totalBins: store.bins.size,
      endpoints: {
        health: "/api/health",
        products: "/api/factory/products/",
        inventory: "/api/warehouse/inventory",
        orders: "/api/drivers/orders",
        bins: "/api/warehouse/bins",
        batches: "/api/warehouse/batches",
        movements: "/api/warehouse/movements",
        dashboard: "/api/warehouse/dashboard",
        chaos: "/api/chaos/config"
      },
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
  app2.get(["/api/health", "/api/warehouse/health"], (_req, res) => {
    res.json({
      status: "UP",
      service: "sapremo-mock-gateway",
      skusCount: store.skus.size,
      binsCount: store.bins.size,
      batchesCount: store.batches.size,
      movementsCount: store.movements.length,
      wsConnectedClients: stompBroker.getConnectedClientsCount(),
      chaos: getChaosConfig(),
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
  app2.get(["/api/chaos/config", "/api/warehouse/chaos/config"], (_req, res) => {
    res.json(getChaosConfig());
  });
  app2.post(["/api/chaos/config", "/api/warehouse/chaos/config"], (req, res) => {
    const updated = updateChaosConfig(req.body ?? {});
    res.json(updated);
  });
  const loginHandler = (req, res) => {
    const { username = "warehouse_admin" } = req.body ?? {};
    const access = createJwtToken(username);
    const refresh = createJwtToken(username);
    res.json({
      access,
      refresh,
      user: {
        id: "usr-warehouse-01",
        username,
        full_name: "\u0410\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440 \u0421\u043A\u043B\u0430\u0434\u0430 (\u0422\u0435\u0440\u043C\u0438\u043D\u0430\u043B \u21161)",
        role: "WAREHOUSE_MANAGER",
        warehouse_id: store.warehouseId,
        is_superuser: false
      }
    });
  };
  app2.post(
    ["/api/factory/auth/login", "/api/warehouse/auth/login", "/api/auth/login"],
    loginHandler
  );
  app2.post(
    ["/api/factory/auth/refresh", "/api/warehouse/auth/refresh", "/api/auth/refresh"],
    (req, res) => {
      const access = createJwtToken("warehouse_admin");
      res.json({
        access,
        refresh: req.body?.refresh ?? access
      });
    }
  );
  app2.post(
    ["/api/factory/auth/register", "/api/warehouse/auth/register"],
    (req, res) => {
      const { username = "new_operator", full_name = "\u041E\u043F\u0435\u0440\u0430\u0442\u043E\u0440 \u0421\u043A\u043B\u0430\u0434\u0430" } = req.body ?? {};
      res.status(201).json({
        id: `usr-${Date.now()}`,
        username,
        full_name,
        role: "WAREHOUSE_MANAGER",
        warehouse_id: store.warehouseId
      });
    }
  );
  const listProductsHandler = (req, res) => {
    const search = String(req.query.search ?? "").trim().toLowerCase();
    const category = String(req.query.category ?? "").trim().toLowerCase();
    const barcode = String(req.query.barcode ?? "").trim();
    let list = Array.from(store.skus.values());
    if (barcode) {
      list = list.filter((p) => p.barcode === barcode || p.code128 === barcode);
    }
    if (category) {
      list = list.filter((p) => p.category.toLowerCase() === category);
    }
    if (search) {
      list = list.filter(
        (p) => p.name.toLowerCase().includes(search) || p.barcode.includes(search) || p.code128.toLowerCase().includes(search) || p.batchNumber.toLowerCase().includes(search)
      );
    }
    const pageParam = req.query.page !== void 0 ? Number(req.query.page) : void 0;
    const sizeParam = req.query.page_size !== void 0 ? Number(req.query.page_size) : req.query.size !== void 0 ? Number(req.query.size) : void 0;
    if (pageParam !== void 0 && sizeParam !== void 0 && sizeParam < 500) {
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
        size: sizeParam
      });
      return;
    }
    res.json(list);
  };
  app2.get(
    [
      "/api/factory/products/",
      "/api/factory/products",
      "/api/warehouse/products",
      "/api/products"
    ],
    listProductsHandler
  );
  app2.post(["/api/factory/products/", "/api/factory/products"], (req, res) => {
    const body = req.body ?? {};
    const nextIndex = store.skus.size + 1;
    const id = String(body.id ?? `sku-${String(nextIndex).padStart(4, "0")}`);
    const barcode = String(body.barcode ?? generateValidEan13(nextIndex));
    const code128 = String(body.code128 ?? generateCode128Barcode(nextIndex, 1));
    const ppb = Math.max(1, Number(body.pieces_per_box ?? body.boxQuantity ?? 24));
    const factoryPrice = Number(body.factory_price ?? body.factoryPrice ?? 40);
    const driverPrice = Number(body.dispatch_price ?? body.driverPrice ?? Math.round(factoryPrice * 1.15));
    const stockQuantity = Number(body.stockQuantity ?? 0);
    const quantityBoxes = Math.floor(stockQuantity / ppb);
    const expiry = String(
      body.expiry_date ?? body.expirationDate ?? new Date(Date.now() + 180 * 864e5).toISOString().split("T")[0]
    );
    const batchNumber = String(body.batch_number ?? body.batchNumber ?? `LOT-2026-${nextIndex}`);
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const newSku = {
      id,
      barcode,
      code128,
      name: String(body.name ?? `\u041D\u043E\u0432\u044B\u0439 \u0442\u043E\u0432\u0430\u0440 #${nextIndex}`),
      category: String(body.category ?? "\u041C\u043E\u0440\u043E\u0436\u0435\u043D\u043E\u0435"),
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
      status: body.status === "inactive" ? "inactive" : "active",
      stockQuantity,
      quantityBoxes,
      quantityPieces: stockQuantity,
      binCode: "A01-R01-S01-B01",
      aisle: "A01",
      rack: "R01",
      shelf: "S01",
      bin: "B01",
      minStockThreshold: ppb * 5,
      version: 1,
      updatedAt: nowIso
    };
    store.skus.set(id, newSku);
    store.skusByBarcode.set(barcode, newSku);
    stompBroker.publish("/topic/inventory", {
      productId: id,
      barcode,
      quantity: stockQuantity,
      version: 1,
      updatedAt: nowIso
    });
    res.status(201).json(newSku);
  });
  const updateProductHandler = (req, res) => {
    const id = req.params.id;
    const existing = store.skus.get(id) ?? store.skusByBarcode.get(id);
    if (!existing) {
      res.status(404).json({ message: `SKU ${id} not found` });
      return;
    }
    const body = req.body ?? {};
    const ppb = Number(body.pieces_per_box ?? body.boxQuantity ?? existing.boxQuantity);
    const factoryPrice = Number(body.factory_price ?? body.factoryPrice ?? existing.factoryPrice);
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const updated = {
      ...existing,
      name: body.name !== void 0 ? String(body.name) : existing.name,
      barcode: body.barcode !== void 0 ? String(body.barcode) : existing.barcode,
      pieces_per_box: ppb,
      piecesPerBox: ppb,
      boxQuantity: ppb,
      factory_price: factoryPrice,
      factoryPrice,
      expiry_date: body.expiry_date !== void 0 ? String(body.expiry_date) : body.expirationDate !== void 0 ? String(body.expirationDate) : existing.expirationDate,
      expirationDate: body.expiry_date !== void 0 ? String(body.expiry_date) : body.expirationDate !== void 0 ? String(body.expirationDate) : existing.expirationDate,
      batch_number: body.batch_number !== void 0 ? String(body.batch_number) : body.batchNumber !== void 0 ? String(body.batchNumber) : existing.batchNumber,
      batchNumber: body.batch_number !== void 0 ? String(body.batch_number) : body.batchNumber !== void 0 ? String(body.batchNumber) : existing.batchNumber,
      status: body.status === "inactive" || body.status === "active" ? body.status : existing.status,
      version: existing.version + 1,
      updatedAt: nowIso
    };
    store.skus.set(existing.id, updated);
    store.skusByBarcode.set(updated.barcode, updated);
    res.json(updated);
  };
  app2.patch(["/api/factory/products/:id/", "/api/factory/products/:id"], updateProductHandler);
  app2.put(["/api/factory/products/:id/", "/api/factory/products/:id"], updateProductHandler);
  app2.delete(
    ["/api/factory/products/:id/", "/api/factory/products/:id"],
    (req, res) => {
      const id = req.params.id;
      const existing = store.skus.get(id) ?? store.skusByBarcode.get(id);
      if (existing) {
        store.skus.delete(existing.id);
        store.skusByBarcode.delete(existing.barcode);
      }
      res.status(204).send();
    }
  );
  app2.get(["/api/warehouse/inventory", "/api/inventory"], (_req, res) => {
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
      updatedAt: sku.updatedAt
    }));
    res.json(stockItems);
  });
  app2.post(
    ["/api/warehouse/inventory/reception", "/api/inventory/reception"],
    (req, res) => {
      const idempotencyKey = String(req.headers["idempotency-key"] ?? "");
      if (idempotencyKey && store.idempotencyKeys.has(idempotencyKey)) {
        res.json(store.idempotencyKeys.get(idempotencyKey));
        return;
      }
      const rawBody = req.body;
      const itemsList = Array.isArray(rawBody) ? rawBody : Array.isArray(rawBody?.items) ? rawBody.items : [];
      const updatedItems = [];
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      for (const rawItem of itemsList) {
        const item = rawItem;
        const sku = (item.barcode ? store.skusByBarcode.get(String(item.barcode)) : void 0) ?? (item.productId ? store.skus.get(String(item.productId)) : void 0);
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
            type: "RECEPTION",
            skuId: sku.id,
            barcode: sku.barcode,
            productName: sku.name,
            batchNumber: sku.batchNumber,
            fromBin: null,
            toBin: sku.binCode,
            deltaBoxes: addedBoxes,
            deltaPieces,
            balanceAfterPieces: sku.stockQuantity,
            actor: "warehouse_admin",
            operationId: idempotencyKey || `op-${Date.now()}`,
            comment: "\u041F\u0440\u0438\u0435\u043C\u043A\u0430 \u043F\u0430\u0440\u0442\u0438\u0438 \u043D\u0430 \u0441\u043A\u043B\u0430\u0434"
          });
          const payload = {
            productId: sku.id,
            barcode: sku.barcode,
            quantityBoxes: sku.quantityBoxes,
            quantityPieces: sku.stockQuantity,
            quantity: sku.stockQuantity,
            version: sku.version,
            updatedAt: nowIso
          };
          updatedItems.push(payload);
          stompBroker.publish("/topic/inventory", payload);
        }
      }
      stompBroker.publish("/topic/dashboard/update", { timestamp: nowIso });
      if (idempotencyKey) {
        store.idempotencyKeys.set(idempotencyKey, updatedItems);
      }
      res.status(200).json(updatedItems);
    }
  );
  app2.post(
    ["/api/warehouse/inventory/adjust", "/api/inventory/adjust"],
    (req, res) => {
      const idempotencyKey = String(req.headers["idempotency-key"] ?? "");
      if (idempotencyKey && store.idempotencyKeys.has(idempotencyKey)) {
        res.json(store.idempotencyKeys.get(idempotencyKey));
        return;
      }
      const body = req.body ?? {};
      const sku = (body.barcode ? store.skusByBarcode.get(String(body.barcode)) : void 0) ?? (body.productId ? store.skus.get(String(body.productId)) : void 0);
      if (!sku) {
        res.status(404).json({ message: "SKU not found in inventory" });
        return;
      }
      const ppb = sku.boxQuantity || 1;
      const newPieces = body.quantityPieces !== void 0 ? Math.max(0, Number(body.quantityPieces)) : Math.max(0, Number(body.quantityBoxes ?? 0) * ppb);
      const deltaPieces = newPieces - sku.stockQuantity;
      const deltaBoxes = Math.round(deltaPieces / ppb);
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      sku.stockQuantity = newPieces;
      sku.quantityPieces = newPieces;
      sku.quantityBoxes = Math.floor(newPieces / ppb);
      sku.version += 1;
      sku.updatedAt = nowIso;
      store.movements.unshift({
        id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: nowIso,
        type: "ADJUSTMENT",
        skuId: sku.id,
        barcode: sku.barcode,
        productName: sku.name,
        batchNumber: sku.batchNumber,
        fromBin: sku.binCode,
        toBin: sku.binCode,
        deltaBoxes,
        deltaPieces,
        balanceAfterPieces: sku.stockQuantity,
        actor: "warehouse_admin",
        operationId: idempotencyKey || `adj-${Date.now()}`,
        comment: body.comment ?? "\u0418\u043D\u0432\u0435\u043D\u0442\u0430\u0440\u0438\u0437\u0430\u0446\u0438\u043E\u043D\u043D\u0430\u044F \u043A\u043E\u0440\u0440\u0435\u043A\u0442\u0438\u0440\u043E\u0432\u043A\u0430 \u043E\u0441\u0442\u0430\u0442\u043A\u0430"
      });
      const responsePayload = {
        productId: sku.id,
        barcode: sku.barcode,
        productName: sku.name,
        quantityBoxes: sku.quantityBoxes,
        quantityPieces: sku.stockQuantity,
        quantity: sku.stockQuantity,
        version: sku.version,
        updatedAt: nowIso
      };
      stompBroker.publish("/topic/inventory", responsePayload);
      stompBroker.publish("/topic/dashboard/update", { timestamp: nowIso });
      if (sku.stockQuantity <= sku.minStockThreshold) {
        const alertPayload = {
          productId: sku.id,
          barcode: sku.barcode,
          productName: sku.name,
          currentQuantity: sku.stockQuantity,
          threshold: sku.minStockThreshold,
          timestamp: nowIso
        };
        stompBroker.publish("/topic/alerts", alertPayload);
        stompBroker.publish("/topic/inventory/low-stock", alertPayload);
      }
      if (idempotencyKey) {
        store.idempotencyKeys.set(idempotencyKey, responsePayload);
      }
      res.json(responsePayload);
    }
  );
  app2.post(
    ["/api/warehouse/inventory/move-pallet", "/api/inventory/move-pallet"],
    (req, res) => {
      const body = req.body ?? {};
      const sku = (body.barcode ? store.skusByBarcode.get(String(body.barcode)) : void 0) ?? (body.productId ? store.skus.get(String(body.productId)) : void 0);
      if (!sku) {
        res.status(404).json({ message: "SKU not found for pallet movement" });
        return;
      }
      const targetBin = store.bins.get(body.toBin);
      if (!targetBin) {
        res.status(400).json({ message: `Target storage bin ${body.toBin} does not exist` });
        return;
      }
      const previousBinCode = body.fromBin ?? sku.binCode;
      const sourceBin = store.bins.get(previousBinCode);
      const movedBoxes = body.boxes !== void 0 ? Number(body.boxes) : sku.quantityBoxes;
      if (sourceBin) {
        sourceBin.occupiedBoxes = Math.max(0, sourceBin.occupiedBoxes - movedBoxes);
      }
      targetBin.occupiedBoxes = Math.min(
        targetBin.capacityBoxes,
        targetBin.occupiedBoxes + movedBoxes
      );
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
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
        type: "PALLET_MOVE",
        skuId: sku.id,
        barcode: sku.barcode,
        productName: sku.name,
        batchNumber: sku.batchNumber,
        fromBin: previousBinCode,
        toBin: targetBin.code,
        deltaBoxes: movedBoxes,
        deltaPieces: movedBoxes * sku.boxQuantity,
        balanceAfterPieces: sku.stockQuantity,
        actor: "warehouse_admin",
        operationId: `move-${Date.now()}`,
        comment: body.comment ?? `\u041F\u0435\u0440\u0435\u043C\u0435\u0449\u0435\u043D\u0438\u0435 \u043F\u0430\u043B\u043B\u0435\u0442\u044B ${previousBinCode} -> ${targetBin.code}`
      };
      store.movements.unshift(movement);
      stompBroker.publish("/topic/inventory", {
        productId: sku.id,
        barcode: sku.barcode,
        quantity: sku.stockQuantity,
        binCode: sku.binCode,
        version: sku.version,
        updatedAt: nowIso
      });
      res.json({
        sku,
        movement
      });
    }
  );
  app2.get(["/api/warehouse/bins", "/api/bins"], (_req, res) => {
    res.json(Array.from(store.bins.values()));
  });
  app2.get(["/api/warehouse/batches", "/api/batches"], (_req, res) => {
    const sortedByFefo = Array.from(store.batches.values()).sort(
      (a, b) => a.expirationDate.localeCompare(b.expirationDate)
    );
    res.json(sortedByFefo);
  });
  app2.get(["/api/warehouse/movements", "/api/movements"], (req, res) => {
    const limit = Math.min(500, Number(req.query.limit ?? 100));
    res.json(store.movements.slice(0, limit));
  });
  app2.get(["/api/drivers", "/api/drivers/"], (_req, res) => {
    const driversList = Array.from(store.drivers.values());
    res.json({
      content: driversList,
      totalElements: driversList.length,
      totalPages: 1
    });
  });
  app2.post(["/api/drivers", "/api/drivers/"], (req, res) => {
    const body = req.body ?? {};
    const id = String(body.id ?? `drv-${String(store.drivers.size + 1).padStart(3, "0")}`);
    const carNumber = String(body.carNumber ?? body.vehicleNumber ?? "01 KG 999 AAA");
    const driver = {
      id,
      fullName: String(body.fullName ?? "\u0412\u043E\u0434\u0438\u0442\u0435\u043B\u044C \u042D\u043A\u0441\u043F\u0435\u0434\u0438\u0442\u043E\u0440"),
      carNumber,
      vehicleNumber: carNumber,
      phone: String(body.phone ?? "+996 555 00-00-00"),
      currentDebt: 0,
      totalDebt: 0,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    store.drivers.set(id, driver);
    res.status(201).json(driver);
  });
  app2.delete(["/api/drivers/:id", "/api/drivers/:id/"], (req, res) => {
    store.drivers.delete(req.params.id);
    res.status(204).send();
  });
  app2.get(["/api/drivers/debts", "/api/drivers/debts/"], (_req, res) => {
    const debts = Array.from(store.drivers.values()).map((d) => ({
      driverId: d.id,
      id: d.id,
      fullName: d.fullName,
      carNumber: d.carNumber,
      totalDebt: d.currentDebt,
      currentDebt: d.currentDebt,
      updatedAt: d.updatedAt
    }));
    res.json({
      content: debts,
      totalElements: debts.length,
      totalPages: 1
    });
  });
  app2.get(["/api/drivers/orders", "/api/drivers/orders/"], (_req, res) => {
    const ordersList = Array.from(store.orders.values());
    res.json({
      content: ordersList,
      totalElements: ordersList.length,
      totalPages: 1
    });
  });
  app2.post(["/api/drivers/orders", "/api/drivers/orders/"], (req, res) => {
    const body = req.body ?? {};
    const driver = (body.driverId ? store.drivers.get(body.driverId) : void 0) ?? Array.from(store.drivers.values())[0];
    const ordIdx = store.orders.size + 1;
    const orderId = `ORD-${1e3 + ordIdx}`;
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const items = (body.items ?? []).map((it, idx) => {
      const sku = (it.productId ? store.skus.get(it.productId) : void 0) ?? (it.barcode ? store.skusByBarcode.get(it.barcode) : void 0) ?? Array.from(store.skus.values())[idx];
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
        amount
      };
    });
    const totalAmount = items.reduce((s, i) => s + i.amount, 0);
    const newOrder = {
      id: orderId,
      invoiceNumber: `INV-2026-${String(ordIdx).padStart(4, "0")}`,
      driverId: driver.id,
      driverName: driver.fullName,
      warehouseId: store.warehouseId,
      status: "PENDING",
      requestedAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
      date: nowIso,
      totalAmount,
      comment: body.comment ?? "",
      version: 1,
      items
    };
    store.orders.set(orderId, newOrder);
    stompBroker.publish("/topic/orders/new", newOrder);
    stompBroker.publish("/topic/orders", newOrder);
    stompBroker.publish("/topic/dashboard/update", { timestamp: nowIso });
    res.status(201).json(newOrder);
  });
  app2.post("/api/drivers/orders/:id/confirm", (req, res) => {
    const order = store.orders.get(req.params.id);
    if (!order) {
      res.status(404).json({ message: "Order not found" });
      return;
    }
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    order.status = "CONFIRMED";
    order.updatedAt = nowIso;
    order.version += 1;
    stompBroker.publish("/topic/orders/status", order);
    stompBroker.publish("/topic/orders/updated", order);
    stompBroker.publish("/topic/dashboard/update", { timestamp: nowIso });
    res.json(order);
  });
  app2.post("/api/drivers/orders/:id/reject", (req, res) => {
    const order = store.orders.get(req.params.id);
    if (!order) {
      res.status(404).json({ message: "Order not found" });
      return;
    }
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    order.status = "REJECTED";
    order.comment = String(req.body?.comment ?? order.comment);
    order.updatedAt = nowIso;
    order.version += 1;
    stompBroker.publish("/topic/orders/status", order);
    stompBroker.publish("/topic/dashboard/update", { timestamp: nowIso });
    res.json(order);
  });
  app2.post("/api/drivers/orders/:id/modify", (req, res) => {
    const order = store.orders.get(req.params.id);
    if (!order) {
      res.status(404).json({ message: "Order not found" });
      return;
    }
    const body = req.body ?? {};
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    if (Array.isArray(body.items) && body.items.length > 0) {
      order.items = body.items.map((it, idx) => {
        const sku = store.skus.get(String(it.productId)) ?? store.skusByBarcode.get(String(it.productId)) ?? Array.from(store.skus.values())[0];
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
          amount
        };
      });
    }
    order.totalAmount = body.totalAmount !== void 0 ? Number(body.totalAmount) : order.items.reduce((s, i) => s + i.amount, 0);
    if (body.comment !== void 0) order.comment = body.comment;
    order.status = "MODIFIED";
    order.updatedAt = nowIso;
    order.version += 1;
    stompBroker.publish("/topic/orders/updated", order);
    stompBroker.publish("/topic/dashboard/update", { timestamp: nowIso });
    res.json(order);
  });
  app2.post("/api/drivers/orders/:id/dispatch", (req, res) => {
    const order = store.orders.get(req.params.id);
    if (!order) {
      res.status(404).json({ message: "Order not found" });
      return;
    }
    const idempotencyKey = String(req.headers["idempotency-key"] ?? "");
    if (idempotencyKey && store.idempotencyKeys.has(idempotencyKey)) {
      res.json(store.idempotencyKeys.get(idempotencyKey));
      return;
    }
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    order.status = "DISPATCHED";
    order.updatedAt = nowIso;
    order.version += 1;
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
          type: "DISPATCH",
          skuId: sku.id,
          barcode: sku.barcode,
          productName: sku.name,
          batchNumber: sku.batchNumber,
          fromBin: sku.binCode,
          toBin: null,
          deltaBoxes: -item.boxCount,
          deltaPieces: -item.quantity,
          balanceAfterPieces: sku.stockQuantity,
          actor: "warehouse_admin",
          operationId: idempotencyKey || `disp-${order.id}`,
          comment: `\u041E\u0442\u0433\u0440\u0443\u0437\u043A\u0430 \u043F\u043E \u0437\u0430\u044F\u0432\u043A\u0435 ${order.invoiceNumber} (${order.driverName})`
        });
        stompBroker.publish("/topic/inventory", {
          productId: sku.id,
          barcode: sku.barcode,
          quantity: sku.stockQuantity,
          version: sku.version,
          updatedAt: nowIso
        });
      }
    }
    const driver = store.drivers.get(order.driverId);
    if (driver) {
      driver.currentDebt += order.totalAmount;
      driver.totalDebt = driver.currentDebt;
      driver.updatedAt = nowIso;
    }
    if (idempotencyKey) {
      store.idempotencyKeys.set(idempotencyKey, order);
    }
    stompBroker.publish("/topic/dispatch/created", order);
    stompBroker.publish("/topic/dashboard/update", { timestamp: nowIso });
    res.json(order);
  });
  app2.get(["/api/drivers/payments", "/api/drivers/payments/"], (_req, res) => {
    const driverPayments = Array.from(store.transactions.values()).filter((t) => t.type === "driver_payment").map((t) => ({
      id: t.id,
      driverId: t.driverId ?? "drv-001",
      amount: t.amount,
      paymentMethod: t.paymentMethod,
      comment: t.comment,
      paidAt: t.date,
      createdAt: t.createdAt
    }));
    res.json({
      content: driverPayments,
      totalElements: driverPayments.length,
      totalPages: 1
    });
  });
  app2.get("/api/warehouse/cashbox/transactions", (_req, res) => {
    res.json(Array.from(store.transactions.values()));
  });
  app2.post("/api/warehouse/cashbox/driver-payment", (req, res) => {
    const body = req.body ?? {};
    const driverId = String(body.driverId ?? "drv-001");
    const amount = Math.max(0, Number(body.amount ?? 0));
    const driver = store.drivers.get(driverId);
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    if (driver) {
      driver.currentDebt = Math.max(0, driver.currentDebt - amount);
      driver.totalDebt = driver.currentDebt;
      driver.updatedAt = nowIso;
    }
    store.cashBalance += amount;
    const txId = `TX-2026-${String(store.transactions.size + 1).padStart(4, "0")}`;
    const tx = {
      id: txId,
      type: "driver_payment",
      amount,
      paymentMethod: body.paymentMethod === "TRANSFER" ? "TRANSFER" : "CASH",
      driverId,
      driverName: driver?.fullName ?? "\u0412\u043E\u0434\u0438\u0442\u0435\u043B\u044C",
      comment: body.comment ?? "\u041E\u043F\u043B\u0430\u0442\u0430 \u043E\u0442 \u0432\u043E\u0434\u0438\u0442\u0435\u043B\u044F \u0432 \u043A\u0430\u0441\u0441\u0443 \u0441\u043A\u043B\u0430\u0434\u0430",
      createdAt: nowIso,
      date: nowIso
    };
    store.transactions.set(txId, tx);
    stompBroker.publish("/topic/dashboard/update", { timestamp: nowIso });
    res.status(201).json(tx);
  });
  app2.post("/api/warehouse/cashbox/factory-payment", (req, res) => {
    const body = req.body ?? {};
    const amount = Math.max(0, Number(body.amount ?? 0));
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    store.cashBalance = Math.max(0, store.cashBalance - amount);
    store.factoryDebt = Math.max(0, store.factoryDebt - amount);
    const txId = `TX-2026-${String(store.transactions.size + 1).padStart(4, "0")}`;
    const tx = {
      id: txId,
      type: "factory_payment",
      amount,
      paymentMethod: body.paymentMethod === "TRANSFER" ? "TRANSFER" : "CASH",
      comment: body.comment ?? "\u041F\u0435\u0440\u0435\u0432\u043E\u0434 \u0434\u0435\u043D\u0435\u0436\u043D\u044B\u0445 \u0441\u0440\u0435\u0434\u0441\u0442\u0432 \u0437\u0430\u0432\u043E\u0434\u0443",
      createdAt: nowIso,
      date: nowIso
    };
    store.transactions.set(txId, tx);
    stompBroker.publish("/topic/dashboard/update", { timestamp: nowIso });
    res.status(201).json(tx);
  });
  app2.get(["/api/drivers/returns", "/api/drivers/returns/"], (_req, res) => {
    const list = Array.from(store.returns.values());
    res.json({
      content: list,
      totalElements: list.length,
      totalPages: 1
    });
  });
  const createReturnHandler = (req, res) => {
    const body = req.body ?? {};
    const driverId = body.driverId ?? body.driver_id;
    const driver = driverId ? store.drivers.get(String(driverId)) : void 0;
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const retId = `RET-2026-${String(store.returns.size + 1).padStart(3, "0")}`;
    const items = (body.items ?? []).map((it, idx) => {
      const sku = (it.barcode ? store.skusByBarcode.get(it.barcode) : void 0) ?? (it.productId ? store.skus.get(it.productId) : void 0) ?? Array.from(store.skus.values())[0];
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
        reason: it.reason ?? "NOT_SOLD"
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
      returnType: driverId ? "from_driver" : "to_factory",
      driverId: driverId ? String(driverId) : void 0,
      driverName: driver?.fullName,
      date: nowIso,
      createdAt: nowIso,
      totalAmount,
      comment: body.comment ?? body.notes ?? "",
      items
    };
    store.returns.set(retId, record);
    stompBroker.publish("/topic/dashboard/update", { timestamp: nowIso });
    res.status(201).json(record);
  };
  app2.post(
    [
      "/api/drivers/returns",
      "/api/drivers/returns/",
      "/api/warehouse/returns",
      "/api/warehouse/returns/",
      "/api/factory/returns/",
      "/api/factory/returns"
    ],
    createReturnHandler
  );
  app2.get(
    ["/api/factory/warehouse-orders/", "/api/factory/warehouse-orders"],
    (_req, res) => {
      res.json(Array.from(store.factoryOrders.values()));
    }
  );
  app2.post(
    ["/api/factory/warehouse-orders/", "/api/factory/warehouse-orders"],
    (req, res) => {
      const body = req.body ?? {};
      const idx = store.factoryOrders.size + 1;
      const id = `FO-2026-${String(idx).padStart(3, "0")}`;
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      const items = (body.items ?? []).map((it, i) => {
        const prodId = String(it.product_id ?? it.productId ?? "");
        const sku = store.skus.get(prodId) ?? store.skusByBarcode.get(prodId) ?? Array.from(store.skus.values())[i];
        const qty = Math.max(1, Number(it.qty ?? 10));
        return {
          id: `fo-item-${idx}-${i + 1}`,
          product_id: sku.id,
          productId: sku.id,
          productName: sku.name,
          qty,
          quantity: qty
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
        status: "approved",
        comment: body.comment ?? "",
        items
      };
      store.factoryOrders.set(id, record);
      res.status(201).json(record);
    }
  );
  app2.post(
    [
      "/api/factory/warehouse-orders/:id/confirm-delivery/",
      "/api/factory/warehouse-orders/:id/confirm-delivery"
    ],
    (req, res) => {
      const fo = store.factoryOrders.get(req.params.id);
      if (fo) {
        fo.status = "delivered";
      }
      res.json(fo ?? { id: req.params.id, status: "delivered" });
    }
  );
  app2.patch(
    ["/api/factory/warehouse-orders/:id/", "/api/factory/warehouse-orders/:id"],
    (req, res) => {
      const fo = store.factoryOrders.get(req.params.id);
      if (fo && req.body?.status) {
        fo.status = req.body.status;
      }
      res.json(fo ?? { id: req.params.id, status: req.body?.status ?? "delivered" });
    }
  );
  app2.get(
    [
      "/api/factory/reception/",
      "/api/factory/reception",
      "/api/factory/receptions/",
      "/api/factory/receptions",
      "/api/factory/deliveries/",
      "/api/factory/deliveries"
    ],
    (_req, res) => {
      res.json(Array.from(store.receptions.values()));
    }
  );
  app2.post(
    ["/api/factory/reception/offline", "/api/factory/reception/offline/"],
    (req, res) => {
      const body = req.body ?? {};
      const nowIso = body.createdAt ?? (/* @__PURE__ */ new Date()).toISOString();
      const recId = body.clientId ?? `REC-2026-${String(store.receptions.size + 1).padStart(3, "0")}`;
      const items = (body.items ?? []).map((it, idx) => {
        const sku = (it.barcode ? store.skusByBarcode.get(it.barcode) : void 0) ?? Array.from(store.skus.values())[0];
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
          discrepancy_type: "none"
        };
      });
      const totalAmount = items.reduce((s, i) => s + i.actual_qty * i.factory_price, 0);
      const record = {
        id: recId,
        client_id: recId,
        delivery_number: recId,
        delivered_at: nowIso,
        created_at: nowIso,
        status: "completed",
        supplier_name: "\u0426\u0435\u043D\u0442\u0440\u0430\u043B\u044C\u043D\u044B\u0439 \u0417\u0430\u0432\u043E\u0434 Sapremo",
        total_amount: totalAmount,
        items
      };
      store.receptions.set(recId, record);
      res.status(201).json(record);
    }
  );
  app2.get(
    ["/api/factory/finance/debt-summary/", "/api/factory/finance/debt-summary"],
    (_req, res) => {
      res.json({
        total_debt: store.factoryDebt,
        total_shipped: 345e4,
        total_paid: 345e4 - store.factoryDebt
      });
    }
  );
  app2.get(
    ["/api/factory/warehouses/", "/api/factory/warehouses"],
    (_req, res) => {
      res.json([
        {
          id: store.warehouseId,
          name: "\u0426\u0435\u043D\u0442\u0440\u0430\u043B\u044C\u043D\u044B\u0439 \u0425\u043E\u043B\u043E\u0434\u0438\u043B\u044C\u043D\u044B\u0439 \u0422\u0435\u0440\u043C\u0438\u043D\u0430\u043B \u21161 (\u0411\u0438\u0448\u043A\u0435\u043A)",
          city: "\u0411\u0438\u0448\u043A\u0435\u043A",
          is_active: true
        },
        {
          id: "wh-osh-02",
          name: "\u042E\u0436\u043D\u044B\u0439 \u0420\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u0425\u0430\u0431 \u21162 (\u041E\u0448)",
          city: "\u041E\u0448",
          is_active: true
        }
      ]);
    }
  );
  app2.get("/api/warehouse/dashboard", (_req, res) => {
    const totalDriversDebt = Array.from(store.drivers.values()).reduce(
      (sum, d) => sum + d.currentDebt,
      0
    );
    const lowStockProducts = Array.from(store.skus.values()).filter(
      (s) => s.stockQuantity <= s.minStockThreshold
    ).length;
    const newOrders = Array.from(store.orders.values()).filter(
      (o) => o.status === "PENDING"
    ).length;
    res.json({
      cashBalance: store.cashBalance,
      factoryDebt: store.factoryDebt,
      totalDriversDebt,
      lowStockProducts,
      newOrders,
      totalSkus: store.skus.size
    });
  });
  return { app: app2, server, stompBroker };
}
var isDirectRun = process.argv[1] && (process.argv[1].endsWith("index.ts") || process.argv[1].endsWith("index.js"));
if (isDirectRun) {
  const PORT = Number(process.env.PORT ?? 3001);
  const { server } = createMockServer();
  server.listen(PORT, () => {
    console.log(
      `[Sapremo Mock Gateway] Running on http://localhost:${PORT} (SKUs: ${store.skus.size}, Bins: ${store.bins.size}, STOMP WS: ws://localhost:${PORT}/api/warehouse/ws)`
    );
  });
}

// src/vercel.ts
var { app } = createMockServer();
var vercel_default = app;
export {
  vercel_default as default
};
