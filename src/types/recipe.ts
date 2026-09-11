/**
 * Recipe & Automatic Stock Consumption Domain Models for RestaurantOS M7-7D.
 * 
 * DESIGN INVARIANTS:
 * 1. restaurantId is strictly tenant-scoped and immutable.
 * 2. Recipes belong to a single menu item (menuItemId) within a restaurant.
 * 3. At most ONE active recipe can exist for a menuItemId at any given time.
 * 4. Active & historical recipe versions are immutable; updates create a new version.
 * 5. Recipe ingredients reference active inventoryItems; units must be compatible with base units.
 * 6. Stock consumption executes atomically via the M7-7B Stock Ledger (all ingredients or none).
 * 7. Stock consumption records are immutable and idempotently guarded (one order = one consumption).
 * 8. Cancellation / refund reversal executes via compensating stock movements (type: 'stock_in').
 */

import { InventoryUnit } from './inventory';

export type RecipeStatus = 'draft' | 'active' | 'archived';

export interface RecipeIngredientSnapshot {
  name: string;
  sku?: string;
  unit: InventoryUnit; // base inventory unit
  costPerUnitPaise?: number;
}

export interface RecipeIngredient {
  inventoryItemId: string;
  inventoryItemSnapshot: RecipeIngredientSnapshot;
  quantity: number; // positive quantity in recipe unit
  unit: InventoryUnit; // recipe unit (must be dimensionally compatible with base unit)
}

export interface MenuItemSnapshot {
  name: string;
  categoryName?: string;
  priceMinor?: number;
}

export interface Recipe {
  id: string; // recipeId
  recipeId?: string; // alias
  restaurantId: string;
  menuItemId: string;
  menuItemSnapshot: MenuItemSnapshot;
  version: number;
  status: RecipeStatus;
  ingredients: RecipeIngredient[];
  notes?: string;
  estimatedCostPaise?: number; // derived sum of ingredient snapshot costs
  createdAt: any;
  updatedAt: any;
  createdBy: string;
  updatedBy: string;
}

export interface RecipeIngredientInput {
  inventoryItemId: string;
  quantity: number;
  unit: InventoryUnit;
}

export interface CreateRecipeDTO {
  menuItemId: string;
  ingredients: RecipeIngredientInput[];
  notes?: string;
  status?: RecipeStatus; // default: 'draft'
}

export interface UpdateRecipeDTO {
  ingredients?: RecipeIngredientInput[];
  notes?: string;
  status?: RecipeStatus;
}

export type ConsumptionStatus = 'consumed' | 'reversed';

export interface StockConsumption {
  id: string; // consumptionId
  consumptionId?: string; // alias
  restaurantId: string;
  orderId: string;
  orderNumber?: string;
  orderItemId?: string;
  menuItemId: string;
  menuItemNameSnapshot?: string;
  recipeId: string;
  recipeVersion: number;
  inventoryItemId: string;
  inventoryItemNameSnapshot?: string;
  quantity: number; // consumed quantity in inventory base unit (positive magnitude)
  unit: InventoryUnit; // inventory base unit
  recipeQuantity: number; // quantity in recipe unit per menu item
  recipeUnit: InventoryUnit; // recipe unit
  orderItemQuantity: number; // ordered line item count
  delta: number; // signed change (e.g. -0.4)
  stockMovementId: string; // authoritative M7-7B StockMovement ID
  actorUid: string;
  clientRequestId?: string | null;
  idempotencyKey?: string | null;
  status: ConsumptionStatus;
  reversedAt?: any;
  reversedBy?: string;
  reversalMovementId?: string;
  reversalReason?: string;
  createdAt: any;
  updatedAt?: any;
}

export interface ConsumeStockForOrderItem {
  itemId: string; // menuItemId
  quantity: number;
  orderItemId?: string;
  nameSnapshot?: string;
}

export interface ConsumeStockForOrderDTO {
  orderId: string;
  orderNumber?: string;
  items: ConsumeStockForOrderItem[];
  clientRequestId?: string;
}

export interface ReverseStockConsumptionDTO {
  orderId?: string;
  consumptionId?: string;
  reason?: string;
  clientRequestId?: string;
}

export interface RecipeResolutionSummary {
  menuItemId: string;
  menuItemName: string;
  orderQuantity: number;
  hasActiveRecipe: boolean;
  recipeId?: string;
  recipeVersion?: number;
  ingredients: Array<{
    inventoryItemId: string;
    inventoryItemName: string;
    quantityPerItem: number;
    recipeUnit: InventoryUnit;
    totalRequiredBaseUnit: number;
    baseUnit: InventoryUnit;
  }>;
}
