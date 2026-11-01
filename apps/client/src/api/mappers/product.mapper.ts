import type { Product, StockItem } from '@/types';
import { roundCurrency } from '@/utils/money';

export interface RawApiProduct {
  id?: string;
  product_id?: string;
  productId?: string;
  _id?: string;
  barcode: string;
  name?: string;
  product_name?: string;
  productName?: string;
  title?: string;
  pieces_per_box?: number;
  piecesPerBox?: number;
  boxQuantity?: number;
  box_quantity?: number;
  expiry_date?: string;
  expirationDate?: string;
  batch_number?: string;
  batchNumber?: string;
  factory_price?: number | string;
  factoryPrice?: number | string;
  price?: number | string;
  unit_price?: number | string;
  status?: string;
  stockQuantity?: number;
  stock_quantity?: number;
  quantity_pieces?: number;
  quantity_boxes?: number;
}

/**
 * Pure mapper: Transforms raw API product / backend response into standardized frontend Product entity.
 * Resolves snake_case / camelCase variations, price coercion and stock merging.
 */
export function mapApiProduct(
  p: RawApiProduct,
  stock?: StockItem,
  localProduct?: Product,
): Product {
  const pId =
    p.id ?? p.product_id ?? p.productId ?? p._id ?? localProduct?.id ?? crypto.randomUUID();
  const name = (
    p.name ??
    p.product_name ??
    p.productName ??
    p.title ??
    localProduct?.name ??
    'Без названия'
  ).trim();
  const barcode = (p.barcode ? p.barcode : (localProduct?.barcode ?? '')).trim();

  const rawBoxQty = p.pieces_per_box ?? p.piecesPerBox ?? p.boxQuantity ?? p.box_quantity;
  const boxQuantity =
    rawBoxQty && rawBoxQty > 0
      ? rawBoxQty
      : localProduct?.boxQuantity && localProduct.boxQuantity > 0
        ? localProduct.boxQuantity
        : 1;

  let stockQuantity = 0;
  if (stock) {
    stockQuantity =
      stock.quantityPieces ??
      (stock.quantityBoxes != null
        ? stock.quantityBoxes * (stock.piecesPerBox ?? boxQuantity ?? 1)
        : 0);
  } else if (localProduct && localProduct.stockQuantity > 0) {
    stockQuantity = localProduct.stockQuantity;
  } else {
    const rawStock = p.stockQuantity ?? p.stock_quantity ?? p.quantity_pieces;
    if (rawStock != null) {
      stockQuantity = Number(rawStock) || 0;
    } else if (p.quantity_boxes != null) {
      stockQuantity = (Number(p.quantity_boxes) || 0) * boxQuantity;
    } else {
      stockQuantity = 0;
    }
  }

  const rawPrice =
    p.factory_price ?? p.factoryPrice ?? p.price ?? p.unit_price ?? localProduct?.factoryPrice ?? 0;
  const factoryPrice = roundCurrency(Number(rawPrice) || 0);

  return {
    id: String(pId),
    barcode,
    name,
    boxQuantity,
    expirationDate: p.expiry_date ?? p.expirationDate ?? localProduct?.expirationDate ?? '',
    batchNumber: p.batch_number ?? p.batchNumber ?? localProduct?.batchNumber ?? '',
    factoryPrice,
    status: (p.status as Product['status']) ?? localProduct?.status ?? 'active',
    stockQuantity,
  };
}
