import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KOTService } from '../services/kotService';
import { KOT, KOTStatus } from '../types/kot';

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
              restaurantId: 'REST_KITCHEN_1',
              orderId: 'ord_1',
              items: [{ itemId: 'item_1', nameSnapshot: 'Paneer Butter Masala', quantity: 2 }],
              status: 'sentToKitchen',
              createdAt: new Date('2026-09-08T10:00:00Z')
            })
          }
        ]
      });
      return vi.fn(); // Unsubscribe function
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

describe('Phase 4A — Kitchen Display System (KDS) Foundation', () => {
  let kotService: KOTService;

  beforeEach(() => {
    vi.clearAllMocks();
    kotService = new KOTService();
  });

  describe('Realtime Subscription & Queue Invariants', () => {
    it('subscribes strictly to active KOT statuses for the target restaurant', () => {
      const onUpdate = vi.fn();
      const onError = vi.fn();

      const unsub = kotService.subscribeToKitchenKOTs('REST_KITCHEN_1', onUpdate, onError);

      expect(firestore.collection).toHaveBeenCalledWith(expect.anything(), 'restaurants/REST_KITCHEN_1/kots');
      expect(firestore.query).toHaveBeenCalled();
      expect(onUpdate).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'kot_101',
            kotNumber: 'KOT-001',
            status: 'sentToKitchen'
          })
        ])
      );
      expect(typeof unsub).toBe('function');
    });

    it('rejects subscription if restaurantId is missing or empty', () => {
      expect(() => {
        kotService.subscribeToKitchenKOTs('', vi.fn());
      }).toThrow('restaurantId is required');
    });
  });

  describe('KOT Lifecycle Workflow Engine & State Machine', () => {
    it('allows valid forward status transitions: sentToKitchen -> preparing -> ready -> served', async () => {
      const mockKot: KOT = {
        id: 'kot_202',
        kotNumber: 'KOT-202',
        restaurantId: 'REST_KITCHEN_1',
        orderId: 'ord_2',
        items: [{ itemId: 'item_2', nameSnapshot: 'Dal Makhani', quantity: 1 }],
        status: 'sentToKitchen',
        createdBy: 'staff_1',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      vi.spyOn(kotService, 'getKOTById').mockResolvedValue(mockKot);
      (firestore.updateDoc as any).mockResolvedValue(undefined);

      // Transition sentToKitchen -> preparing
      await kotService.updateKOTStatus('REST_KITCHEN_1', 'kot_202', 'preparing', 'CHEF_USER_99');
      expect(firestore.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: 'preparing',
          updatedBy: 'CHEF_USER_99'
        })
      );

      // Transition preparing -> ready
      mockKot.status = 'preparing';
      await kotService.updateKOTStatus('REST_KITCHEN_1', 'kot_202', 'ready', 'CHEF_USER_99');
      expect(firestore.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: 'ready'
        })
      );

      // Transition ready -> served
      mockKot.status = 'ready';
      await kotService.updateKOTStatus('REST_KITCHEN_1', 'kot_202', 'served', 'CHEF_USER_99');
      expect(firestore.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: 'served'
        })
      );
    });

    it('prevents illegal status transitions (e.g. ready -> sentToKitchen or served -> preparing)', async () => {
      const mockKot: KOT = {
        id: 'kot_303',
        kotNumber: 'KOT-303',
        restaurantId: 'REST_KITCHEN_1',
        orderId: 'ord_3',
        items: [],
        status: 'served',
        createdBy: 'staff_1',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      vi.spyOn(kotService, 'getKOTById').mockResolvedValue(mockKot);

      // Served is terminal state
      await expect(
        kotService.updateKOTStatus('REST_KITCHEN_1', 'kot_303', 'preparing', 'CHEF_USER_99')
      ).rejects.toThrow();
    });

    it('requires a non-empty audit reason when cancelling a KOT', async () => {
      const mockKot: KOT = {
        id: 'kot_404',
        kotNumber: 'KOT-404',
        restaurantId: 'REST_KITCHEN_1',
        orderId: 'ord_4',
        items: [],
        status: 'preparing',
        createdBy: 'staff_1',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      vi.spyOn(kotService, 'getKOTById').mockResolvedValue(mockKot);
      (firestore.updateDoc as any).mockResolvedValue(undefined);

      // Empty reason throws error
      await expect(
        kotService.cancelKOT('REST_KITCHEN_1', 'kot_404', '   ', 'CHEF_USER_99')
      ).rejects.toThrow('Cancellation reason is required');

      // Valid cancellation sets status to cancelled and records audit trail
      await kotService.cancelKOT('REST_KITCHEN_1', 'kot_404', 'Item out of stock', 'CHEF_USER_99');
      expect(firestore.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: 'cancelled',
          cancellationReason: 'Item out of stock',
          cancelledBy: 'CHEF_USER_99'
        })
      );
    });
  });
});
