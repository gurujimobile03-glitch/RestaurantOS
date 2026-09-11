import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  InventoryAnalyticsService,
  getInventoryPresetBounds,
  parseDateInput
} from '../services/inventoryAnalyticsService';
import { InventoryItem, StockMovement } from '../types/inventory';
import { PurchaseOrder } from '../types/purchaseOrder';
import { Recipe, StockConsumption } from '../types/recipe';
import { hasPermission } from '../utils/permissions';

describe('M7-7E Inventory Analytics & Stock Intelligence Master Test Suite', () => {
  let analyticsService: InventoryAnalyticsService;

  beforeEach(() => {
    vi.clearAllMocks();
    analyticsService = new InventoryAnalyticsService();
  });

  // =========================================================================
  // 1. Date Bounds & Input Parsing
  // =========================================================================
  describe('1. Date Bounds & Input Parsing', () => {
    it('calculates accurate preset bounds for today, yesterday, thisWeek, thisMonth', () => {
      const today = getInventoryPresetBounds('today');
      expect(today.start.getHours()).toBe(0);
      expect(today.end.getHours()).toBe(23);
      expect(today.label).toBe('Today');

      const yesterday = getInventoryPresetBounds('yesterday');
      expect(yesterday.label).toBe('Yesterday');
      expect(yesterday.start.getTime()).toBeLessThan(today.start.getTime());

      const thisWeek = getInventoryPresetBounds('thisWeek');
      expect(thisWeek.label).toBe('This Week');
      expect(thisWeek.start.getDay()).toBe(1); // Monday

      const thisMonth = getInventoryPresetBounds('thisMonth');
      expect(thisMonth.label).toBe('This Month');
      expect(thisMonth.start.getDate()).toBe(1);
    });

    it('parses diverse date inputs robustly', () => {
      const dateObj = new Date('2026-09-10T12:00:00Z');
      expect(parseDateInput(dateObj).getTime()).toBe(dateObj.getTime());

      const isoStr = '2026-09-10T12:00:00Z';
      expect(parseDateInput(isoStr).toISOString()).toBe(new Date(isoStr).toISOString());

      const timestampMock = { toDate: () => dateObj };
      expect(parseDateInput(timestampMock).getTime()).toBe(dateObj.getTime());

      // Fallback on invalid/empty
      expect(parseDateInput(null)).toBeInstanceOf(Date);
      expect(parseDateInput('invalid-date')).toBeInstanceOf(Date);
    });
  });

  // =========================================================================
  // 2. Inventory Catalog Overview & Valuation
  // =========================================================================
  describe('2. Inventory Catalog Overview & Valuation', () => {
    it('computes inventory valuation and status counts with integer paise precision', () => {
      const items: InventoryItem[] = [
        {
          id: 'item_flour',
          restaurantId: 'rest_123',
          name: 'Flour',
          normalizedName: 'flour',
          unit: 'kg',
          currentQuantity: 25.5,
          minimumQuantity: 10,
          costPerUnitPaise: 4000, // ₹40.00/kg
          active: true,
          status: 'active',
          createdBy: 'user_1',
          updatedBy: 'user_1',
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 'item_sugar',
          restaurantId: 'rest_123',
          name: 'Sugar',
          normalizedName: 'sugar',
          unit: 'kg',
          currentQuantity: 4.0,
          minimumQuantity: 10, // Low stock
          costPerUnitPaise: 5000, // ₹50.00/kg
          active: true,
          status: 'active',
          createdBy: 'user_1',
          updatedBy: 'user_1',
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 'item_milk',
          restaurantId: 'rest_123',
          name: 'Milk',
          normalizedName: 'milk',
          unit: 'litre',
          currentQuantity: 0, // Out of stock
          minimumQuantity: 5,
          costPerUnitPaise: 6000, // ₹60.00/litre
          active: true,
          status: 'active',
          createdBy: 'user_1',
          updatedBy: 'user_1',
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 'item_boxes',
          restaurantId: 'rest_123',
          name: 'Takeout Boxes',
          normalizedName: 'takeout boxes',
          unit: 'piece',
          currentQuantity: 200,
          minimumQuantity: 50,
          costPerUnitPaise: 500, // ₹5.00/pc
          active: true,
          status: 'active',
          createdBy: 'user_1',
          updatedBy: 'user_1',
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 'item_archived',
          restaurantId: 'rest_123',
          name: 'Old Spices',
          normalizedName: 'old spices',
          unit: 'g',
          currentQuantity: 100,
          minimumQuantity: 50,
          costPerUnitPaise: 100,
          active: false,
          status: 'archived',
          createdBy: 'user_1',
          updatedBy: 'user_1',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      const overview = analyticsService.computeOverview(items);

      expect(overview.totalItems).toBe(5);
      expect(overview.activeItems).toBe(4);
      expect(overview.inactiveItems).toBe(1);
      expect(overview.healthyCount).toBe(2); // Flour, Boxes
      expect(overview.lowStockCount).toBe(1); // Sugar
      expect(overview.outOfStockCount).toBe(1); // Milk

      // Expected valuation:
      // Flour: 25.5 * 4000 = 102000 paise
      // Sugar: 4.0 * 5000 = 20000 paise
      // Milk: 0 * 6000 = 0 paise
      // Boxes: 200 * 500 = 100000 paise
      // Total = 102000 + 20000 + 0 + 100000 = 222000 paise (₹2,220.00)
      expect(overview.totalValuationPaise).toBe(222000);

      // Category breakdown
      const weightCat = overview.categoryDistribution.find(c => c.category === 'weight');
      const volumeCat = overview.categoryDistribution.find(c => c.category === 'volume');
      const countCat = overview.categoryDistribution.find(c => c.category === 'count');

      expect(weightCat?.count).toBe(2); // Flour, Sugar
      expect(weightCat?.valuationPaise).toBe(122000); // 102000 + 20000

      expect(volumeCat?.count).toBe(1); // Milk
      expect(volumeCat?.valuationPaise).toBe(0);

      expect(countCat?.count).toBe(1); // Boxes
      expect(countCat?.valuationPaise).toBe(100000);
    });
  });

  // =========================================================================
  // 3. Stock Movement & Wastage/Damage Loss Intelligence
  // =========================================================================
  describe('3. Stock Movement & Wastage/Damage Loss Intelligence', () => {
    it('aggregates movements by type and calculates itemized wastage/damage cost', () => {
      const itemMap = new Map<string, InventoryItem>([
        [
          'item_tomato',
          {
            id: 'item_tomato',
            restaurantId: 'rest_123',
            name: 'Fresh Tomatoes',
            normalizedName: 'fresh tomatoes',
            unit: 'kg',
            currentQuantity: 15,
            minimumQuantity: 5,
            costPerUnitPaise: 3000, // ₹30/kg
            active: true,
            status: 'active',
            createdBy: 'user_1',
            updatedBy: 'user_1',
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ],
        [
          'item_cheese',
          {
            id: 'item_cheese',
            restaurantId: 'rest_123',
            name: 'Mozzarella',
            normalizedName: 'mozzarella',
            unit: 'kg',
            currentQuantity: 8,
            minimumQuantity: 2,
            costPerUnitPaise: 45000, // ₹450/kg
            active: true,
            status: 'active',
            createdBy: 'user_1',
            updatedBy: 'user_1',
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ]
      ]);

      const movements: StockMovement[] = [
        {
          id: 'mov_1',
          movementId: 'mov_1',
          restaurantId: 'rest_123',
          inventoryItemId: 'item_tomato',
          type: 'opening',
          quantity: 20,
          unit: 'kg',
          delta: 20,
          previousQuantity: 0,
          resultingQuantity: 20,
          actorUid: 'user_1',
          createdAt: new Date()
        },
        {
          id: 'mov_2',
          movementId: 'mov_2',
          restaurantId: 'rest_123',
          inventoryItemId: 'item_tomato',
          type: 'stock_in',
          quantity: 10,
          unit: 'kg',
          delta: 10,
          previousQuantity: 20,
          resultingQuantity: 30,
          actorUid: 'user_1',
          createdAt: new Date()
        },
        {
          id: 'mov_3',
          movementId: 'mov_3',
          restaurantId: 'rest_123',
          inventoryItemId: 'item_tomato',
          type: 'wastage',
          quantity: 2.5,
          unit: 'kg',
          delta: -2.5,
          previousQuantity: 30,
          resultingQuantity: 27.5,
          reason: 'Spoiled / Overripe',
          actorUid: 'user_1',
          createdAt: new Date()
        },
        {
          id: 'mov_4',
          movementId: 'mov_4',
          restaurantId: 'rest_123',
          inventoryItemId: 'item_cheese',
          type: 'damage',
          quantity: 1.0,
          unit: 'kg',
          delta: -1.0,
          previousQuantity: 9,
          resultingQuantity: 8,
          reason: 'Broken cold seal',
          actorUid: 'user_1',
          createdAt: new Date()
        }
      ];

      const analytics = analyticsService.computeStockMovementAnalytics(movements, itemMap);

      expect(analytics.totalMovementsCount).toBe(4);
      expect(analytics.totalInflowQuantity).toBe(30); // 20 opening + 10 stock_in
      expect(analytics.totalInflowCostPaise).toBe(20 * 3000 + 10 * 3000); // 90000 paise

      expect(analytics.totalOutflowQuantity).toBe(3.5); // 2.5 wastage + 1.0 damage
      expect(analytics.totalOutflowCostPaise).toBe(2.5 * 3000 + 1.0 * 45000); // 7500 + 45000 = 52500 paise

      expect(analytics.netQuantityChange).toBe(26.5);
      expect(analytics.netCostChangePaise).toBe(90000 - 52500);

      // Wastage and damage specific
      expect(analytics.wastageDamage.totalWastageQuantity).toBe(2.5);
      expect(analytics.wastageDamage.totalWastageCostPaise).toBe(7500);
      expect(analytics.wastageDamage.totalDamageQuantity).toBe(1.0);
      expect(analytics.wastageDamage.totalDamageCostPaise).toBe(45000);
      expect(analytics.wastageDamage.totalLossCostPaise).toBe(52500);

      expect(analytics.wastageDamage.itemBreakdown).toHaveLength(2);
      // Cheese has higher loss (45000 > 7500), so it should rank first
      expect(analytics.wastageDamage.itemBreakdown[0].itemId).toBe('item_cheese');
      expect(analytics.wastageDamage.itemBreakdown[0].totalLossCostPaise).toBe(45000);
      expect(analytics.wastageDamage.itemBreakdown[0].reasons).toContain('Broken cold seal');
    });
  });

  // =========================================================================
  // 4. Stock Consumption & Recipe Performance Analytics
  // =========================================================================
  describe('4. Stock Consumption & Recipe Performance Analytics', () => {
    it('analyzes recipe consumption, top ingredients, dish costs, and reversals', () => {
      const itemMap = new Map<string, InventoryItem>([
        [
          'inv_coffee_beans',
          {
            id: 'inv_coffee_beans',
            restaurantId: 'rest_123',
            name: 'Arabica Coffee Beans',
            normalizedName: 'arabica coffee beans',
            unit: 'g',
            currentQuantity: 5000,
            minimumQuantity: 1000,
            costPerUnitPaise: 200, // ₹2.00 per gram
            active: true,
            status: 'active',
            createdBy: 'user_1',
            updatedBy: 'user_1',
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ],
        [
          'inv_milk',
          {
            id: 'inv_milk',
            restaurantId: 'rest_123',
            name: 'Whole Milk',
            normalizedName: 'whole milk',
            unit: 'ml',
            currentQuantity: 10000,
            minimumQuantity: 2000,
            costPerUnitPaise: 8, // ₹0.08 per ml (₹80/litre)
            active: true,
            status: 'active',
            createdBy: 'user_1',
            updatedBy: 'user_1',
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ]
      ]);

      const consumptions: StockConsumption[] = [
        {
          id: 'c_1',
          consumptionId: 'c_1',
          restaurantId: 'rest_123',
          orderId: 'order_1',
          orderItemId: 'item_cappuccino_1',
          menuItemId: 'menu_cappuccino',
          menuItemNameSnapshot: 'Cappuccino',
          recipeId: 'rec_cappuccino',
          recipeVersion: 1,
          recipeQuantity: 20,
          recipeUnit: 'g',
          delta: -20,
          stockMovementId: 'mov_c1',
          actorUid: 'user_1',
          inventoryItemId: 'inv_coffee_beans',
          inventoryItemNameSnapshot: 'Arabica Coffee Beans',
          quantity: 20, // 20g
          unit: 'g',
          orderItemQuantity: 1,
          status: 'consumed',
          createdAt: new Date()
        },
        {
          id: 'c_2',
          consumptionId: 'c_2',
          restaurantId: 'rest_123',
          orderId: 'order_1',
          orderItemId: 'item_cappuccino_1',
          menuItemId: 'menu_cappuccino',
          menuItemNameSnapshot: 'Cappuccino',
          recipeId: 'rec_cappuccino',
          recipeVersion: 1,
          recipeQuantity: 150,
          recipeUnit: 'ml',
          delta: -150,
          stockMovementId: 'mov_c2',
          actorUid: 'user_1',
          inventoryItemId: 'inv_milk',
          inventoryItemNameSnapshot: 'Whole Milk',
          quantity: 150, // 150ml
          unit: 'ml',
          orderItemQuantity: 1,
          status: 'consumed',
          createdAt: new Date()
        },
        {
          id: 'c_3',
          consumptionId: 'c_3',
          restaurantId: 'rest_123',
          orderId: 'order_2',
          orderItemId: 'item_cappuccino_2',
          menuItemId: 'menu_cappuccino',
          menuItemNameSnapshot: 'Cappuccino',
          recipeId: 'rec_cappuccino',
          recipeVersion: 1,
          recipeQuantity: 20,
          recipeUnit: 'g',
          delta: -20,
          stockMovementId: 'mov_c3',
          actorUid: 'user_1',
          inventoryItemId: 'inv_coffee_beans',
          quantity: 20, // 20g
          unit: 'g',
          orderItemQuantity: 1,
          status: 'reversed', // Order cancelled
          reversalReason: 'Order cancelled by customer',
          createdAt: new Date()
        }
      ];

      const recipes: Recipe[] = [];

      const analytics = analyticsService.computeConsumptionAnalytics(consumptions, itemMap, recipes);

      expect(analytics.totalConsumptionsCount).toBe(3);
      expect(analytics.totalActiveConsumptions).toBe(2);
      expect(analytics.totalReversedConsumptions).toBe(1);

      // Active costs:
      // Coffee: 20g * 200 = 4000 paise (₹40)
      // Milk: 150ml * 8 = 1200 paise (₹12)
      // Active Total = 5200 paise
      // Reversed Coffee = 20g * 200 = 4000 paise
      expect(analytics.totalConsumedCostPaise).toBe(5200);
      expect(analytics.totalReversedCostPaise).toBe(4000);
      expect(analytics.netConsumptionCostPaise).toBe(1200);
      expect(analytics.reversalRatePercent).toBe(33); // 1 / 3 = 33%

      // Top consumed items
      expect(analytics.topConsumedItems).toHaveLength(2);
      expect(analytics.topConsumedItems[0].inventoryItemId).toBe('inv_coffee_beans');
      expect(analytics.topConsumedItems[0].totalQuantityConsumed).toBe(20);
      expect(analytics.topConsumedItems[0].estimatedCostPaise).toBe(4000);

      // Top dishes
      expect(analytics.topDishes).toHaveLength(1);
      expect(analytics.topDishes[0].menuItemId).toBe('menu_cappuccino');
      expect(analytics.topDishes[0].totalPortionsPrepared).toBe(1);
      expect(analytics.topDishes[0].estimatedTotalIngredientCostPaise).toBe(5200);
      expect(analytics.topDishes[0].averageCostPerPortionPaise).toBe(5200);
    });
  });

  // =========================================================================
  // 5. Supplier Procurement & Purchase Order Analytics
  // =========================================================================
  describe('5. Supplier Procurement & Purchase Order Analytics', () => {
    it('aggregates purchase order spend and fulfillment metrics', () => {
      const purchases: PurchaseOrder[] = [
        {
          purchaseOrderId: 'po_1',
          restaurantId: 'rest_123',
          orderNumber: 'PO-001',
          supplierId: 'sup_dairy',
          supplierSnapshot: { supplierId: 'sup_dairy', name: 'Metro Dairy Farm', phone: '9876543210' },
          status: 'received',
          orderDate: '2026-09-01',
          currency: 'INR',
          subtotalMinor: 100000,
          taxMinor: 5000,
          grandTotalMinor: 105000, // ₹1,050.00
          items: [
            {
              id: 'poi_1',
              inventoryItemId: 'inv_milk',
              itemNameSnapshot: 'Milk',
              unit: 'litre',
              unitPriceMinor: 6000,
              quantityOrdered: 20,
              receivedQuantity: 20,
              remainingQuantity: 0,
              lineTotalMinor: 120000
            }
          ],
          createdBy: 'user_1',
          updatedBy: 'user_1',
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          purchaseOrderId: 'po_2',
          restaurantId: 'rest_123',
          orderNumber: 'PO-002',
          supplierId: 'sup_grains',
          supplierSnapshot: { supplierId: 'sup_grains', name: 'Sunrise Grains Ltd', phone: '9876543211' },
          status: 'partiallyReceived',
          orderDate: '2026-09-05',
          currency: 'INR',
          subtotalMinor: 200000,
          taxMinor: 10000,
          grandTotalMinor: 210000, // ₹2,100.00
          items: [
            {
              id: 'poi_2',
              inventoryItemId: 'inv_flour',
              itemNameSnapshot: 'Flour',
              unit: 'kg',
              unitPriceMinor: 4000,
              quantityOrdered: 50,
              receivedQuantity: 30,
              remainingQuantity: 20,
              lineTotalMinor: 200000
            }
          ],
          createdBy: 'user_1',
          updatedBy: 'user_1',
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          purchaseOrderId: 'po_3',
          restaurantId: 'rest_123',
          orderNumber: 'PO-003',
          supplierId: 'sup_dairy',
          supplierSnapshot: { supplierId: 'sup_dairy', name: 'Metro Dairy Farm', phone: '9876543210' },
          status: 'cancelled',
          orderDate: '2026-09-08',
          currency: 'INR',
          subtotalMinor: 50000,
          taxMinor: 0,
          grandTotalMinor: 50000,
          items: [],
          createdBy: 'user_1',
          updatedBy: 'user_1',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      const analytics = analyticsService.computePurchaseAnalytics(purchases);

      expect(analytics.totalPurchaseOrders).toBe(3);
      // Cancelled PO (po_3) is excluded from total spend
      expect(analytics.totalSpendPaise).toBe(105000 + 210000); // 315000 paise (₹3,150.00)

      expect(analytics.statusCounts.received).toBe(1);
      expect(analytics.statusCounts.partiallyReceived).toBe(1);
      expect(analytics.statusCounts.cancelled).toBe(1);

      // Fulfillment
      expect(analytics.fulfillment.totalOrderedQuantity).toBe(70); // 20 + 50
      expect(analytics.fulfillment.totalReceivedQuantity).toBe(50); // 20 + 30
      expect(analytics.fulfillment.fulfillmentRatePercent).toBe(71); // 50 / 70 = 71%
      expect(analytics.fulfillment.pendingOrdersCount).toBe(1); // partiallyReceived

      // Supplier breakdown
      expect(analytics.supplierBreakdown).toHaveLength(2);
      expect(analytics.supplierBreakdown[0].supplierId).toBe('sup_grains');
      expect(analytics.supplierBreakdown[0].totalSpendPaise).toBe(210000);
      expect(analytics.supplierBreakdown[0].fulfillmentRatePercent).toBe(60); // 30 / 50 = 60%
    });
  });

  // =========================================================================
  // 6. Stock Health & Smart Reorder Insights
  // =========================================================================
  describe('6. Stock Health & Smart Reorder Insights', () => {
    it('generates prioritized reorder recommendations with accurate deficit costing', () => {
      const items: InventoryItem[] = [
        {
          id: 'item_oil',
          restaurantId: 'rest_123',
          name: 'Cooking Oil',
          normalizedName: 'cooking oil',
          unit: 'litre',
          currentQuantity: 0, // Critical Out of stock
          minimumQuantity: 15,
          reorderQuantity: 30,
          costPerUnitPaise: 15000, // ₹150.00/litre
          active: true,
          status: 'active',
          createdBy: 'user_1',
          updatedBy: 'user_1',
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 'item_butter',
          restaurantId: 'rest_123',
          name: 'Butter',
          normalizedName: 'butter',
          unit: 'kg',
          currentQuantity: 2, // Low stock (min: 5)
          minimumQuantity: 5,
          reorderQuantity: 10,
          costPerUnitPaise: 40000, // ₹400.00/kg
          active: true,
          status: 'active',
          createdBy: 'user_1',
          updatedBy: 'user_1',
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 'item_rice',
          restaurantId: 'rest_123',
          name: 'Basmati Rice',
          normalizedName: 'basmati rice',
          unit: 'kg',
          currentQuantity: 50, // Healthy (min: 20)
          minimumQuantity: 20,
          costPerUnitPaise: 8000,
          active: true,
          status: 'active',
          createdBy: 'user_1',
          updatedBy: 'user_1',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      const health = analyticsService.computeStockHealth(items);

      expect(health.healthyCount).toBe(1);
      expect(health.lowStockCount).toBe(1);
      expect(health.outOfStockCount).toBe(1);
      expect(health.stockHealthScorePercent).toBe(33); // 1 / 3 = 33%

      expect(health.recommendations).toHaveLength(2);

      // Critical recommendation (Oil) ranked first
      expect(health.recommendations[0].inventoryItemId).toBe('item_oil');
      expect(health.recommendations[0].urgency).toBe('critical');
      expect(health.recommendations[0].suggestedQuantity).toBe(30);
      expect(health.recommendations[0].estimatedCostPaise).toBe(30 * 15000); // 450000 paise (₹4,500.00)

      // Low stock recommendation (Butter)
      expect(health.recommendations[1].inventoryItemId).toBe('item_butter');
      expect(health.recommendations[1].urgency).toBe('low');
      expect(health.recommendations[1].suggestedQuantity).toBe(10);
      expect(health.recommendations[1].estimatedCostPaise).toBe(10 * 40000); // 400000 paise (₹4,000.00)
    });
  });

  // =========================================================================
  // 7. Role-Based Access Control (RBAC) & Tenant Isolation
  // =========================================================================
  describe('7. Role-Based Access Control (RBAC) & Tenant Isolation', () => {
    it('authorizes owner, manager, and accountant to view inventory analytics', () => {
      expect(hasPermission('owner', 'view_inventory')).toBe(true);
      expect(hasPermission('manager', 'view_inventory')).toBe(true);
      expect(hasPermission('accountant', 'view_inventory')).toBe(true);
    });

    it('rejects unprivileged staff roles from inventory analytics', () => {
      expect(hasPermission('cashier', 'view_inventory')).toBe(false);
      expect(hasPermission('captain', 'view_inventory')).toBe(false);
      expect(hasPermission('kitchen', 'view_inventory')).toBe(false);
    });

    it('requires non-empty restaurantId for analytics query', async () => {
      await expect(analyticsService.fetchInventoryAnalytics('')).rejects.toThrow(
        /restaurantId is required/
      );
      await expect(analyticsService.fetchInventoryAnalytics('   ')).rejects.toThrow(
        /restaurantId is required/
      );
    });
  });
});
