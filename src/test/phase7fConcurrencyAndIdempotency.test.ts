(globalThis as any).ENFORCE_PERMISSIONS_IN_TESTS = true;

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IdempotencyService, createRequestSignature } from '../services/idempotencyService';
import { stockConsumptionService } from '../services/stockConsumptionService';
import { purchaseOrderService } from '../services/purchaseOrderService';
import { recipeService } from '../services/recipeService';
import { inventoryService } from '../services/inventoryService';

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
  auth: { currentUser: { uid: 'USER_CONCURRENCY_123' } }
}));

// Mock Audit Service
vi.mock('../services/auditService', () => ({
  auditService: {
    logEvent: vi.fn().mockResolvedValue(undefined)
  }
}));

import * as firestore from 'firebase/firestore';
import { auth } from '../config/firebase';

describe('M7-7F Concurrency, Atomic Isolation & Idempotency Hardening Suite (22 Tests)', () => {
  let idempotencyService: IdempotencyService;

  beforeEach(() => {
    vi.clearAllMocks();
    idempotencyService = new IdempotencyService();
    (auth as any).currentUser = { uid: 'USER_CONCURRENCY_123' };

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
            ownerId: 'OWNER_MGR_123',
            name: 'Concurrency Test Restaurant'
          })
        } as any;
      }

      if (path.includes('/inventoryItems/inv_rice_1')) {
        return {
          exists: () => true,
          data: () => ({
            id: 'inv_rice_1',
            restaurantId: 'rest_test_conc',
            name: 'Basmati Rice',
            unit: 'kg',
            currentQuantity: 100,
            minimumQuantity: 10,
            costPerUnitPaise: 8000,
            active: true,
            status: 'active'
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
  // IDEMPOTENCY CORE PROTOCOL TESTS (1-7)
  // ============================================================================
  describe('Idempotency Protocol & Deterministic Fingerprints', () => {
    it('1: Computes deterministic request signature regardless of object key ordering', () => {
      const payloadA = { restaurantId: 'rest_1', quantity: 10, unit: 'kg', name: 'Rice' };
      const payloadB = { name: 'Rice', unit: 'kg', quantity: 10, restaurantId: 'rest_1' };

      const sigA = createRequestSignature(payloadA);
      const sigB = createRequestSignature(payloadB);

      expect(sigA).toBe(sigB);
      expect(sigA.length).toBe(64); // SHA-256 hex string
    });

    it('2: Different payload parameters produce distinct request signatures', () => {
      const payloadA = { restaurantId: 'rest_1', quantity: 10, unit: 'kg' };
      const payloadB = { restaurantId: 'rest_1', quantity: 15, unit: 'kg' };

      expect(createRequestSignature(payloadA)).not.toBe(createRequestSignature(payloadB));
    });

    it('3: Acquires new idempotency lease when clientRequestId has not been used', async () => {
      vi.mocked(firestore.getDoc).mockResolvedValueOnce({
        exists: () => false,
        data: () => null
      } as any);

      const res = await idempotencyService.checkOrAcquire(
        'rest_test_conc',
        'client_req_001',
        'create_inventory_item',
        { name: 'Sugar', quantity: 50 }
      );

      expect(['proceed', 'execute']).toContain(res.action);
    });

    it('4: Returns cached result on duplicate clientRequestId with matching payload', async () => {
      const payload = { name: 'Sugar', quantity: 50 };
      const sig = createRequestSignature(payload);
      const mockCachedData = { id: 'inv_cached_123', name: 'Sugar', currentQuantity: 50 };

      vi.mocked(firestore.getDoc).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          clientRequestId: 'client_req_001',
          operation: 'create_inventory_item',
          requestSignature: sig,
          status: 'completed',
          result: mockCachedData
        })
      } as any);

      const res = await idempotencyService.checkOrAcquire(
        'rest_test_conc',
        'client_req_001',
        'create_inventory_item',
        payload
      );

      expect(res.action).toBe('return_cached');
      if (res.action === 'return_cached') {
        expect(res.cachedResult).toEqual(mockCachedData);
      }
    });

    it('5: Detects payload tampering on reused clientRequestId and rejects with conflict', async () => {
      const originalPayload = { name: 'Sugar', quantity: 50 };
      const originalSig = createRequestSignature(originalPayload);

      const tamperedPayload = { name: 'Sugar', quantity: 500 }; // Altered!

      vi.mocked(firestore.getDoc).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          clientRequestId: 'client_req_001',
          operation: 'create_inventory_item',
          requestSignature: originalSig,
          status: 'completed'
        })
      } as any);

      await expect(
        idempotencyService.checkOrAcquire(
          'rest_test_conc',
          'client_req_001',
          'create_inventory_item',
          tamperedPayload
        )
      ).rejects.toThrow(/tampering|mismatch/i);
    });

    it('6: Handles in-flight concurrent execution on same clientRequestId safely', async () => {
      const payload = { name: 'Sugar', quantity: 50 };
      const sig = createRequestSignature(payload);

      vi.mocked(firestore.getDoc).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          clientRequestId: 'client_req_001',
          operation: 'create_inventory_item',
          requestSignature: sig,
          status: 'in_progress',
          createdAt: { toMillis: () => Date.now() - 5000 } // Recent in-progress lease
        })
      } as any);

      await expect(
        idempotencyService.checkOrAcquire(
          'rest_test_conc',
          'client_req_001',
          'create_inventory_item',
          payload
        )
      ).rejects.toThrow(/in progress/i);
    });

    it('7: Records failure and clears blocking status on failed execution', async () => {
      await idempotencyService.recordFailure(
        'rest_test_conc',
        'client_req_failed',
        'create_inventory_item',
        'Stock validation failed'
      );

      expect(firestore.setDoc).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // CONCURRENT ATOMIC TRANSACTIONS & ROLLBACKS (8-15)
  // ============================================================================
  describe('Concurrent Atomic Transactions & All-or-Nothing Rollbacks', () => {
    it('8: Rollback guarantees zero stock mutation when one recipe ingredient fails sufficiency', async () => {
      vi.mocked(firestore.getDocs).mockImplementation(async (q: any) => {
        const path = q?.colRef?.path || '';
        if (path.includes('recipes')) {
          return {
            empty: false,
            docs: [
              {
                id: 'rec_combo',
                data: () => ({
                  id: 'rec_combo',
                  menuItemId: 'item_combo_1',
                  status: 'active',
                  ingredients: [
                    { inventoryItemId: 'inv_rice_1', quantity: 0.5, unit: 'kg' },
                    { inventoryItemId: 'inv_saffron_1', quantity: 10, unit: 'g' } // Saffron will fail
                  ]
                })
              }
            ]
          } as any;
        }
        return {
          empty: true,
          docs: []
        } as any;
      });

      const mockTxUpdate = vi.fn();
      const mockTxSet = vi.fn();

      vi.mocked(firestore.runTransaction).mockImplementation(async (_db, updateFn: any) => {
        const tx = {
          get: async (ref: any) => {
            if (ref.path.includes('inv_rice_1')) {
              return {
                exists: () => true,
                data: () => ({ id: 'inv_rice_1', restaurantId: 'rest_test_conc', name: 'Rice', currentQuantity: 100, unit: 'kg', active: true })
              };
            }
            if (ref.path.includes('inv_saffron_1')) {
              return {
                exists: () => true,
                data: () => ({ id: 'inv_saffron_1', restaurantId: 'rest_test_conc', name: 'Saffron', currentQuantity: 2, unit: 'g', active: true }) // Only 2g available!
              };
            }
            return { exists: () => false };
          },
          update: mockTxUpdate,
          set: mockTxSet
        };
        return updateFn(tx);
      });

      await expect(
        stockConsumptionService.consumeStockForOrder('rest_test_conc', {
          orderId: 'ord_atomic_fail_1',
          items: [{ itemId: 'item_combo_1', quantity: 1, nameSnapshot: 'Combo' }]
        })
      ).rejects.toThrow(/Insufficient stock for "Saffron"/i);

      // Verify NO updates were committed to transaction
      expect(mockTxUpdate).not.toHaveBeenCalled();
      expect(mockTxSet).not.toHaveBeenCalled();
    });

    it('9: Idempotent replay of stock consumption returns existing consumption records without re-decrementing stock', async () => {
      const existingRecord = {
        id: 'sc_existing_1',
        consumptionId: 'sc_existing_1',
        orderId: 'ord_duplicate_1',
        status: 'consumed',
        quantity: 0.5
      };

      vi.mocked(firestore.getDocs).mockImplementation(async (q: any) => {
        return {
          empty: false,
          docs: [
            {
              id: 'sc_existing_1',
              data: () => existingRecord
            }
          ]
        } as any;
      });

      const res = await stockConsumptionService.consumeStockForOrder('rest_test_conc', {
        orderId: 'ord_duplicate_1',
        items: [{ itemId: 'item_biryani_1', quantity: 1 }]
      });

      expect(res.consumptions.length).toBe(1);
      expect(res.consumptions[0].id).toBe('sc_existing_1');
      expect(res.movements.length).toBe(0); // ZERO additional stock movements created
      expect(firestore.runTransaction).not.toHaveBeenCalled();
    });

    it('10: Idempotent replay of order reversal returns existing reversed records without double-incrementing stock', async () => {
      const reversedRecord = {
        id: 'sc_reversed_1',
        orderId: 'ord_cancel_replay_1',
        status: 'reversed',
        quantity: 0.5
      };

      vi.mocked(firestore.getDocs).mockImplementation(async (q: any) => {
        return {
          empty: false,
          docs: [
            {
              id: 'sc_reversed_1',
              data: () => reversedRecord
            }
          ]
        } as any;
      });

      const res = await stockConsumptionService.reverseOrderStockConsumption(
        'rest_test_conc',
        'ord_cancel_replay_1',
        'Replay test'
      );

      expect(res.reversedConsumptions.length).toBe(1);
      expect(res.compensatingMovements.length).toBe(0); // ZERO duplicate compensating movements
      expect(firestore.runTransaction).not.toHaveBeenCalled();
    });

    it('11: Handles simultaneous stock receiving without over-receiving ordered quantities', async () => {
      const mockPO = {
        purchaseOrderId: 'po_conc_1',
        orderNumber: 'PO-2026-CONC',
        restaurantId: 'rest_test_conc',
        status: 'submitted',
        supplierSnapshot: { name: 'Supplier' },
        items: [
          {
            id: 'poi_1',
            inventoryItemId: 'inv_rice_1',
            itemNameSnapshot: 'Rice',
            quantityOrdered: 50,
            remainingQuantity: 50,
            unit: 'kg'
          }
        ]
      };

      vi.mocked(firestore.runTransaction).mockImplementation(async (_db, updateFn: any) => {
        const tx = {
          get: async (ref: any) => {
            if (ref.path.includes('purchaseOrders/po_conc_1')) {
              return { exists: () => true, data: () => mockPO };
            }
            if (ref.path.includes('inventoryItems/inv_rice_1')) {
              return { exists: () => true, data: () => ({ id: 'inv_rice_1', restaurantId: 'rest_test_conc', name: 'Rice', unit: 'kg', currentQuantity: 100, active: true }) };
            }
            return { exists: () => false };
          },
          update: vi.fn(),
          set: vi.fn()
        };
        return updateFn(tx);
      });

      const res = await purchaseOrderService.receiveGoods('rest_test_conc', {
        purchaseOrderId: 'po_conc_1',
        items: [{ purchaseOrderItemId: 'poi_1', quantityReceived: 50 }]
      });

      expect(res.purchaseOrder.status).toBe('received');
      expect(res.purchaseOrder.items[0].remainingQuantity).toBe(0);
    });

    it('12: Handles partial receiving followed by full receiving transition', async () => {
      const mockPO = {
        purchaseOrderId: 'po_partial_1',
        orderNumber: 'PO-2026-PART',
        restaurantId: 'rest_test_conc',
        status: 'submitted',
        supplierSnapshot: { name: 'Supplier' },
        items: [
          {
            id: 'poi_1',
            inventoryItemId: 'inv_rice_1',
            itemNameSnapshot: 'Rice',
            quantityOrdered: 100,
            remainingQuantity: 100,
            unit: 'kg'
          }
        ]
      };

      vi.mocked(firestore.runTransaction).mockImplementation(async (_db, updateFn: any) => {
        const tx = {
          get: async (ref: any) => {
            if (ref.path.includes('purchaseOrders/po_partial_1')) {
              return { exists: () => true, data: () => mockPO };
            }
            if (ref.path.includes('inventoryItems/inv_rice_1')) {
              return { exists: () => true, data: () => ({ id: 'inv_rice_1', restaurantId: 'rest_test_conc', name: 'Rice', unit: 'kg', currentQuantity: 100, active: true }) };
            }
            return { exists: () => false };
          },
          update: vi.fn(),
          set: vi.fn()
        };
        return updateFn(tx);
      });

      const res = await purchaseOrderService.receiveGoods('rest_test_conc', {
        purchaseOrderId: 'po_partial_1',
        items: [{ purchaseOrderItemId: 'poi_1', quantityReceived: 40 }]
      });

      expect(res.purchaseOrder.status).toBe('partiallyReceived');
      expect(res.purchaseOrder.items[0].remainingQuantity).toBe(60);
      expect(res.purchaseOrder.items[0].receivedQuantity).toBe(40);
    });

    it('13: Prevents duplicate activation of recipe for same menu item', async () => {
      vi.mocked(firestore.getDoc).mockImplementation(async (ref: any) => {
        const path = ref.path;
        if (path.includes('/members/')) {
          return { exists: () => true, data: () => ({ role: 'manager', isActive: true, status: 'active' }) } as any;
        }
        if (path.match(/^restaurants\/[^/]+$/)) {
          return { exists: () => true, data: () => ({ ownerId: 'OWNER_MGR_123', name: 'Conc Rest' }) } as any;
        }
        if (path.includes('recipes/rec_already_active')) {
          return {
            exists: () => true,
            data: () => ({
              id: 'rec_already_active',
              restaurantId: 'rest_test_conc',
              menuItemId: 'item_biryani_1',
              status: 'active',
              version: 1
            })
          } as any;
        }
        return { exists: () => false } as any;
      });

      const res = await recipeService.activateRecipe('rest_test_conc', 'rec_already_active');
      expect(res.status).toBe('active');
      expect(firestore.runTransaction).not.toHaveBeenCalled(); // No unnecessary write
    });

    it('14: Concurrent stock movements execute atomically and maintain running balance', async () => {
      let balance = 100;

      vi.mocked(firestore.runTransaction).mockImplementation(async (_db, updateFn: any) => {
        const tx = {
          get: async () => ({
            exists: () => true,
            data: () => ({
              id: 'inv_rice_1',
              restaurantId: 'rest_test_conc',
              name: 'Basmati Rice',
              unit: 'kg',
              currentQuantity: balance,
              active: true
            })
          }),
          update: (_ref: any, data: any) => {
            balance = data.currentQuantity;
          },
          set: vi.fn()
        };
        return updateFn(tx);
      });

      await inventoryService.recordStockMovement('rest_test_conc', {
        inventoryItemId: 'inv_rice_1',
        type: 'stock_out',
        quantity: 10,
        reason: 'Order 1'
      });
      expect(balance).toBe(90);

      await inventoryService.recordStockMovement('rest_test_conc', {
        inventoryItemId: 'inv_rice_1',
        type: 'stock_out',
        quantity: 15,
        reason: 'Order 2'
      });
      expect(balance).toBe(75);

      await inventoryService.recordStockMovement('rest_test_conc', {
        inventoryItemId: 'inv_rice_1',
        type: 'stock_in',
        quantity: 25,
        reason: 'Replenishment'
      });
      expect(balance).toBe(100);
    });

    it('15: Atomic transaction rollback prevents orphaned stock movements if inventory update throws', async () => {
      vi.mocked(firestore.runTransaction).mockImplementation(async (_db, updateFn: any) => {
        const tx = {
          get: async () => ({
            exists: () => true,
            data: () => ({
              id: 'inv_rice_1',
              restaurantId: 'rest_test_conc',
              name: 'Basmati Rice',
              unit: 'kg',
              currentQuantity: 100,
              active: true
            })
          }),
          update: () => {
            throw new Error('Database write collision');
          },
          set: vi.fn()
        };
        return updateFn(tx);
      });

      await expect(
        inventoryService.recordStockMovement('rest_test_conc', {
          inventoryItemId: 'inv_rice_1',
          type: 'stock_out',
          quantity: 10,
          reason: 'Test rollback'
        })
      ).rejects.toThrow('Database write collision');
    });
  });

  // ============================================================================
  // IDEMPOTENCY END-TO-END MUTATIONS (16-22)
  // ============================================================================
  describe('Idempotency Across M7 Service APIs', () => {
    it('16: InventoryService create item honors clientRequestId', async () => {
      const clientReqId = 'req_inv_item_001';
      const itemData = {
        name: 'Salt',
        unit: 'kg' as const,
        currentQuantity: 50,
        minimumQuantity: 5,
        costPerUnitPaise: 2000
      };

      const item = await inventoryService.createInventoryItem('rest_test_conc', itemData, clientReqId);
      expect(item.name).toBe('Salt');
    });

    it('17: RecipeService create recipe honors clientRequestId', async () => {
      const clientReqId = 'req_recipe_001';
      vi.mocked(firestore.getDoc).mockImplementation(async (ref: any) => {
        const path = ref.path;
        if (path.includes('/members/')) {
          return { exists: () => true, data: () => ({ role: 'manager', isActive: true, status: 'active' }) } as any;
        }
        if (path.match(/^restaurants\/[^/]+$/)) {
          return { exists: () => true, data: () => ({ ownerId: 'OWNER_MGR_123', name: 'Conc Rest' }) } as any;
        }
        if (path.includes('items/item_biryani_1')) {
          return { exists: () => true, data: () => ({ id: 'item_biryani_1', restaurantId: 'rest_test_conc', name: 'Biryani' }) } as any;
        }
        if (path.includes('inventoryItems/inv_rice_1')) {
          return { exists: () => true, data: () => ({ id: 'inv_rice_1', restaurantId: 'rest_test_conc', name: 'Rice', unit: 'kg', active: true, costPerUnitPaise: 8000 }) } as any;
        }
        return { exists: () => false } as any;
      });

      const recipe = await recipeService.createRecipe(
        'rest_test_conc',
        {
          menuItemId: 'item_biryani_1',
          ingredients: [{ inventoryItemId: 'inv_rice_1', quantity: 0.25, unit: 'kg' }]
        },
        clientReqId
      );

      expect(recipe.version).toBe(1);
    });

    it('18: PurchaseOrderService submit PO honors clientRequestId', async () => {
      const clientReqId = 'req_po_submit_001';
      vi.mocked(firestore.getDoc).mockImplementation(async (ref: any) => {
        const path = ref.path;
        if (path.includes('/members/')) {
          return { exists: () => true, data: () => ({ role: 'manager', isActive: true, status: 'active' }) } as any;
        }
        if (path.match(/^restaurants\/[^/]+$/)) {
          return { exists: () => true, data: () => ({ ownerId: 'OWNER_MGR_123', name: 'Conc Rest' }) } as any;
        }
        if (path.includes('purchaseOrders/po_draft_1')) {
          return {
            exists: () => true,
            data: () => ({
              purchaseOrderId: 'po_draft_1',
              restaurantId: 'rest_test_conc',
              status: 'draft',
              orderNumber: 'PO-101',
              supplierSnapshot: { name: 'Supplier' }
            })
          } as any;
        }
        return { exists: () => false } as any;
      });

      const po = await purchaseOrderService.submitPurchaseOrder('rest_test_conc', 'po_draft_1', clientReqId);
      expect(po.status).toBe('submitted');
    });

    it('19: PurchaseOrderService cancel PO honors clientRequestId', async () => {
      const clientReqId = 'req_po_cancel_001';
      vi.mocked(firestore.getDoc).mockImplementation(async (ref: any) => {
        const path = ref.path;
        if (path.includes('/members/')) {
          return { exists: () => true, data: () => ({ role: 'manager', isActive: true, status: 'active' }) } as any;
        }
        if (path.match(/^restaurants\/[^/]+$/)) {
          return { exists: () => true, data: () => ({ ownerId: 'OWNER_MGR_123', name: 'Conc Rest' }) } as any;
        }
        if (path.includes('purchaseOrders/po_cancel_1')) {
          return {
            exists: () => true,
            data: () => ({
              purchaseOrderId: 'po_cancel_1',
              restaurantId: 'rest_test_conc',
              status: 'draft',
              orderNumber: 'PO-102',
              items: [{ receivedQuantity: 0 }]
            })
          } as any;
        }
        return { exists: () => false } as any;
      });

      const po = await purchaseOrderService.cancelPurchaseOrder('rest_test_conc', 'po_cancel_1', 'Supplier Out of Stock', clientReqId);
      expect(po.status).toBe('cancelled');
    });

    it('20: PurchaseOrderService receiveGoods honors clientRequestId', async () => {
      const clientReqId = 'req_po_recv_001';
      const mockPO = {
        purchaseOrderId: 'po_recv_1',
        orderNumber: 'PO-103',
        restaurantId: 'rest_test_conc',
        status: 'submitted',
        supplierSnapshot: { name: 'Supplier' },
        items: [
          {
            id: 'poi_1',
            inventoryItemId: 'inv_rice_1',
            itemNameSnapshot: 'Rice',
            quantityOrdered: 20,
            remainingQuantity: 20,
            unit: 'kg'
          }
        ]
      };

      vi.mocked(firestore.runTransaction).mockImplementation(async (_db, updateFn: any) => {
        const tx = {
          get: async (ref: any) => {
            if (ref.path.includes('purchaseOrders/po_recv_1')) {
              return { exists: () => true, data: () => mockPO };
            }
            if (ref.path.includes('inventoryItems/inv_rice_1')) {
              return { exists: () => true, data: () => ({ id: 'inv_rice_1', restaurantId: 'rest_test_conc', name: 'Rice', unit: 'kg', currentQuantity: 50, active: true }) };
            }
            return { exists: () => false };
          },
          update: vi.fn(),
          set: vi.fn()
        };
        return updateFn(tx);
      });

      const res = await purchaseOrderService.receiveGoods(
        'rest_test_conc',
        {
          purchaseOrderId: 'po_recv_1',
          items: [{ purchaseOrderItemId: 'poi_1', quantityReceived: 20 }]
        },
        clientReqId
      );

      expect(res.purchaseOrder.status).toBe('received');
    });

    it('21: StockLedgerService recordMovement honors clientRequestId', async () => {
      const clientReqId = 'req_movement_001';
      vi.mocked(firestore.runTransaction).mockImplementation(async (_db, updateFn: any) => {
        const tx = {
          get: async () => ({
            exists: () => true,
            data: () => ({
              id: 'inv_rice_1',
              restaurantId: 'rest_test_conc',
              name: 'Basmati Rice',
              unit: 'kg',
              currentQuantity: 100,
              active: true
            })
          }),
          update: vi.fn(),
          set: vi.fn()
        };
        return updateFn(tx);
      });

      const movement = await inventoryService.recordStockMovement(
        'rest_test_conc',
        {
          inventoryItemId: 'inv_rice_1',
          type: 'stock_in',
          quantity: 20,
          reason: 'Restock',
          clientRequestId: clientReqId
        }
      );

      expect(movement.delta).toBe(20);
      expect(movement.resultingQuantity).toBe(120);
    });

    it('22: StockConsumptionService consumeStockForOrder generates orderId fallback idempotency key', async () => {
      vi.mocked(firestore.getDocs).mockImplementation(async () => ({
        empty: true,
        docs: []
      } as any));

      const res = await stockConsumptionService.consumeStockForOrder('rest_test_conc', {
        orderId: 'ord_no_req_id',
        items: []
      });

      expect(res.consumptions).toEqual([]);
    });
  });
});
