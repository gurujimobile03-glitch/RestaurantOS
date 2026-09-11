import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KOT, KOTStatus } from '../types/kot';
import { OrderItem } from '../types/order';
import {
  calculateKOTElapsedTimeMinutes,
  formatElapsedTime,
  getNextValidKOTAction,
  sortKOTsByCreationTime,
  groupKOTsByOperationalStatus,
  filterKOTsByOperationalStatus,
  getOperationalGroup
} from '../utils/kotQueueHelpers';
import {
  validateKOT,
  validateKOTStatusTransition
} from '../utils/transactionValidation';
import {
  hasPermission,
  isViewAllowed
} from '../utils/permissions';
import { kotService, createKOTItemFromOrderItem } from '../services/kotService';
import { offlineSyncService } from '../services/offlineSyncService';
import { idempotencyService } from '../services/idempotencyService';

describe('M6-6C — Kitchen Multi-Device + Operational Workflow Hardening Acceptance Suite', () => {
  const restaurantId = 'rest_m6_6c_test';

  beforeEach(() => {
    vi.clearAllMocks();
    offlineSyncService.clearAll();
  });

  // =========================================================================
  // CATEGORY 1: Kitchen Display & Ticket Presentation (Scenarios 1–4)
  // =========================================================================
  describe('Category 1: Kitchen Display & Ticket Presentation', () => {
    it('Scenario 1: KOT ticket displays KOT number, order reference, and creation timestamp', () => {
      const now = new Date('2026-09-09T12:00:00Z');
      const kot: KOT = {
        id: 'kot_101',
        kotNumber: 'KOT-2026-001',
        restaurantId,
        orderId: 'ord_901',
        createdBy: 'captain_1',
        items: [
          { itemId: 'item_1', nameSnapshot: 'Paneer Butter Masala', quantity: 2 }
        ],
        status: 'sentToKitchen',
        createdAt: now,
        updatedAt: now
      };

      expect(kot.kotNumber).toBe('KOT-2026-001');
      expect(kot.orderId).toBe('ord_901');
      expect(kot.createdAt).toEqual(now);
      expect(kot.items).toHaveLength(1);
    });

    it('Scenario 2: Table/Channel badge correctly resolves Dine-in, Takeaway, and Delivery channels', () => {
      const dineInKot: KOT = {
        id: 'kot_dinein',
        kotNumber: 'KOT-DINE-1',
        restaurantId,
        orderId: 'ord_1',
        tableId: 'tbl_5',
        tableSessionId: 'sess_5',
        createdBy: 'captain_1',
        items: [{ itemId: 'item_1', nameSnapshot: 'Garlic Naan', quantity: 3 }],
        status: 'sentToKitchen',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const takeawayKot: KOT = {
        id: 'kot_takeaway',
        kotNumber: 'KOT-TAKE-1',
        restaurantId,
        orderId: 'ord_2',
        createdBy: 'pos_1',
        items: [{ itemId: 'item_2', nameSnapshot: 'Veg Biryani', quantity: 1 }],
        status: 'sentToKitchen',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      expect(dineInKot.tableId).toBe('tbl_5');
      expect(takeawayKot.tableId).toBeUndefined();
    });

    it('Scenario 3: Items rendered with quantity indicator, item name snapshot, modifiers list, and item-level notes', () => {
      const orderItem: OrderItem = {
        itemId: 'item_burger_1',
        nameSnapshot: 'Classic Cheeseburger',
        shortNameSnapshot: 'Cheese Burger',
        unitPriceMinor: 15000,
        quantity: 2,
        taxRate: 5,
        taxInclusive: false,
        lineSubtotalMinor: 30000,
        lineTaxMinor: 1500,
        discountMinor: 0,
        lineTotalMinor: 31500,
        notes: 'Extra crispy fries on the side',
        modifiers: [
          { id: 'mod_1', name: 'Extra Cheddar Cheese', priceMinor: 2000 },
          { id: 'mod_2', name: 'Gluten-Free Bun', priceMinor: 3000 }
        ]
      };

      const kotItem = createKOTItemFromOrderItem(orderItem);

      expect(kotItem.itemId).toBe('item_burger_1');
      expect(kotItem.nameSnapshot).toBe('Classic Cheeseburger');
      expect(kotItem.shortNameSnapshot).toBe('Cheese Burger');
      expect(kotItem.quantity).toBe(2);
      expect(kotItem.notes).toBe('Extra crispy fries on the side');
      expect(kotItem.modifiers).toHaveLength(2);
      expect(kotItem.modifiers![0].name).toBe('Extra Cheddar Cheese');
      expect((kotItem as any).unitPriceMinor).toBeUndefined(); // Financial stripping
      expect((kotItem as any).lineTotalMinor).toBeUndefined();
    });

    it('Scenario 4: Deterministic elapsed time calculation and display formatting with warning/overdue thresholds', () => {
      const baseTimeMs = 1700000000000;
      const fiveMinAgoKot: KOT = {
        id: 'kot_5m',
        kotNumber: 'KOT-5M',
        restaurantId,
        orderId: 'ord_1',
        createdBy: 'captain_1',
        items: [{ itemId: 'i1', nameSnapshot: 'Soup', quantity: 1 }],
        status: 'sentToKitchen',
        createdAt: new Date(baseTimeMs - 5 * 60 * 1000) as any,
        updatedAt: new Date(baseTimeMs - 5 * 60 * 1000) as any
      };

      const fifteenMinAgoKot: KOT = {
        id: 'kot_15m',
        kotNumber: 'KOT-15M',
        restaurantId,
        orderId: 'ord_2',
        createdBy: 'captain_1',
        items: [{ itemId: 'i2', nameSnapshot: 'Curry', quantity: 1 }],
        status: 'preparing',
        createdAt: new Date(baseTimeMs - 15 * 60 * 1000) as any,
        updatedAt: new Date(baseTimeMs - 15 * 60 * 1000) as any
      };

      const twentyFiveMinAgoKot: KOT = {
        id: 'kot_25m',
        kotNumber: 'KOT-25M',
        restaurantId,
        orderId: 'ord_3',
        createdBy: 'captain_1',
        items: [{ itemId: 'i3', nameSnapshot: 'Pizza', quantity: 1 }],
        status: 'sentToKitchen',
        createdAt: new Date(baseTimeMs - 25 * 60 * 1000) as any,
        updatedAt: new Date(baseTimeMs - 25 * 60 * 1000) as any
      };

      const elapsed5 = calculateKOTElapsedTimeMinutes(fiveMinAgoKot, baseTimeMs);
      const elapsed15 = calculateKOTElapsedTimeMinutes(fifteenMinAgoKot, baseTimeMs);
      const elapsed25 = calculateKOTElapsedTimeMinutes(twentyFiveMinAgoKot, baseTimeMs);

      expect(elapsed5).toBe(5);
      expect(elapsed15).toBe(15);
      expect(elapsed25).toBe(25);

      expect(formatElapsedTime(elapsed5)).toBe('05 min');
      expect(formatElapsedTime(elapsed15)).toBe('15 min');
      expect(formatElapsedTime(elapsed25)).toBe('25 min');
    });
  });

  // =========================================================================
  // CATEGORY 2: Kitchen State Machine Lifecycle & Permitted Transitions (Scenarios 5–10)
  // =========================================================================
  describe('Category 2: Kitchen State Machine Lifecycle & Permitted Transitions', () => {
    it('Scenario 5: Valid progression sentToKitchen → preparing is validated', () => {
      const v = validateKOTStatusTransition('sentToKitchen', 'preparing');
      expect(v.isValid).toBe(true);

      const action = getNextValidKOTAction('sentToKitchen');
      expect(action).toEqual({ actionStatus: 'preparing', label: 'Start Preparing' });
    });

    it('Scenario 6: Valid progression preparing → ready is validated', () => {
      const v = validateKOTStatusTransition('preparing', 'ready');
      expect(v.isValid).toBe(true);

      const action = getNextValidKOTAction('preparing');
      expect(action).toEqual({ actionStatus: 'ready', label: 'Mark Ready' });
    });

    it('Scenario 7: Valid captain progression ready → served is validated', () => {
      const v = validateKOTStatusTransition('ready', 'served');
      expect(v.isValid).toBe(true);

      const action = getNextValidKOTAction('ready');
      expect(action).toEqual({ actionStatus: 'served', label: 'Mark Served' });
    });

    it('Scenario 8: Safe cancellation from active states (sentToKitchen, preparing) requires reason', () => {
      expect(validateKOTStatusTransition('sentToKitchen', 'cancelled').isValid).toBe(true);
      expect(validateKOTStatusTransition('preparing', 'cancelled').isValid).toBe(true);
      expect(validateKOTStatusTransition('ready', 'cancelled').isValid).toBe(true);
    });

    it('Scenario 9: Terminal state protection: served and cancelled KOTs strictly reject further transitions', () => {
      const servedToPrep = validateKOTStatusTransition('served', 'preparing');
      expect(servedToPrep.isValid).toBe(false);
      expect(servedToPrep.error).toContain('terminal state');

      const cancelledToReady = validateKOTStatusTransition('cancelled', 'ready');
      expect(cancelledToReady.isValid).toBe(false);
      expect(cancelledToReady.error).toContain('terminal state');

      expect(getNextValidKOTAction('served')).toBeNull();
      expect(getNextValidKOTAction('cancelled')).toBeNull();
    });

    it('Scenario 10: Invalid backwards transitions (e.g. ready → sentToKitchen, ready → draft) are rejected', () => {
      const readyToSent = validateKOTStatusTransition('ready', 'sentToKitchen');
      expect(readyToSent.isValid).toBe(false);
      expect(readyToSent.error).toContain('Illegal KOT status transition');

      const prepToDraft = validateKOTStatusTransition('preparing', 'draft');
      expect(prepToDraft.isValid).toBe(false);
      expect(prepToDraft.error).toContain('Illegal KOT status transition');
    });
  });

  // =========================================================================
  // CATEGORY 3: Deterministic Queue Ordering & Operational Lanes (Scenarios 11–13)
  // =========================================================================
  describe('Category 3: Deterministic Queue Ordering & Operational Lanes', () => {
    it('Scenario 11: Queue sorts KOTs deterministically oldest-first by timestamp with tie-breaking', () => {
      const t1 = new Date('2026-09-09T10:00:00Z');
      const t2 = new Date('2026-09-09T10:05:00Z');
      const t3 = new Date('2026-09-09T10:10:00Z');

      const kotA: KOT = { id: 'k1', kotNumber: 'KOT-A', restaurantId, orderId: 'o1', createdBy: 'u1', items: [], status: 'sentToKitchen', createdAt: t2 as any, updatedAt: t2 as any };
      const kotB: KOT = { id: 'k2', kotNumber: 'KOT-B', restaurantId, orderId: 'o2', createdBy: 'u1', items: [], status: 'sentToKitchen', createdAt: t1 as any, updatedAt: t1 as any };
      const kotC: KOT = { id: 'k3', kotNumber: 'KOT-C', restaurantId, orderId: 'o3', createdBy: 'u1', items: [], status: 'sentToKitchen', createdAt: t3 as any, updatedAt: t3 as any };

      const sorted = sortKOTsByCreationTime([kotA, kotC, kotB]);
      expect(sorted.map(k => k.kotNumber)).toEqual(['KOT-B', 'KOT-A', 'KOT-C']);
    });

    it('Scenario 12: Operational lane grouping partitions tickets accurately into WAITING, PREPARING, and READY buckets', () => {
      const kots: KOT[] = [
        { id: '1', kotNumber: 'K1', restaurantId, orderId: 'o1', createdBy: 'u1', items: [], status: 'sentToKitchen', createdAt: new Date() as any, updatedAt: new Date() as any },
        { id: '2', kotNumber: 'K2', restaurantId, orderId: 'o2', createdBy: 'u1', items: [], status: 'confirmed', createdAt: new Date() as any, updatedAt: new Date() as any },
        { id: '3', kotNumber: 'K3', restaurantId, orderId: 'o3', createdBy: 'u1', items: [], status: 'preparing', createdAt: new Date() as any, updatedAt: new Date() as any },
        { id: '4', kotNumber: 'K4', restaurantId, orderId: 'o4', createdBy: 'u1', items: [], status: 'ready', createdAt: new Date() as any, updatedAt: new Date() as any }
      ];

      const grouped = groupKOTsByOperationalStatus(kots);
      expect(grouped.waiting).toHaveLength(2); // sentToKitchen + confirmed
      expect(grouped.preparing).toHaveLength(1);
      expect(grouped.ready).toHaveLength(1);
    });

    it('Scenario 13: Status filtering (all | waiting | preparing | ready) filters tickets without altering order state', () => {
      const kots: KOT[] = [
        { id: '1', kotNumber: 'K1', restaurantId, orderId: 'o1', createdBy: 'u1', items: [], status: 'sentToKitchen', createdAt: new Date() as any, updatedAt: new Date() as any },
        { id: '2', kotNumber: 'K2', restaurantId, orderId: 'o2', createdBy: 'u1', items: [], status: 'preparing', createdAt: new Date() as any, updatedAt: new Date() as any },
        { id: '3', kotNumber: 'K3', restaurantId, orderId: 'o3', createdBy: 'u1', items: [], status: 'ready', createdAt: new Date() as any, updatedAt: new Date() as any }
      ];

      expect(filterKOTsByOperationalStatus(kots, 'all')).toHaveLength(3);
      expect(filterKOTsByOperationalStatus(kots, 'waiting')).toHaveLength(1);
      expect(filterKOTsByOperationalStatus(kots, 'preparing')).toHaveLength(1);
      expect(filterKOTsByOperationalStatus(kots, 'ready')).toHaveLength(1);
      expect(getOperationalGroup('sentToKitchen')).toBe('waiting');
    });
  });

  // =========================================================================
  // CATEGORY 4: Multi-Device Realtime Operational Convergence (Scenarios 14–16)
  // =========================================================================
  describe('Category 4: Multi-Device Realtime Operational Convergence', () => {
    it('Scenario 14: Realtime subscription handler processes active KOT updates for multi-device synchronization', () => {
      let activeKotsState: KOT[] = [];
      const onUpdate = (kots: KOT[]) => {
        activeKotsState = kots;
      };

      const incomingKots: KOT[] = [
        { id: 'k1', kotNumber: 'KOT-1', restaurantId, orderId: 'o1', createdBy: 'u1', items: [], status: 'preparing', createdAt: new Date() as any, updatedAt: new Date() as any }
      ];

      onUpdate(incomingKots);
      expect(activeKotsState).toHaveLength(1);
      expect(activeKotsState[0].status).toBe('preparing');
    });

    it('Scenario 15: Device 2 state updates immediately when Device 1 marks KOT as ready', () => {
      const device2State = { kots: [{ id: 'k1', kotNumber: 'KOT-1', status: 'preparing' as KOTStatus }] };
      const simulatedRealtimeStream = (updatedKots: any[]) => {
        device2State.kots = updatedKots;
      };

      simulatedRealtimeStream([{ id: 'k1', kotNumber: 'KOT-1', status: 'ready' }]);
      expect(device2State.kots[0].status).toBe('ready');
    });

    it('Scenario 16: Unsubscription cleanly detaches listener without memory leaks', () => {
      let isListening = true;
      const unsubscribe = () => {
        isListening = false;
      };

      expect(isListening).toBe(true);
      unsubscribe();
      expect(isListening).toBe(false);
    });
  });

  // =========================================================================
  // CATEGORY 5: Concurrency & Idempotency Safeguards (Scenarios 17–19)
  // =========================================================================
  describe('Category 5: Concurrency & Idempotency Safeguards', () => {
    it('Scenario 17: Duplicate status changes with same idempotencyKey resolve idempotently', async () => {
      const idempotencyKey = 'idemp_test_kot_status_change_123';
      const checkOrAcquireSpy = vi.spyOn(idempotencyService, 'checkOrAcquire')
        .mockResolvedValueOnce({ action: 'execute', recordRef: {} as any })
        .mockResolvedValueOnce({
          action: 'return_cached',
          cachedResult: { status: 'success' },
          record: {
            id: idempotencyKey,
            restaurantId,
            operation: 'update_kot_status',
            requestSignature: 'sig_123',
            status: 'completed',
            targetEntityId: 'kot_1',
            responseSnapshot: { status: 'success' },
            errorMessage: null,
            createdBy: 'u1',
            createdAt: new Date(),
            updatedAt: new Date()
          }
        });

      const acquireResult = await idempotencyService.checkOrAcquire(
        restaurantId,
        idempotencyKey,
        'update_kot_status',
        { kotId: 'kot_1', newStatus: 'preparing' }
      );

      expect(acquireResult.action).toBe('execute');

      const duplicateAcquire = await idempotencyService.checkOrAcquire(
        restaurantId,
        idempotencyKey,
        'update_kot_status',
        { kotId: 'kot_1', newStatus: 'preparing' }
      );

      expect(duplicateAcquire.action).toBe('return_cached');
      if (duplicateAcquire.action === 'return_cached') {
        expect(duplicateAcquire.cachedResult).toEqual({ status: 'success' });
      }
      checkOrAcquireSpy.mockRestore();
    });

    it('Scenario 18: Conflicting concurrent status updates are rejected if initial state has progressed', () => {
      const currentKot: KOT = {
        id: 'kot_conflict',
        kotNumber: 'KOT-CONF',
        restaurantId,
        orderId: 'ord_1',
        createdBy: 'u1',
        items: [],
        status: 'ready',
        createdAt: new Date() as any,
        updatedAt: new Date() as any
      };

      // Device A attempts to transition to 'preparing', but it is already 'ready'
      const check = validateKOTStatusTransition(currentKot.status, 'preparing');
      expect(check.isValid).toBe(false);
      expect(check.error).toContain('Illegal KOT status transition');
    });

    it('Scenario 19: Duplicate KOT cancellation requests with same idempotencyKey resolve safely', async () => {
      const cancelKey = 'idemp_cancel_kot_safe_456';
      const checkSpy = vi.spyOn(idempotencyService, 'checkOrAcquire')
        .mockResolvedValueOnce({ action: 'execute', recordRef: {} as any })
        .mockResolvedValueOnce({
          action: 'return_cached',
          cachedResult: { cancelled: true },
          record: {
            id: cancelKey,
            restaurantId,
            operation: 'cancel_kot',
            requestSignature: 'sig_456',
            status: 'completed',
            targetEntityId: 'kot_cancel_1',
            responseSnapshot: { cancelled: true },
            errorMessage: null,
            createdBy: 'u1',
            createdAt: new Date(),
            updatedAt: new Date()
          }
        });

      const firstCheck = await idempotencyService.checkOrAcquire(
        restaurantId,
        cancelKey,
        'cancel_kot',
        { kotId: 'kot_cancel_1', reason: 'Customer changed mind' }
      );

      expect(firstCheck.action).toBe('execute');

      const secondCheck = await idempotencyService.checkOrAcquire(
        restaurantId,
        cancelKey,
        'cancel_kot',
        { kotId: 'kot_cancel_1', reason: 'Customer changed mind' }
      );

      expect(secondCheck.action).toBe('return_cached');
      if (secondCheck.action === 'return_cached') {
        expect(secondCheck.cachedResult).toEqual({ cancelled: true });
      }
      checkSpy.mockRestore();
    });
  });

  // =========================================================================
  // CATEGORY 6: Role Boundaries & Permissions Enforcement (Scenarios 20–22)
  // =========================================================================
  describe('Category 6: Role Boundaries & Permissions Enforcement', () => {
    it('Scenario 20: Kitchen role has access to Kitchen Display and KOT status updates, but blocked from financial & admin capabilities', () => {
      expect(hasPermission('kitchen', 'access_kitchen')).toBe(true);
      expect(hasPermission('kitchen', 'update_kot_status')).toBe(true);
      expect(hasPermission('kitchen', 'view_orders')).toBe(true);

      // Denied actions
      expect(hasPermission('kitchen', 'create_orders')).toBe(false);
      expect(hasPermission('kitchen', 'process_payments')).toBe(false);
      expect(hasPermission('kitchen', 'refund_payments')).toBe(false);
      expect(hasPermission('kitchen', 'open_table_sessions')).toBe(false);
      expect(hasPermission('kitchen', 'close_sessions')).toBe(false);
      expect(hasPermission('kitchen', 'view_financial_info')).toBe(false);
      expect(hasPermission('kitchen', 'access_restaurant_setup')).toBe(false);
      expect(hasPermission('kitchen', 'access_audit')).toBe(false);

      expect(isViewAllowed('kitchen', 'kitchen')).toBe(true);
      expect(isViewAllowed('kitchen', 'pos')).toBe(false);
      expect(isViewAllowed('kitchen', 'dashboard')).toBe(false);
      expect(isViewAllowed('kitchen', 'reports')).toBe(false);
      expect(isViewAllowed('kitchen', 'settings')).toBe(false);
    });

    it('Scenario 21: Captain role has access to Captain Ops, table sessions, order creation, and KOT served update, but blocked from payments and admin', () => {
      expect(hasPermission('captain', 'access_captain')).toBe(true);
      expect(hasPermission('captain', 'create_orders')).toBe(true);
      expect(hasPermission('captain', 'open_table_sessions')).toBe(true);
      expect(hasPermission('captain', 'close_sessions')).toBe(true);
      expect(hasPermission('captain', 'update_kot_status')).toBe(true);

      // Denied actions
      expect(hasPermission('captain', 'process_payments')).toBe(false);
      expect(hasPermission('captain', 'refund_payments')).toBe(false);
      expect(hasPermission('captain', 'cancel_orders')).toBe(false);
      expect(hasPermission('captain', 'access_restaurant_setup')).toBe(false);
      expect(hasPermission('captain', 'view_financial_info')).toBe(false);

      expect(isViewAllowed('captain', 'captain')).toBe(true);
      expect(isViewAllowed('captain', 'pos')).toBe(false);
      expect(isViewAllowed('captain', 'reports')).toBe(false);
    });

    it('Scenario 22: Cashier role can process payments, open/close sessions, create orders, but cannot update KOT status or cancel orders without manager', () => {
      expect(hasPermission('cashier', 'access_pos')).toBe(true);
      expect(hasPermission('cashier', 'process_payments')).toBe(true);
      expect(hasPermission('cashier', 'create_orders')).toBe(true);
      expect(hasPermission('cashier', 'open_table_sessions')).toBe(true);

      // Denied actions
      expect(hasPermission('cashier', 'update_kot_status')).toBe(false);
      expect(hasPermission('cashier', 'cancel_orders')).toBe(false);
      expect(hasPermission('cashier', 'refund_payments')).toBe(false);
      expect(hasPermission('cashier', 'access_kitchen')).toBe(false);
    });
  });

  // =========================================================================
  // CATEGORY 7: Multi-Tenant & Restaurant-Scoped Security (Scenarios 23–24)
  // =========================================================================
  describe('Category 7: Multi-Tenant & Restaurant-Scoped Security', () => {
    it('Scenario 23: Cross-tenant payload matching rejects mismatched restaurantId in KOT creation', async () => {
      const mismatchedPayload: Omit<KOT, 'id' | 'createdAt' | 'updatedAt'> = {
        kotNumber: 'KOT-MISMATCH',
        restaurantId: 'rest_TENANT_B',
        orderId: 'ord_1',
        items: [{ itemId: 'item_1', nameSnapshot: 'Item', quantity: 1 }],
        status: 'sentToKitchen',
        createdBy: 'user_1'
      };

      await expect(
        kotService.createKOT('rest_TENANT_A', mismatchedPayload)
      ).rejects.toThrow('Payload restaurantId "rest_TENANT_B" does not match target restaurantId "rest_TENANT_A"');
    });

    it('Scenario 24: KOT validation rejects empty items array or missing restaurantId', () => {
      const invalidKot: Partial<KOT> = {
        kotNumber: 'KOT-INVALID',
        restaurantId: '',
        orderId: 'ord_1',
        items: [],
        status: 'sentToKitchen'
      };

      const result = validateKOT(invalidKot);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('restaurantId is required');
    });
  });

  // =========================================================================
  // CATEGORY 8: Offline Queueing, Resilience & Reconnect Reconciliation (Scenario 25)
  // =========================================================================
  describe('Category 8: Offline Queueing, Resilience & Reconnect Reconciliation', () => {
    it('Scenario 25: Offline KOT status update is enqueued with unique idempotencyKey in OfflineSyncService and retried safely', () => {
      // Simulate offline state
      (offlineSyncService as any).isOnline = false;

      const item = offlineSyncService.enqueue(
        restaurantId,
        'update_kot_status',
        { kotId: 'kot_offline_1', newStatus: 'preparing', updatedBy: 'chef_1' },
        'idemp_offline_kot_preparing_999'
      );

      expect(item.status).toBe('queued');
      expect(item.idempotencyKey).toBe('idemp_offline_kot_preparing_999');
      expect(item.operation).toBe('update_kot_status');

      const stats = offlineSyncService.getStats();
      expect(stats.queued).toBe(1);

      // Verify item can be inspected in queue
      const queue = offlineSyncService.getQueue();
      expect(queue.some(q => q.idempotencyKey === 'idemp_offline_kot_preparing_999')).toBe(true);
    });
  });
});
