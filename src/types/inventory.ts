/**
 * Inventory Domain Models for RestaurantOS M7-7A Inventory Foundation.
 * 
 * DESIGN INVARIANTS:
 * 1. restaurantId is strictly tenant-scoped and immutable.
 * 2. Quantities are deterministically rounded to 3 decimal places (roundQuantity)
 *    to avoid floating-point drift across metric and count units.
 * 3. stockMovements are strictly immutable once created.
 * 4. Current stock cannot be directly mutated without an authoritative stock movement.
 */

export type InventoryUnit =
  | 'kg'
  | 'g'
  | 'litre'
  | 'ml'
  | 'piece'
  | 'box'
  | 'packet';

export type UnitCategory = 'weight' | 'volume' | 'count';

export type InventoryItemStatus = 'active' | 'inactive' | 'archived';

export type StockMovementType =
  | 'opening'
  | 'stock_in'
  | 'stock_out'
  | 'adjustment'
  | 'wastage'
  | 'damage'
  | 'correction';

export interface InventoryItem {
  id: string; // inventoryItemId
  restaurantId: string;
  name: string;
  normalizedName: string;
  sku?: string;
  unit: InventoryUnit;
  currentQuantity: number;
  minimumQuantity: number;
  reorderQuantity?: number;
  costPerUnitPaise?: number;
  status: InventoryItemStatus;
  active: boolean;
  createdAt: any;
  updatedAt: any;
  createdBy: string;
  updatedBy: string;
}

export interface StockMovement {
  id: string; // movementId
  movementId?: string; // alias
  restaurantId: string;
  inventoryItemId: string;
  type: StockMovementType;
  quantity: number; // positive magnitude of change
  unit: InventoryUnit;
  delta?: number; // signed change: resultingQuantity = previousQuantity + delta
  previousQuantity: number;
  resultingQuantity: number;
  reason?: string;
  note?: string;
  actorUid: string;
  clientRequestId?: string | null;
  referenceType?: 'manual' | 'order' | 'physical_count' | 'correction' | string;
  referenceId?: string;
  reversalOfMovementId?: string;
  reversedByMovementId?: string;
  createdAt: any;
}

export interface CreateInventoryItemDTO {
  name: string;
  sku?: string;
  unit: InventoryUnit;
  minimumQuantity: number;
  reorderQuantity?: number;
  costPerUnitPaise?: number;
  openingQuantity?: number;
  openingReason?: string;
}

export interface UpdateInventoryItemDTO {
  name?: string;
  sku?: string;
  unit?: InventoryUnit;
  minimumQuantity?: number;
  reorderQuantity?: number;
  costPerUnitPaise?: number;
}

export interface RecordStockMovementDTO {
  inventoryItemId: string;
  type: StockMovementType;
  quantity: number;
  unit?: InventoryUnit;
  reason?: string;
  note?: string;
  adjustmentMode?: 'set_to' | 'add' | 'subtract';
  clientRequestId?: string;
  referenceType?: 'manual' | 'order' | 'physical_count' | 'correction' | string;
  referenceId?: string;
  reversalOfMovementId?: string;
}

export interface StockLedgerQueryOptions {
  inventoryItemId?: string;
  types?: StockMovementType[];
  type?: StockMovementType;
  startDate?: string | Date;
  endDate?: string | Date;
  actorUid?: string;
  searchTerm?: string;
  limit?: number;
  startAfterDocId?: string;
}

export interface StockReconciliationSummary {
  inventoryItemId: string;
  itemName: string;
  unit: InventoryUnit;
  openingQuantity: number;
  totalInflow: number;
  totalOutflow: number;
  netChange: number;
  calculatedQuantity: number;
  currentQuantity: number;
  isReconciled: boolean;
  discrepancy: number;
  movementsCount: number;
}
