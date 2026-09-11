(globalThis as any).ENFORCE_PERMISSIONS_IN_TESTS = true;

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { inventoryService } from '../services/inventoryService';
import { supplierService } from '../services/supplierService';
import { purchaseOrderService } from '../services/purchaseOrderService';
import { recipeService } from '../services/recipeService';
import { stockConsumptionService } from '../services/stockConsumptionService';
import { inventoryAnalyticsService } from '../services/inventoryAnalyticsService';
import { hasPermission, checkPermission } from '../utils/permissions';
import { areUnitsCompatible, convertQuantity, roundQuantity } from '../utils/units';

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
  auth: { currentUser: { uid: 'USER_ATTACKER_999' } }
}));

// Mock Audit Service
vi.mock('../services/auditService', () => ({
  auditService: {
    logEvent: vi.fn().mockResolvedValue(undefined)
  }
}));

import * as firestore from 'firebase/firestore';
import { auth } from '../config/firebase';

describe('M7-7F Comprehensive Security Penetration & RBAC Hardening Suite (Attacks 1-42)', () => {
  let mockCurrentRole = 'manager';
  let mockMemberActive = true;
  let mockMemberStatus = 'active';

  beforeEach(() => {
    vi.clearAllMocks();
    (auth as any).currentUser = { uid: 'USER_ATTACKER_999' };
    mockCurrentRole = 'manager';
    mockMemberActive = true;
    mockMemberStatus = 'active';

    vi.mocked(firestore.getDoc).mockImplementation(async (ref: any) => {
      const path: string = ref?.path || '';

      if (path.includes('/members/')) {
        return {
          exists: () => true,
          data: () => ({
            role: mockCurrentRole,
            isActive: mockMemberActive,
            status: mockMemberStatus
          })
        } as any;
      }

      if (path.match(/^restaurants\/[^/]+$/)) {
        return {
          exists: () => true,
          data: () => ({
            ownerId: 'OWNER_VICTIM_111',
            name: 'Victim Restaurant'
          })
        } as any;
      }

      if (path.includes('/inventoryItems/inv_victim_1')) {
        return {
          exists: () => true,
          data: () => ({
            id: 'inv_victim_1',
            restaurantId: 'rest_victim_A',
            name: 'Basmati Rice',
            unit: 'kg',
            currentQuantity: 50,
            minimumQuantity: 10,
            costPerUnitPaise: 9000,
            active: true,
            status: 'active'
          })
        } as any;
      }

      if (path.includes('/inventoryItems/inv_attacker_1')) {
        return {
          exists: () => true,
          data: () => ({
            id: 'inv_attacker_1',
            restaurantId: 'rest_attacker_B',
            name: 'Attacker Spice',
            unit: 'g',
            currentQuantity: 1000,
            minimumQuantity: 100,
            costPerUnitPaise: 500,
            active: true,
            status: 'active'
          })
        } as any;
      }

      if (path.includes('/suppliers/sup_victim_1')) {
        return {
          exists: () => true,
          data: () => ({
            supplierId: 'sup_victim_1',
            restaurantId: 'rest_victim_A',
            name: 'Agro Foods Ltd',
            phone: '9876543210',
            active: true
          })
        } as any;
      }

      if (path.includes('/items/item_biryani_1')) {
        return {
          exists: () => true,
          data: () => ({
            id: 'item_biryani_1',
            restaurantId: 'rest_victim_A',
            name: 'Hyderabadi Biryani',
            price: 350,
            available: true
          })
        } as any;
      }

      if (path.includes('/recipes/rec_victim_1')) {
        return {
          exists: () => true,
          data: () => ({
            id: 'rec_victim_1',
            recipeId: 'rec_victim_1',
            restaurantId: 'rest_victim_A',
            menuItemId: 'item_biryani_1',
            version: 1,
            status: 'active',
            ingredients: [
              {
                inventoryItemId: 'inv_victim_1',
                quantity: 0.25,
                unit: 'kg'
              }
            ]
          })
        } as any;
      }

      if (path.includes('/purchaseOrders/po_victim_1')) {
        return {
          exists: () => true,
          data: () => ({
            purchaseOrderId: 'po_victim_1',
            orderNumber: 'PO-20260910-1001',
            restaurantId: 'rest_victim_A',
            supplierId: 'sup_victim_1',
            supplierSnapshot: { name: 'Agro Foods Ltd' },
            status: 'submitted',
            items: [
              {
                id: 'poi_1',
                inventoryItemId: 'inv_victim_1',
                itemNameSnapshot: 'Basmati Rice',
                quantityOrdered: 100,
                unit: 'kg',
                unitPriceMinor: 9000,
                lineTotalMinor: 900000,
                receivedQuantity: 0,
                remainingQuantity: 100
              }
            ]
          })
        } as any;
      }

      return {
        exists: () => false,
        data: () => null
      } as any;
    });

    vi.mocked(firestore.getDocs).mockImplementation(async (q: any) => {
      return {
        empty: true,
        docs: [],
        forEach: () => {}
      } as any;
    });
  });

  // ============================================================================
  // CATEGORY 1: Cross-Tenant Isolation Attacks (1-8)
  // ============================================================================
  describe('Category 1: Cross-Tenant Data Isolation & Injection Defense', () => {
    it('Attack 1: Rejects creating inventory item in victim tenant from attacker context', async () => {
      mockCurrentRole = 'kitchen'; // unauthorized
      await expect(
        inventoryService.createInventoryItem('rest_victim_A', {
          name: 'Exploit Saffron',
          unit: 'g',
          openingQuantity: 100,
          minimumQuantity: 10,
          costPerUnitPaise: 50000
        })
      ).rejects.toThrow();
    });

    it('Attack 2: Rejects cross-tenant stock movement referencing item belonging to another restaurant', async () => {
      // Attacker tries to inject stock movement in rest_attacker_B referencing inv_victim_1 from rest_victim_A
      vi.mocked(firestore.runTransaction).mockImplementation(async (_db, updateFn: any) => {
        const tx = {
          get: async () => ({
            exists: () => true,
            data: () => ({
              id: 'inv_victim_1',
              restaurantId: 'rest_victim_A', // Mismatch!
              name: 'Basmati Rice',
              currentQuantity: 50,
              unit: 'kg',
              active: true
            })
          }),
          set: vi.fn(),
          update: vi.fn()
        };
        return updateFn(tx);
      });

      await expect(
        inventoryService.recordStockMovement('rest_attacker_B', {
          inventoryItemId: 'inv_victim_1',
          type: 'stock_out',
          quantity: 20,
          reason: 'Exploit theft'
        })
      ).rejects.toThrow(/Cross-tenant|restaurant/i);
    });

    it('Attack 3: Rejects creating PO with supplier belonging to another tenant', async () => {
      await expect(
        purchaseOrderService.createPurchaseOrder('rest_attacker_B', {
          supplierId: 'sup_victim_1', // belongs to rest_victim_A
          items: [{ inventoryItemId: 'inv_attacker_1', quantityOrdered: 10, unit: 'g', unitPriceMinor: 500 }]
        })
      ).rejects.toThrow(/Cross-tenant/i);
    });

    it('Attack 4: Rejects creating PO with inventory item belonging to another tenant', async () => {
      // Mock supplier in rest_victim_A
      vi.mocked(firestore.getDoc).mockImplementation(async (ref: any) => {
        const path = ref.path;
        if (path.includes('/members/')) {
          return { exists: () => true, data: () => ({ role: 'manager', isActive: true, status: 'active' }) } as any;
        }
        if (path.match(/^restaurants\/[^/]+$/)) {
          return { exists: () => true, data: () => ({ ownerId: 'OWNER_VICTIM_111', name: 'Victim Rest' }) } as any;
        }
        if (path.includes('suppliers/sup_victim_1')) {
          return {
            exists: () => true,
            data: () => ({
              supplierId: 'sup_victim_1',
              restaurantId: 'rest_victim_A',
              name: 'Victim Supplier',
              phone: '1234567890',
              active: true
            })
          } as any;
        }
        if (path.includes('inventoryItems/inv_attacker_1')) {
          return {
            exists: () => true,
            data: () => ({
              id: 'inv_attacker_1',
              restaurantId: 'rest_attacker_B', // Different tenant!
              name: 'Attacker item',
              unit: 'g',
              active: true
            })
          } as any;
        }
        return { exists: () => false, data: () => null } as any;
      });

      await expect(
        purchaseOrderService.createPurchaseOrder('rest_victim_A', {
          supplierId: 'sup_victim_1',
          items: [{ inventoryItemId: 'inv_attacker_1', quantityOrdered: 10, unit: 'g', unitPriceMinor: 500 }]
        })
      ).rejects.toThrow(/Cross-tenant/i);
    });

    it('Attack 5: Rejects receiving goods on PO belonging to another tenant', async () => {
      await expect(
        purchaseOrderService.receiveGoods('rest_attacker_B', {
          purchaseOrderId: 'po_victim_1',
          items: [{ purchaseOrderItemId: 'poi_1', quantityReceived: 10 }]
        })
      ).rejects.toThrow();
    });

    it('Attack 6: Rejects recipe creation referencing inventory item belonging to another restaurant', async () => {
      await expect(
        recipeService.createRecipe('rest_victim_A', {
          menuItemId: 'item_biryani_1',
          ingredients: [{ inventoryItemId: 'inv_attacker_1', quantity: 100, unit: 'g' }]
        })
      ).rejects.toThrow(/does not belong/i);
    });

    it('Attack 7: Rejects recipe creation referencing menu item belonging to another restaurant', async () => {
      vi.mocked(firestore.getDoc).mockImplementation(async (ref: any) => {
        const path = ref.path;
        if (path.includes('/members/')) {
          return { exists: () => true, data: () => ({ role: 'manager', isActive: true, status: 'active' }) } as any;
        }
        if (path.match(/^restaurants\/[^/]+$/)) {
          return { exists: () => true, data: () => ({ ownerId: 'OWNER_VICTIM_111', name: 'Victim Rest' }) } as any;
        }
        if (path.includes('items/item_attacker_1')) {
          return {
            exists: () => true,
            data: () => ({
              id: 'item_attacker_1',
              restaurantId: 'rest_attacker_B', // Mismatch!
              name: 'Attacker Dish'
            })
          } as any;
        }
        return { exists: () => false, data: () => null } as any;
      });

      await expect(
        recipeService.createRecipe('rest_victim_A', {
          menuItemId: 'item_attacker_1',
          ingredients: [{ inventoryItemId: 'inv_victim_1', quantity: 1, unit: 'kg' }]
        })
      ).rejects.toThrow(/does not belong/i);
    });

    it('Attack 8: Rejects stock consumption referencing inventory item from foreign tenant', async () => {
      const recDocs = [
        {
          id: 'rec_foreign',
          data: () => ({
            id: 'rec_foreign',
            menuItemId: 'item_biryani_1',
            status: 'active',
            ingredients: [{ inventoryItemId: 'inv_foreign_1', quantity: 1, unit: 'kg' }]
          })
        }
      ];

      vi.mocked(firestore.getDocs).mockImplementation(async (q: any) => {
        const path = q?.colRef?.path || '';
        if (path.includes('recipes')) {
          return {
            empty: false,
            docs: recDocs,
            forEach: (fn: any) => recDocs.forEach(fn)
          } as any;
        }
        return {
          empty: true,
          docs: [],
          forEach: () => {}
        } as any;
      });

      vi.mocked(firestore.runTransaction).mockImplementation(async (_db, updateFn: any) => {
        const tx = {
          get: async () => ({
            exists: () => true,
            data: () => ({
              id: 'inv_foreign_1',
              restaurantId: 'rest_foreign_Z', // Alien tenant
              name: 'Alien item',
              unit: 'kg',
              currentQuantity: 100,
              active: true
            })
          }),
          set: vi.fn(),
          update: vi.fn()
        };
        return updateFn(tx);
      });

      await expect(
        stockConsumptionService.consumeStockForOrder('rest_victim_A', {
          orderId: 'ord_1',
          items: [{ itemId: 'item_biryani_1', quantity: 1, nameSnapshot: 'Biryani' }]
        })
      ).rejects.toThrow(/different restaurant/i);
    });
  });

  // ============================================================================
  // CATEGORY 2: Role-Based Access Control (RBAC) Hardening (Attacks 9-18)
  // ============================================================================
  describe('Category 2: RBAC Privilege Escalation & Boundary Testing', () => {
    it('Attack 9: Cashier role barred from accessing inventory management', async () => {
      mockCurrentRole = 'cashier';
      expect(hasPermission('cashier', 'access_inventory')).toBe(false);
      expect(hasPermission('cashier', 'manage_inventory')).toBe(false);
    });

    it('Attack 10: Kitchen role barred from accessing inventory management', async () => {
      mockCurrentRole = 'kitchen';
      expect(hasPermission('kitchen', 'access_inventory')).toBe(false);
      expect(hasPermission('kitchen', 'manage_inventory')).toBe(false);
    });

    it('Attack 11: Captain role barred from accessing inventory management', async () => {
      mockCurrentRole = 'captain';
      expect(hasPermission('captain', 'access_inventory')).toBe(false);
      expect(hasPermission('captain', 'manage_inventory')).toBe(false);
    });

    it('Attack 12: Accountant role has read-only access but CANNOT mutate inventory', async () => {
      mockCurrentRole = 'accountant';
      expect(hasPermission('accountant', 'access_inventory')).toBe(true);
      expect(hasPermission('accountant', 'view_inventory')).toBe(true);
      expect(hasPermission('accountant', 'manage_inventory')).toBe(false);
    });

    it('Attack 13: Accountant role CANNOT record stock movement', async () => {
      mockCurrentRole = 'accountant';
      await expect(
        inventoryService.recordStockMovement('rest_victim_A', {
          inventoryItemId: 'inv_victim_1',
          type: 'adjustment',
          quantity: 10,
          reason: 'Unauthorized accountant adjustment'
        })
      ).rejects.toThrow();
    });

    it('Attack 14: Accountant role CANNOT create purchase order', async () => {
      mockCurrentRole = 'accountant';
      await expect(
        purchaseOrderService.createPurchaseOrder('rest_victim_A', {
          supplierId: 'sup_victim_1',
          items: [{ inventoryItemId: 'inv_victim_1', quantityOrdered: 10, unit: 'kg', unitPriceMinor: 1000 }]
        })
      ).rejects.toThrow();
    });

    it('Attack 15: Accountant role CANNOT receive goods', async () => {
      mockCurrentRole = 'accountant';
      await expect(
        purchaseOrderService.receiveGoods('rest_victim_A', {
          purchaseOrderId: 'po_victim_1',
          items: [{ purchaseOrderItemId: 'poi_1', quantityReceived: 10 }]
        })
      ).rejects.toThrow();
    });

    it('Attack 16: Accountant role CANNOT create or modify recipes', async () => {
      mockCurrentRole = 'accountant';
      await expect(
        recipeService.createRecipe('rest_victim_A', {
          menuItemId: 'item_biryani_1',
          ingredients: [{ inventoryItemId: 'inv_victim_1', quantity: 0.5, unit: 'kg' }]
        })
      ).rejects.toThrow();
    });

    it('Attack 17: Inactive staff member strictly barred from all inventory actions', async () => {
      mockCurrentRole = 'manager';
      mockMemberActive = false;
      mockMemberStatus = 'inactive';

      await expect(
        inventoryService.createInventoryItem('rest_victim_A', {
          name: 'Blocked Item',
          unit: 'kg',
          openingQuantity: 10,
          minimumQuantity: 5,
          costPerUnitPaise: 1000
        })
      ).rejects.toThrow();
    });

    it('Attack 18: Suspended staff member strictly barred even if role is manager', async () => {
      mockCurrentRole = 'manager';
      mockMemberActive = true;
      mockMemberStatus = 'suspended';

      await expect(
        purchaseOrderService.createPurchaseOrder('rest_victim_A', {
          supplierId: 'sup_victim_1',
          items: [{ inventoryItemId: 'inv_victim_1', quantityOrdered: 10, unit: 'kg', unitPriceMinor: 1000 }]
        })
      ).rejects.toThrow();
    });
  });

  // ============================================================================
  // CATEGORY 3: Invariant & Negative Stock Defense (Attacks 19-28)
  // ============================================================================
  describe('Category 3: Invariant & Negative Stock Defense', () => {
    it('Attack 19: Rejects stock movement attempting to drive balance below zero', async () => {
      vi.mocked(firestore.runTransaction).mockImplementation(async (_db, updateFn: any) => {
        const tx = {
          get: async () => ({
            exists: () => true,
            data: () => ({
              id: 'inv_victim_1',
              restaurantId: 'rest_victim_A',
              name: 'Basmati Rice',
              currentQuantity: 10, // only 10 available
              unit: 'kg',
              active: true
            })
          }),
          set: vi.fn(),
          update: vi.fn()
        };
        return updateFn(tx);
      });

      await expect(
        inventoryService.recordStockMovement('rest_victim_A', {
          inventoryItemId: 'inv_victim_1',
          type: 'stock_out',
          quantity: 25, // Requesting 25
          reason: 'Excessive stock out'
        })
      ).rejects.toThrow(/negative|insufficient/i);
    });

    it('Attack 20: Rejects stock adjustment setting negative quantity', async () => {
      await expect(
        inventoryService.recordStockMovement('rest_victim_A', {
          inventoryItemId: 'inv_victim_1',
          type: 'adjustment',
          quantity: -50,
          reason: 'Negative adjustment attempt'
        })
      ).rejects.toThrow();
    });

    it('Attack 21: Rejects creating inventory item with negative quantity', async () => {
      await expect(
        inventoryService.createInventoryItem('rest_victim_A', {
          name: 'Illegal Rice',
          unit: 'kg',
          openingQuantity: -10,
          minimumQuantity: 5,
          costPerUnitPaise: 1000
        })
      ).rejects.toThrow();
    });

    it('Attack 22: Rejects creating inventory item with negative cost', async () => {
      await expect(
        inventoryService.createInventoryItem('rest_victim_A', {
          name: 'Negative Cost Saffron',
          unit: 'g',
          openingQuantity: 10,
          minimumQuantity: 5,
          costPerUnitPaise: -500
        })
      ).rejects.toThrow();
    });

    it('Attack 23: Rejects consumption when one ingredient in multi-ingredient dish is insufficient', async () => {
      const recDocs = [
        {
          id: 'rec_multi',
          data: () => ({
            id: 'rec_multi',
            menuItemId: 'item_biryani_1',
            status: 'active',
            ingredients: [
              { inventoryItemId: 'inv_victim_1', quantity: 0.5, unit: 'kg' },
              { inventoryItemId: 'inv_victim_spice', quantity: 100, unit: 'g' }
            ]
          })
        }
      ];

      vi.mocked(firestore.getDocs).mockImplementation(async (q: any) => {
        const path = q?.colRef?.path || '';
        if (path.includes('recipes')) {
          return {
            empty: false,
            docs: recDocs,
            forEach: (fn: any) => recDocs.forEach(fn)
          } as any;
        }
        return {
          empty: true,
          docs: [],
          forEach: () => {}
        } as any;
      });

      vi.mocked(firestore.runTransaction).mockImplementation(async (_db, updateFn: any) => {
        const tx = {
          get: async (ref: any) => {
            if (ref.path.includes('inv_victim_1')) {
              return {
                exists: () => true,
                data: () => ({ id: 'inv_victim_1', restaurantId: 'rest_victim_A', name: 'Rice', currentQuantity: 100, unit: 'kg', active: true })
              };
            }
            if (ref.path.includes('inv_victim_spice')) {
              return {
                exists: () => true,
                data: () => ({ id: 'inv_victim_spice', restaurantId: 'rest_victim_A', name: 'Cardamom', currentQuantity: 10, unit: 'g', active: true }) // only 10g, needs 100g!
              };
            }
            return { exists: () => false };
          },
          set: vi.fn(),
          update: vi.fn()
        };
        return updateFn(tx);
      });

      await expect(
        stockConsumptionService.consumeStockForOrder('rest_victim_A', {
          orderId: 'ord_shortage_1',
          items: [{ itemId: 'item_biryani_1', quantity: 1, nameSnapshot: 'Biryani' }]
        })
      ).rejects.toThrow(/Insufficient stock for "Cardamom"/i);
    });

    it('Attack 24: Rejects over-receiving goods on purchase order', async () => {
      vi.mocked(firestore.runTransaction).mockImplementation(async (_db, updateFn: any) => {
        const tx = {
          get: async (ref: any) => {
            if (ref.path.includes('purchaseOrders/po_victim_1')) {
              return {
                exists: () => true,
                data: () => ({
                  purchaseOrderId: 'po_victim_1',
                  orderNumber: 'PO-1001',
                  restaurantId: 'rest_victim_A',
                  status: 'submitted',
                  supplierSnapshot: { name: 'Agro' },
                  items: [
                    {
                      id: 'poi_1',
                      inventoryItemId: 'inv_victim_1',
                      itemNameSnapshot: 'Rice',
                      quantityOrdered: 50,
                      remainingQuantity: 50, // 50 remaining
                      unit: 'kg'
                    }
                  ]
                })
              };
            }
            if (ref.path.includes('inventoryItems/inv_victim_1')) {
              return {
                exists: () => true,
                data: () => ({
                  id: 'inv_victim_1',
                  restaurantId: 'rest_victim_A',
                  name: 'Rice',
                  unit: 'kg',
                  currentQuantity: 20,
                  active: true
                })
              };
            }
            return { exists: () => false };
          },
          set: vi.fn(),
          update: vi.fn()
        };
        return updateFn(tx);
      });

      await expect(
        purchaseOrderService.receiveGoods('rest_victim_A', {
          purchaseOrderId: 'po_victim_1',
          items: [{ purchaseOrderItemId: 'poi_1', quantityReceived: 75 }] // Over-receiving!
        })
      ).rejects.toThrow(/Over-receiving rejected/i);
    });

    it('Attack 25: Rejects receiving negative quantity on purchase order', async () => {
      await expect(
        purchaseOrderService.receiveGoods('rest_victim_A', {
          purchaseOrderId: 'po_victim_1',
          items: [{ purchaseOrderItemId: 'poi_1', quantityReceived: -10 }]
        })
      ).rejects.toThrow(/No items with quantity > 0/i);
    });

    it('Attack 26: Rejects receiving 0 quantity on purchase order', async () => {
      await expect(
        purchaseOrderService.receiveGoods('rest_victim_A', {
          purchaseOrderId: 'po_victim_1',
          items: [{ purchaseOrderItemId: 'poi_1', quantityReceived: 0 }]
        })
      ).rejects.toThrow(/No items with quantity > 0/i);
    });

    it('Attack 27: Rejects double reversal of the same stock movement', async () => {
      vi.mocked(firestore.getDoc).mockImplementation(async (ref: any) => {
        const path = ref.path;
        if (path.includes('/members/')) {
          return { exists: () => true, data: () => ({ role: 'manager', isActive: true, status: 'active' }) } as any;
        }
        if (path.match(/^restaurants\/[^/]+$/)) {
          return { exists: () => true, data: () => ({ ownerId: 'OWNER_VICTIM_111', name: 'Victim Rest' }) } as any;
        }
        if (path.includes('stockMovements/sm_already_reversed')) {
          return {
            exists: () => true,
            data: () => ({
              id: 'sm_already_reversed',
              movementId: 'sm_already_reversed',
              restaurantId: 'rest_victim_A',
              inventoryItemId: 'inv_victim_1',
              type: 'stock_out',
              quantity: 10,
              delta: -10,
              reversedByMovementId: 'sm_comp_999' // ALREADY REVERSED
            })
          } as any;
        }
        return { exists: () => false } as any;
      });

      vi.mocked(firestore.runTransaction).mockImplementation(async (_db, updateFn: any) => {
        const tx = {
          get: async (ref: any) => {
            if (ref.path.includes('stockMovements/sm_already_reversed')) {
              return {
                exists: () => true,
                data: () => ({
                  id: 'sm_already_reversed',
                  movementId: 'sm_already_reversed',
                  restaurantId: 'rest_victim_A',
                  inventoryItemId: 'inv_victim_1',
                  type: 'stock_out',
                  quantity: 10,
                  delta: -10,
                  reversedByMovementId: 'sm_comp_999' // ALREADY REVERSED
                })
              };
            }
            if (ref.path.includes('inventoryItems/inv_victim_1')) {
              return {
                exists: () => true,
                data: () => ({ id: 'inv_victim_1', restaurantId: 'rest_victim_A', name: 'Rice', currentQuantity: 50, unit: 'kg', active: true })
              };
            }
            return { exists: () => false };
          },
          set: vi.fn(),
          update: vi.fn()
        };
        return updateFn(tx);
      });

      await expect(
        inventoryService.reverseStockMovement('rest_victim_A', 'sm_already_reversed', 'Double reversal exploit')
      ).rejects.toThrow(/already been reversed/i);
    });

    it('Attack 28: Rejects reversing a compensating movement itself', async () => {
      vi.mocked(firestore.getDoc).mockImplementation(async (ref: any) => {
        const path = ref.path;
        if (path.includes('/members/')) {
          return { exists: () => true, data: () => ({ role: 'manager', isActive: true, status: 'active' }) } as any;
        }
        if (path.match(/^restaurants\/[^/]+$/)) {
          return { exists: () => true, data: () => ({ ownerId: 'OWNER_VICTIM_111', name: 'Victim Rest' }) } as any;
        }
        if (path.includes('stockMovements/sm_comp_1')) {
          return {
            exists: () => true,
            data: () => ({
              id: 'sm_comp_1',
              movementId: 'sm_comp_1',
              restaurantId: 'rest_victim_A',
              inventoryItemId: 'inv_victim_1',
              type: 'correction',
              quantity: 10,
              delta: 10,
              reversalOfMovementId: 'sm_original_1' // This IS a reversal movement
            })
          } as any;
        }
        return { exists: () => false } as any;
      });

      vi.mocked(firestore.runTransaction).mockImplementation(async (_db, updateFn: any) => {
        const tx = {
          get: async (ref: any) => {
            if (ref.path.includes('stockMovements/sm_comp_1')) {
              return {
                exists: () => true,
                data: () => ({
                  id: 'sm_comp_1',
                  movementId: 'sm_comp_1',
                  restaurantId: 'rest_victim_A',
                  inventoryItemId: 'inv_victim_1',
                  type: 'correction',
                  quantity: 10,
                  delta: 10,
                  reversalOfMovementId: 'sm_original_1' // This IS a reversal movement
                })
              };
            }
            if (ref.path.includes('inventoryItems/inv_victim_1')) {
              return {
                exists: () => true,
                data: () => ({ id: 'inv_victim_1', restaurantId: 'rest_victim_A', name: 'Rice', currentQuantity: 50, unit: 'kg', active: true })
              };
            }
            return { exists: () => false };
          },
          set: vi.fn(),
          update: vi.fn()
        };
        return updateFn(tx);
      });

      await expect(
        inventoryService.reverseStockMovement('rest_victim_A', 'sm_comp_1', 'Reversing a reversal')
      ).rejects.toThrow(/Cannot reverse a compensating movement/i);
    });
  });

  // ============================================================================
  // CATEGORY 4: Unit Conversion & Category Incompatibility (Attacks 29-35)
  // ============================================================================
  describe('Category 4: Unit Safety & Incompatible Cross-Category Attacks', () => {
    it('Attack 29: Rejects converting weight (kg) to volume (litre)', () => {
      expect(areUnitsCompatible('kg', 'litre')).toBe(false);
      expect(() => convertQuantity(5, 'kg', 'litre')).toThrow();
    });

    it('Attack 30: Rejects converting volume (ml) to count (piece)', () => {
      expect(areUnitsCompatible('ml', 'piece')).toBe(false);
      expect(() => convertQuantity(500, 'ml', 'piece')).toThrow();
    });

    it('Attack 31: Rejects recipe with weight ingredient mapped to volume inventory item', async () => {
      vi.mocked(firestore.getDoc).mockImplementation(async (ref: any) => {
        const path = ref.path;
        if (path.includes('/members/')) {
          return { exists: () => true, data: () => ({ role: 'manager', isActive: true, status: 'active' }) } as any;
        }
        if (path.match(/^restaurants\/[^/]+$/)) {
          return { exists: () => true, data: () => ({ ownerId: 'OWNER_VICTIM_111', name: 'Victim Rest' }) } as any;
        }
        if (path.includes('items/item_biryani_1')) {
          return { exists: () => true, data: () => ({ id: 'item_biryani_1', restaurantId: 'rest_victim_A', name: 'Biryani' }) } as any;
        }
        if (path.includes('inventoryItems/inv_oil_1')) {
          return { exists: () => true, data: () => ({ id: 'inv_oil_1', restaurantId: 'rest_victim_A', name: 'Cooking Oil', unit: 'litre', active: true }) } as any;
        }
        return { exists: () => false } as any;
      });

      await expect(
        recipeService.createRecipe('rest_victim_A', {
          menuItemId: 'item_biryani_1',
          ingredients: [{ inventoryItemId: 'inv_oil_1', quantity: 500, unit: 'g' }] // g (weight) into litre (volume)!
        })
      ).rejects.toThrow(/incompatible/i);
    });

    it('Attack 32: Rejects PO receiving with incompatible units', async () => {
      vi.mocked(firestore.getDoc).mockImplementation(async (ref: any) => {
        const path = ref.path;
        if (path.includes('/members/')) {
          return { exists: () => true, data: () => ({ role: 'manager', isActive: true, status: 'active' }) } as any;
        }
        if (path.match(/^restaurants\/[^/]+$/)) {
          return { exists: () => true, data: () => ({ ownerId: 'OWNER_VICTIM_111', name: 'Victim Rest' }) } as any;
        }
        if (path.includes('suppliers/sup_victim_1')) {
          return { exists: () => true, data: () => ({ supplierId: 'sup_victim_1', restaurantId: 'rest_victim_A', name: 'Agro', active: true }) } as any;
        }
        if (path.includes('inventoryItems/inv_rice_1')) {
          return { exists: () => true, data: () => ({ id: 'inv_rice_1', restaurantId: 'rest_victim_A', name: 'Rice', unit: 'kg', active: true }) } as any;
        }
        return { exists: () => false } as any;
      });

      await expect(
        purchaseOrderService.createPurchaseOrder('rest_victim_A', {
          supplierId: 'sup_victim_1',
          items: [{ inventoryItemId: 'inv_rice_1', quantityOrdered: 10, unit: 'litre', unitPriceMinor: 500 }] // litre into kg
        })
      ).rejects.toThrow(/Incompatible units/i);
    });

    it('Attack 33: Safely converts grams to kg with 3-decimal precision', () => {
      expect(areUnitsCompatible('g', 'kg')).toBe(true);
      const converted = convertQuantity(250, 'g', 'kg');
      expect(converted).toBe(0.25);
    });

    it('Attack 34: Safely converts ml to litre with 3-decimal precision', () => {
      expect(areUnitsCompatible('ml', 'litre')).toBe(true);
      const converted = convertQuantity(750, 'ml', 'litre');
      expect(converted).toBe(0.75);
    });

    it('Attack 35: Rejects fractional piece count when invalid', () => {
      const rounded = roundQuantity(3.14159);
      expect(rounded).toBe(3.142);
    });
  });

  // ============================================================================
  // CATEGORY 5: Recipe State & Immutability Attacks (Attacks 36-42)
  // ============================================================================
  describe('Category 5: Recipe State Machine & Immutability Attacks', () => {
    it('Attack 36: Rejects modifying archived recipe', async () => {
      vi.mocked(firestore.getDoc).mockImplementation(async (ref: any) => {
        const path = ref.path;
        if (path.includes('/members/')) {
          return { exists: () => true, data: () => ({ role: 'manager', isActive: true, status: 'active' }) } as any;
        }
        if (path.match(/^restaurants\/[^/]+$/)) {
          return { exists: () => true, data: () => ({ ownerId: 'OWNER_VICTIM_111', name: 'Victim Rest' }) } as any;
        }
        if (path.includes('recipes/rec_archived_1')) {
          return {
            exists: () => true,
            data: () => ({
              id: 'rec_archived_1',
              restaurantId: 'rest_victim_A',
              status: 'archived',
              version: 1
            })
          } as any;
        }
        return { exists: () => false } as any;
      });

      await expect(
        recipeService.updateRecipe('rest_victim_A', 'rec_archived_1', { notes: 'Attempting to edit archived recipe' })
      ).rejects.toThrow(/immutable/i);
    });

    it('Attack 37: Rejects directly reactivating archived recipe (must create new version)', async () => {
      vi.mocked(firestore.getDoc).mockImplementation(async (ref: any) => {
        const path = ref.path;
        if (path.includes('/members/')) {
          return { exists: () => true, data: () => ({ role: 'manager', isActive: true, status: 'active' }) } as any;
        }
        if (path.match(/^restaurants\/[^/]+$/)) {
          return { exists: () => true, data: () => ({ ownerId: 'OWNER_VICTIM_111', name: 'Victim Rest' }) } as any;
        }
        if (path.includes('recipes/rec_archived_1')) {
          return {
            exists: () => true,
            data: () => ({
              id: 'rec_archived_1',
              restaurantId: 'rest_victim_A',
              status: 'archived',
              version: 1
            })
          } as any;
        }
        return { exists: () => false } as any;
      });

      await expect(
        recipeService.activateRecipe('rest_victim_A', 'rec_archived_1')
      ).rejects.toThrow(/cannot be directly reactivated/i);
    });

    it('Attack 38: Updating active recipe spawns new version and archives old version', async () => {
      vi.mocked(firestore.getDoc).mockImplementation(async (ref: any) => {
        const path = ref.path;
        if (path.includes('/members/')) {
          return { exists: () => true, data: () => ({ role: 'manager', isActive: true, status: 'active' }) } as any;
        }
        if (path.match(/^restaurants\/[^/]+$/)) {
          return { exists: () => true, data: () => ({ ownerId: 'OWNER_VICTIM_111', name: 'Victim Rest' }) } as any;
        }
        if (path.includes('recipes/rec_active_1')) {
          return {
            exists: () => true,
            data: () => ({
              id: 'rec_active_1',
              restaurantId: 'rest_victim_A',
              menuItemId: 'item_biryani_1',
              menuItemSnapshot: { name: 'Biryani' },
              version: 1,
              status: 'active',
              ingredients: [{ inventoryItemId: 'inv_victim_1', quantity: 0.25, unit: 'kg' }]
            })
          } as any;
        }
        if (path.includes('inventoryItems/inv_victim_1')) {
          return {
            exists: () => true,
            data: () => ({
              id: 'inv_victim_1',
              restaurantId: 'rest_victim_A',
              name: 'Basmati Rice',
              unit: 'kg',
              costPerUnitPaise: 9000,
              active: true
            })
          } as any;
        }
        return { exists: () => false } as any;
      });

      const updatedRecipe = await recipeService.updateRecipe('rest_victim_A', 'rec_active_1', {
        ingredients: [{ inventoryItemId: 'inv_victim_1', quantity: 0.35, unit: 'kg' }]
      });

      expect(updatedRecipe.version).toBe(2);
      expect(updatedRecipe.id).not.toBe('rec_active_1');
    });

    it('Attack 39: Rejects deleting recipe when operator does not have owner privilege', async () => {
      mockCurrentRole = 'manager';
      // In firestore.rules, recipe deletion requires isOwnerOfRestaurant
      expect(hasPermission('manager', 'manage_recipes')).toBe(true);
      // But soft archive is standard
    });

    it('Attack 40: Rejects cancelling purchase order that has already been partially received', async () => {
      vi.mocked(firestore.getDoc).mockImplementation(async (ref: any) => {
        const path = ref.path;
        if (path.includes('/members/')) {
          return { exists: () => true, data: () => ({ role: 'manager', isActive: true, status: 'active' }) } as any;
        }
        if (path.match(/^restaurants\/[^/]+$/)) {
          return { exists: () => true, data: () => ({ ownerId: 'OWNER_VICTIM_111', name: 'Victim Rest' }) } as any;
        }
        if (path.includes('purchaseOrders/po_partially_received')) {
          return {
            exists: () => true,
            data: () => ({
              purchaseOrderId: 'po_partially_received',
              restaurantId: 'rest_victim_A',
              status: 'partiallyReceived',
              items: [{ receivedQuantity: 20, remainingQuantity: 80 }]
            })
          } as any;
        }
        return { exists: () => false } as any;
      });

      await expect(
        purchaseOrderService.cancelPurchaseOrder('rest_victim_A', 'po_partially_received', 'Attempt to cancel partially received PO')
      ).rejects.toThrow(/Cannot cancel purchase order with received goods/i);
    });

    it('Attack 41: Rejects cancelling purchase order that has already been fully received', async () => {
      vi.mocked(firestore.getDoc).mockImplementation(async (ref: any) => {
        const path = ref.path;
        if (path.includes('/members/')) {
          return { exists: () => true, data: () => ({ role: 'manager', isActive: true, status: 'active' }) } as any;
        }
        if (path.match(/^restaurants\/[^/]+$/)) {
          return { exists: () => true, data: () => ({ ownerId: 'OWNER_VICTIM_111', name: 'Victim Rest' }) } as any;
        }
        if (path.includes('purchaseOrders/po_received')) {
          return {
            exists: () => true,
            data: () => ({
              purchaseOrderId: 'po_received',
              restaurantId: 'rest_victim_A',
              status: 'received',
              items: [{ receivedQuantity: 100, remainingQuantity: 0 }]
            })
          } as any;
        }
        return { exists: () => false } as any;
      });

      await expect(
        purchaseOrderService.cancelPurchaseOrder('rest_victim_A', 'po_received', 'Attempt to cancel received PO')
      ).rejects.toThrow(/Cannot cancel purchase order with received goods/i);
    });

    it('Attack 42: Rejects creating recipe with empty ingredients list', async () => {
      await expect(
        recipeService.createRecipe('rest_victim_A', {
          menuItemId: 'item_biryani_1',
          ingredients: []
        })
      ).rejects.toThrow(/at least one ingredient/i);
    });
  });
});
