import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  Timestamp
} from 'firebase/firestore';
import { db } from '../config/firebase';
import {
  inventoryItemsPath,
  stockMovementsPath,
  stockConsumptionsPath,
  purchaseOrdersPath,
  recipesPath,
  suppliersPath
} from '../utils/paths';
import { enforcePermission } from '../utils/permissions';
import { roundQuantity, UNIT_CONFIG } from '../utils/units';
import { InventoryItem, StockMovement, StockMovementType, StockReconciliationSummary, UnitCategory } from '../types/inventory';
import { PurchaseOrder, PurchaseOrderStatus } from '../types/purchaseOrder';
import { Recipe, StockConsumption } from '../types/recipe';
import {
  AnalyticsDatePreset,
  DateBounds,
  InventoryAnalyticsSummary,
  InventoryOverviewAnalytics,
  StockMovementAnalytics,
  ConsumptionAnalytics,
  PurchaseAnalytics,
  StockHealthInsights,
  ReconciliationHealthSummary,
  WastageDamageLossItem,
  TopConsumedItemSummary,
  TopDishConsumptionSummary,
  SupplierSpendSummary,
  ReorderRecommendation,
  ReconciliationDiscrepancyItem,
  CategoryValuation
} from '../types/inventoryAnalytics';

/**
 * Parses any date-like input to a native JS Date object.
 */
export function parseDateInput(value: any): Date {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

/**
 * Returns strictly bounded start and end dates for analytics presets.
 */
export function getInventoryPresetBounds(preset: AnalyticsDatePreset): { start: Date; end: Date; label: string } {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  switch (preset) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return { start, end, label: 'Today' };

    case 'yesterday': {
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      return { start, end, label: 'Yesterday' };
    }

    case 'thisWeek': {
      // Monday as week start
      const day = start.getDay();
      const diff = (day === 0 ? -6 : 1) - day;
      start.setDate(start.getDate() + diff);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return { start, end, label: 'This Week' };
    }

    case 'thisMonth':
    default: {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return { start, end, label: 'This Month' };
    }
  }
}

export class InventoryAnalyticsService {
  /**
   * Fetches comprehensive inventory analytics for a restaurant across all data domains.
   */
  async fetchInventoryAnalytics(
    restaurantId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<InventoryAnalyticsSummary> {
    const cleanRestId = restaurantId?.trim();
    if (!cleanRestId) {
      throw new Error('restaurantId is required for inventory analytics');
    }

    await enforcePermission(cleanRestId, 'view_inventory');

    // Default bounds to This Month if not provided
    const defaultBounds = getInventoryPresetBounds('thisMonth');
    const startObj = startDate ? new Date(startDate) : defaultBounds.start;
    const endObj = endDate ? new Date(endDate) : defaultBounds.end;

    // Normalize start/end bounds
    startObj.setHours(0, 0, 0, 0);
    endObj.setHours(23, 59, 59, 999);

    const startTimestamp = Timestamp.fromDate(startObj);
    const endTimestamp = Timestamp.fromDate(endObj);

    const dateBounds: DateBounds = {
      start: startObj,
      end: endObj,
      label: `${startObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} – ${endObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
    };

    // 1. Fetch Inventory Items
    const itemsRef = collection(db, inventoryItemsPath(cleanRestId));
    const itemsSnap = await getDocs(itemsRef);
    const items: InventoryItem[] = itemsSnap.docs.map(d => ({
      id: d.id,
      ...(d.data() as any)
    }));

    const itemMap = new Map<string, InventoryItem>();
    for (const item of items) {
      itemMap.set(item.id, item);
    }

    // 2. Fetch Stock Movements within range (bounded)
    const movementsRef = collection(db, stockMovementsPath(cleanRestId));
    const movementsQuery = query(
      movementsRef,
      where('createdAt', '>=', startTimestamp),
      where('createdAt', '<=', endTimestamp),
      orderBy('createdAt', 'desc'),
      limit(2000)
    );
    const movementsSnap = await getDocs(movementsQuery);
    const rangeMovements: StockMovement[] = movementsSnap.docs.map(d => ({
      id: d.id,
      movementId: d.id,
      ...(d.data() as any)
    }));

    // 3. Fetch Stock Consumptions within range
    const consumptionsRef = collection(db, stockConsumptionsPath(cleanRestId));
    const consumptionsQuery = query(
      consumptionsRef,
      where('createdAt', '>=', startTimestamp),
      where('createdAt', '<=', endTimestamp),
      orderBy('createdAt', 'desc'),
      limit(2000)
    );
    const consumptionsSnap = await getDocs(consumptionsQuery);
    const rangeConsumptions: StockConsumption[] = consumptionsSnap.docs.map(d => ({
      id: d.id,
      consumptionId: d.id,
      ...(d.data() as any)
    }));

    // 4. Fetch Purchase Orders within range
    const purchasesRef = collection(db, purchaseOrdersPath(cleanRestId));
    const purchasesSnap = await getDocs(purchasesRef);
    const allPurchases: PurchaseOrder[] = purchasesSnap.docs.map(d => ({
      purchaseOrderId: d.id,
      ...(d.data() as any)
    }));
    // Filter purchases within date bounds
    const rangePurchases = allPurchases.filter(po => {
      const d = parseDateInput(po.createdAt || po.orderDate);
      return d >= startObj && d <= endObj;
    });

    // 5. Fetch Recipes (active recipes for dish modeling)
    const recipesRef = collection(db, recipesPath(cleanRestId));
    const recipesSnap = await getDocs(recipesRef);
    const recipes: Recipe[] = recipesSnap.docs.map(d => ({
      id: d.id,
      recipeId: d.id,
      ...(d.data() as any)
    }));

    // -------------------------------------------------------------
    // AGGREGATION 1: Inventory Overview
    // -------------------------------------------------------------
    const overview = this.computeOverview(items);

    // -------------------------------------------------------------
    // AGGREGATION 2: Stock Movements & Wastage/Damage Loss
    // -------------------------------------------------------------
    const movementsAnalytics = this.computeStockMovementAnalytics(rangeMovements, itemMap);

    // -------------------------------------------------------------
    // AGGREGATION 3: Stock Consumption & Recipe Performance
    // -------------------------------------------------------------
    const consumptionAnalytics = this.computeConsumptionAnalytics(rangeConsumptions, itemMap, recipes);

    // -------------------------------------------------------------
    // AGGREGATION 4: Supplier & Purchase Orders
    // -------------------------------------------------------------
    const purchaseAnalytics = this.computePurchaseAnalytics(rangePurchases);

    // -------------------------------------------------------------
    // AGGREGATION 5: Stock Health & Reorder Recommendations
    // -------------------------------------------------------------
    const healthInsights = this.computeStockHealth(items);

    // -------------------------------------------------------------
    // AGGREGATION 6: Deterministic Stock Reconciliation
    // -------------------------------------------------------------
    const reconciliation = await this.computeReconciliation(cleanRestId, items);

    return {
      restaurantId: cleanRestId,
      dateBounds,
      overview,
      movements: movementsAnalytics,
      consumption: consumptionAnalytics,
      purchases: purchaseAnalytics,
      health: healthInsights,
      reconciliation
    };
  }

  /**
   * Computes inventory catalog overview, total valuation, and unit category breakdown.
   */
  computeOverview(items: InventoryItem[]): InventoryOverviewAnalytics {
    let activeItems = 0;
    let inactiveItems = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    let healthyCount = 0;
    let totalValuationPaise = 0;

    const categoryMap: Record<UnitCategory, { count: number; valuationPaise: number }> = {
      weight: { count: 0, valuationPaise: 0 },
      volume: { count: 0, valuationPaise: 0 },
      count: { count: 0, valuationPaise: 0 }
    };

    for (const item of items) {
      const isActive = item.active && item.status === 'active';
      if (isActive) {
        activeItems++;
        const currentQty = roundQuantity(item.currentQuantity || 0);
        const minQty = roundQuantity(item.minimumQuantity || 0);
        const costPaise = item.costPerUnitPaise || 0;
        const itemValuation = Math.round(currentQty * costPaise);

        if (currentQty <= 0) {
          outOfStockCount++;
        } else if (currentQty <= minQty) {
          lowStockCount++;
        } else {
          healthyCount++;
        }

        totalValuationPaise += Math.max(0, itemValuation);

        const category: UnitCategory = UNIT_CONFIG[item.unit]?.category || 'count';
        categoryMap[category].count++;
        categoryMap[category].valuationPaise += Math.max(0, itemValuation);
      } else {
        inactiveItems++;
      }
    }

    const categoryDistribution: CategoryValuation[] = (['weight', 'volume', 'count'] as UnitCategory[]).map(cat => ({
      category: cat,
      count: categoryMap[cat].count,
      valuationPaise: categoryMap[cat].valuationPaise,
      proportionPercent:
        totalValuationPaise > 0
          ? Math.round((categoryMap[cat].valuationPaise / totalValuationPaise) * 100)
          : 0
    }));

    return {
      totalItems: items.length,
      activeItems,
      inactiveItems,
      lowStockCount,
      outOfStockCount,
      healthyCount,
      totalValuationPaise,
      categoryDistribution
    };
  }

  /**
   * Aggregates stock movements by type and analyzes wastage/damage losses.
   * INVARIANT: No double counting. Movements ledger is the single source of truth for physical stock delta.
   */
  computeStockMovementAnalytics(
    movements: StockMovement[],
    itemMap: Map<string, InventoryItem>
  ): StockMovementAnalytics {
    const movementsByType: Record<StockMovementType, { count: number; totalQuantity: number; estimatedCostPaise: number }> = {
      opening: { count: 0, totalQuantity: 0, estimatedCostPaise: 0 },
      stock_in: { count: 0, totalQuantity: 0, estimatedCostPaise: 0 },
      stock_out: { count: 0, totalQuantity: 0, estimatedCostPaise: 0 },
      adjustment: { count: 0, totalQuantity: 0, estimatedCostPaise: 0 },
      wastage: { count: 0, totalQuantity: 0, estimatedCostPaise: 0 },
      damage: { count: 0, totalQuantity: 0, estimatedCostPaise: 0 },
      correction: { count: 0, totalQuantity: 0, estimatedCostPaise: 0 }
    };

    let totalInflowQuantity = 0;
    let totalOutflowQuantity = 0;
    let totalInflowCostPaise = 0;
    let totalOutflowCostPaise = 0;

    let totalWastageQuantity = 0;
    let totalWastageCostPaise = 0;
    let totalDamageQuantity = 0;
    let totalDamageCostPaise = 0;

    const wastageDamageItemMap = new Map<string, WastageDamageLossItem>();

    for (const m of movements) {
      const type = m.type || 'adjustment';
      if (!movementsByType[type]) {
        movementsByType[type] = { count: 0, totalQuantity: 0, estimatedCostPaise: 0 };
      }

      const item = itemMap.get(m.inventoryItemId);
      const costPerUnit = item?.costPerUnitPaise || 0;
      const qty = roundQuantity(m.quantity || 0);
      const delta =
        typeof m.delta === 'number'
          ? m.delta
          : type === 'stock_out' || type === 'wastage' || type === 'damage'
            ? -qty
            : qty;

      const movementCost = Math.round(qty * costPerUnit);

      movementsByType[type].count++;
      movementsByType[type].totalQuantity = roundQuantity(movementsByType[type].totalQuantity + qty);
      movementsByType[type].estimatedCostPaise += movementCost;

      // Inflow vs Outflow
      if (type === 'opening') {
        totalInflowQuantity = roundQuantity(totalInflowQuantity + qty);
        totalInflowCostPaise += movementCost;
      } else if (delta > 0) {
        totalInflowQuantity = roundQuantity(totalInflowQuantity + delta);
        totalInflowCostPaise += Math.round(delta * costPerUnit);
      } else if (delta < 0) {
        totalOutflowQuantity = roundQuantity(totalOutflowQuantity + Math.abs(delta));
        totalOutflowCostPaise += Math.round(Math.abs(delta) * costPerUnit);
      }

      // Wastage and damage specific tracking
      if (type === 'wastage' || type === 'damage') {
        const isWastage = type === 'wastage';
        if (isWastage) {
          totalWastageQuantity = roundQuantity(totalWastageQuantity + qty);
          totalWastageCostPaise += movementCost;
        } else {
          totalDamageQuantity = roundQuantity(totalDamageQuantity + qty);
          totalDamageCostPaise += movementCost;
        }

        const existing = wastageDamageItemMap.get(m.inventoryItemId) || {
          itemId: m.inventoryItemId,
          itemName: item?.name || 'Unknown Item',
          unit: m.unit || item?.unit || 'piece',
          wastageQuantity: 0,
          wastageCostPaise: 0,
          damageQuantity: 0,
          damageCostPaise: 0,
          totalLossCostPaise: 0,
          reasons: []
        };

        if (isWastage) {
          existing.wastageQuantity = roundQuantity(existing.wastageQuantity + qty);
          existing.wastageCostPaise += movementCost;
        } else {
          existing.damageQuantity = roundQuantity(existing.damageQuantity + qty);
          existing.damageCostPaise += movementCost;
        }
        existing.totalLossCostPaise += movementCost;
        const reasonText = (m.reason || m.note || '').trim();
        if (reasonText && !existing.reasons.includes(reasonText)) {
          existing.reasons.push(reasonText);
        }

        wastageDamageItemMap.set(m.inventoryItemId, existing);
      }
    }

    const netQuantityChange = roundQuantity(totalInflowQuantity - totalOutflowQuantity);
    const netCostChangePaise = totalInflowCostPaise - totalOutflowCostPaise;

    const wastageDamageBreakdown = Array.from(wastageDamageItemMap.values()).sort(
      (a, b) => b.totalLossCostPaise - a.totalLossCostPaise
    );

    return {
      movementsByType: {
        opening: { type: 'opening', ...movementsByType.opening },
        stock_in: { type: 'stock_in', ...movementsByType.stock_in },
        stock_out: { type: 'stock_out', ...movementsByType.stock_out },
        adjustment: { type: 'adjustment', ...movementsByType.adjustment },
        wastage: { type: 'wastage', ...movementsByType.wastage },
        damage: { type: 'damage', ...movementsByType.damage },
        correction: { type: 'correction', ...movementsByType.correction }
      },
      totalMovementsCount: movements.length,
      totalInflowQuantity,
      totalOutflowQuantity,
      totalInflowCostPaise,
      totalOutflowCostPaise,
      netQuantityChange,
      netCostChangePaise,
      wastageDamage: {
        totalWastageQuantity,
        totalWastageCostPaise,
        totalDamageQuantity,
        totalDamageCostPaise,
        totalLossCostPaise: totalWastageCostPaise + totalDamageCostPaise,
        itemBreakdown: wastageDamageBreakdown
      }
    };
  }

  /**
   * Analyzes stock consumption vs recipes, top consumed ingredients, top menu items prepared, and reversals.
   */
  computeConsumptionAnalytics(
    consumptions: StockConsumption[],
    itemMap: Map<string, InventoryItem>,
    recipes: Recipe[]
  ): ConsumptionAnalytics {
    let totalActiveConsumptions = 0;
    let totalReversedConsumptions = 0;
    let totalConsumedCostPaise = 0;
    let totalReversedCostPaise = 0;

    const consumedItemMap = new Map<
      string,
      {
        inventoryItemId: string;
        itemName: string;
        unit: any;
        totalQuantity: number;
        costPaise: number;
        orders: Set<string>;
        recipes: Set<string>;
      }
    >();

    const dishMap = new Map<
      string,
      {
        menuItemId: string;
        menuItemName: string;
        orderItems: Map<string, number>;
        totalCostPaise: number;
      }
    >();

    for (const c of consumptions) {
      const item = itemMap.get(c.inventoryItemId);
      const costPerUnit = item?.costPerUnitPaise || 0;
      const qty = roundQuantity(c.quantity || 0);
      const cost = Math.round(qty * costPerUnit);

      if (c.status === 'reversed') {
        totalReversedConsumptions++;
        totalReversedCostPaise += cost;
      } else {
        totalActiveConsumptions++;
        totalConsumedCostPaise += cost;

        // Inventory item level consumption
        const existingItem = consumedItemMap.get(c.inventoryItemId) || {
          inventoryItemId: c.inventoryItemId,
          itemName: c.inventoryItemNameSnapshot || item?.name || 'Unknown Item',
          unit: c.unit || item?.unit || 'piece',
          totalQuantity: 0,
          costPaise: 0,
          orders: new Set<string>(),
          recipes: new Set<string>()
        };

        existingItem.totalQuantity = roundQuantity(existingItem.totalQuantity + qty);
        existingItem.costPaise += cost;
        if (c.orderId) existingItem.orders.add(c.orderId);
        if (c.recipeId) existingItem.recipes.add(c.recipeId);
        consumedItemMap.set(c.inventoryItemId, existingItem);

        // Menu item / dish level consumption
        const menuItemId = c.menuItemId;
        if (menuItemId) {
          const existingDish = dishMap.get(menuItemId) || {
            menuItemId,
            menuItemName: c.menuItemNameSnapshot || 'Unknown Dish',
            orderItems: new Map<string, number>(),
            totalCostPaise: 0
          };

          const orderItemKey = c.orderItemId || `${c.orderId}_${c.menuItemId}`;
          if (!existingDish.orderItems.has(orderItemKey)) {
            existingDish.orderItems.set(orderItemKey, c.orderItemQuantity || 1);
          }
          existingDish.totalCostPaise += cost;
          dishMap.set(menuItemId, existingDish);
        }
      }
    }

    const topConsumedItems: TopConsumedItemSummary[] = Array.from(consumedItemMap.values())
      .map(entry => ({
        inventoryItemId: entry.inventoryItemId,
        itemName: entry.itemName,
        unit: entry.unit,
        totalQuantityConsumed: entry.totalQuantity,
        estimatedCostPaise: entry.costPaise,
        orderCount: entry.orders.size,
        distinctRecipesCount: entry.recipes.size
      }))
      .sort((a, b) => b.estimatedCostPaise - a.estimatedCostPaise);

    const topDishes: TopDishConsumptionSummary[] = Array.from(dishMap.values())
      .map(entry => {
        let totalPortions = 0;
        for (const qty of entry.orderItems.values()) {
          totalPortions += qty;
        }
        return {
          menuItemId: entry.menuItemId,
          menuItemName: entry.menuItemName,
          totalPortionsPrepared: totalPortions,
          estimatedTotalIngredientCostPaise: entry.totalCostPaise,
          averageCostPerPortionPaise:
            totalPortions > 0 ? Math.round(entry.totalCostPaise / totalPortions) : 0
        };
      })
      .sort((a, b) => b.estimatedTotalIngredientCostPaise - a.estimatedTotalIngredientCostPaise);

    const netConsumptionCostPaise = Math.max(0, totalConsumedCostPaise - totalReversedCostPaise);
    const totalRecords = consumptions.length;
    const reversalRatePercent =
      totalRecords > 0 ? Math.round((totalReversedConsumptions / totalRecords) * 100) : 0;

    return {
      totalConsumptionsCount: totalRecords,
      totalActiveConsumptions,
      totalReversedConsumptions,
      totalConsumedCostPaise,
      totalReversedCostPaise,
      netConsumptionCostPaise,
      topConsumedItems,
      topDishes,
      reversalRatePercent
    };
  }

  /**
   * Analyzes supplier purchase orders, total spend in integer paise, and fulfillment metrics.
   */
  computePurchaseAnalytics(purchases: PurchaseOrder[]): PurchaseAnalytics {
    let totalSpendPaise = 0;
    let totalOrderedQuantity = 0;
    let totalReceivedQuantity = 0;
    let pendingOrdersCount = 0;

    const statusCounts: Record<PurchaseOrderStatus, number> = {
      draft: 0,
      submitted: 0,
      partiallyReceived: 0,
      received: 0,
      cancelled: 0
    };

    const supplierMap = new Map<
      string,
      {
        supplierId: string;
        supplierName: string;
        poCount: number;
        totalSpendPaise: number;
        totalOrdered: number;
        totalReceived: number;
      }
    >();

    for (const po of purchases) {
      const status = po.status || 'draft';
      if (statusCounts[status] !== undefined) {
        statusCounts[status]++;
      }

      if (status !== 'cancelled') {
        const grandTotal = po.grandTotalMinor || 0;
        totalSpendPaise += grandTotal;

        if (status === 'submitted' || status === 'partiallyReceived') {
          pendingOrdersCount++;
        }

        const supplierId = po.supplierId || 'unknown';
        const supplierName = po.supplierSnapshot?.name || 'Unknown Supplier';

        const existingSup = supplierMap.get(supplierId) || {
          supplierId,
          supplierName,
          poCount: 0,
          totalSpendPaise: 0,
          totalOrdered: 0,
          totalReceived: 0
        };

        existingSup.poCount++;
        existingSup.totalSpendPaise += grandTotal;

        for (const item of po.items || []) {
          const ordered = roundQuantity(item.quantityOrdered || 0);
          const received = roundQuantity(item.receivedQuantity || 0);
          totalOrderedQuantity = roundQuantity(totalOrderedQuantity + ordered);
          totalReceivedQuantity = roundQuantity(totalReceivedQuantity + received);

          existingSup.totalOrdered = roundQuantity(existingSup.totalOrdered + ordered);
          existingSup.totalReceived = roundQuantity(existingSup.totalReceived + received);
        }

        supplierMap.set(supplierId, existingSup);
      }
    }

    const fulfillmentRatePercent =
      totalOrderedQuantity > 0
        ? Math.min(100, Math.round((totalReceivedQuantity / totalOrderedQuantity) * 100))
        : 100;

    const supplierBreakdown: SupplierSpendSummary[] = Array.from(supplierMap.values())
      .map(entry => ({
        supplierId: entry.supplierId,
        supplierName: entry.supplierName,
        poCount: entry.poCount,
        totalSpendPaise: entry.totalSpendPaise,
        fulfillmentRatePercent:
          entry.totalOrdered > 0
            ? Math.min(100, Math.round((entry.totalReceived / entry.totalOrdered) * 100))
            : 100
      }))
      .sort((a, b) => b.totalSpendPaise - a.totalSpendPaise);

    return {
      totalPurchaseOrders: purchases.length,
      totalSpendPaise,
      statusCounts,
      supplierBreakdown,
      fulfillment: {
        totalOrderedQuantity,
        totalReceivedQuantity,
        fulfillmentRatePercent,
        pendingOrdersCount
      }
    };
  }

  /**
   * Computes stock health and reorder recommendations for active items.
   */
  computeStockHealth(items: InventoryItem[]): StockHealthInsights {
    const activeItems = items.filter(i => i.active && i.status === 'active');
    let healthyCount = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    const recommendations: ReorderRecommendation[] = [];

    for (const item of activeItems) {
      const current = roundQuantity(item.currentQuantity || 0);
      const min = roundQuantity(item.minimumQuantity || 0);
      const cost = item.costPerUnitPaise || 0;

      if (current <= 0) {
        outOfStockCount++;
        const suggestedQty = item.reorderQuantity
          ? item.reorderQuantity
          : Math.max(min * 2, 5);
        recommendations.push({
          inventoryItemId: item.id,
          itemName: item.name,
          sku: item.sku,
          unit: item.unit,
          currentQuantity: current,
          minimumQuantity: min,
          reorderQuantity: item.reorderQuantity,
          suggestedQuantity: roundQuantity(suggestedQty),
          costPerUnitPaise: item.costPerUnitPaise,
          estimatedCostPaise: Math.round(suggestedQty * cost),
          urgency: 'critical'
        });
      } else if (current <= min) {
        lowStockCount++;
        const deficit = roundQuantity(min - current);
        const suggestedQty = item.reorderQuantity
          ? item.reorderQuantity
          : Math.max(deficit + min, min);
        recommendations.push({
          inventoryItemId: item.id,
          itemName: item.name,
          sku: item.sku,
          unit: item.unit,
          currentQuantity: current,
          minimumQuantity: min,
          reorderQuantity: item.reorderQuantity,
          suggestedQuantity: roundQuantity(suggestedQty),
          costPerUnitPaise: item.costPerUnitPaise,
          estimatedCostPaise: Math.round(suggestedQty * cost),
          urgency: 'low'
        });
      } else {
        healthyCount++;
      }
    }

    const totalActive = activeItems.length;
    const stockHealthScorePercent =
      totalActive > 0 ? Math.round((healthyCount / totalActive) * 100) : 100;

    // Sort recommendations: critical first, then highest estimated reorder cost
    recommendations.sort((a, b) => {
      if (a.urgency === 'critical' && b.urgency !== 'critical') return -1;
      if (a.urgency !== 'critical' && b.urgency === 'critical') return 1;
      return b.estimatedCostPaise - a.estimatedCostPaise;
    });

    return {
      healthyCount,
      lowStockCount,
      outOfStockCount,
      stockHealthScorePercent,
      recommendations
    };
  }

  /**
   * Pure mathematical reconciliation for a single item against a list of movements.
   * INVARIANT: Opening + Inflows - Outflows ± Adjustments = Expected Stock.
   */
  computeItemReconciliation(
    item: InventoryItem,
    movements: StockMovement[]
  ): StockReconciliationSummary {
    let openingQuantity = 0;
    let totalInflow = 0;
    let totalOutflow = 0;

    // Filter movements belonging to this item
    const itemMovements = movements.filter(m => m.inventoryItemId === item.id);
    const chronological = [...itemMovements].sort((a, b) => {
      const timeA = parseDateInput(a.createdAt).getTime();
      const timeB = parseDateInput(b.createdAt).getTime();
      return timeA - timeB;
    });

    for (const m of chronological) {
      const qty = roundQuantity(m.quantity || 0);
      const d =
        typeof m.delta === 'number'
          ? m.delta
          : m.type === 'stock_out' || m.type === 'wastage' || m.type === 'damage'
            ? -qty
            : qty;

      if (m.type === 'opening') {
        openingQuantity = roundQuantity(openingQuantity + qty);
      } else if (d > 0) {
        totalInflow = roundQuantity(totalInflow + d);
      } else if (d < 0) {
        totalOutflow = roundQuantity(totalOutflow + Math.abs(d));
      }
    }

    const netChange = roundQuantity(totalInflow - totalOutflow);
    const calculatedQuantity = roundQuantity(openingQuantity + netChange);
    const currentQuantity = roundQuantity(item.currentQuantity || 0);
    const discrepancy = roundQuantity(currentQuantity - calculatedQuantity);
    const isReconciled = Math.abs(discrepancy) < 0.001;

    return {
      inventoryItemId: item.id,
      itemName: item.name,
      unit: item.unit,
      openingQuantity,
      totalInflow,
      totalOutflow,
      netChange,
      calculatedQuantity,
      currentQuantity,
      isReconciled,
      discrepancy,
      movementsCount: itemMovements.length
    };
  }

  /**
   * Pure reconciliation calculation across multiple items and a set of movements.
   */
  computeReconciliationFromMovements(
    items: InventoryItem[],
    movements: StockMovement[]
  ): StockReconciliationSummary[] {
    return items.map(item => this.computeItemReconciliation(item, movements));
  }

  /**
   * Computes stock reconciliation summary across active items against movement ledger history.
   * INVARIANT: Deterministic calculation:
   * Opening + Stock In + Reversal - Stock Out - Wastage - Damage ± Adjustments = Expected Stock.
   */
  async computeReconciliation(
    restaurantId: string,
    items: InventoryItem[]
  ): Promise<ReconciliationHealthSummary> {
    const cleanRestId = restaurantId.trim();
    const activeItems = items.filter(i => i.active && i.status === 'active');

    let perfectlyReconciledCount = 0;
    let discrepantCount = 0;
    const discrepancies: ReconciliationDiscrepancyItem[] = [];

    // Fetch movements for items (bounded per item or recent ledger)
    for (const item of activeItems) {
      const movementsRef = collection(db, stockMovementsPath(cleanRestId));
      const q = query(
        movementsRef,
        where('inventoryItemId', '==', item.id),
        orderBy('createdAt', 'desc'),
        limit(200)
      );
      const snap = await getDocs(q);
      const movements: StockMovement[] = snap.docs.map(d => ({
        id: d.id,
        ...(d.data() as any)
      }));

      let openingQuantity = 0;
      let totalInflow = 0;
      let totalOutflow = 0;

      const chronological = [...movements].reverse();

      for (const m of chronological) {
        const d =
          typeof m.delta === 'number'
            ? m.delta
            : m.type === 'stock_out' || m.type === 'wastage' || m.type === 'damage'
              ? -m.quantity
              : m.quantity;

        if (m.type === 'opening') {
          openingQuantity = roundQuantity(openingQuantity + m.quantity);
        } else if (d > 0) {
          totalInflow = roundQuantity(totalInflow + d);
        } else if (d < 0) {
          totalOutflow = roundQuantity(totalOutflow + Math.abs(d));
        }
      }

      const netChange = roundQuantity(totalInflow - totalOutflow);
      const calculatedQuantity = roundQuantity(openingQuantity + netChange);
      const currentQuantity = roundQuantity(item.currentQuantity || 0);
      const discrepancy = roundQuantity(currentQuantity - calculatedQuantity);
      const isReconciled = Math.abs(discrepancy) < 0.001;

      if (isReconciled) {
        perfectlyReconciledCount++;
      } else {
        discrepantCount++;
        const costPerUnit = item.costPerUnitPaise || 0;
        const discrepancyCostPaise = Math.round(discrepancy * costPerUnit);

        discrepancies.push({
          inventoryItemId: item.id,
          itemName: item.name,
          unit: item.unit,
          openingQuantity,
          totalInflow,
          totalOutflow,
          calculatedQuantity,
          currentQuantity,
          discrepancy,
          costPerUnitPaise: item.costPerUnitPaise,
          discrepancyCostPaise
        });
      }
    }

    const totalAuditedItems = activeItems.length;
    const accuracyRatePercent =
      totalAuditedItems > 0
        ? Math.round((perfectlyReconciledCount / totalAuditedItems) * 100)
        : 100;

    return {
      totalAuditedItems,
      perfectlyReconciledCount,
      discrepantCount,
      accuracyRatePercent,
      discrepancies
    };
  }
}

export const inventoryAnalyticsService = new InventoryAnalyticsService();
