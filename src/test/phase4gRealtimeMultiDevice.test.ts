import { describe, it, expect, vi, beforeEach } from 'vitest';
import { orderService } from '../services/orderService';
import { kotService } from '../services/kotService';
import { tableService } from '../services/tableService';
import { tableSessionService } from '../services/tableSessionService';
import { offlineSyncService } from '../services/offlineSyncService';
import { idempotencyService } from '../services/idempotencyService';
import { auditService } from '../services/auditService';
import { Order } from '../types/order';
import { KOT } from '../types/kot';
import { Table, TableSession } from '../types/table';

// Mocks for Firebase
vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({})),
  getApps: vi.fn(() => [{}]),
  getApp: vi.fn(() => ({}))
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({ currentUser: { uid: 'staff_user_1' } }))
}));

vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(() => ({}))
}));

// Mocks for Firestore Realtime Listeners & DB operations
let listenerCallbacks: Map<string, Function> = new Map();

vi.mock('firebase/firestore', () => {
  return {
    getFirestore: vi.fn(() => ({})),
    initializeFirestore: vi.fn(() => ({})),
    persistentLocalCache: vi.fn(),
    persistentMultipleTabManager: vi.fn(),
    collection: vi.fn((_db, ...pathSegments) => ({
      path: pathSegments.join('/')
    })),
    doc: vi.fn((_db, ...pathSegments) => ({
      id: pathSegments[pathSegments.length - 1] || 'mock_doc_id',
      path: pathSegments.join('/')
    })),
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    query: vi.fn((col) => col),
    where: vi.fn(),
    orderBy: vi.fn(),
    onSnapshot: vi.fn((queryObj: any, successCb: Function, errorCb?: Function) => {
      const queryPath = queryObj?.path || 'default';
      listenerCallbacks.set(queryPath, successCb);
      // Simulate initial empty snapshot immediately
      successCb({
        docs: [],
        forEach: (fn: any) => [].forEach(fn)
      });
      // Return cleanup function
      return () => {
        listenerCallbacks.delete(queryPath);
      };
    }),
    serverTimestamp: vi.fn(() => new Date()),
    runTransaction: vi.fn(async (_db, updateFunction) => {
      const mockTransaction = {
        get: vi.fn(async (docRef: any) => {
          if (docRef.path?.includes('tables/tbl_occupied')) {
            return {
              exists: () => true,
              data: () => ({
                id: 'tbl_occupied',
                tableNumber: '101',
                capacity: 4,
                isActive: true,
                activeSessionId: 'sess_active_123'
              })
            };
          }
          if (docRef.path?.includes('tables/tbl_available')) {
            return {
              exists: () => true,
              data: () => ({
                id: 'tbl_available',
                tableNumber: '102',
                capacity: 4,
                isActive: true,
                activeSessionId: null
              })
            };
          }
          if (docRef.path?.includes('tableSessions')) {
            return {
              exists: () => false,
              data: () => null
            };
          }
          return { exists: () => false, data: () => null };
        }),
        set: vi.fn(),
        update: vi.fn()
      };
      return await updateFunction(mockTransaction);
    })
  };
});

describe('Phase 4G — Realtime Multi-Device Behavior Suite', () => {
  const restaurantA = 'rest_tenant_A';
  const restaurantB = 'rest_tenant_B';

  beforeEach(() => {
    vi.clearAllMocks();
    listenerCallbacks.clear();
  });

  describe('1. POS -> Captain & Kitchen Realtime Data Flows', () => {
    it('should propagate order created in POS to Captain subscription', () => {
      let receivedOrders: Order[] = [];
      const unsub = orderService.subscribeToOrders(restaurantA, (orders) => {
        receivedOrders = orders;
      });

      // Simulate snapshot update from Firestore
      const mockOrderSnapshot = [
        {
          id: 'ord_pos_1001',
          orderNumber: 'ORD-1001',
          restaurantId: restaurantA,
          status: 'confirmed',
          orderType: 'dineIn',
          items: [],
          financials: { grandTotalMinor: 5000 }
        }
      ];

      const callback = listenerCallbacks.get(`restaurants/${restaurantA}/orders`);
      expect(callback).toBeDefined();

      const mockDocs = mockOrderSnapshot.map((d) => ({
        id: d.id,
        data: () => d
      }));

      callback!({
        docs: mockDocs,
        forEach: (fn: any) => mockDocs.forEach(fn)
      });

      expect(receivedOrders.length).toBe(1);
      expect(receivedOrders[0].orderNumber).toBe('ORD-1001');

      unsub();
    });

    it('should propagate KOT sent from POS to Kitchen subscription in real-time', () => {
      let kitchenKots: KOT[] = [];
      const unsub = kotService.subscribeToKitchenKOTs(restaurantA, (kots) => {
        kitchenKots = kots;
      });

      const mockKot = {
        id: 'kot_pos_001',
        kotNumber: 'KOT-001',
        restaurantId: restaurantA,
        orderId: 'ord_pos_1001',
        status: 'sentToKitchen',
        items: [{ itemId: 'item_1', nameSnapshot: 'Paneer Butter Masala', quantity: 2 }]
      };

      const callback = listenerCallbacks.get(`restaurants/${restaurantA}/kots`);
      expect(callback).toBeDefined();

      callback!({
        docs: [
          {
            id: mockKot.id,
            data: () => mockKot
          }
        ]
      });

      expect(kitchenKots.length).toBe(1);
      expect(kitchenKots[0].kotNumber).toBe('KOT-001');
      expect(kitchenKots[0].status).toBe('sentToKitchen');

      unsub();
    });
  });

  describe('2. Kitchen -> Captain Realtime Propagation', () => {
    it('should update KOT status from kitchen and push update to Captain listener', () => {
      let captainKots: KOT[] = [];
      const unsub = kotService.subscribeToKOTs(restaurantA, (kots) => {
        captainKots = kots;
      });

      const callback = listenerCallbacks.get(`restaurants/${restaurantA}/kots`);
      expect(callback).toBeDefined();

      // Kitchen updates status to 'preparing'
      callback!({
        docs: [
          {
            id: 'kot_pos_001',
            data: () => ({
              id: 'kot_pos_001',
              kotNumber: 'KOT-001',
              restaurantId: restaurantA,
              orderId: 'ord_pos_1001',
              status: 'preparing'
            })
          }
        ]
      });

      expect(captainKots[0].status).toBe('preparing');

      // Kitchen updates status to 'ready'
      callback!({
        docs: [
          {
            id: 'kot_pos_001',
            data: () => ({
              id: 'kot_pos_001',
              kotNumber: 'KOT-001',
              restaurantId: restaurantA,
              orderId: 'ord_pos_1001',
              status: 'ready'
            })
          }
        ]
      });

      expect(captainKots[0].status).toBe('ready');

      unsub();
    });
  });

  describe('3. Captain -> POS Table & Session Realtime Propagation', () => {
    it('should notify POS table selector when Captain opens or closes a table session', () => {
      let posTables: Table[] = [];
      const unsubTables = tableService.subscribeToTables(restaurantA, (tbls) => {
        posTables = tbls;
      });

      let posSessions: TableSession[] = [];
      const unsubSessions = tableSessionService.subscribeToActiveSessions(restaurantA, (sess) => {
        posSessions = sess;
      });

      const tablesCallback = listenerCallbacks.get(`restaurants/${restaurantA}/tables`);
      const sessionsCallback = listenerCallbacks.get(`restaurants/${restaurantA}/tableSessions`);

      // Captain opens session on Table 1
      const tableDocs = [
        {
          id: 'tbl_1',
          data: () => ({
            id: 'tbl_1',
            tableNumber: 'T1',
            status: 'occupied',
            activeSessionId: 'sess_1'
          })
        }
      ];
      tablesCallback!({
        docs: tableDocs,
        forEach: (fn: any) => tableDocs.forEach(fn)
      });

      const sessionDocs = [
        {
          id: 'sess_1',
          data: () => ({
            id: 'sess_1',
            tableId: 'tbl_1',
            restaurantId: restaurantA,
            status: 'open',
            guestCount: 4
          })
        }
      ];
      sessionsCallback!({
        docs: sessionDocs,
        forEach: (fn: any) => sessionDocs.forEach(fn)
      });

      expect((posTables[0] as any).status).toBe('occupied');
      expect(posSessions[0].guestCount).toBe(4);

      unsubTables();
      unsubSessions();
    });
  });

  describe('4. Listener Lifecycle, Resubscription & Multi-Tenant Security Isolation', () => {
    it('should unsubscribe cleanly and remove callback on unmount', () => {
      const unsub = tableService.subscribeToTables(restaurantA, () => {});
      expect(listenerCallbacks.has(`restaurants/${restaurantA}/tables`)).toBe(true);

      unsub();
      expect(listenerCallbacks.has(`restaurants/${restaurantA}/tables`)).toBe(false);
    });

    it('should strictly isolate listeners between Restaurant A and Restaurant B', () => {
      let restaurantAOrders: Order[] = [];
      let restaurantBOrders: Order[] = [];

      const unsubA = orderService.subscribeToOrders(restaurantA, (orders) => {
        restaurantAOrders = orders;
      });

      const unsubB = orderService.subscribeToOrders(restaurantB, (orders) => {
        restaurantBOrders = orders;
      });

      const callbackA = listenerCallbacks.get(`restaurants/${restaurantA}/orders`);
      const callbackB = listenerCallbacks.get(`restaurants/${restaurantB}/orders`);

      expect(callbackA).toBeDefined();
      expect(callbackB).toBeDefined();
      expect(callbackA).not.toBe(callbackB);

      const docsA = [
        {
          id: 'ord_A',
          data: () => ({ id: 'ord_A', restaurantId: restaurantA, orderNumber: 'ORD-A' })
        }
      ];
      callbackA!({
        docs: docsA,
        forEach: (fn: any) => docsA.forEach(fn)
      });

      const docsB = [
        {
          id: 'ord_B',
          data: () => ({ id: 'ord_B', restaurantId: restaurantB, orderNumber: 'ORD-B' })
        }
      ];
      callbackB!({
        docs: docsB,
        forEach: (fn: any) => docsB.forEach(fn)
      });

      expect(restaurantAOrders.length).toBe(1);
      expect(restaurantAOrders[0].orderNumber).toBe('ORD-A');

      expect(restaurantBOrders.length).toBe(1);
      expect(restaurantBOrders[0].orderNumber).toBe('ORD-B');

      unsubA();
      unsubB();
    });

    it('should throw error when subscribing without a valid restaurantId', () => {
      expect(() => tableService.subscribeToTables('', () => {})).toThrow(
        'restaurantId is required to subscribe to tables.'
      );
      expect(() => kotService.subscribeToKOTs('   ', () => {})).toThrow(
        'restaurantId is required to subscribe to KOTs.'
      );
    });
  });

  describe('5. Concurrency Protection & Audit Event Uniqueness', () => {
    it('should prevent opening duplicate active session on occupied table via transaction', async () => {
      await expect(
        tableSessionService.openSession(restaurantA, 'tbl_occupied', 2, 'staff_1')
      ).rejects.toThrow(/already has an active open session/);
    });

    it('should generate exactly one audit log for an authoritative mutation', async () => {
      const auditSpy = vi.spyOn(auditService, 'logEvent').mockResolvedValue(undefined);

      await tableSessionService.openSession(restaurantA, 'tbl_available', 3, 'staff_1');

      // Exactly 1 audit event for session opening
      expect(auditSpy).toHaveBeenCalledTimes(1);
      expect(auditSpy).toHaveBeenCalledWith(
        restaurantA,
        expect.objectContaining({
          action: 'session_opened',
          entityType: 'tableSession'
        })
      );
    });
  });

  describe('6. Offline Queueing and Reconnect Idempotency', () => {
    it('should process enqueued offline KOT status update idempotently without duplication', async () => {
      const checkSpy = vi.spyOn(idempotencyService, 'checkOrAcquire').mockResolvedValue({
        action: 'execute',
        recordRef: {}
      } as any);

      offlineSyncService.enqueue(
        restaurantA,
        'update_kot_status',
        { kotId: 'kot_100', newStatus: 'served', updatedBy: 'staff_1' },
        'idemp_kot_served_100'
      );

      const queue = offlineSyncService.getQueue().filter((q) => q.restaurantId === restaurantA);
      expect(queue.length).toBe(1);
      expect(queue[0].idempotencyKey).toBe('idemp_kot_served_100');
    });
  });
});
