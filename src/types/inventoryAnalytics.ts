import { InventoryUnit, UnitCategory, StockMovementType, InventoryItem } from './inventory';
import { PurchaseOrderStatus } from './purchaseOrder';

export type AnalyticsDatePreset = 'today' | 'yesterday' | 'thisWeek' | 'thisMonth' | 'custom';

export interface DateBounds {
  start: Date;
  end: Date;
  label: string;
}

export interface CategoryValuation {
  category: UnitCategory;
  count: number;
  valuationPaise: number;
  proportionPercent: number;
}

export interface InventoryOverviewAnalytics {
  totalItems: number;
  activeItems: number;
  inactiveItems: number;
  lowStockCount: number;
  outOfStockCount: number;
  healthyCount: number;
  totalValuationPaise: number;
  categoryDistribution: CategoryValuation[];
}

export interface MovementTypeSummary {
  type: StockMovementType;
  count: number;
  totalQuantity: number;
  estimatedCostPaise: number;
}

export interface WastageDamageLossItem {
  itemId: string;
  itemName: string;
  unit: InventoryUnit;
  wastageQuantity: number;
  wastageCostPaise: number;
  damageQuantity: number;
  damageCostPaise: number;
  totalLossCostPaise: number;
  reasons: string[];
}

export interface StockMovementAnalytics {
  movementsByType: Record<StockMovementType, MovementTypeSummary>;
  totalMovementsCount: number;
  totalInflowQuantity: number;
  totalOutflowQuantity: number;
  totalInflowCostPaise: number;
  totalOutflowCostPaise: number;
  netQuantityChange: number;
  netCostChangePaise: number;
  wastageDamage: {
    totalWastageQuantity: number;
    totalWastageCostPaise: number;
    totalDamageQuantity: number;
    totalDamageCostPaise: number;
    totalLossCostPaise: number;
    itemBreakdown: WastageDamageLossItem[];
  };
}

export interface TopConsumedItemSummary {
  inventoryItemId: string;
  itemName: string;
  unit: InventoryUnit;
  totalQuantityConsumed: number;
  estimatedCostPaise: number;
  orderCount: number;
  distinctRecipesCount: number;
}

export interface TopDishConsumptionSummary {
  menuItemId: string;
  menuItemName: string;
  totalPortionsPrepared: number;
  estimatedTotalIngredientCostPaise: number;
  averageCostPerPortionPaise: number;
}

export interface ConsumptionAnalytics {
  totalConsumptionsCount: number;
  totalActiveConsumptions: number;
  totalReversedConsumptions: number;
  totalConsumedCostPaise: number;
  totalReversedCostPaise: number;
  netConsumptionCostPaise: number;
  topConsumedItems: TopConsumedItemSummary[];
  topDishes: TopDishConsumptionSummary[];
  reversalRatePercent: number;
}

export interface SupplierSpendSummary {
  supplierId: string;
  supplierName: string;
  poCount: number;
  totalSpendPaise: number;
  fulfillmentRatePercent: number;
}

export interface PurchaseAnalytics {
  totalPurchaseOrders: number;
  totalSpendPaise: number;
  statusCounts: Record<PurchaseOrderStatus, number>;
  supplierBreakdown: SupplierSpendSummary[];
  fulfillment: {
    totalOrderedQuantity: number;
    totalReceivedQuantity: number;
    fulfillmentRatePercent: number;
    pendingOrdersCount: number;
  };
}

export interface ReorderRecommendation {
  inventoryItemId: string;
  itemName: string;
  sku?: string;
  unit: InventoryUnit;
  currentQuantity: number;
  minimumQuantity: number;
  reorderQuantity?: number;
  suggestedQuantity: number;
  costPerUnitPaise?: number;
  estimatedCostPaise: number;
  urgency: 'critical' | 'low';
}

export interface StockHealthInsights {
  healthyCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  stockHealthScorePercent: number;
  recommendations: ReorderRecommendation[];
}

export interface ReconciliationDiscrepancyItem {
  inventoryItemId: string;
  itemName: string;
  unit: InventoryUnit;
  openingQuantity: number;
  totalInflow: number;
  totalOutflow: number;
  calculatedQuantity: number;
  currentQuantity: number;
  discrepancy: number;
  costPerUnitPaise?: number;
  discrepancyCostPaise: number;
}

export interface ReconciliationHealthSummary {
  totalAuditedItems: number;
  perfectlyReconciledCount: number;
  discrepantCount: number;
  accuracyRatePercent: number;
  discrepancies: ReconciliationDiscrepancyItem[];
}

export interface InventoryAnalyticsSummary {
  restaurantId: string;
  dateBounds: DateBounds;
  overview: InventoryOverviewAnalytics;
  movements: StockMovementAnalytics;
  consumption: ConsumptionAnalytics;
  purchases: PurchaseAnalytics;
  health: StockHealthInsights;
  reconciliation: ReconciliationHealthSummary;
}
