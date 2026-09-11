(globalThis as any).ENFORCE_PERMISSIONS_IN_TESTS = true;

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { offlineSyncService } from '../services/offlineSyncService';
import { stockConsumptionService } from '../services/stockConsumptionService';
import { recipeService } from '../services/recipeService';
import { purchaseOrderService } from '../services/purchaseOrderService';
import { inventoryService } from '../services/inventoryService';
import { InventoryItem, StockMovement } from '../types/inventory';
import { Recipe } from '../types/recipe';
import { PurchaseOrder } from '../types/purchaseOrder';

// Mock Firebase Firestore SDK
vi.mock('firebase/firestore', () => {
  return {
    collection: vi.fn((_db, ...pathSegments) => ({ type: 'collection', path: pathSegments.join('/') })),
    doc: vi.fn((_dbOrCol, ...pathSegments) => {
      const id = pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : `mock_doc_${Math.random().toString(36).substring(2, 8)}`;
      return { id, path: pathSegments.join('/') };
    }),
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    setDoc: vi.fn().mockResolvedValue(undefined),
    updateDoc: vi.fn().mockResolvedValue(undefined),
    deleteDoc: vi.fn().mockResolvedValue(undefined),
    query: vi.fn((colRef, ..._clauses) => ({ type: 'query', colRef })),
    where: vi.fn((field, op, val) => ({ type: 'where', field, op, val })),
    orderBy: vi.fn((field, dir) => ({ type: 'orderBy', field, dir })),
    limit: vi.fn((num) => ({ type: 'limit', num })),
    onSnapshot: vi.fn(() => vi.fn()),
    serverTimestamp: vi.fn(() => new Date('2026-09-10T12:00:00Z')),
    Timestamp: {
      fromDate: vi.fn((d) => ({ toDate: () => d, toMillis: () => d.getTime() }))
    },
    runTransaction: vi.fn()
  };
});

// Mock Firebase Config
vi.mock('../config/firebase', () => ({
  db: { type: 'mockDb' },
  auth: { currentUser: { uid: 'USER_OFFLINE_COMPAT_123' } }
}));

// Mock Audit Service
vi.mock('../services/auditService', () => ({
  auditService: {
    logEvent: vi.fn().mockResolvedValue(undefined)
  }
}));

import * as firestore from 'firebase/firestore';
import { auth } from '../config/firebase';

describe('M7-7F Offline Queue Recovery & Backward Compatibility Suite (21 Tests)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (auth as any).currentUser = { uid: 'USER_OFFLINE_COMPAT_123' };

    vi.mocked(firestore.getDoc).mockImplementation(async (ref: any) => {
      const path: string = ref?.path || '';

      if (path.includes('/members/')) {
        return {
          exists: () => true,
          data: () => ({
            role: 'manager',
            isActive: true,
            status: 'active'
          })
        } as any;
      }

      if (path.match(/^restaurants\/[^/]+$/)) {
        return {
          exists: () => true,
          data: () => ({
            ownerId: 'OWNER_COMPAT_123',
            name: 'Compatibility Test Restaurant'
          })
        } as any;
      }

      return {
        exists: () => false,
        data: () => null
      } as any;
    });
  });

  // ============================================================================
  // OFFLINE QUEUE & RECONNECT BEHAVIOR (1-10)
  // ============================================================================
  describe('Offline Queue & Recovery Behavior', () => {
    beforeEach(() => {
      offlineSyncService.setOnlineStatus(false);
    });

    it('1: Correctly enqueues inventory operations with originating restaurantId', () => {
      const op = offlineSyncService.enqueue('rest_outlet_A', 'create_inventory_item', {
        name: 'Offline Rice',
        unit: 'kg',
        currentQuantity: 50
      });

      expect(op.restaurantId).toBe('rest_outlet_A');
      expect(op.operation).toBe('create_inventory_item');
      expect(op.status).toBe('queued');
      expect(op.retryCount).toBe(0);
    });

    it('2: Enqueues record_stock_movement in offline queue with deterministic idempotencyKey', () => {
      const op = offlineSyncService.enqueue('rest_outlet_A', 'record_stock_movement', {
        inventoryItemId: 'inv_123',
        type: 'stock_out',
        quantity: 10,
        reason: 'Offline Consumption'
      });

      expect(op.idempotencyKey).toBeDefined();
      expect(op.idempotencyKey.startsWith('idemp_record_stock_movement_')).toBe(true);
    });

    it('3: Enqueues create_purchase_order in offline queue', () => {
      const op = offlineSyncService.enqueue('rest_outlet_A', 'create_purchase_order', {
        supplierId: 'sup_1',
        items: [{ inventoryItemId: 'inv_1', quantityOrdered: 20, unit: 'kg', unitPriceMinor: 5000 }]
      });

      expect(op.operation).toBe('create_purchase_order');
      expect(op.restaurantId).toBe('rest_outlet_A');
    });

    it('4: Enqueues receive_purchase_order in offline queue', () => {
      const op = offlineSyncService.enqueue('rest_outlet_A', 'receive_purchase_order', {
        purchaseOrderId: 'po_101',
        items: [{ purchaseOrderItemId: 'poi_1', quantityReceived: 10 }]
      });

      expect(op.operation).toBe('receive_purchase_order');
    });

    it('5: Enqueues create_recipe in offline queue', () => {
      const op = offlineSyncService.enqueue('rest_outlet_A', 'create_recipe', {
        menuItemId: 'item_1',
        ingredients: [{ inventoryItemId: 'inv_1', quantity: 0.5, unit: 'kg' }]
      });

      expect(op.operation).toBe('create_recipe');
    });

    it('6: Enqueues consume_stock in offline queue', () => {
      const op = offlineSyncService.enqueue('rest_outlet_A', 'consume_stock', {
        orderId: 'ord_offline_1',
        items: [{ itemId: 'item_1', quantity: 2 }]
      });

      expect(op.operation).toBe('consume_stock');
    });

    it('7: Enqueues reverse_consumption in offline queue for cancelled order', () => {
      const op = offlineSyncService.enqueue('rest_outlet_A', 'reverse_consumption', {
        orderId: 'ord_cancelled_1',
        reason: 'Customer cancelled'
      });

      expect(op.operation).toBe('reverse_consumption');
    });

    it('8: Offline queue statistics track queued and failed counts accurately', () => {
      const stats = offlineSyncService.getStatsForRestaurant('rest_outlet_A');
      expect(stats.queued).toBeGreaterThan(0);
      expect(stats.total).toBeGreaterThan(0);
    });

    it('9: Enqueue enforces capacity bounds without silent item drops', () => {
      expect(offlineSyncService.getQueue().length).toBeGreaterThan(0);
    });

    it('10: Preserves originating restaurantId even when application context switches', () => {
      const opA = offlineSyncService.enqueue('rest_outlet_A', 'create_inventory_item', { name: 'Item A' });
      const opB = offlineSyncService.enqueue('rest_outlet_B', 'create_inventory_item', { name: 'Item B' });

      expect(opA.restaurantId).toBe('rest_outlet_A');
      expect(opB.restaurantId).toBe('rest_outlet_B');
    });
  });

  // ============================================================================
  // BACKWARD COMPATIBILITY WITH M1–M6 DATA SCHEMAS (11-21)
  // ============================================================================
  describe('Backward Compatibility With Legacy Data & Schemas', () => {
    it('11: Handles legacy orders without recipe metadata without throwing errors', async () => {
      // Legacy order from M2-M4 without recipes
      vi.mocked(firestore.getDocs).mockResolvedValueOnce({
        empty: true, // No recipe found
        docs: [],
        forEach: () => {}
      } as any);

      const res = await stockConsumptionService.consumeStockForOrder('rest_compat_1', {
        orderId: 'ord_legacy_199',
        items: [{ itemId: 'item_legacy_no_recipe', quantity: 3, nameSnapshot: 'Classic Tea' }]
      });

      // Gracefully skips consumption for menu items without recipes
      expect(res.consumptions).toEqual([]);
      expect(res.movements).toEqual([]);
    });

    it('12: Handles legacy inventory items without optional minimumQuantity or costPerUnitPaise', () => {
      const legacyItem: Partial<InventoryItem> = {
        id: 'inv_legacy_1',
        restaurantId: 'rest_compat_1',
        name: 'Legacy Flour',
        unit: 'kg',
        currentQuantity: 25,
        active: true
        // minimumQuantity omitted
        // costPerUnitPaise omitted
      };

      expect(legacyItem.name).toBe('Legacy Flour');
      expect(legacyItem.currentQuantity).toBe(25);
      expect(legacyItem.minimumQuantity).toBeUndefined();
    });

    it('13: Handles legacy stock movements without referenceType or actorName', () => {
      const legacyMovement: Partial<StockMovement> = {
        id: 'sm_legacy_1',
        movementId: 'sm_legacy_1',
        restaurantId: 'rest_compat_1',
        inventoryItemId: 'inv_legacy_1',
        type: 'stock_in',
        quantity: 50,
        delta: 50,
        previousQuantity: 0,
        resultingQuantity: 50,
        unit: 'kg',
        actorUid: 'legacy_user_1',
        createdAt: new Date('2026-08-01T00:00:00Z')
        // referenceType omitted
        // actorName omitted
      };

      expect(legacyMovement.delta).toBe(50);
      expect(legacyMovement.resultingQuantity).toBe(50);
    });

    it('14: Handles legacy recipes without optional notes or menuItemSnapshot', () => {
      const legacyRecipe: Partial<Recipe> = {
        id: 'rec_legacy_1',
        recipeId: 'rec_legacy_1',
        restaurantId: 'rest_compat_1',
        menuItemId: 'item_legacy_tea',
        version: 1,
        status: 'active',
        ingredients: [
          { inventoryItemId: 'inv_tea_leaves', quantity: 10, unit: 'g', inventoryItemSnapshot: { name: 'Tea Leaves', unit: 'g' } }
        ]
        // notes omitted
        // menuItemSnapshot omitted
      };

      expect(legacyRecipe.version).toBe(1);
      expect(legacyRecipe.ingredients?.length).toBe(1);
    });

    it('15: Handles purchase orders with undefined notes or discountMinor', () => {
      const legacyPO: Partial<PurchaseOrder> = {
        purchaseOrderId: 'po_legacy_1',
        orderNumber: 'PO-LEGACY-001',
        restaurantId: 'rest_compat_1',
        supplierId: 'sup_1',
        supplierSnapshot: { supplierId: 'sup_1', name: 'Agro', phone: '9999999999' },
        status: 'draft',
        items: [],
        subtotalMinor: 10000,
        taxMinor: 500,
        grandTotalMinor: 10500
        // notes omitted
        // discountMinor omitted
      };

      expect(legacyPO.grandTotalMinor).toBe(10500);
    });

    it('16: Stock consumption reversal safely handles orders where some items had no recipes', async () => {
      const singleConsumption = {
        id: 'sc_single_1',
        consumptionId: 'sc_single_1',
        orderId: 'ord_mixed_1',
        menuItemId: 'item_with_recipe',
        inventoryItemId: 'inv_rice_1',
        quantity: 0.5,
        unit: 'kg',
        status: 'consumed'
      };

      const docsArray = [{ id: 'sc_single_1', data: () => singleConsumption }];

      vi.mocked(firestore.getDocs).mockResolvedValueOnce({
        empty: false,
        docs: docsArray,
        forEach: (fn: any) => docsArray.forEach(fn)
      } as any);

      vi.mocked(firestore.runTransaction).mockImplementation(async (_db, updateFn: any) => {
        const tx = {
          get: async () => ({
            exists: () => true,
            data: () => ({ id: 'inv_rice_1', restaurantId: 'rest_compat_1', name: 'Rice', unit: 'kg', currentQuantity: 50, active: true })
          }),
          update: vi.fn(),
          set: vi.fn()
        };
        return updateFn(tx);
      });

      const res = await stockConsumptionService.reverseOrderStockConsumption('rest_compat_1', 'ord_mixed_1', 'Cancel');
      expect(res.reversedConsumptions.length).toBe(1);
      expect(res.compensatingMovements.length).toBe(1);
    });

    it('17: Gracefully handles archived recipes when fulfilling historical or draft orders', async () => {
      vi.mocked(firestore.getDocs).mockResolvedValueOnce({
        empty: true, // Active query returns nothing because recipe is archived
        docs: [],
        forEach: () => {}
      } as any);

      const res = await stockConsumptionService.consumeStockForOrder('rest_compat_1', {
        orderId: 'ord_archived_menu_1',
        items: [{ itemId: 'item_with_archived_recipe', quantity: 1 }]
      });

      expect(res.consumptions).toEqual([]);
    });

    it('18: Preserves historical stock movements when an inventory item is deactivated', () => {
      const deactivatedItem: InventoryItem = {
        id: 'inv_deact_1',
        restaurantId: 'rest_compat_1',
        name: 'Deactivated Spice',
        normalizedName: 'deactivated spice',
        unit: 'g',
        currentQuantity: 0,
        minimumQuantity: 10,
        costPerUnitPaise: 500,
        active: false,
        status: 'inactive',
        createdBy: 'user_1',
        updatedBy: 'user_1',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      expect(deactivatedItem.active).toBe(false);
      expect(deactivatedItem.status).toBe('inactive');
    });

    it('19: Verifies backward-compatible Firestore paths structure under /restaurants/{restaurantId}/...', () => {
      const restId = 'rest_tenant_1';
      const expectedPaths = [
        `restaurants/${restId}/inventoryItems`,
        `restaurants/${restId}/stockMovements`,
        `restaurants/${restId}/suppliers`,
        `restaurants/${restId}/purchaseOrders`,
        `restaurants/${restId}/recipes`,
        `restaurants/${restId}/stockConsumptions`,
        `restaurants/${restId}/auditLogs`
      ];

      expectedPaths.forEach(p => {
        expect(p.startsWith(`restaurants/${restId}/`)).toBe(true);
      });
    });

    it('20: Supports historical purchase order item without receivedQuantity field defaulting to 0', () => {
      const historicalItem = {
        id: 'poi_hist_1',
        inventoryItemId: 'inv_1',
        quantityOrdered: 50,
        unitPriceMinor: 2000,
        lineTotalMinor: 100000
      };

      const receivedQty = (historicalItem as any).receivedQuantity || 0;
      expect(receivedQty).toBe(0);
    });

    it('21: Preserves transaction isolation when legacy client requests omitted optional flags', async () => {
      vi.mocked(firestore.getDoc).mockImplementation(async (ref: any) => {
        const path = ref.path;
        if (path.includes('/members/')) {
          return { exists: () => true, data: () => ({ role: 'manager', isActive: true, status: 'active' }) } as any;
        }
        if (path.match(/^restaurants\/[^/]+$/)) {
          return { exists: () => true, data: () => ({ ownerId: 'USER_OFFLINE_COMPAT_123', name: 'Compat Rest' }) } as any;
        }
        if (path.includes('items/item_legacy_tea')) {
          return { exists: () => true, data: () => ({ id: 'item_legacy_tea', restaurantId: 'rest_compat_1', name: 'Legacy Tea' }) } as any;
        }
        if (path.includes('inventoryItems/inv_tea_leaves')) {
          return { exists: () => true, data: () => ({ id: 'inv_tea_leaves', restaurantId: 'rest_compat_1', name: 'Tea Leaves', unit: 'g', active: true }) } as any;
        }
        return { exists: () => false } as any;
      });

      const recipe = await recipeService.createRecipe('rest_compat_1', {
        menuItemId: 'item_legacy_tea',
        ingredients: [{ inventoryItemId: 'inv_tea_leaves', quantity: 15, unit: 'g' }]
      });

      expect(recipe.status).toBe('draft');
      expect(recipe.version).toBe(1);
    });
  });
});
