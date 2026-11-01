export interface Warehouse {
  id: string;
  name: string;
  address?: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type ProductStatus = 'active' | 'inactive' | 'low_stock' | 'no_stock';

export interface Product {
  id: string;
  barcode: string;
  name: string;
  boxQuantity: number;
  expirationDate: string;
  batchNumber: string;
  factoryPrice: number;
  driverPrice?: number;
  status: ProductStatus;
  stockQuantity: number;
  isArchived?: boolean;
}

/** Складской остаток из GET /api/warehouse/inventory */
export interface StockItem {
  id: number;
  productId: number;
  productName: string;
  barcode: string;
  piecesPerBox: number;
  quantityBoxes: number;
  quantityPieces: number;
  driverPrice: number;
  updatedAt: string;
}

export interface Driver {
  id: string;
  fullName: string;
  /** API field: carNumber. vehicleNumber kept for local display compat */
  carNumber?: string;
  vehicleNumber?: string;
  phone?: string;
  warehouseId?: string;
  status?: 'ACTIVE' | 'INACTIVE';
  currentDebt: number;
  isArchived?: boolean;
}

/** Payload sent to POST /api/drivers when creating a new driver */
export interface CreateDriverPayload {
  fullName: string;
  carNumber: string;
  phone: string;
  password: string;
  warehouseId: string;
}

/**
 * Drivers-service returns statuses in UPPER_CASE.
 * Internally we use lowercase for display/logic.
 */
export type ApiOrderStatus = 'NEW' | 'CONFIRMED' | 'MODIFIED' | 'REJECTED' | 'DISPATCHED';
export type OrderStatus = ApiOrderStatus;

export const ORDER_STATUS_MAP: Record<string, ApiOrderStatus> = {
  pending: 'NEW',
  approved: 'CONFIRMED',
  rejected: 'REJECTED',
  issued: 'DISPATCHED',
};

export const mapApiOrderStatus = (s: string): OrderStatus => {
  return (s as OrderStatus) ?? 'NEW';
};

export interface OrderItem {
  barcode: string;
  productName: string;
  quantity: number;
  boxCount: number;
  unitPrice: number;
  amount: number;
}

export interface Order {
  id: string;
  invoiceNumber?: string;
  driverId: string;
  driverName: string;
  vehicleNumber?: string;
  date: string;
  status: OrderStatus;
  items: OrderItem[];
  totalAmount: number;
  notes?: string;
  localUpdatedAt?: string;
  isArchived?: boolean;
}

export type FactoryOrderStatus = 'pending' | 'approved' | 'rejected' | 'delivered';

export interface FactoryOrderItem {
  id?: string;
  productId: string;
  productName?: string;
  qty: number;
  boxCount?: number;
}

export interface FactoryOrder {
  id: string;
  orderNumber?: number;
  warehouseId?: string;
  date: string;
  status: FactoryOrderStatus;
  comment?: string;
  createdByName?: string;
  items: FactoryOrderItem[];
  isArchived?: boolean;
  isSynced?: boolean;
  syncStatus?: 'synced' | 'pending' | 'failed';
}

export type ReceiptDiscrepancyType = 'shortage' | 'surplus' | 'defect' | 'none';

export interface ReceiptItem {
  barcode: string;
  productName: string;
  quantityBoxes?: number;
  expectedQuantity: number;
  actualQuantity: number;
  discrepancyType: ReceiptDiscrepancyType;
  factoryPrice: number;
}

export interface GoodsReceipt {
  id: string;
  date: string;
  items: ReceiptItem[];
  totalAmount: number;
  status: 'draft' | 'completed';
  supplierName?: string;
  factoryOrderId?: string;
  isArchived?: boolean;
  isSynced?: boolean;
  syncStatus?: 'synced' | 'pending' | 'failed';
}

export type ReturnReason = 'unsold' | 'melted' | 'damaged' | 'defective' | 'other';

/** Map internal return reason → API ENUM */
export const mapReturnReason = (r: ReturnReason): string => {
  switch (r) {
    case 'unsold':
      return 'NOT_SOLD';
    case 'melted':
      return 'MELTED';
    case 'damaged':
      return 'DAMAGED';
    case 'defective':
      return 'DEFECTIVE';
    default:
      return 'OTHER';
  }
};

export interface ReturnItem {
  barcode: string;
  productName: string;
  quantity: number;
  boxCount: number;
  unitPrice: number;
  amount: number;
  reason: ReturnReason;
}

export interface ProductReturn {
  id: string;
  returnType: 'from_driver' | 'to_factory';
  driverId?: string;
  driverName?: string;
  date: string;
  items: ReturnItem[];
  totalAmount: number;
  notes?: string;
  isArchived?: boolean;
  isSynced?: boolean;
  syncStatus?: 'synced' | 'pending' | 'failed' | 'local_only';
}

export type TransactionType = 'driver_payment' | 'factory_payment';
export type PaymentMethod = 'cash' | 'transfer';

export interface Transaction {
  id: string;
  amount: number;
  date: string;
  type: TransactionType;
  paymentMethod: PaymentMethod;
  driverId?: string;
  driverName?: string;
  comment?: string;
  isArchived?: boolean;
}

export interface InventoryReceptionItem {
  productId?: string;
  barcode: string;
  productName?: string;
  quantityBoxes?: number;
  quantityPieces?: number;
  piecesPerBox?: number;
  factoryPrice?: number;
  driverPrice?: number;
}

export interface InventoryReceptionPayload {
  warehouseId?: string | null;
  deliveryNumber?: string;
  comment?: string;
  items: InventoryReceptionItem[];
}

export interface InventoryAdjustPayload {
  warehouseId?: string | null;
  barcode?: string;
  productId?: string;
  quantityBoxes?: number;
  quantityPieces?: number;
  comment?: string;
  isNew?: boolean;
}

// prettier-ignore
export type SyncAction =
  | 'CREATE_ORDER'
   | 'DISPATCH_ORDER'
   | 'UPDATE_ORDER'
   | 'MODIFY_ORDER'
  | 'CREATE_RECEIPT'
  | 'CREATE_RETURN'
  | 'CREATE_PAYMENT'
  | 'CREATE_FACTORY_ORDER'
  | 'ADJUST_STOCK';

export type SyncPayload =
  | { action: 'CREATE_ORDER'; payload: Order }
  | { action: 'DISPATCH_ORDER'; payload: Order }
  | { action: 'UPDATE_ORDER'; payload: Partial<Order> & { id: string } }
  | { action: 'MODIFY_ORDER'; payload: Partial<Order> & { id: string } }
  | { action: 'CREATE_RECEIPT'; payload: GoodsReceipt }
  | { action: 'CREATE_RETURN'; payload: ProductReturn }
  | { action: 'CREATE_PAYMENT'; payload: Transaction }
  | { action: 'CREATE_FACTORY_ORDER'; payload: FactoryOrder }
  | { action: 'ADJUST_STOCK'; payload: InventoryAdjustPayload };

export type SyncTask = SyncPayload & {
  id?: number;
  createdAt: string;
  status: 'pending' | 'processing' | 'failed';
  retryCount: number;
  lastError?: string;
  userId?: string;
  warehouseId?: string | null;
  processingAt?: string;
  operationId?: string;
};

export type ProductRetryPayload =
  | { action: 'POST'; payload: Omit<Product, 'stockQuantity'> }
  | { action: 'PUT' | 'PATCH'; payload: Partial<Product> & { id: string } }
  | { action: 'DELETE'; payload: { id: string } };

export type ProductRetry = ProductRetryPayload & {
  id?: number;
  createdAt: string;
  status: 'pending' | 'failed';
  retryCount: number;
  lastError?: string;
  userId?: string;
};

export interface AuditLog {
  id: string;
  entityId: string;
  entityName: string;
  userId: string;
  userName: string;
  oldValue: string;
  newValue: string;
  createdAt: string;
}

export interface DashboardSummary {
  id: string;
  cashBalance?: number;
  factoryDebt?: number;
  totalDriversDebt?: number;
  lowStockProducts?: number;
  newOrders?: number;
  updatedAt: string;
}
