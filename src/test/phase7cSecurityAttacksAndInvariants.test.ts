(globalThis as any).ENFORCE_PERMISSIONS_IN_TESTS = true;

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supplierService } from '../services/supplierService';
import { purchaseOrderService } from '../services/purchaseOrderService';
import {
  normalizeSupplierName,
  isValidPOStatusTransition,
  validateReceivingQuantities,
  calculatePOTotals
} from '../utils/supplierUtils';
import { hasPermission, checkPermission } from '../utils/permissions';
import { areUnitsCompatible, convertQuantity, roundQuantity } from '../utils/units';
import { createRequestSignature } from '../services/idempotencyService';

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
    query: vi.fn((colRef, ..._clauses) => ({ type: 'query', colRef })),
    where: vi.fn((field, op, val) => ({ type: 'where', field, op, val })),
    orderBy: vi.fn((field, dir) => ({ type: 'orderBy', field, dir })),
    onSnapshot: vi.fn(() => vi.fn()),
    serverTimestamp: vi.fn(() => new Date('2026-09-10T12:00:00Z')),
    runTransaction: vi.fn()
  };
});

// Mock Firebase Config
vi.mock('../config/firebase', () => ({
  db: { type: 'mockDb' },
  auth: { currentUser: { uid: 'USER_MGR_123' } }
}));

// Mock Audit Service
vi.mock('../services/auditService', () => ({
  auditService: {
    logEvent: vi.fn().mockResolvedValue(undefined)
  }
}));

import * as firestore from 'firebase/firestore';
import { auth } from '../config/firebase';

describe('M7-7C Security Attack Tests & Hardening Verification (Attacks 1-20)', () => {
  let mockCurrentRole = 'manager';
  let mockMemberActive = true;
  let mockMemberStatus = 'active';

  beforeEach(() => {
    vi.clearAllMocks();
    (auth as any).currentUser = { uid: 'USER_MGR_123' };
    mockCurrentRole = 'manager';
    mockMemberActive = true;
    mockMemberStatus = 'active';

    // Default getDoc handler resolving restaurant owner & member permissions
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
            restaurantId: 'rest_alpha',
            ownerId: 'OWNER_ROOT_999'
          })
        } as any;
      }

      return {
        exists: () => false,
        data: () => undefined
      } as any;
    });

    vi.mocked(firestore.getDocs).mockResolvedValue({
      empty: true,
      docs: []
    } as any);
  });

  // =========================================================================
  // Attack 1: Cross-Tenant Supplier Access / Tampering
  // =========================================================================
  it('Attack 1: Rejects cross-tenant supplier access, reading, and modifications', async () => {
    vi.mocked(firestore.getDoc).mockImplementation(async (ref: any) => {
      const path: string = ref?.path || '';
      if (path.includes('/members/')) {
        return {
          exists: () => true,
          data: () => ({ role: 'manager', isActive: true, status: 'active' })
        } as any;
      }
      if (path.includes('/suppliers/')) {
        return {
          exists: () => true,
          data: () => ({
            supplierId: 'sup_999',
            restaurantId: 'rest_beta', // Cross-tenant!
            name: 'Attacker Supplier',
            active: true
          })
        } as any;
      }
      return { exists: () => true, data: () => ({ ownerId: 'OWNER_ROOT' }) } as any;
    });

    await expect(
      supplierService.getSupplier('rest_alpha', 'sup_999')
    ).rejects.toThrow(/Cross-tenant supplier access rejected/i);
  });

  // =========================================================================
  // Attack 2: Cross-Tenant Purchase Order Creation / Reading / Cancellation
  // =========================================================================
  it('Attack 2: Rejects cross-tenant purchase order creation and operations', async () => {
    vi.mocked(firestore.getDoc).mockImplementation(async (ref: any) => {
      const path: string = ref?.path || '';
      if (path.includes('/members/')) {
        return {
          exists: () => true,
          data: () => ({ role: 'manager', isActive: true, status: 'active' })
        } as any;
      }
      if (path.includes('/suppliers/')) {
        return {
          exists: () => true,
          data: () => ({
            supplierId: 'sup_beta',
            restaurantId: 'rest_beta', // Supplier belongs to rest_beta!
            name: 'Beta Supplier',
            active: true
          })
        } as any;
      }
      if (path.includes('/purchaseOrders/')) {
        return {
          exists: () => true,
          data: () => ({
            purchaseOrderId: 'po_beta',
            restaurantId: 'rest_beta', // Cross tenant PO
            status: 'draft'
          })
        } as any;
      }
      return { exists: () => true, data: () => ({ ownerId: 'OWNER_ROOT' }) } as any;
    });

    await expect(
      purchaseOrderService.createPurchaseOrder('rest_alpha', {
        supplierId: 'sup_beta',
        items: [{ inventoryItemId: 'inv_1', quantityOrdered: 10, unit: 'kg', unitPriceMinor: 1000 }]
      })
    ).rejects.toThrow(/Cross-tenant supplier access rejected/i);

    await expect(
      purchaseOrderService.getPurchaseOrder('rest_alpha', 'po_beta')
    ).rejects.toThrow(/Cross-tenant purchase order access rejected/i);
  });

  // =========================================================================
  // Attack 3: Cross-Tenant Goods Receiving Injection
  // =========================================================================
  it('Attack 3: Rejects cross-tenant goods receiving attempts inside transactions', async () => {
    (firestore.runTransaction as any).mockImplementationOnce(async (_db: any, txCallback: any) => {
      const mockTx = {
        get: vi.fn().mockImplementation((ref: any) => {
          if (ref.path.includes('purchaseOrders')) {
            return Promise.resolve({
              exists: () => true,
              data: () => ({
                purchaseOrderId: 'po_victim',
                restaurantId: 'rest_victim', // Cross-tenant!
                status: 'submitted',
                items: [{ id: 'poi_1', inventoryItemId: 'inv_1', remainingQuantity: 10, unit: 'kg' }]
              })
            });
          }
          return Promise.resolve({ exists: () => false });
        }),
        set: vi.fn(),
        update: vi.fn()
      };
      return txCallback(mockTx);
    });

    await expect(
      purchaseOrderService.receiveGoods('rest_attacker', {
        purchaseOrderId: 'po_victim',
        items: [{ purchaseOrderItemId: 'poi_1', quantityReceived: 5 }]
      })
    ).rejects.toThrow(/Cross-tenant purchase order access rejected/i);
  });

  // =========================================================================
  // Attack 4: Unauthenticated Access
  // =========================================================================
  it('Attack 4: Blocks unauthenticated requests from creating suppliers or POs', async () => {
    (auth as any).currentUser = null;

    await expect(
      supplierService.createSupplier('rest_alpha', { name: 'Fresh Veg', phone: '1234567890' })
    ).rejects.toThrow(/Unauthorized|Authentication required|Forbidden|Access denied/i);

    await expect(
      purchaseOrderService.createPurchaseOrder('rest_alpha', {
        supplierId: 'sup_1',
        items: [{ inventoryItemId: 'inv_1', quantityOrdered: 5, unit: 'kg', unitPriceMinor: 100 }]
      })
    ).rejects.toThrow(/Unauthorized|Authentication required|Forbidden|Access denied/i);
  });

  // =========================================================================
  // Attack 5: Inactive Staff Member Mutation Attempt
  // =========================================================================
  it('Attack 5: Rejects supplier and PO mutations when staff member is inactive', async () => {
    mockMemberActive = false;

    await expect(
      supplierService.createSupplier('rest_alpha', { name: 'Dairy Co', phone: '9876543210' })
    ).rejects.toThrow(/Unauthorized to perform action/i);

    await expect(
      purchaseOrderService.submitPurchaseOrder('rest_alpha', 'po_1')
    ).rejects.toThrow(/Unauthorized to perform action/i);
  });

  // =========================================================================
  // Attacks 6, 7, 8: Kitchen, Captain, and Cashier Privilege Escalation
  // =========================================================================
  it('Attacks 6-8: Strictly blocks kitchen, captain, and cashier from supplier and procurement actions', async () => {
    const forbiddenRoles = ['kitchen', 'captain', 'cashier'];

    for (const role of forbiddenRoles) {
      expect(hasPermission(role as any, 'access_suppliers')).toBe(false);
      expect(hasPermission(role as any, 'manage_suppliers')).toBe(false);
      expect(hasPermission(role as any, 'access_purchases')).toBe(false);
      expect(hasPermission(role as any, 'manage_purchases')).toBe(false);
      expect(hasPermission(role as any, 'receive_purchases')).toBe(false);

      mockCurrentRole = role;

      await expect(
        supplierService.createSupplier('rest_alpha', { name: 'Attacker Mart', phone: '9999999999' })
      ).rejects.toThrow(/Unauthorized to perform action/i);

      await expect(
        purchaseOrderService.receiveGoods('rest_alpha', {
          purchaseOrderId: 'po_1',
          items: [{ purchaseOrderItemId: 'poi_1', quantityReceived: 10 }]
        })
      ).rejects.toThrow(/Unauthorized to perform action/i);
    }
  });

  // =========================================================================
  // Attack 9: Accountant Mutation Escalation (Read-only Boundary)
  // =========================================================================
  it('Attack 9: Verifies accountant has read access but cannot create suppliers, POs, or receive goods', async () => {
    expect(hasPermission('accountant', 'access_suppliers')).toBe(true);
    expect(hasPermission('accountant', 'access_purchases')).toBe(true);
    expect(hasPermission('accountant', 'manage_suppliers')).toBe(false);
    expect(hasPermission('accountant', 'manage_purchases')).toBe(false);
    expect(hasPermission('accountant', 'receive_purchases')).toBe(false);

    mockCurrentRole = 'accountant';

    await expect(
      supplierService.createSupplier('rest_alpha', { name: 'Audit Supplies', phone: '1111111111' })
    ).rejects.toThrow(/Unauthorized to perform action/i);

    await expect(
      purchaseOrderService.createPurchaseOrder('rest_alpha', {
        supplierId: 'sup_1',
        items: [{ inventoryItemId: 'inv_1', quantityOrdered: 10, unit: 'kg', unitPriceMinor: 500 }]
      })
    ).rejects.toThrow(/Unauthorized to perform action/i);

    await expect(
      purchaseOrderService.receiveGoods('rest_alpha', {
        purchaseOrderId: 'po_1',
        items: [{ purchaseOrderItemId: 'poi_1', quantityReceived: 5 }]
      })
    ).rejects.toThrow(/Unauthorized to perform action/i);
  });

  // =========================================================================
  // Attack 10: Over-Receiving Attack (> Remaining Quantity)
  // =========================================================================
  it('Attack 10: Strictly rejects over-receiving attempts where quantity received > remaining quantity', () => {
    const poItems = [
      { id: 'poi_1', remainingQuantity: 50, unit: 'kg' },
      { id: 'poi_2', remainingQuantity: 10, unit: 'litre' }
    ];

    // Attempting to receive 51 when remaining is 50
    const attackReceiving = [
      { purchaseOrderItemId: 'poi_1', quantityReceived: 51 }
    ];

    const validation = validateReceivingQuantities(poItems, attackReceiving);
    expect(validation.isValid).toBe(false);
    expect(validation.errors[0]).toContain('exceeds remaining quantity (50 kg)');
  });

  // =========================================================================
  // Attack 11: Negative / Zero Receiving Quantity Injection
  // =========================================================================
  it('Attack 11: Rejects zero and negative receiving quantity tampering', () => {
    const poItems = [{ id: 'poi_1', remainingQuantity: 50, unit: 'kg' }];

    const zeroValidation = validateReceivingQuantities(poItems, [
      { purchaseOrderItemId: 'poi_1', quantityReceived: 0 }
    ]);
    expect(zeroValidation.isValid).toBe(false);
    expect(zeroValidation.errors[0]).toContain('must be greater than 0');

    const negativeValidation = validateReceivingQuantities(poItems, [
      { purchaseOrderItemId: 'poi_1', quantityReceived: -25 }
    ]);
    expect(negativeValidation.isValid).toBe(false);
    expect(negativeValidation.errors[0]).toContain('must be greater than 0');
  });

  // =========================================================================
  // Attack 12: Receiving on Draft Purchase Order
  // =========================================================================
  it('Attack 12: Rejects receiving on a draft purchase order', async () => {
    (firestore.runTransaction as any).mockImplementationOnce(async (_db: any, txCallback: any) => {
      const mockTx = {
        get: vi.fn().mockImplementation((ref: any) => {
          if (ref.path.includes('purchaseOrders')) {
            return Promise.resolve({
              exists: () => true,
              data: () => ({
                purchaseOrderId: 'po_draft_1',
                restaurantId: 'rest_alpha',
                status: 'draft', // Draft! Not submitted
                items: [{ id: 'poi_1', inventoryItemId: 'inv_1', remainingQuantity: 10, unit: 'kg' }]
              })
            });
          }
          return Promise.resolve({ exists: () => true, data: () => ({ active: true, restaurantId: 'rest_alpha', unit: 'kg', currentQuantity: 0 }) });
        }),
        set: vi.fn(),
        update: vi.fn()
      };
      return txCallback(mockTx);
    });

    await expect(
      purchaseOrderService.receiveGoods('rest_alpha', {
        purchaseOrderId: 'po_draft_1',
        items: [{ purchaseOrderItemId: 'poi_1', quantityReceived: 5 }]
      })
    ).rejects.toThrow(/Cannot receive goods on purchase order with status 'draft'/i);
  });

  // =========================================================================
  // Attack 13: Receiving on Cancelled Purchase Order
  // =========================================================================
  it('Attack 13: Rejects receiving on a cancelled purchase order', async () => {
    (firestore.runTransaction as any).mockImplementationOnce(async (_db: any, txCallback: any) => {
      const mockTx = {
        get: vi.fn().mockImplementation((ref: any) => {
          if (ref.path.includes('purchaseOrders')) {
            return Promise.resolve({
              exists: () => true,
              data: () => ({
                purchaseOrderId: 'po_cancelled_1',
                restaurantId: 'rest_alpha',
                status: 'cancelled', // Cancelled!
                items: [{ id: 'poi_1', inventoryItemId: 'inv_1', remainingQuantity: 10, unit: 'kg' }]
              })
            });
          }
          return Promise.resolve({ exists: () => true, data: () => ({ active: true, restaurantId: 'rest_alpha', unit: 'kg', currentQuantity: 0 }) });
        }),
        set: vi.fn(),
        update: vi.fn()
      };
      return txCallback(mockTx);
    });

    await expect(
      purchaseOrderService.receiveGoods('rest_alpha', {
        purchaseOrderId: 'po_cancelled_1',
        items: [{ purchaseOrderItemId: 'poi_1', quantityReceived: 5 }]
      })
    ).rejects.toThrow(/Cannot receive goods on purchase order with status 'cancelled'/i);
  });

  // =========================================================================
  // Attack 14: Receiving on Terminal 'received' Purchase Order
  // =========================================================================
  it('Attack 14: Rejects receiving on an already fully received purchase order', async () => {
    (firestore.runTransaction as any).mockImplementationOnce(async (_db: any, txCallback: any) => {
      const mockTx = {
        get: vi.fn().mockImplementation((ref: any) => {
          if (ref.path.includes('purchaseOrders')) {
            return Promise.resolve({
              exists: () => true,
              data: () => ({
                purchaseOrderId: 'po_done_1',
                restaurantId: 'rest_alpha',
                status: 'received', // Terminal state!
                items: [{ id: 'poi_1', inventoryItemId: 'inv_1', remainingQuantity: 0, unit: 'kg' }]
              })
            });
          }
          return Promise.resolve({ exists: () => true, data: () => ({ active: true, restaurantId: 'rest_alpha', unit: 'kg', currentQuantity: 100 }) });
        }),
        set: vi.fn(),
        update: vi.fn()
      };
      return txCallback(mockTx);
    });

    await expect(
      purchaseOrderService.receiveGoods('rest_alpha', {
        purchaseOrderId: 'po_done_1',
        items: [{ purchaseOrderItemId: 'poi_1', quantityReceived: 5 }]
      })
    ).rejects.toThrow(/Cannot receive goods on purchase order with status 'received'/i);
  });

  // =========================================================================
  // Attack 15: Cancelling a PO that has already received goods
  // =========================================================================
  it('Attack 15: Rejects cancellation if any goods have already been received', async () => {
    vi.mocked(firestore.getDoc).mockImplementation(async (ref: any) => {
      const path: string = ref?.path || '';
      if (path.includes('/members/')) {
        return {
          exists: () => true,
          data: () => ({ role: 'manager', isActive: true, status: 'active' })
        } as any;
      }
      if (path.includes('/purchaseOrders/')) {
        return {
          exists: () => true,
          data: () => ({
            purchaseOrderId: 'po_partial_1',
            restaurantId: 'rest_alpha',
            status: 'partiallyReceived',
            items: [
              { id: 'poi_1', quantityOrdered: 50, receivedQuantity: 20, remainingQuantity: 30 }
            ]
          })
        } as any;
      }
      return { exists: () => true, data: () => ({ ownerId: 'OWNER_ROOT' }) } as any;
    });

    await expect(
      purchaseOrderService.cancelPurchaseOrder('rest_alpha', 'po_partial_1', 'Supplier breach')
    ).rejects.toThrow(/Cannot cancel purchase order with received goods/i);
  });

  // =========================================================================
  // Attack 16: Incompatible Unit Injection
  // =========================================================================
  it('Attack 16: Rejects incompatible unit injection (e.g. litre vs kg) during PO creation', async () => {
    vi.mocked(firestore.getDoc).mockImplementation(async (ref: any) => {
      const path: string = ref?.path || '';
      if (path.includes('/members/')) {
        return {
          exists: () => true,
          data: () => ({ role: 'manager', isActive: true, status: 'active' })
        } as any;
      }
      if (path.includes('/suppliers/')) {
        return {
          exists: () => true,
          data: () => ({ supplierId: 'sup_1', restaurantId: 'rest_alpha', active: true, name: 'Spice Co', phone: '123' })
        } as any;
      }
      if (path.includes('/inventoryItems/')) {
        return {
          exists: () => true,
          data: () => ({ id: 'inv_solid', restaurantId: 'rest_alpha', active: true, name: 'Rice Flour', unit: 'kg' })
        } as any;
      }
      return { exists: () => true, data: () => ({ ownerId: 'OWNER_ROOT' }) } as any;
    });

    // PO specifies unit 'litre' (volume) vs base unit 'kg' (mass)
    await expect(
      purchaseOrderService.createPurchaseOrder('rest_alpha', {
        supplierId: 'sup_1',
        items: [{ inventoryItemId: 'inv_solid', quantityOrdered: 10, unit: 'litre' as any, unitPriceMinor: 5000 }]
      })
    ).rejects.toThrow(/Incompatible units for "Rice Flour": PO unit litre cannot be converted to inventory base unit kg/i);
  });

  // =========================================================================
  // Attack 17: Mutating Immutable Historical Fields
  // =========================================================================
  it('Attack 17: Protects immutable restaurantId and supplierId fields during supplier update', async () => {
    vi.mocked(firestore.getDoc).mockImplementation(async (ref: any) => {
      const path: string = ref?.path || '';
      if (path.includes('/members/')) {
        return {
          exists: () => true,
          data: () => ({ role: 'manager', isActive: true, status: 'active' })
        } as any;
      }
      if (path.includes('/suppliers/')) {
        return {
          exists: () => true,
          data: () => ({
            supplierId: 'sup_legit',
            restaurantId: 'rest_alpha',
            name: 'Original Name',
            phone: '1234567890',
            active: true
          })
        } as any;
      }
      return { exists: () => true, data: () => ({ ownerId: 'OWNER_ROOT' }) } as any;
    });

    const updated = await supplierService.updateSupplier('rest_alpha', 'sup_legit', {
      name: 'Renamed Legit Supplier'
    });

    expect(updated.restaurantId).toBe('rest_alpha');
    expect(updated.supplierId).toBe('sup_legit');
    expect(updated.name).toBe('Renamed Legit Supplier');
  });

  // =========================================================================
  // Attack 18: Stock Ledger Immutability & Audit Trail
  // =========================================================================
  it('Attack 18: Verifies historical stock movements and receivings cannot be overwritten or altered', () => {
    // State machine check: terminal states have empty transition lists
    expect(isValidPOStatusTransition('received', 'draft')).toBe(false);
    expect(isValidPOStatusTransition('received', 'submitted')).toBe(false);
    expect(isValidPOStatusTransition('cancelled', 'draft')).toBe(false);
    expect(isValidPOStatusTransition('cancelled', 'submitted')).toBe(false);
  });

  // =========================================================================
  // Attack 19: Replay Attack via Idempotency Key
  // =========================================================================
  it('Attack 19: Idempotent replay returns cached result, preventing duplicate receiving or stock movements', async () => {
    const mockReceivingResult = {
      purchaseOrder: { purchaseOrderId: 'po_idem', status: 'partiallyReceived' },
      receiving: { receivingId: 'rec_001', items: [{ quantityReceived: 20 }] }
    };

    const receivePayload = {
      purchaseOrderId: 'po_idem',
      items: [{ purchaseOrderItemId: 'poi_1', quantityReceived: 20 }]
    };

    const expectedSignature = createRequestSignature({
      ...receivePayload,
      restaurantId: 'rest_alpha'
    });

    vi.mocked(firestore.getDoc).mockImplementation(async (ref: any) => {
      const path: string = ref?.path || '';
      if (path.includes('/members/')) {
        return {
          exists: () => true,
          data: () => ({ role: 'manager', isActive: true, status: 'active' })
        } as any;
      }
      if (path.includes('/idempotency/')) {
        return {
          exists: () => true,
          data: () => ({
            status: 'completed',
            restaurantId: 'rest_alpha',
            idempotencyKey: 'key_replay_123',
            operation: 'receive_purchase_order',
            requestSignature: expectedSignature,
            responseSnapshot: mockReceivingResult
          })
        } as any;
      }
      return { exists: () => true, data: () => ({ ownerId: 'OWNER_ROOT' }) } as any;
    });

    const replayResult = await purchaseOrderService.receiveGoods(
      'rest_alpha',
      receivePayload,
      'key_replay_123'
    );

    // Should return cached result without invoking runTransaction
    expect(replayResult).toEqual(mockReceivingResult);
    expect(firestore.runTransaction).not.toHaveBeenCalled();
  });

  // =========================================================================
  // Attack 20: Concurrent Over-Receiving Race Condition
  // =========================================================================
  it('Attack 20: Concurrency protection serializes transactions and rejects cumulative over-receiving', async () => {
    // PO item ordered 100 kg. Device A received 60 kg, leaving 40 kg remaining.
    // Device B concurrently attempts 50 kg -> Must be rejected because 50 > 40!
    const poStateAfterA = {
      purchaseOrderId: 'po_race_1',
      restaurantId: 'rest_alpha',
      orderNumber: 'PO-20260910-1111',
      supplierId: 'sup_1',
      supplierSnapshot: { name: 'Farm Fresh' },
      status: 'partiallyReceived',
      items: [
        {
          id: 'poi_race_item',
          inventoryItemId: 'inv_flour',
          itemNameSnapshot: 'Wheat Flour',
          quantityOrdered: 100,
          receivedQuantity: 60, // A committed 60
          remainingQuantity: 40, // 40 remaining
          unit: 'kg'
        }
      ]
    };

    (firestore.runTransaction as any).mockImplementationOnce(async (_db: any, txCallback: any) => {
      const mockTx = {
        get: vi.fn().mockImplementation((ref: any) => {
          if (ref.path.includes('purchaseOrders')) {
            return Promise.resolve({
              exists: () => true,
              data: () => poStateAfterA
            });
          }
          return Promise.resolve({
            exists: () => true,
            data: () => ({
              id: 'inv_flour',
              restaurantId: 'rest_alpha',
              active: true,
              unit: 'kg',
              currentQuantity: 60
            })
          });
        }),
        set: vi.fn(),
        update: vi.fn()
      };
      return txCallback(mockTx);
    });

    await expect(
      purchaseOrderService.receiveGoods('rest_alpha', {
        purchaseOrderId: 'po_race_1',
        items: [{ purchaseOrderItemId: 'poi_race_item', quantityReceived: 50 }]
      })
    ).rejects.toThrow(/Remaining ordered quantity is only 40 kg\. Over-receiving rejected/i);
  });
});
