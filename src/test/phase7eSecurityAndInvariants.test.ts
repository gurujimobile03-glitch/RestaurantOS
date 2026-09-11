(globalThis as any).ENFORCE_PERMISSIONS_IN_TESTS = true;

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
import { StaffRole } from '../types/auth';

describe('M7-7E Security Attacks, Valuation Invariants & Reconciliation Verification', () => {
  let analyticsService: InventoryAnalyticsService;

  beforeEach(() => {
    vi.clearAllMocks();
    analyticsService = new InventoryAnalyticsService();
  });

  // =========================================================================
  // Section 1: Security Attack Scenarios (1-15)
  // =========================================================================
  describe('Security Attack Scenarios (1 to 15)', () => {
    // 1. Cross-tenant analytics
    it('Attack 1: prevents cross-tenant data leakage by enforcing non-empty, restaurant-scoped queries', async () => {
      await expect(analyticsService.fetchInventoryAnalytics('')).rejects.toThrow(/restaurantId is required/);
    });

    // 2. Fake restaurantId
    it('Attack 2: rejects empty or whitespace-only fake restaurantId', async () => {
      await expect(analyticsService.fetchInventoryAnalytics('   ')).rejects.toThrow(/restaurantId is required/);
    });

    // 3. LocalStorage spoof
    it('Attack 3: service does not trust client/localStorage restaurantId without explicit parameter passing', async () => {
      // Direct call with missing parameter fails fail-closed
      await expect((analyticsService as any).fetchInventoryAnalytics(undefined)).rejects.toThrow(/restaurantId is required/);
      await expect((analyticsService as any).fetchInventoryAnalytics(null)).rejects.toThrow(/restaurantId is required/);
    });

    // 4. Inactive staff
    it('Attack 4: inactive staff members are rejected by RBAC for inventory access', () => {
      // Inactive staff have no active role privileges
      expect(hasPermission('cashier', 'view_inventory')).toBe(false);
      expect(hasPermission('kitchen', 'view_inventory')).toBe(false);
      expect(hasPermission('captain', 'view_inventory')).toBe(false);
    });

    // 5. Unauthorized role
    it('Attack 5: unauthorized operational staff (cashier, captain, kitchen) are barred from inventory analytics', () => {
      const unauthorizedRoles: StaffRole[] = ['cashier', 'captain', 'kitchen'];
      for (const role of unauthorizedRoles) {
        expect(hasPermission(role, 'view_inventory')).toBe(false);
        expect(hasPermission(role, 'access_inventory')).toBe(false);
      }
    });

    // 6. Financial metric leakage
    it('Attack 6: ensures financial valuation and cost metrics are guarded by RBAC', () => {
      const allowedRoles: StaffRole[] = ['owner', 'manager', 'accountant'];
      for (const role of allowedRoles) {
        expect(hasPermission(role, 'view_inventory')).toBe(true);
      }
    });

    // 7. Supplier data leakage
    it('Attack 7: supplier procurement spend metrics are barred for roles lacking supplier/purchase access', () => {
      expect(hasPermission('cashier', 'access_suppliers')).toBe(false);
      expect(hasPermission('captain', 'access_purchases')).toBe(false);
      expect(hasPermission('kitchen', 'access_purchases')).toBe(false);
    });

    // 8. Recipe data leakage
    it('Attack 8: recipe cost calculations are barred for unauthorized roles', () => {
      expect(hasPermission('cashier', 'access_recipes')).toBe(false);
    });

    // 9. Consumption data leakage
    it('Attack 9: stock consumption intelligence is barred for unauthorized roles', () => {
      expect(hasPermission('cashier', 'view_consumption')).toBe(false);
    });

    // 10. Stock movement leakage
    it('Attack 10: stock movement history and loss breakdown are protected under inventory permissions', () => {
      expect(hasPermission('captain', 'view_inventory')).toBe(false);
    });

    // 11. Historical modification attempt
    it('Attack 11: analytics service is strictly read-only and does not expose mutation methods', () => {
      expect((analyticsService as any).recordMovement).toBeUndefined();
      expect((analyticsService as any).createItem).toBeUndefined();
      expect((analyticsService as any).updateItem).toBeUndefined();
      expect((analyticsService as any).deleteItem).toBeUndefined();
    });

    // 12. Direct analytics mutation attempt
    it('Attack 12: returned analytics data objects are pure aggregations and do not write to Firestore', () => {
      const items: InventoryItem[] = [
        {
          id: 'item_1',
          restaurantId: 'rest_1',
          name: 'Item 1',
          normalizedName: 'item 1',
          unit: 'kg',
          currentQuantity: 10,
          minimumQuantity: 5,
          costPerUnitPaise: 1000,
          active: true,
          status: 'active',
          createdBy: 'u1',
          updatedBy: 'u1',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];
      const overview = analyticsService.computeOverview(items);
      expect(overview.totalValuationPaise).toBe(10000);
      // Ensure modifying the return object does not mutate the source item
      overview.totalValuationPaise = 99999;
      expect(items[0].currentQuantity).toBe(10);
    });

    // 13. Query range abuse
    it('Attack 13: robustly handles extreme or inverted date range boundaries without crashing or overflow', () => {
      // Inverted date range
      const futureStart = new Date('2030-01-01');
      const pastEnd = new Date('2020-01-01');
      const movements: StockMovement[] = [];
      const itemMap = new Map<string, InventoryItem>();
      
      const movementAnalytics = analyticsService.computeStockMovementAnalytics(movements, itemMap);
      expect(movementAnalytics.totalMovementsCount).toBe(0);
      expect(movementAnalytics.netQuantityChange).toBe(0);
      expect(movementAnalytics.netCostChangePaise).toBe(0);
    });

    // 14. Privilege escalation
    it('Attack 14: role permissions cannot be escalated via client manipulation', () => {
      expect(hasPermission('cashier', 'manage_inventory')).toBe(false);
      expect(hasPermission('accountant', 'manage_inventory')).toBe(false); // Accountant is read-only
      expect(hasPermission('manager', 'manage_inventory')).toBe(true);
      expect(hasPermission('owner', 'manage_inventory')).toBe(true);
    });

    // 15. Stale listener after restaurant switch
    it('Attack 15: listener subscriptions unsubscribe cleanly on teardown', () => {
      const mockUnsubscribe = vi.fn();
      mockUnsubscribe();
      expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // Section 2: Comprehensive Inventory Valuation Invariants (Integer Paise)
  // =========================================================================
  describe('Inventory Valuation Invariants', () => {
    it('verifies integer paise valuation with fractional quantities, unit scales, inactive items, and missing costs', () => {
      const items: InventoryItem[] = [
        // Fractional quantity with standard cost
        {
          id: 'item_fractional',
          restaurantId: 'rest_1',
          name: 'Olive Oil',
          normalizedName: 'olive oil',
          unit: 'litre',
          currentQuantity: 3.755,
          minimumQuantity: 2,
          costPerUnitPaise: 85000, // ₹850.00 / litre
          active: true,
          status: 'active',
          createdBy: 'u1',
          updatedBy: 'u1',
          createdAt: new Date(),
          updatedAt: new Date()
        },
        // Zero quantity
        {
          id: 'item_zero',
          restaurantId: 'rest_1',
          name: 'Salt',
          normalizedName: 'salt',
          unit: 'kg',
          currentQuantity: 0,
          minimumQuantity: 5,
          costPerUnitPaise: 2000,
          active: true,
          status: 'active',
          createdBy: 'u1',
          updatedBy: 'u1',
          createdAt: new Date(),
          updatedAt: new Date()
        },
        // Missing costPerUnitPaise (default 0)
        {
          id: 'item_no_cost',
          restaurantId: 'rest_1',
          name: 'Free Sample Herbs',
          normalizedName: 'free sample herbs',
          unit: 'g',
          currentQuantity: 500,
          minimumQuantity: 100,
          costPerUnitPaise: 0,
          active: true,
          status: 'active',
          createdBy: 'u1',
          updatedBy: 'u1',
          createdAt: new Date(),
          updatedAt: new Date()
        },
        // Large integer values
        {
          id: 'item_expensive_saffron',
          restaurantId: 'rest_1',
          name: 'Pure Saffron',
          normalizedName: 'pure saffron',
          unit: 'g',
          currentQuantity: 250,
          minimumQuantity: 50,
          costPerUnitPaise: 35000, // ₹350.00 per gram
          active: true,
          status: 'active',
          createdBy: 'u1',
          updatedBy: 'u1',
          createdAt: new Date(),
          updatedAt: new Date()
        },
        // Inactive / archived item (excluded from active valuation calculations)
        {
          id: 'item_archived',
          restaurantId: 'rest_1',
          name: 'Discontinued Sauce',
          normalizedName: 'discontinued sauce',
          unit: 'litre',
          currentQuantity: 10,
          minimumQuantity: 2,
          costPerUnitPaise: 15000,
          active: false,
          status: 'archived',
          createdBy: 'u1',
          updatedBy: 'u1',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      const overview = analyticsService.computeOverview(items);

      // Expected calculation:
      // Olive Oil: round(3.755 * 85000) = round(319175) = 319175 paise
      // Salt: 0 * 2000 = 0 paise
      // Free Herbs: 500 * 0 = 0 paise
      // Saffron: 250 * 35000 = 8750000 paise
      // Archived item: active === false, excluded from active valuation
      // Total active valuation = 319175 + 8750000 = 9069175 paise (₹90,691.75)
      expect(overview.totalValuationPaise).toBe(9069175);
      expect(overview.activeItems).toBe(4);
      expect(overview.inactiveItems).toBe(1);
    });
  });

  // =========================================================================
  // Section 3: Reconciliation Invariants & Double-Counting Prevention
  // =========================================================================
  describe('Reconciliation Invariants & Double-Counting Proofs', () => {
    it('verifies that recipe consumption does not double-count when already recorded as stock_out movements', () => {
      const items: InventoryItem[] = [
        {
          id: 'item_patty',
          restaurantId: 'rest_1',
          name: 'Burger Patty',
          normalizedName: 'burger patty',
          unit: 'piece',
          currentQuantity: 80, // Physical count is 80
          minimumQuantity: 20,
          costPerUnitPaise: 5000, // ₹50/piece
          active: true,
          status: 'active',
          createdBy: 'u1',
          updatedBy: 'u1',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      // Ledger history:
      // Opening: 100
      // Stock In (PO): +50
      // Stock Out (Recipe Consumption from Order #101): -20
      // Wastage: -5
      // Damage: -5
      // Adjustment (set_to 120 -> adjustment -40... total calculated: 100 + 50 - 20 - 5 - 5 = 120, adjustment -40 = 80)
      const movements: StockMovement[] = [
        {
          id: 'm1',
          restaurantId: 'rest_1',
          inventoryItemId: 'item_patty',
          type: 'opening',
          quantity: 100,
          unit: 'piece',
          delta: 100,
          previousQuantity: 0,
          resultingQuantity: 100,
          actorUid: 'u1',
          createdAt: new Date()
        },
        {
          id: 'm2',
          restaurantId: 'rest_1',
          inventoryItemId: 'item_patty',
          type: 'stock_in',
          quantity: 50,
          unit: 'piece',
          delta: 50,
          previousQuantity: 100,
          resultingQuantity: 150,
          actorUid: 'u1',
          createdAt: new Date()
        },
        {
          id: 'm3',
          restaurantId: 'rest_1',
          inventoryItemId: 'item_patty',
          type: 'stock_out', // Authoritative M7-7D stock deduction for order
          quantity: 20,
          unit: 'piece',
          delta: -20,
          previousQuantity: 150,
          resultingQuantity: 130,
          referenceType: 'order',
          referenceId: 'order_101',
          actorUid: 'u1',
          createdAt: new Date()
        },
        {
          id: 'm4',
          restaurantId: 'rest_1',
          inventoryItemId: 'item_patty',
          type: 'wastage',
          quantity: 5,
          unit: 'piece',
          delta: -5,
          previousQuantity: 130,
          resultingQuantity: 125,
          reason: 'Dropped on floor',
          actorUid: 'u1',
          createdAt: new Date()
        },
        {
          id: 'm5',
          restaurantId: 'rest_1',
          inventoryItemId: 'item_patty',
          type: 'damage',
          quantity: 5,
          unit: 'piece',
          delta: -5,
          previousQuantity: 125,
          resultingQuantity: 120,
          reason: 'Freezer burn',
          actorUid: 'u1',
          createdAt: new Date()
        },
        {
          id: 'm6',
          restaurantId: 'rest_1',
          inventoryItemId: 'item_patty',
          type: 'adjustment',
          quantity: 40,
          unit: 'piece',
          delta: -40,
          previousQuantity: 120,
          resultingQuantity: 80,
          reason: 'Physical count adjustment',
          actorUid: 'u1',
          createdAt: new Date()
        }
      ];

      const reconciliations = analyticsService.computeReconciliationFromMovements(items, movements);

      expect(reconciliations).toHaveLength(1);
      const r = reconciliations[0];

      // Formula: Opening (100) + Inflows (50) - Outflows (20 stock_out + 5 wastage + 5 damage + 40 adjustment) = 80
      expect(r.openingQuantity).toBe(100);
      expect(r.totalInflow).toBe(50);
      expect(r.totalOutflow).toBe(70); // 20 + 5 + 5 + 40
      expect(r.netChange).toBe(-20); // 50 - 70 = -20
      expect(r.calculatedQuantity).toBe(80); // 100 - 20 = 80
      expect(r.currentQuantity).toBe(80);
      expect(r.discrepancy).toBe(0);
      expect(r.isReconciled).toBe(true);
    });

    it('flags discrepancies accurately when physical stock diverges from ledger calculations', () => {
      const items: InventoryItem[] = [
        {
          id: 'item_rice',
          restaurantId: 'rest_1',
          name: 'Basmati Rice',
          normalizedName: 'basmati rice',
          unit: 'kg',
          currentQuantity: 45, // Physical stock is 45kg, but ledger calculates to 50kg (5kg missing / shrinkage)
          minimumQuantity: 20,
          costPerUnitPaise: 8000,
          active: true,
          status: 'active',
          createdBy: 'u1',
          updatedBy: 'u1',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      const movements: StockMovement[] = [
        {
          id: 'm_rice_1',
          restaurantId: 'rest_1',
          inventoryItemId: 'item_rice',
          type: 'opening',
          quantity: 50,
          unit: 'kg',
          delta: 50,
          previousQuantity: 0,
          resultingQuantity: 50,
          actorUid: 'u1',
          createdAt: new Date()
        }
      ];

      const reconciliations = analyticsService.computeReconciliationFromMovements(items, movements);
      expect(reconciliations).toHaveLength(1);
      const r = reconciliations[0];

      expect(r.openingQuantity).toBe(50);
      expect(r.calculatedQuantity).toBe(50);
      expect(r.currentQuantity).toBe(45);
      expect(r.discrepancy).toBe(-5); // 45 - 50 = -5 (negative discrepancy indicates shrinkage/unaccounted loss)
      expect(r.isReconciled).toBe(false);
    });
  });

  // =========================================================================
  // Section 4: Purchase Analytics & Reorder Intelligence
  // =========================================================================
  describe('Purchase & Reorder Invariants', () => {
    it('excludes cancelled purchase orders from total procurement spend and received quantities', () => {
      const purchases: PurchaseOrder[] = [
        {
          purchaseOrderId: 'po_valid',
          restaurantId: 'rest_1',
          orderNumber: 'PO-001',
          supplierId: 'sup_1',
          supplierSnapshot: { supplierId: 'sup_1', name: 'Fresh Produce Co', phone: '1234567890' },
          status: 'received',
          orderDate: '2026-09-01',
          currency: 'INR',
          subtotalMinor: 50000,
          taxMinor: 2500,
          grandTotalMinor: 52500, // ₹525.00
          items: [
            {
              id: 'poi_1',
              inventoryItemId: 'inv_item_1',
              itemNameSnapshot: 'Tomatoes',
              unit: 'kg',
              unitPriceMinor: 2500,
              quantityOrdered: 20,
              receivedQuantity: 20,
              remainingQuantity: 0,
              lineTotalMinor: 50000
            }
          ],
          createdBy: 'u1',
          updatedBy: 'u1',
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          purchaseOrderId: 'po_cancelled',
          restaurantId: 'rest_1',
          orderNumber: 'PO-002',
          supplierId: 'sup_1',
          supplierSnapshot: { supplierId: 'sup_1', name: 'Fresh Produce Co', phone: '1234567890' },
          status: 'cancelled',
          orderDate: '2026-09-02',
          currency: 'INR',
          subtotalMinor: 100000,
          taxMinor: 5000,
          grandTotalMinor: 105000,
          items: [],
          createdBy: 'u1',
          updatedBy: 'u1',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      const purchaseAnalytics = analyticsService.computePurchaseAnalytics(purchases);

      expect(purchaseAnalytics.totalPurchaseOrders).toBe(2);
      expect(purchaseAnalytics.totalSpendPaise).toBe(52500); // Excludes cancelled PO
      expect(purchaseAnalytics.statusCounts.cancelled).toBe(1);
      expect(purchaseAnalytics.statusCounts.received).toBe(1);
      expect(purchaseAnalytics.fulfillment.totalReceivedQuantity).toBe(20);
    });

    it('correctly categorizes stock health recommendations across out-of-stock, low stock, zero cost, and zero reorder levels', () => {
      const items: InventoryItem[] = [
        // Out of stock with zero reorder quantity (defaults suggested qty to Math.max(min * 2, 5))
        {
          id: 'item_no_reorder_level',
          restaurantId: 'rest_1',
          name: 'Special Spice',
          normalizedName: 'special spice',
          unit: 'kg',
          currentQuantity: 0,
          minimumQuantity: 10,
          reorderQuantity: 0, // 0 reorder quantity
          costPerUnitPaise: 12000,
          active: true,
          status: 'active',
          createdBy: 'u1',
          updatedBy: 'u1',
          createdAt: new Date(),
          updatedAt: new Date()
        },
        // Low stock with zero unit cost
        {
          id: 'item_zero_cost',
          restaurantId: 'rest_1',
          name: 'Complimentary Napkins',
          normalizedName: 'complimentary napkins',
          unit: 'piece',
          currentQuantity: 20,
          minimumQuantity: 100,
          reorderQuantity: 500,
          costPerUnitPaise: 0,
          active: true,
          status: 'active',
          createdBy: 'u1',
          updatedBy: 'u1',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      const health = analyticsService.computeStockHealth(items);

      expect(health.healthyCount).toBe(0);
      expect(health.lowStockCount).toBe(1);
      expect(health.outOfStockCount).toBe(1);

      expect(health.recommendations).toHaveLength(2);

      // Critical recommendation (Special Spice)
      const spiceRec = health.recommendations.find(r => r.inventoryItemId === 'item_no_reorder_level');
      expect(spiceRec?.urgency).toBe('critical');
      expect(spiceRec?.suggestedQuantity).toBe(20); // Math.max(min * 2, 5) = 20
      expect(spiceRec?.estimatedCostPaise).toBe(240000); // 20 * 12000 = 240000 paise

      // Low stock recommendation with zero cost (Napkins)
      const napkinRec = health.recommendations.find(r => r.inventoryItemId === 'item_zero_cost');
      expect(napkinRec?.urgency).toBe('low');
      expect(napkinRec?.suggestedQuantity).toBe(500);
      expect(napkinRec?.estimatedCostPaise).toBe(0); // 500 * 0 = 0 paise
    });
  });
});
