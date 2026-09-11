import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TableService } from '../services/tableService';
import { TableSessionService } from '../services/tableSessionService';
import { Table, TableSession } from '../types/table';

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
    onSnapshot: vi.fn(),
    serverTimestamp: vi.fn(() => new Date('2026-09-08T12:00:00Z')),
    runTransaction: vi.fn(async (_db, callback) => {
      let hasWritten = false;
      const mockTx = {
        get: vi.fn(async (docRef: any) => {
          if (hasWritten) {
            throw new Error('Firestore transactions require all reads to be executed before all writes.');
          }
          return firestore.getDoc(docRef);
        }),
        set: vi.fn((docRef: any, data: any) => {
          hasWritten = true;
          return firestore.setDoc(docRef, data);
        }),
        update: vi.fn((docRef: any, data: any) => {
          hasWritten = true;
          return firestore.updateDoc(docRef, data);
        }),
        delete: vi.fn((docRef: any) => {
          hasWritten = true;
          return firestore.deleteDoc(docRef);
        })
      };
      return callback(mockTx);
    })
  };
});

// Mock Firebase Config
vi.mock('../config/firebase', () => ({
  db: { type: 'mockDb' },
  auth: { currentUser: { uid: 'TEST_AUTH_USER_999' } }
}));

import * as firestore from 'firebase/firestore';

describe('TableService & TableSessionService (Phase 2C Service Tests)', () => {
  let tableService: TableService;
  let sessionService: TableSessionService;

  beforeEach(() => {
    vi.clearAllMocks();
    tableService = new TableService();
    sessionService = new TableSessionService();
  });

  describe('TableService CRUD operations', () => {
    it('creates a physical table with validated properties', async () => {
      const restaurantId = 'REST_TEST_101';
      const created = await tableService.createTable(
        restaurantId,
        {
          name: 'Table 5',
          tableNumber: 'T-05',
          floorOrArea: 'Main Dining',
          capacity: 6,
          isActive: true,
          sortOrder: 5
        },
        'USER_ADMIN'
      );

      expect(created).toBeDefined();
      expect(created.restaurantId).toBe(restaurantId);
      expect(created.tableNumber).toBe('T-05');
      expect(created.capacity).toBe(6);
      expect(created.isActive).toBe(true);
      expect(firestore.setDoc).toHaveBeenCalled();
    });

    it('rejects invalid table parameters on creation (e.g. 0 capacity)', async () => {
      await expect(
        tableService.createTable(
          'REST_TEST_101',
          {
            name: 'Table 5',
            tableNumber: 'T-05',
            floorOrArea: 'Main',
            capacity: 0,
            isActive: true,
            sortOrder: 1
          },
          'USER_ADMIN'
        )
      ).rejects.toThrow(/validation failed/i);
    });

    it('fetches table by ID scoped to restaurant', async () => {
      const mockTableData: Table = {
        id: 'table_xyz',
        restaurantId: 'REST_TEST_101',
        name: 'Table 1',
        tableNumber: '1',
        floorOrArea: 'Ground',
        capacity: 4,
        isActive: true,
        sortOrder: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      vi.mocked(firestore.getDoc).mockResolvedValueOnce({
        exists: () => true,
        id: 'table_xyz',
        data: () => mockTableData
      } as any);

      const table = await tableService.getTableById('REST_TEST_101', 'table_xyz');
      expect(table).toEqual(mockTableData);
      expect(firestore.doc).toHaveBeenCalledWith(
        expect.anything(),
        'restaurants',
        'REST_TEST_101',
        'tables',
        'table_xyz'
      );
    });

    it('returns null if table is not found', async () => {
      vi.mocked(firestore.getDoc).mockResolvedValueOnce({
        exists: () => false
      } as any);

      const table = await tableService.getTableById('REST_TEST_101', 'nonexistent_table');
      expect(table).toBeNull();
    });

    it('updates table details with validation check', async () => {
      await tableService.updateTable(
        'REST_TEST_101',
        'table_xyz',
        { name: 'Table 1 (Window)', capacity: 5 },
        'USER_ADMIN'
      );

      expect(firestore.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          name: 'Table 1 (Window)',
          capacity: 5
        })
      );
    });

    it('deletes/deactivates table document', async () => {
      await tableService.deleteTable('REST_TEST_101', 'table_xyz');
      expect(firestore.deleteDoc).toHaveBeenCalledWith(
        expect.anything()
      );
    });
  });

  describe('TableSessionService Lifecycle & Invariants', () => {
    const restaurantId = 'REST_TEST_101';
    const tableId = 'tbl_main_1';

    it('opens a new session when table exists, is active, and has no open session', async () => {
      // Mock table lookup
      vi.mocked(firestore.getDoc).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          id: tableId,
          restaurantId,
          name: 'Table 1',
          tableNumber: '1',
          capacity: 4,
          isActive: true
        })
      } as any);

      // Mock getActiveSession check (no existing active session)
      vi.mocked(firestore.getDocs).mockResolvedValueOnce({
        empty: true,
        docs: []
      } as any);

      const session = await sessionService.openSession(restaurantId, tableId, 3, 'CASHIER_1');

      expect(session).toBeDefined();
      expect(session.tableId).toBe(tableId);
      expect(session.guestCount).toBe(3);
      expect(session.status).toBe('open');
      expect(session.closedAt).toBeNull();
      expect(firestore.setDoc).toHaveBeenCalled();
    });

    it('rejects opening session for non-existent table', async () => {
      vi.mocked(firestore.getDoc).mockResolvedValueOnce({
        exists: () => false
      } as any);

      await expect(
        sessionService.openSession(restaurantId, 'missing_table', 2, 'CASHIER_1')
      ).rejects.toThrow(/does not exist/i);
    });

    it('rejects opening session for an inactive table', async () => {
      vi.mocked(firestore.getDoc).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          id: tableId,
          restaurantId,
          capacity: 4,
          isActive: false
        })
      } as any);

      await expect(
        sessionService.openSession(restaurantId, tableId, 2, 'CASHIER_1')
      ).rejects.toThrow(/currently inactive/i);
    });

    it('rejects opening session when guestCount exceeds table capacity', async () => {
      vi.mocked(firestore.getDoc).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          id: tableId,
          restaurantId,
          capacity: 4,
          isActive: true
        })
      } as any);

      await expect(
        sessionService.openSession(restaurantId, tableId, 6, 'CASHIER_1')
      ).rejects.toThrow(/exceeds table capacity/i);
    });

    it('enforces single open session invariant: rejects opening when active session exists', async () => {
      // Mock table lookup with activeSessionId set
      vi.mocked(firestore.getDoc).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          id: tableId,
          restaurantId,
          capacity: 4,
          isActive: true,
          activeSessionId: 'sess_already_open'
        })
      } as any);

      await expect(
        sessionService.openSession(restaurantId, tableId, 2, 'CASHIER_1')
      ).rejects.toThrow(/already has an active open session/i);
    });

    it('closes an active session (open -> closed)', async () => {
      const sessionId = 'session_to_close';

      // 1. Session doc get
      vi.mocked(firestore.getDoc).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          id: sessionId,
          restaurantId,
          tableId,
          status: 'open',
          guestCount: 2,
          openedAt: new Date('2026-09-08T10:00:00Z')
        })
      } as any);

      // 2. Table doc get
      vi.mocked(firestore.getDoc).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          id: tableId,
          activeSessionId: sessionId
        })
      } as any);

      await sessionService.closeSession(restaurantId, sessionId, 'CASHIER_1');

      expect(firestore.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: 'closed',
          closedBy: 'CASHIER_1'
        })
      );
    });

    it('rejects closing an already closed session', async () => {
      const sessionId = 'session_already_closed';

      vi.mocked(firestore.getDoc).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          id: sessionId,
          restaurantId,
          tableId,
          status: 'closed',
          guestCount: 2,
          openedAt: new Date('2026-09-08T10:00:00Z'),
          closedAt: new Date('2026-09-08T11:00:00Z')
        })
      } as any);

      await expect(
        sessionService.closeSession(restaurantId, sessionId, 'CASHIER_1')
      ).rejects.toThrow(/already closed/i);
    });

    it('supports multiple sequential sessions for the same physical table', async () => {
      // Session 1: open
      vi.mocked(firestore.getDoc).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          id: tableId,
          restaurantId,
          capacity: 4,
          isActive: true,
          activeSessionId: null
        })
      } as any);
      const session1 = await sessionService.openSession(restaurantId, tableId, 2, 'CASHIER_1');
      expect(session1.status).toBe('open');

      // Close Session 1 (session doc + table doc)
      vi.mocked(firestore.getDoc).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ id: session1.id, status: 'open', tableId, restaurantId })
      } as any);
      vi.mocked(firestore.getDoc).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ id: tableId, activeSessionId: session1.id })
      } as any);
      await sessionService.closeSession(restaurantId, session1.id, 'CASHIER_1');

      // Session 2: open new session on the exact same physical table (table activeSessionId cleared)
      vi.mocked(firestore.getDoc).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          id: tableId,
          restaurantId,
          capacity: 4,
          isActive: true,
          activeSessionId: null
        })
      } as any);
      const session2 = await sessionService.openSession(restaurantId, tableId, 4, 'CASHIER_2');
      expect(session2.status).toBe('open');
      expect(session2.tableId).toBe(tableId);
    });

    it('successfully opens session with clientRequestId without violating transaction read-before-write constraints', async () => {
      const restaurantId = 'REST_TEST_TX';
      const tableId = 'table_tx_1';
      const idempotencyKey = 'client_req_session_001';

      // 1. Idempotency doc read (does not exist yet)
      vi.mocked(firestore.getDoc).mockResolvedValueOnce({
        exists: () => false,
        data: () => null
      } as any);

      // 2. Table doc read (exists, active, no activeSessionId)
      vi.mocked(firestore.getDoc).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          id: tableId,
          restaurantId,
          capacity: 4,
          isActive: true,
          activeSessionId: null
        })
      } as any);

      const session = await sessionService.openSession(
        restaurantId,
        tableId,
        2,
        'CASHIER_TX',
        idempotencyKey
      );

      expect(session).toBeDefined();
      expect(session.status).toBe('open');
      expect(session.tableId).toBe(tableId);
      expect(session.guestCount).toBe(2);
    });
  });

  describe('Cross-Tenant Isolation for Tables & Sessions', () => {
    it('verifies that operations strictly isolate between Restaurant A and Restaurant B', async () => {
      const restaurantA = 'RESTAURANT_ALPHA';
      const restaurantB = 'RESTAURANT_BETA';
      const tableId = 'shared_table_id';

      // Lookup table on Restaurant A
      vi.mocked(firestore.getDoc).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ id: tableId, restaurantId: restaurantA, name: 'Table A1' })
      } as any);

      await tableService.getTableById(restaurantA, tableId);
      expect(firestore.doc).toHaveBeenLastCalledWith(
        expect.anything(),
        'restaurants',
        restaurantA,
        'tables',
        tableId
      );

      // Lookup table on Restaurant B
      vi.mocked(firestore.getDoc).mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ id: tableId, restaurantId: restaurantB, name: 'Table B1' })
      } as any);

      await tableService.getTableById(restaurantB, tableId);
      expect(firestore.doc).toHaveBeenLastCalledWith(
        expect.anything(),
        'restaurants',
        restaurantB,
        'tables',
        tableId
      );
    });
  });
});
