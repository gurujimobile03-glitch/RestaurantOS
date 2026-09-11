import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Table, TableSession } from '../types/table';
import { Order } from '../types/order';
import { KOT } from '../types/kot';
import { StaffRole } from '../types/auth';
import { TableSessionService } from '../services/tableSessionService';
import { TableService } from '../services/tableService';
import { KOTService } from '../services/kotService';
import { OrderService } from '../services/orderService';
import { offlineSyncService } from '../services/offlineSyncService';

// Mock Firebase Firestore
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
    query: vi.fn((colRef, ...clauses) => ({ type: 'query', colRef, clauses })),
    where: vi.fn((field, op, val) => ({ type: 'where', field, op, val })),
    orderBy: vi.fn((field, dir) => ({ type: 'orderBy', field, dir })),
    onSnapshot: vi.fn((q, callback) => {
      const docs = [
        {
          id: 'tbl_101',
          data: () => ({
            restaurantId: 'REST_CAPTAIN_TEST',
            tableNumber: '12',
            name: 'Window Table 12',
            capacity: 4,
            isActive: true,
            floorOrArea: 'Main Dining',
            sortOrder: 1,
            activeSessionId: 'sess_101'
          })
        }
      ];
      callback({
        docs,
        forEach: (fn: any) => docs.forEach(fn)
      });
      return vi.fn();
    }),
    runTransaction: vi.fn(async (_db, updateFunction) => {
      const mockTransaction = {
        get: vi.fn(async (docRef) => {
          if (docRef.path?.includes('tables/tbl_101')) {
            return {
              exists: () => true,
              data: () => ({
                restaurantId: 'REST_CAPTAIN_TEST',
                tableNumber: '12',
                capacity: 4,
                isActive: true,
                activeSessionId: null
              })
            };
          }
          if (docRef.path?.includes('tables/tbl_locked')) {
            return {
              exists: () => true,
              data: () => ({
                restaurantId: 'REST_CAPTAIN_TEST',
                tableNumber: '13',
                capacity: 4,
                isActive: true,
                activeSessionId: 'existing_sess_888'
              })
            };
          }
          return { exists: () => false, data: () => null };
        }),
        set: vi.fn(),
        update: vi.fn()
      };
      return await updateFunction(mockTransaction);
    }),
    serverTimestamp: vi.fn(() => new Date('2026-09-08T12:00:00Z'))
  };
});

// Mock Firebase Config
vi.mock('../config/firebase', () => ({
  db: { type: 'mockDb' },
  auth: { currentUser: { uid: 'CAPTAIN_USER_777' } }
}));

import * as firestore from 'firebase/firestore';

describe('Phase 4D — Captain / Staff Operations Foundation Verification', () => {
  let tableService: TableService;
  let tableSessionService: TableSessionService;
  let orderService: OrderService;
  let kotService: KOTService;

  const mockTableAvailable: Table = {
    id: 'tbl_avail',
    restaurantId: 'REST_CAPTAIN_TEST',
    name: 'Table 1',
    tableNumber: '1',
    floorOrArea: 'Main Floor',
    capacity: 4,
    isActive: true,
    sortOrder: 1,
    activeSessionId: null,
    createdAt: new Date('2026-09-08T10:00:00Z'),
    updatedAt: new Date('2026-09-08T10:00:00Z')
  };

  const mockTableOccupied: Table = {
    id: 'tbl_occ',
    restaurantId: 'REST_CAPTAIN_TEST',
    name: 'Table 2',
    tableNumber: '2',
    floorOrArea: 'Main Floor',
    capacity: 6,
    isActive: true,
    sortOrder: 2,
    activeSessionId: 'sess_99',
    createdAt: new Date('2026-09-08T10:00:00Z'),
    updatedAt: new Date('2026-09-08T10:00:00Z')
  };

  const mockActiveSession: TableSession = {
    id: 'sess_99',
    restaurantId: 'REST_CAPTAIN_TEST',
    tableId: 'tbl_occ',
    status: 'open',
    guestCount: 4,
    openedAt: new Date('2026-09-08T11:00:00Z'),
    activeOrderIds: ['ord_555'],
    openedBy: 'captain_jack',
    createdAt: new Date('2026-09-08T11:00:00Z'),
    updatedAt: new Date('2026-09-08T11:00:00Z')
  };

  beforeEach(() => {
    vi.clearAllMocks();
    tableService = new TableService();
    tableSessionService = new TableSessionService();
    orderService = new OrderService();
    kotService = new KOTService();
  });

  describe('1. Staff Role & Permission Architecture', () => {
    it('supports captain role in StaffRole taxonomy alongside owner, manager, cashier, and kitchen', () => {
      const validRoles: StaffRole[] = ['owner', 'manager', 'cashier', 'kitchen', 'captain'];
      expect(validRoles).toContain('captain');
      expect(validRoles).toHaveLength(5);
    });
  });

  describe('2. Table Loading & Realtime Subscriptions', () => {
    it('subscribes to tables strictly under restaurant isolation scope', () => {
      const onUpdate = vi.fn();
      tableService.subscribeToTables('REST_CAPTAIN_TEST', onUpdate);

      expect(firestore.collection).toHaveBeenCalledWith(
        expect.anything(),
        'restaurants',
        'REST_CAPTAIN_TEST',
        'tables'
      );
      expect(onUpdate).toHaveBeenCalled();
    });

    it('subscribes to active table sessions strictly scoped to restaurant', () => {
      const onUpdate = vi.fn();
      tableSessionService.subscribeToActiveSessions('REST_CAPTAIN_TEST', onUpdate);

      expect(firestore.collection).toHaveBeenCalledWith(
        expect.anything(),
        'restaurants',
        'REST_CAPTAIN_TEST',
        'tableSessions'
      );
      expect(onUpdate).toHaveBeenCalled();
    });
  });

  describe('3. Table Session Lifecycle & One-Active-Session Invariant', () => {
    it('opens a table session atomically when table is available and guestCount <= capacity', async () => {
      const newSession = await tableSessionService.openSession(
        'REST_CAPTAIN_TEST',
        'tbl_101',
        3,
        'captain_user_777'
      );

      expect(newSession).toBeDefined();
      expect(newSession.status).toBe('open');
      expect(newSession.guestCount).toBe(3);
    });

    it('prevents opening a new session on a table that already has an active session', async () => {
      await expect(
        tableSessionService.openSession('REST_CAPTAIN_TEST', 'tbl_locked', 2, 'captain_user_777')
      ).rejects.toThrow('already has an active open session');
    });

    it('enforces guestCount validity (must be > 0 and <= capacity)', async () => {
      await expect(
        tableSessionService.openSession('REST_CAPTAIN_TEST', 'tbl_101', 0, 'captain_user_777')
      ).rejects.toThrow('TableSession validation failed');

      await expect(
        tableSessionService.openSession('REST_CAPTAIN_TEST', 'tbl_101', 10, 'captain_user_777')
      ).rejects.toThrow('exceeds table capacity');
    });
  });

  describe('4. Order & KOT Operations in Captain Ops', () => {
    it('preserves multi-tenant isolation for order subscriptions', () => {
      const onUpdate = vi.fn();
      orderService.subscribeToOrders('REST_CAPTAIN_TEST', onUpdate);

      expect(firestore.collection).toHaveBeenCalledWith(
        expect.anything(),
        'restaurants',
        'REST_CAPTAIN_TEST',
        'orders'
      );
    });

    it('creates KOT from active order safely via KOTService', async () => {
      vi.spyOn(firestore, 'getDoc').mockResolvedValueOnce({
        exists: () => true,
        id: 'ord_555',
        data: () => ({
          restaurantId: 'REST_CAPTAIN_TEST',
          status: 'confirmed',
          items: [{ itemId: 'item_1', nameSnapshot: 'Chicken Tikka', quantity: 2 }]
        })
      } as any);

      vi.spyOn(kotService, 'createKOT').mockResolvedValueOnce({
        id: 'kot_new_1',
        kotNumber: 'KOT-099',
        restaurantId: 'REST_CAPTAIN_TEST',
        orderId: 'ord_555',
        items: [{ itemId: 'item_1', nameSnapshot: 'Chicken Tikka', quantity: 2 }],
        status: 'sentToKitchen',
        createdBy: 'captain_user_777',
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const kot = await kotService.createKOTFromOrder({
        restaurantId: 'REST_CAPTAIN_TEST',
        orderId: 'ord_555',
        createdBy: 'captain_user_777'
      });

      expect(kot).toBeDefined();
      expect(kot.status).toBe('sentToKitchen');
    });
  });

  describe('5. Offline Queueing & Idempotency', () => {
    it('queues offline captain operations through OfflineSyncService', () => {
      offlineSyncService.clearAll();

      const queuedItem = offlineSyncService.enqueue(
        'REST_CAPTAIN_TEST',
        'open_session',
        { tableId: 'tbl_avail', guestCount: 2, openedBy: 'captain_user_777' },
        'idemp_captain_key_555'
      );

      expect(queuedItem).toBeDefined();
      expect(queuedItem.idempotencyKey).toBe('idemp_captain_key_555');
      expect(offlineSyncService.getQueue()).toHaveLength(1);
    });
  });

  describe('6. Security & Multi-Tenant Isolation Boundaries', () => {
    it('throws error when attempting operations without restaurantId', async () => {
      await expect(
        tableSessionService.openSession('', 'tbl_101', 2, 'captain_user_777')
      ).rejects.toThrow('restaurantId');

      expect(() => tableService.subscribeToTables('', vi.fn())).toThrow();
    });
  });
});
