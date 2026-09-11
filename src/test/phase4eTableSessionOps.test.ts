import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tableSessionService } from '../services/tableSessionService';
import { tableService } from '../services/tableService';
import { offlineSyncService } from '../services/offlineSyncService';
import { idempotencyService } from '../services/idempotencyService';
import { auditService } from '../services/auditService';
import { Table, TableSession } from '../types/table';

// Mocks for Firebase Firestore
vi.mock('firebase/firestore', () => {
  return {
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
    onSnapshot: vi.fn((_q, callback) => {
      callback({
        docs: [],
        forEach: (fn: any) => [].forEach(fn)
      });
      return () => {};
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
          if (docRef.path?.includes('tables/tbl_inactive')) {
            return {
              exists: () => true,
              data: () => ({
                id: 'tbl_inactive',
                tableNumber: '103',
                capacity: 4,
                isActive: false,
                activeSessionId: null
              })
            };
          }
          if (docRef.path?.includes('tableSessions/sess_closed_999')) {
            return {
              exists: () => true,
              data: () => ({
                id: 'sess_closed_999',
                tableId: 'tbl_available',
                status: 'closed',
                guestCount: 2
              })
            };
          }
          if (docRef.path?.includes('tableSessions/sess_open_777')) {
            return {
              exists: () => true,
              data: () => ({
                id: 'sess_open_777',
                tableId: 'tbl_available',
                status: 'open',
                guestCount: 2
              })
            };
          }
          return {
            exists: () => false,
            data: () => null
          };
        }),
        set: vi.fn(),
        update: vi.fn()
      };
      return await updateFunction(mockTransaction);
    })
  };
});

vi.mock('../config/firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'captain_test_user' } }
}));

describe('Phase 4E — Table & Session Operations Suite', () => {
  const RESTAURANT_ID = 'rest_phase4e_001';

  beforeEach(() => {
    vi.clearAllMocks();
    offlineSyncService.clearAll();
  });

  describe('1. Table State & Invariants', () => {
    it('opens session atomically when table is available and guestCount <= capacity', async () => {
      const session = await tableSessionService.openSession(
        RESTAURANT_ID,
        'tbl_available',
        3,
        'captain_user_1'
      );

      expect(session).toBeDefined();
      expect(session.tableId).toBe('tbl_available');
      expect(session.guestCount).toBe(3);
      expect(session.status).toBe('open');
    });

    it('enforces one-active-session invariant (rejects opening session if table already has activeSessionId)', async () => {
      await expect(
        tableSessionService.openSession(
          RESTAURANT_ID,
          'tbl_occupied',
          2,
          'captain_user_1'
        )
      ).rejects.toThrow(/already has an active open session/i);
    });

    it('rejects session creation if guestCount exceeds table capacity', async () => {
      await expect(
        tableSessionService.openSession(
          RESTAURANT_ID,
          'tbl_available',
          10, // capacity is 4
          'captain_user_1'
        )
      ).rejects.toThrow(/exceeds table capacity/i);
    });

    it('rejects session creation on inactive tables', async () => {
      await expect(
        tableSessionService.openSession(
          RESTAURANT_ID,
          'tbl_inactive',
          2,
          'captain_user_1'
        )
      ).rejects.toThrow(/currently inactive/i);
    });
  });

  describe('2. Guest Count & Closed Session Operations', () => {
    it('updates guest count on active open session within table capacity', async () => {
      const auditSpy = vi.spyOn(auditService, 'logEvent');

      await tableSessionService.updateGuestCount(
        RESTAURANT_ID,
        'sess_open_777',
        4,
        'captain_user_1'
      );

      expect(auditSpy).toHaveBeenCalledWith(
        RESTAURANT_ID,
        expect.objectContaining({
          entityType: 'tableSession',
          entityId: 'sess_open_777',
          action: 'session_guest_count_updated',
          metadata: { newGuestCount: 4 }
        })
      );
    });

    it('rejects guest count update if newGuestCount > capacity', async () => {
      await expect(
        tableSessionService.updateGuestCount(
          RESTAURANT_ID,
          'sess_open_777',
          12, // capacity is 4
          'captain_user_1'
        )
      ).rejects.toThrow(/exceeds table capacity/i);
    });

    it('enforces closed session immutability (cannot update guest count on closed session)', async () => {
      await expect(
        tableSessionService.updateGuestCount(
          RESTAURANT_ID,
          'sess_closed_999',
          3,
          'captain_user_1'
        )
      ).rejects.toThrow(/Only open sessions can be updated/i);
    });

    it('enforces closed session immutability (cannot close an already closed session)', async () => {
      await expect(
        tableSessionService.closeSession(
          RESTAURANT_ID,
          'sess_closed_999',
          'captain_user_1'
        )
      ).rejects.toThrow(/Cannot close session/i);
    });

    it('closes an active open session and logs audit event', async () => {
      const auditSpy = vi.spyOn(auditService, 'logEvent');

      await tableSessionService.closeSession(
        RESTAURANT_ID,
        'sess_open_777',
        'captain_user_1'
      );

      expect(auditSpy).toHaveBeenCalledWith(
        RESTAURANT_ID,
        expect.objectContaining({
          entityType: 'tableSession',
          entityId: 'sess_open_777',
          action: 'session_closed'
        })
      );
    });
  });

  describe('3. Offline Sync & Idempotency Queueing', () => {
    it('queues close_session and update_guest_count in offlineSyncService', () => {
      (offlineSyncService as any).isOnline = false;

      const queueItem1 = offlineSyncService.enqueue(
        RESTAURANT_ID,
        'close_session',
        { sessionId: 'sess_111', closedBy: 'user_1' }
      );

      const queueItem2 = offlineSyncService.enqueue(
        RESTAURANT_ID,
        'update_guest_count',
        { sessionId: 'sess_111', newGuestCount: 3, updatedBy: 'user_1' }
      );

      expect(queueItem1.operation).toBe('close_session');
      expect(queueItem2.operation).toBe('update_guest_count');
      expect(offlineSyncService.getStats().queued).toBe(2);
    });

    it('enforces idempotency key reuse during exact retries', async () => {
      const key = `idemp_test_open_${Date.now()}`;

      const session1 = await tableSessionService.openSession(
        RESTAURANT_ID,
        'tbl_available',
        2,
        'user_1',
        key
      );

      const session2 = await tableSessionService.openSession(
        RESTAURANT_ID,
        'tbl_available',
        2,
        'user_1',
        key
      );

      expect(session1.id).toBe(session2.id);
    });
  });

  describe('4. Multi-Tenant Scoping & Security', () => {
    it('rejects table session operations without valid restaurantId', async () => {
      await expect(
        tableSessionService.openSession('', 'tbl_available', 2, 'user_1')
      ).rejects.toThrow('restaurantId');

      await expect(
        tableSessionService.updateGuestCount('', 'sess_open_777', 3, 'user_1')
      ).rejects.toThrow('restaurantId');
    });

    it('subscribes strictly under restaurant isolation path', () => {
      expect(() => tableSessionService.subscribeToActiveSessions(RESTAURANT_ID, vi.fn())).not.toThrow();
    });
  });
});
