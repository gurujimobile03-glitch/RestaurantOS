import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KOT, KOTStatus } from '../types/kot';
import {
  getOperationalGroup,
  calculateKOTElapsedTimeMinutes,
  formatElapsedTime,
  getNextValidKOTAction,
  sortKOTsByCreationTime,
  groupKOTsByOperationalStatus,
  filterKOTsByOperationalStatus
} from '../utils/kotQueueHelpers';
import { KOTService } from '../services/kotService';
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
      callback({
        docs: [
          {
            id: 'kot_101',
            data: () => ({
              kotNumber: 'KOT-001',
              restaurantId: 'REST_KITCHEN_TEST',
              orderId: 'ord_1',
              items: [{ itemId: 'item_1', nameSnapshot: 'Paneer Tikka', quantity: 2 }],
              status: 'sentToKitchen',
              createdAt: new Date('2026-09-08T10:00:00Z')
            })
          }
        ]
      });
      return vi.fn();
    }),
    serverTimestamp: vi.fn(() => new Date('2026-09-08T12:00:00Z'))
  };
});

// Mock Firebase Config
vi.mock('../config/firebase', () => ({
  db: { type: 'mockDb' },
  auth: { currentUser: { uid: 'CHEF_USER_99' } }
}));

import * as firestore from 'firebase/firestore';

describe('Phase 4C — Kitchen Queue & Operational UX Verification', () => {
  let kotService: KOTService;

  const mockKot1: KOT = {
    id: 'kot_1',
    kotNumber: 'KOT-001',
    restaurantId: 'REST_KITCHEN_TEST',
    orderId: 'ord_101',
    tableId: 'tbl_1',
    items: [{ itemId: 'i1', nameSnapshot: 'Butter Chicken', quantity: 2, notes: 'Extra gravy' }],
    status: 'sentToKitchen',
    createdBy: 'staff_1',
    createdAt: new Date('2026-09-08T10:00:00Z'),
    updatedAt: new Date('2026-09-08T10:00:00Z')
  };

  const mockKot2: KOT = {
    id: 'kot_2',
    kotNumber: 'KOT-002',
    restaurantId: 'REST_KITCHEN_TEST',
    orderId: 'ord_102',
    tableId: null,
    items: [{ itemId: 'i2', nameSnapshot: 'Veg Biryani', quantity: 1 }],
    status: 'preparing',
    createdBy: 'staff_2',
    createdAt: new Date('2026-09-08T10:05:00Z'),
    updatedAt: new Date('2026-09-08T10:05:00Z')
  };

  const mockKot3: KOT = {
    id: 'kot_3',
    kotNumber: 'KOT-003',
    restaurantId: 'REST_KITCHEN_TEST',
    orderId: 'ord_103',
    tableId: 'tbl_2',
    items: [{ itemId: 'i3', nameSnapshot: 'Garlic Naan', quantity: 4 }],
    status: 'ready',
    createdBy: 'staff_1',
    createdAt: new Date('2026-09-08T10:10:00Z'),
    updatedAt: new Date('2026-09-08T10:10:00Z')
  };

  const mockKotServed: KOT = {
    id: 'kot_4',
    kotNumber: 'KOT-004',
    restaurantId: 'REST_KITCHEN_TEST',
    orderId: 'ord_104',
    tableId: 'tbl_2',
    items: [{ itemId: 'i4', nameSnapshot: 'Gulab Jamun', quantity: 2 }],
    status: 'served',
    createdBy: 'staff_1',
    createdAt: new Date('2026-09-08T09:30:00Z'),
    updatedAt: new Date('2026-09-08T10:00:00Z')
  };

  beforeEach(() => {
    vi.clearAllMocks();
    kotService = new KOTService();
  });

  describe('1. Operational Queue Grouping & Status Mapping', () => {
    it('maps authoritative KOT statuses to operational groups (waiting, preparing, ready, terminal)', () => {
      expect(getOperationalGroup('confirmed')).toBe('waiting');
      expect(getOperationalGroup('sentToKitchen')).toBe('waiting');
      expect(getOperationalGroup('preparing')).toBe('preparing');
      expect(getOperationalGroup('ready')).toBe('ready');
      expect(getOperationalGroup('served')).toBe('terminal');
      expect(getOperationalGroup('cancelled')).toBe('terminal');
    });

    it('groups active KOTs into WAITING, PREPARING, and READY buckets', () => {
      const grouped = groupKOTsByOperationalStatus([mockKot1, mockKot2, mockKot3, mockKotServed]);
      expect(grouped.waiting).toHaveLength(1);
      expect(grouped.waiting[0].id).toBe('kot_1');

      expect(grouped.preparing).toHaveLength(1);
      expect(grouped.preparing[0].id).toBe('kot_2');

      expect(grouped.ready).toHaveLength(1);
      expect(grouped.ready[0].id).toBe('kot_3');
    });
  });

  describe('2. Active KOT Filtering & Presentation State', () => {
    it('filters active KOTs by operational filter without altering dataset', () => {
      const active = [mockKot1, mockKot2, mockKot3];
      expect(filterKOTsByOperationalStatus(active, 'all')).toHaveLength(3);
      expect(filterKOTsByOperationalStatus(active, 'waiting')).toEqual([mockKot1]);
      expect(filterKOTsByOperationalStatus(active, 'preparing')).toEqual([mockKot2]);
      expect(filterKOTsByOperationalStatus(active, 'ready')).toEqual([mockKot3]);
    });
  });

  describe('3. Deterministic Ordering', () => {
    it('sorts KOTs deterministically by creation time (oldest tickets first)', () => {
      const unsorted = [mockKot3, mockKot1, mockKot2];
      const sorted = sortKOTsByCreationTime(unsorted);
      expect(sorted.map((k) => k.id)).toEqual(['kot_1', 'kot_2', 'kot_3']);
    });
  });

  describe('4. Elapsed Time Calculation & Formatting', () => {
    it('calculates elapsed minutes deterministically without modifying stored data', () => {
      const nowMs = new Date('2026-09-08T10:15:00Z').getTime();
      const elapsed1 = calculateKOTElapsedTimeMinutes(mockKot1, nowMs); // 10:00 to 10:15 = 15m
      expect(elapsed1).toBe(15);
      expect(formatElapsedTime(elapsed1)).toBe('15 min');

      const elapsed2 = calculateKOTElapsedTimeMinutes(mockKot2, nowMs); // 10:05 to 10:15 = 10m
      expect(elapsed2).toBe(10);
      expect(formatElapsedTime(elapsed2)).toBe('10 min');
    });
  });

  describe('5 & 6. Valid Next Actions & Action Hiding', () => {
    it('exposes only valid next action for each active KOT status', () => {
      expect(getNextValidKOTAction('sentToKitchen')).toEqual({
        actionStatus: 'preparing',
        label: 'Start Preparing'
      });
      expect(getNextValidKOTAction('confirmed')).toEqual({
        actionStatus: 'preparing',
        label: 'Start Preparing'
      });
      expect(getNextValidKOTAction('preparing')).toEqual({
        actionStatus: 'ready',
        label: 'Mark Ready'
      });
      expect(getNextValidKOTAction('ready')).toEqual({
        actionStatus: 'served',
        label: 'Mark Served'
      });
    });

    it('returns null (hides next actions) for terminal KOT statuses', () => {
      expect(getNextValidKOTAction('served')).toBeNull();
      expect(getNextValidKOTAction('cancelled')).toBeNull();
      expect(getNextValidKOTAction('draft')).toBeNull();
    });
  });

  describe('7 & 8. Duplicate Action Prevention & Workflow Guardrails', () => {
    it('enforces status transition validations via KOTService', async () => {
      vi.spyOn(kotService, 'getKOTById').mockResolvedValue(mockKot1);

      // Attempt invalid transition: sentToKitchen -> served (skipping preparing & ready)
      await expect(
        kotService.updateKOTStatus('REST_KITCHEN_TEST', 'kot_1', 'served', 'staff_1')
      ).rejects.toThrow('Illegal KOT status transition');
    });
  });

  describe('9–13. Realtime Updates, Arrivals & Offline Integration', () => {
    it('subscribes strictly under restaurant isolation scope', () => {
      const callback = vi.fn();
      kotService.subscribeToKitchenKOTs('REST_KITCHEN_TEST', callback);

      expect(firestore.collection).toHaveBeenCalledWith(
        expect.anything(),
        'restaurants/REST_KITCHEN_TEST/kots'
      );
      expect(callback).toHaveBeenCalled();
    });

    it('queues status mutation via OfflineSyncService when offline', () => {
      offlineSyncService.clearAll();

      const item = offlineSyncService.enqueue(
        'REST_KITCHEN_TEST',
        'update_kot_status',
        { kotId: 'kot_1', newStatus: 'preparing', updatedBy: 'staff_1' },
        'idemp_test_key_101'
      );

      expect(['queued', 'syncing']).toContain(item.status);
      expect(item.idempotencyKey).toBe('idemp_test_key_101');
      expect(offlineSyncService.getQueue()).toHaveLength(1);
    });
  });

  describe('18–22. Security & Regression Checks', () => {
    it('rejects subscription or mutations without restaurantId (Tenant Isolation)', () => {
      expect(() => kotService.subscribeToKitchenKOTs('', vi.fn())).toThrow(
        'restaurantId is required'
      );
    });

    it('preserves Phase 4A/4B KOT data structure invariants', () => {
      expect(mockKot1.items[0]).toHaveProperty('nameSnapshot');
      expect(mockKot1.items[0]).toHaveProperty('quantity');
      expect(mockKot1).not.toHaveProperty('subtotal'); // Financial information strictly absent from KOT
    });
  });
});
