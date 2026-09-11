import { Timestamp } from 'firebase/firestore';
import { InventoryUnit } from './inventory';
import { MoneyMinor } from './money';

export type PurchaseOrderStatus =
  | 'draft'
  | 'submitted'
  | 'partiallyReceived'
  | 'received'
  | 'cancelled';

export interface PurchaseOrderItem {
  id: string; // unique item id within purchase order
  inventoryItemId: string;
  itemNameSnapshot: string;
  skuSnapshot?: string;
  quantityOrdered: number; // rounded to 3 decimal places
  unit: InventoryUnit;
  unitPriceMinor: MoneyMinor; // in integer minor units (paise)
  lineTotalMinor: MoneyMinor; // quantityOrdered * unitPriceMinor
  receivedQuantity: number; // rounded to 3 decimal places (default 0)
  remainingQuantity: number; // quantityOrdered - receivedQuantity
}

export interface SupplierSnapshot {
  supplierId: string;
  name: string;
  phone: string;
  email?: string;
  contactPerson?: string;
  gstNumber?: string;
}

export interface PurchaseOrder {
  purchaseOrderId: string;
  orderNumber: string; // e.g. PO-2026-0001
  restaurantId: string;
  supplierId: string;
  supplierSnapshot: SupplierSnapshot;
  status: PurchaseOrderStatus;
  orderDate: string; // ISO format YYYY-MM-DD
  expectedDate?: string; // ISO format YYYY-MM-DD
  items: PurchaseOrderItem[];
  notes?: string;
  subtotalMinor: MoneyMinor;
  taxMinor: MoneyMinor;
  grandTotalMinor: MoneyMinor;
  currency: string;
  createdBy: string;
  createdAt: Timestamp | any;
  updatedBy: string;
  updatedAt: Timestamp | any;
  clientRequestId?: string;
}

export interface CreatePurchaseOrderItemDTO {
  inventoryItemId: string;
  quantityOrdered: number;
  unit: InventoryUnit;
  unitPriceMinor: MoneyMinor;
}

export interface CreatePurchaseOrderDTO {
  supplierId: string;
  orderDate?: string;
  expectedDate?: string;
  notes?: string;
  taxRatePercent?: number; // optional tax percentage rate e.g. 5 for 5%
  items: CreatePurchaseOrderItemDTO[];
}

export interface ReceiveGoodsItemDTO {
  purchaseOrderItemId: string;
  quantityReceived: number; // in unit specified or item's base unit
}

export interface ReceiveGoodsDTO {
  purchaseOrderId: string;
  items: ReceiveGoodsItemDTO[];
  notes?: string;
  clientRequestId?: string;
}

export interface PurchaseReceivingItemLog {
  purchaseOrderItemId: string;
  inventoryItemId: string;
  itemNameSnapshot: string;
  quantityReceived: number;
  unit: InventoryUnit;
  convertedQuantity: number; // in inventory item unit
  baseUnit: InventoryUnit;
  stockMovementId: string;
}

export interface PurchaseReceiving {
  receivingId: string;
  restaurantId: string;
  purchaseOrderId: string;
  orderNumber: string;
  supplierId: string;
  supplierName: string;
  items: PurchaseReceivingItemLog[];
  notes?: string;
  actorUid: string;
  clientRequestId?: string;
  createdAt: Timestamp | any;
}

export interface PurchaseOrderQueryOptions {
  status?: PurchaseOrderStatus;
  supplierId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}
