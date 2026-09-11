import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KOTService } from '../services/kotService';
import { Order } from '../types/order';
import { KOT } from '../types/kot';

// Mock Firebase Firestore SDK
vi.mock('firebase/firestore', () => {
  return {
    collection: vi.fn((_db, ...pathSegments) => ({ type: 'collection', path: pathSegments.join('/') })),
    doc: vi.fn((_dbOrCol, ...pathSegments) => {
      const id = pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : `mock_id_${Math.random().toString(36).substring(2, 8)}`;
      const basePath = _dbOrCol && typeof _dbOrCol === 'object' && 'path' in _dbOrCol ? _dbOrCol.path : '';
      const subPath = pathSegments.join('/');
      const fullPath = [basePath, subPath].filter(Boolean).join('/') || id;
      return { id, path: fullPath };
    }),
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    query: vi.fn((colRef, ..._clauses) => ({ type: 'query', colRef })),
    where: vi.fn((field, op, val) => ({ type: 'where', field, op, val })),
    orderBy: vi.fn((field, dir) => ({ type: 'orderBy', field, dir })),
    onSnapshot: vi.fn(() => vi.fn()),
    serverTimestamp: vi.fn(() => new Date('2026-09-08T12:00:00Z'))
  };
});

// Mock Firebase Config
vi.mock('../config/firebase', () => ({
  db: { type: 'mockDb' },
  auth: { currentUser: { uid: 'TEST_AUTH_USER_123' } }
}));

import * as firestore from 'firebase/firestore';

describe('KOT Service & Kitchen Workflow Engine (Phase 2E)', () => {
  let kotService: KOTService;
  let sampleOrder: Order;

  beforeEach(() => {
    vi.clearAllMocks();
    kotService = new KOTService();

    sampleOrder = {
      id: 'ord_sample_101',
      restaurantId: 'REST_ABC_999',
      orderNumber: 'ORD-2026-001',
      tableId: 'table_t1',
      tableSessionId: 'session_s1',
      orderType: 'dineIn',
      source: 'pos',
      status: 'confirmed',
      items: [
        {
          itemId: 'item_veg_biryani',
          nameSnapshot: 'Veg Biryani',
          shortNameSnapshot: 'Veg Biry',
          quantity: 2,
          unitPriceMinor: 25000,
          taxRate: 5,
          taxInclusive: false,
          discountMinor: 0,
          lineSubtotalMinor: 50000,
          lineTaxMinor: 2500,
          lineTotalMinor: 52500,
          notes: 'Spicy',
          modifiers: [{ id: 'mod_1', name: 'Raita', priceMinor: 4000 }]
        },
        {
          itemId: 'item_garlic_naan',
          nameSnapshot: 'Butter Garlic Naan',
          shortNameSnapshot: 'Garlic Naan',
          quantity: 3,
          unitPriceMinor: 6000,
          taxRate: 5,
          taxInclusive: false,
          discountMinor: 0,
          lineSubtotalMinor: 18000,
          lineTaxMinor: 900,
          lineTotalMinor: 18900
        }
      ],
      subtotalMinor: 68000,
      discountMinor: 0,
      taxableAmountMinor: 68000,
      cgstMinor: 1700,
      sgstMinor: 1700,
      igstMinor: 0,
      totalTaxMinor: 3400,
      grandTotalMinor: 71400,
      paidAmountMinor: 0,
      dueAmountMinor: 71400,
      notes: 'Customer prefers quick serving',
      createdBy: 'USER_STAFF_1',
      updatedBy: 'USER_STAFF_1',
      createdAt: new Date(),
      updatedAt: new Date()
    };
  });

  describe('1. KOT Creation from Order (createKOTFromOrder)', () => {
    it('successfully creates a KOT for a confirmed dine-in order and updates order status to sentToKitchen', async () => {
      // Mock getDoc for Order
      vi.mocked(firestore.getDoc).mockImplementation(async (docRef: any) => {
        if (docRef.path?.includes('orders/ord_sample_101')) {
          return {
            exists: () => true,
            id: 'ord_sample_101',
            data: () => ({ ...sampleOrder })
          } as any;
        }
        if (docRef.path?.includes('tableSessions/session_s1')) {
          return {
            exists: () => true,
            id: 'session_s1',
            data: () => ({
              id: 'session_s1',
              restaurantId: 'REST_ABC_999',
              status: 'open'
            })
          } as any;
        }
        return { exists: () => false } as any;
      });

      const kot = await kotService.createKOTFromOrder({
        restaurantId: 'REST_ABC_999',
        orderId: 'ord_sample_101',
        createdBy: 'CHEF_RAMESH'
      });

      expect(kot.restaurantId).toBe('REST_ABC_999');
      expect(kot.orderId).toBe('ord_sample_101');
      expect(kot.tableId).toBe('table_t1');
      expect(kot.tableSessionId).toBe('session_s1');
      expect(kot.status).toBe('sentToKitchen');
      expect(kot.items).toHaveLength(2);
      expect(kot.items[0].nameSnapshot).toBe('Veg Biryani');
      expect(kot.items[0].quantity).toBe(2);
      expect(kot.items[0].notes).toBe('Spicy');
      expect(kot.items[0].modifiers).toHaveLength(1);
      expect(kot.items[1].nameSnapshot).toBe('Butter Garlic Naan');
      expect(kot.items[1].quantity).toBe(3);

      // Verify setDoc was called with KOT payload
      expect(firestore.setDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: expect.stringContaining('kots') }),
        expect.anything()
      );

      // Verify Order status was updated to sentToKitchen
      expect(firestore.updateDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'restaurants/REST_ABC_999/orders/ord_sample_101' }),
        expect.objectContaining({ status: 'sentToKitchen' })
      );
    });

    it('supports creating incremental / split KOT with specific items subset', async () => {
      vi.mocked(firestore.getDoc).mockImplementation(async (docRef: any) => {
        if (docRef.path?.includes('orders/ord_sample_101')) {
          return {
            exists: () => true,
            id: 'ord_sample_101',
            data: () => ({ ...sampleOrder })
          } as any;
        }
        return { exists: () => false } as any;
      });

      // Create KOT only with Item 2 (Garlic Naan)
      const kot = await kotService.createKOTFromOrder({
        restaurantId: 'REST_ABC_999',
        orderId: 'ord_sample_101',
        items: [sampleOrder.items[1]],
        notes: 'Priority naan request'
      });

      expect(kot.items).toHaveLength(1);
      expect(kot.items[0].nameSnapshot).toBe('Butter Garlic Naan');
      expect(kot.notes).toBe('Priority naan request');
    });

    it('rejects KOT creation if Order does not exist', async () => {
      vi.mocked(firestore.getDoc).mockResolvedValueOnce({
        exists: () => false
      } as any);

      await expect(
        kotService.createKOTFromOrder({
          restaurantId: 'REST_ABC_999',
          orderId: 'non_existent_order'
        })
      ).rejects.toThrow('Order "non_existent_order" does not exist in restaurant "REST_ABC_999"');
    });

    it('rejects KOT creation if Order status is draft, cancelled, or completed', async () => {
      // Draft
      vi.mocked(firestore.getDoc).mockResolvedValueOnce({
        exists: () => true,
        id: 'ord_draft',
        data: () => ({ ...sampleOrder, status: 'draft' })
      } as any);

      await expect(
        kotService.createKOTFromOrder({
          restaurantId: 'REST_ABC_999',
          orderId: 'ord_draft'
        })
      ).rejects.toThrow('Cannot create KOT from draft order');

      // Cancelled
      vi.mocked(firestore.getDoc).mockResolvedValueOnce({
        exists: () => true,
        id: 'ord_cancelled',
        data: () => ({ ...sampleOrder, status: 'cancelled' })
      } as any);

      await expect(
        kotService.createKOTFromOrder({
          restaurantId: 'REST_ABC_999',
          orderId: 'ord_cancelled'
        })
      ).rejects.toThrow('Cannot create KOT from cancelled order');

      // Completed
      vi.mocked(firestore.getDoc).mockResolvedValueOnce({
        exists: () => true,
        id: 'ord_completed',
        data: () => ({ ...sampleOrder, status: 'completed' })
      } as any);

      await expect(
        kotService.createKOTFromOrder({
          restaurantId: 'REST_ABC_999',
          orderId: 'ord_completed'
        })
      ).rejects.toThrow('Cannot create KOT from completed order');
    });

    it('enforces multi-tenant cross-restaurant isolation when fetching order', async () => {
      // Order belongs to REST_ANOTHER_TENANT
      vi.mocked(firestore.getDoc).mockResolvedValueOnce({
        exists: () => true,
        id: 'ord_sample_101',
        data: () => ({ ...sampleOrder, restaurantId: 'REST_ANOTHER_TENANT' })
      } as any);

      await expect(
        kotService.createKOTFromOrder({
          restaurantId: 'REST_ABC_999',
          orderId: 'ord_sample_101'
        })
      ).rejects.toThrow('Cross-tenant violation');
    });
  });

  describe('2. KOT Lifecycle & Status Workflow (updateKOTStatus & cancelKOT)', () => {
    let activeKot: KOT;

    beforeEach(() => {
      activeKot = {
        id: 'kot_101',
        kotNumber: 'KOT-2026-001',
        restaurantId: 'REST_ABC_999',
        orderId: 'ord_sample_101',
        tableId: 'table_t1',
        tableSessionId: 'session_s1',
        status: 'sentToKitchen',
        items: [
          { itemId: 'item_veg_biryani', nameSnapshot: 'Veg Biryani', quantity: 2 }
        ],
        createdBy: 'USER_1',
        updatedBy: 'USER_1',
        createdAt: new Date(),
        updatedAt: new Date()
      };
    });

    it('progresses through kitchen lifecycle states: sentToKitchen -> preparing -> ready -> served', async () => {
      // Step 1: sentToKitchen -> preparing
      vi.mocked(firestore.getDoc).mockResolvedValueOnce({
        exists: () => true,
        id: 'kot_101',
        data: () => ({ ...activeKot, status: 'sentToKitchen' })
      } as any);

      await kotService.updateKOTStatus('REST_ABC_999', 'kot_101', 'preparing', 'CHEF_A');
      expect(firestore.updateDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'restaurants/REST_ABC_999/kots/kot_101' }),
        expect.objectContaining({
          status: 'preparing',
          updatedBy: 'CHEF_A'
        })
      );

      // Step 2: preparing -> ready
      vi.mocked(firestore.getDoc).mockResolvedValueOnce({
        exists: () => true,
        id: 'kot_101',
        data: () => ({ ...activeKot, status: 'preparing' })
      } as any);

      await kotService.updateKOTStatus('REST_ABC_999', 'kot_101', 'ready', 'CHEF_A');
      expect(firestore.updateDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'restaurants/REST_ABC_999/kots/kot_101' }),
        expect.objectContaining({
          status: 'ready',
          updatedBy: 'CHEF_A'
        })
      );

      // Step 3: ready -> served
      vi.mocked(firestore.getDoc).mockResolvedValueOnce({
        exists: () => true,
        id: 'kot_101',
        data: () => ({ ...activeKot, status: 'ready' })
      } as any);

      await kotService.updateKOTStatus('REST_ABC_999', 'kot_101', 'served', 'WAITER_B');
      expect(firestore.updateDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'restaurants/REST_ABC_999/kots/kot_101' }),
        expect.objectContaining({
          status: 'served',
          updatedBy: 'WAITER_B'
        })
      );
    });

    it('rejects invalid status transitions (e.g. served -> preparing)', async () => {
      vi.mocked(firestore.getDoc).mockResolvedValueOnce({
        exists: () => true,
        id: 'kot_101',
        data: () => ({ ...activeKot, status: 'served' })
      } as any);

      await expect(
        kotService.updateKOTStatus('REST_ABC_999', 'kot_101', 'preparing', 'CHEF_A')
      ).rejects.toThrow('Illegal KOT status transition from "served" to "preparing"');
    });

    it('allows cancelling an active KOT with reason and audit metadata', async () => {
      vi.mocked(firestore.getDoc).mockResolvedValueOnce({
        exists: () => true,
        id: 'kot_101',
        data: () => ({ ...activeKot, status: 'preparing' })
      } as any);

      await kotService.cancelKOT(
        'REST_ABC_999',
        'kot_101',
        'Guest changed mind and left table',
        'MANAGER_VIKRAM'
      );

      expect(firestore.updateDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'restaurants/REST_ABC_999/kots/kot_101' }),
        expect.objectContaining({
          status: 'cancelled',
          cancellationReason: 'Guest changed mind and left table',
          cancelledBy: 'MANAGER_VIKRAM',
          updatedBy: 'MANAGER_VIKRAM'
        })
      );
    });

    it('handles idempotent duplicate action protection for updateKOTStatus', async () => {
      let idempRecord: any = null;

      vi.mocked(firestore.getDoc).mockImplementation(async (docRef: any) => {
        if (docRef.path?.includes('kots/kot_101')) {
          return {
            exists: () => true,
            id: 'kot_101',
            data: () => ({ ...activeKot, status: 'sentToKitchen' })
          } as any;
        }
        if (docRef.path?.includes('idempotency/')) {
          if (!idempRecord) {
            return { exists: () => false } as any;
          }
          return {
            exists: () => true,
            data: () => idempRecord
          } as any;
        }
        return { exists: () => false } as any;
      });

      vi.mocked(firestore.setDoc).mockImplementation(async (docRef: any, data: any) => {
        if (docRef.path?.includes('idempotency/')) {
          idempRecord = data;
        }
      });

      const idempotencyKey = 'idemp_key_12345';

      // First execution
      await kotService.updateKOTStatus('REST_ABC_999', 'kot_101', 'preparing', 'CHEF_A', idempotencyKey);
      
      // Second execution with same key should be idempotent (cached / return_cached)
      await kotService.updateKOTStatus('REST_ABC_999', 'kot_101', 'preparing', 'CHEF_A', idempotencyKey);

      expect(firestore.updateDoc).toHaveBeenCalledTimes(1);
    });

    it('rejects cancellation if KOT is already in terminal state (served)', async () => {
      vi.mocked(firestore.getDoc).mockResolvedValueOnce({
        exists: () => true,
        id: 'kot_101',
        data: () => ({ ...activeKot, status: 'served' })
      } as any);

      await expect(
        kotService.cancelKOT('REST_ABC_999', 'kot_101', 'Too late', 'MANAGER_VIKRAM')
      ).rejects.toThrow('Illegal KOT status transition from "served" to "cancelled"');
    });

    it('rejects cancellation without reason', async () => {
      await expect(
        kotService.cancelKOT('REST_ABC_999', 'kot_101', '', 'MANAGER_VIKRAM')
      ).rejects.toThrow('Cancellation reason is required');
    });
  });

  describe('3. Multi-KOT & Realtime Queries (getKOTsForOrder & getActiveKOTs)', () => {
    it('retrieves multiple KOTs for the same Order', async () => {
      const kot1: KOT = {
        id: 'kot_1',
        kotNumber: 'KOT-1',
        restaurantId: 'REST_ABC_999',
        orderId: 'ord_sample_101',
        status: 'served',
        items: [{ itemId: 'item_starter', nameSnapshot: 'Soup', quantity: 2 }],
        createdBy: 'STAFF_1',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      const kot2: KOT = {
        id: 'kot_2',
        kotNumber: 'KOT-2',
        restaurantId: 'REST_ABC_999',
        orderId: 'ord_sample_101',
        status: 'preparing',
        items: [{ itemId: 'item_main', nameSnapshot: 'Biryani', quantity: 1 }],
        createdBy: 'STAFF_1',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      vi.mocked(firestore.getDocs).mockResolvedValueOnce({
        docs: [
          { id: 'kot_1', data: () => kot1 },
          { id: 'kot_2', data: () => kot2 }
        ]
      } as any);

      const kots = await kotService.getKOTsForOrder('REST_ABC_999', 'ord_sample_101');
      expect(kots).toHaveLength(2);
      expect(kots[0].kotNumber).toBe('KOT-1');
      expect(kots[1].kotNumber).toBe('KOT-2');
    });

    it('retrieves active kitchen KOTs filtering out served and cancelled', async () => {
      const activeKots = [
        { id: 'kot_2', data: () => ({ id: 'kot_2', status: 'preparing' }) },
        { id: 'kot_3', data: () => ({ id: 'kot_3', status: 'ready' }) }
      ];

      vi.mocked(firestore.getDocs).mockResolvedValueOnce({
        docs: activeKots
      } as any);

      const kots = await kotService.getActiveKOTs('REST_ABC_999');
      expect(kots).toHaveLength(2);
      expect(firestore.where).toHaveBeenCalledWith(
        'status',
        'in',
        ['confirmed', 'sentToKitchen', 'preparing', 'ready']
      );
    });

    it('subscribes to kitchen KOTs with scoped listener', () => {
      const onUpdate = vi.fn();
      const onError = vi.fn();

      const unsubscribe = kotService.subscribeToKitchenKOTs('REST_ABC_999', onUpdate, onError);
      expect(firestore.onSnapshot).toHaveBeenCalledTimes(1);
      expect(typeof unsubscribe).toBe('function');
    });
  });
});
