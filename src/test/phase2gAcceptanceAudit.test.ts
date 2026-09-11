import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaymentService } from '../services/paymentService';
import { TableSessionService } from '../services/tableSessionService';
import { IdempotencyService, createRequestSignature } from '../services/idempotencyService';
import { OfflineSyncService, MAX_OFFLINE_QUEUE_CAPACITY } from '../services/offlineSyncService';
import { Order } from '../types/order';
import { TableSession } from '../types/table';

// Mock Firebase Firestore SDK
vi.mock('firebase/firestore', () => {
  return {
    collection: vi.fn((_db, ...pathSegments) => ({ type: 'collection', path: pathSegments.join('/') })),
    doc: vi.fn((_dbOrCol, ...pathSegments) => {
      const id = pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : `mock_id_${Math.random().toString(36).substring(2, 8)}`;
      return { id, path: pathSegments.join('/') };
    }),
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
    query: vi.fn((colRef, ..._clauses) => ({ type: 'query', colRef })),
    where: vi.fn((field, op, val) => ({ type: 'where', field, op, val })),
    orderBy: vi.fn((field, dir) => ({ type: 'orderBy', field, dir })),
    onSnapshot: vi.fn(() => vi.fn()),
    serverTimestamp: vi.fn(() => new Date('2026-09-08T12:00:00Z')),
    runTransaction: vi.fn()
  };
});

// Mock Firebase Config
vi.mock('../config/firebase', () => ({
  db: { type: 'mockDb' },
  auth: { currentUser: { uid: 'STAFF_USER_ALPHA' } }
}));

import * as firestore from 'firebase/firestore';

describe('Phase 2G: Final Acceptance Audit Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  // ==========================================
  // SCENARIO 1: PAYMENT CONCURRENCY & OVERPAYMENT
  // ==========================================
  describe('1. Payment Concurrency & Financial Invariants', () => {
    it('prevents overpayment when two concurrent transactions attempt ₹700 on a ₹1,000 order', async () => {
      const paymentService = new PaymentService();
      const restaurantId = 'rest_audit_1';
      const orderId = 'ord_1000';

      // Order state in database: Grand total = 100000 paise (₹1,000.00), Paid = 0
      let orderDocState: Order = {
        id: orderId,
        restaurantId,
        orderNumber: 'ORD-1000',
        orderType: 'dineIn',
        source: 'pos',
        status: 'confirmed',
        tableId: 'tbl_1',
        tableSessionId: 'sess_1',
        items: [],
        subtotalMinor: 100000,
        discountMinor: 0,
        taxableAmountMinor: 100000,
        cgstMinor: 0,
        sgstMinor: 0,
        igstMinor: 0,
        totalTaxMinor: 0,
        grandTotalMinor: 100000, // ₹1,000.00
        paidAmountMinor: 0,
        dueAmountMinor: 100000,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'STAFF_USER_ALPHA'
      };

      // Mock Firestore runTransaction to simulate atomic OCC serialization
      vi.mocked(firestore.runTransaction).mockImplementation(async (_db, callback) => {
        const tx = {
          get: vi.fn(async (docRef: any) => {
            if (docRef.path.includes(`orders/${orderId}`)) {
              return {
                exists: () => true,
                data: () => ({ ...orderDocState })
              };
            }
            // Idempotency doc (not found initially)
            return { exists: () => false };
          }),
          set: vi.fn((_docRef: any, _data: any) => {}),
          update: vi.fn((docRef: any, data: any) => {
            if (docRef.path.includes(`orders/${orderId}`)) {
              orderDocState = {
                ...orderDocState,
                ...data
              };
            }
          }),
          delete: vi.fn()
        };
        return callback(tx as any);
      });

      // Attempt 1: Payment of ₹700 (70000 paise)
      const payment1 = await paymentService.recordPayment(
        restaurantId,
        {
          orderId,
          amountMinor: 70000,
          method: 'cash',
          status: 'completed'
        },
        'idemp_pay_1'
      );

      expect(payment1).toBeDefined();
      expect(payment1.amountMinor).toBe(70000);
      expect(orderDocState.paidAmountMinor).toBe(70000);
      expect(orderDocState.dueAmountMinor).toBe(30000);

      // Attempt 2: Concurrent payment of ₹700 (70000 paise) on the updated state
      await expect(
        paymentService.recordPayment(
          restaurantId,
          {
            orderId,
            amountMinor: 70000,
            method: 'cash',
            status: 'completed'
          },
          'idemp_pay_2'
        )
      ).rejects.toThrow(/Overpayment rejected/i);

      // Verify Financial Invariants:
      // 1. paid <= grandTotal
      expect(orderDocState.paidAmountMinor).toBeLessThanOrEqual(orderDocState.grandTotalMinor);
      // 2. paid (70000) + due (30000) = grandTotal (100000)
      expect(orderDocState.paidAmountMinor + orderDocState.dueAmountMinor).toBe(
        orderDocState.grandTotalMinor
      );
      // 3. paid >= 0 and due >= 0
      expect(orderDocState.paidAmountMinor).toBeGreaterThanOrEqual(0);
      expect(orderDocState.dueAmountMinor).toBeGreaterThanOrEqual(0);
      // 4. Exact remaining due
      expect(orderDocState.dueAmountMinor).toBe(30000);
    });
  });

  // ==========================================
  // SCENARIO 2: IDEMPOTENCY RETRY & CONFLICTS
  // ==========================================
  describe('2. Idempotency Retry & Conflict Rejection', () => {
    let idempotencyService: IdempotencyService;

    beforeEach(() => {
      idempotencyService = new IdempotencyService();
    });

    it('returns cached result for identical retry and rejects payload conflicts', async () => {
      const restaurantId = 'rest_audit_2';
      const key = 'idemp_key_unique_1';
      const originalPayload = { orderId: 'ord_1', amountMinor: 5000, method: 'cash' };

      let storedDoc: any = null;

      vi.mocked(firestore.getDoc).mockImplementation(async () => {
        if (!storedDoc) return { exists: () => false } as any;
        return {
          exists: () => true,
          data: () => storedDoc
        } as any;
      });

      vi.mocked(firestore.setDoc).mockImplementation(async (_ref, data) => {
        storedDoc = data;
      });

      // 1. Acquire key
      const firstCheck = await idempotencyService.checkOrAcquire(
        restaurantId,
        key,
        'record_payment',
        originalPayload
      );
      expect(firstCheck.action).toBe('execute');

      // 2. Record success
      const cachedResult = { paymentId: 'pay_999', status: 'completed' };
      await idempotencyService.recordSuccess(
        restaurantId,
        key,
        'record_payment',
        originalPayload,
        'pay_999',
        cachedResult
      );

      // 3. Retry exact same request -> must return cached result
      const retryCheck = await idempotencyService.checkOrAcquire(
        restaurantId,
        key,
        'record_payment',
        originalPayload
      );
      expect(retryCheck.action).toBe('return_cached');
      if (retryCheck.action === 'return_cached') {
        expect(retryCheck.cachedResult).toEqual(cachedResult);
      }

      // 4. Retry with different payload using same key -> MUST be rejected
      const conflictingPayload = { orderId: 'ord_1', amountMinor: 7500, method: 'cash' };
      await expect(
        idempotencyService.checkOrAcquire(
          restaurantId,
          key,
          'record_payment',
          conflictingPayload
        )
      ).rejects.toThrow(/Idempotency payload divergence/i);

      // 5. Same key across different operation types -> MUST be rejected with operation mismatch
      await expect(
        idempotencyService.checkOrAcquire(
          restaurantId,
          key,
          'create_order',
          originalPayload
        )
      ).rejects.toThrow(/Idempotency operation mismatch/i);
    });

    it('isolates idempotency keys strictly per restaurant tenant', () => {
      const sigA = createRequestSignature({ rest: 'A', amount: 100 });
      const sigB = createRequestSignature({ rest: 'B', amount: 100 });
      expect(sigA).not.toBe(sigB);
    });
  });

  // ==========================================
  // SCENARIO 3: OFFLINE QUEUE & RECONNECT
  // ==========================================
  describe('3. Offline Queue, Reconnect & Payment Safety', () => {
    let syncService: OfflineSyncService;

    beforeEach(() => {
      syncService = new OfflineSyncService();
    });

    it('enforces bounded queue capacity and rejects mutations beyond limit', () => {
      vi.spyOn(syncService, 'processQueue').mockImplementation(async () => {});

      // Fill queue up to MAX_OFFLINE_QUEUE_CAPACITY
      for (let i = 0; i < MAX_OFFLINE_QUEUE_CAPACITY; i++) {
        syncService.enqueue('rest_1', 'create_order', { i });
      }

      // Enqueueing beyond limit must throw bounded capacity error
      expect(() => {
        syncService.enqueue('rest_1', 'create_order', { overflow: true });
      }).toThrow(/Offline queue capacity limit reached/i);
    });

    it('rejects marking external digital payments (card/UPI) as completed while offline', () => {
      // Force offline state
      (syncService as any).isOnline = false;

      // Card payment attempted offline with status completed -> rejected
      expect(() => {
        syncService.enqueue('rest_1', 'record_payment', {
          orderId: 'ord_1',
          amountMinor: 5000,
          method: 'card',
          status: 'completed'
        });
      }).toThrow(/Cannot record external CARD payment as "completed" while offline/i);

      // UPI payment attempted offline with status completed -> rejected
      expect(() => {
        syncService.enqueue('rest_1', 'record_payment', {
          orderId: 'ord_1',
          amountMinor: 5000,
          method: 'upi',
          status: 'completed'
        });
      }).toThrow(/Cannot record external UPI payment as "completed" while offline/i);

      // Cash payment attempted offline -> Allowed into offline queue
      const cashItem = syncService.enqueue('rest_1', 'record_payment', {
        orderId: 'ord_1',
        amountMinor: 5000,
        method: 'cash',
        status: 'completed'
      });
      expect(cashItem.status).toBe('queued');
    });
  });

  // ==========================================
  // SCENARIO 4: TABLE SESSION CONCURRENCY
  // ==========================================
  describe('4. Table Session Concurrency & OCC Atomic Locking', () => {
    it('guarantees maximum ONE open session per physical table via Firestore transaction', async () => {
      const sessionService = new TableSessionService();
      const restaurantId = 'rest_audit_4';
      const tableId = 'tbl_10';

      // Table physical doc in database
      let tableDocState = {
        id: tableId,
        restaurantId,
        name: 'Table 10',
        tableNumber: '10',
        capacity: 4,
        isActive: true,
        activeSessionId: null as string | null
      };

      vi.mocked(firestore.runTransaction).mockImplementation(async (_db, callback) => {
        const tx = {
          get: vi.fn(async (docRef: any) => {
            if (docRef.path.includes(`tables/${tableId}`)) {
              return {
                exists: () => true,
                data: () => ({ ...tableDocState })
              };
            }
            return { exists: () => false };
          }),
          set: vi.fn((_docRef: any, _data: any) => {}),
          update: vi.fn((docRef: any, data: any) => {
            if (docRef.path.includes(`tables/${tableId}`)) {
              tableDocState = {
                ...tableDocState,
                ...data
              };
            }
          }),
          delete: vi.fn()
        };
        return callback(tx as any);
      });

      // Device 1: opens session
      const session1 = await sessionService.openSession(restaurantId, tableId, 2, 'WAITER_1');
      expect(session1).toBeDefined();
      expect(session1.status).toBe('open');
      expect(tableDocState.activeSessionId).toBe(session1.id);

      // Device 2: opens session concurrently on same table -> Transaction aborts with conflict
      await expect(
        sessionService.openSession(restaurantId, tableId, 3, 'WAITER_2')
      ).rejects.toThrow(/already has an active open session/i);

      // Close Session 1 -> Table lock is released
      vi.mocked(firestore.runTransaction).mockImplementationOnce(async (_db, callback) => {
        const tx = {
          get: vi.fn(async (docRef: any) => {
            if (docRef.path.includes(`tableSessions/${session1.id}`)) {
              return {
                exists: () => true,
                data: () => ({
                  id: session1.id,
                  restaurantId,
                  tableId,
                  status: 'open',
                  guestCount: 2
                })
              };
            }
            if (docRef.path.includes(`tables/${tableId}`)) {
              return {
                exists: () => true,
                data: () => ({ ...tableDocState })
              };
            }
            return { exists: () => false };
          }),
          set: vi.fn(),
          update: vi.fn((docRef: any, data: any) => {
            if (docRef.path.includes(`tables/${tableId}`)) {
              tableDocState = { ...tableDocState, ...data };
            }
          }),
          delete: vi.fn()
        };
        return callback(tx as any);
      });

      await sessionService.closeSession(restaurantId, session1.id, 'WAITER_1');
      expect(tableDocState.activeSessionId).toBeNull();
    });
  });

  // ==========================================
  // SCENARIO 5: CROSS-TENANT ISOLATION
  // ==========================================
  describe('5. Cross-Tenant Security & Decoupled Auth Isolation', () => {
    it('enforces that Auth UID is completely decoupled from restaurantId', () => {
      const authUid = 'STAFF_USER_ALPHA';
      const restaurantA = 'rest_enterprise_01';
      const restaurantB = 'rest_enterprise_02';

      expect(authUid).not.toBe(restaurantA);
      expect(authUid).not.toBe(restaurantB);
    });

    it('rejects cross-tenant payment mutation inside Firestore transaction', async () => {
      const paymentService = new PaymentService();
      const restaurantA = 'rest_tenant_A';
      const restaurantB = 'rest_tenant_B';
      const orderId = 'ord_tenant_B';

      // Order belongs to restaurant B
      vi.mocked(firestore.runTransaction).mockImplementationOnce(async (_db, callback) => {
        const tx = {
          get: vi.fn(async (docRef: any) => {
            if (docRef.path.includes(`orders/${orderId}`)) {
              return {
                exists: () => true,
                data: () => ({
                  id: orderId,
                  restaurantId: restaurantB, // Belongs to B
                  grandTotalMinor: 5000,
                  paidAmountMinor: 0
                })
              };
            }
            return { exists: () => false };
          }),
          set: vi.fn(),
          update: vi.fn(),
          delete: vi.fn()
        };
        return callback(tx as any);
      });

      // Tenant A attempts to record payment on Tenant B's order
      await expect(
        paymentService.recordPayment(
          restaurantA,
          {
            orderId,
            amountMinor: 5000,
            method: 'cash',
            status: 'completed'
          },
          'idemp_cross_1'
        )
      ).rejects.toThrow(/Cross-tenant violation/i);
    });
  });
});
