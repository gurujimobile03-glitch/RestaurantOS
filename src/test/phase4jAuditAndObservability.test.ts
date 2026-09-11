import { describe, it, expect, vi, beforeEach } from 'vitest';
import { orderService } from '../services/orderService';
import { paymentService } from '../services/paymentService';
import { tableService } from '../services/tableService';
import { auditService } from '../services/auditService';
import { offlineSyncService } from '../services/offlineSyncService';
import { Order } from '../types/order';
import { Table } from '../types/table';
import { Payment } from '../types/payment';

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

describe('Phase 4J: Audit & Observability Verification Suite', () => {
  const restaurantId = 'rest_audit_test_99';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  // ==========================================
  // 1. ORDER SERVICE AUDIT VERIFICATION
  // ==========================================
  describe('Order Operations Auditing', () => {
    it('creates an audit log when an order is created successfully', async () => {
      const logEventSpy = vi.spyOn(auditService, 'logEvent').mockResolvedValue({ id: 'log_123' } as any);
      vi.mocked(firestore.setDoc).mockResolvedValue(undefined);
      vi.mocked(firestore.getDoc).mockResolvedValue({
        exists: () => true,
        data: () => ({ status: 'open', restaurantId: 'rest_audit_test_99' })
      } as any);

      const mockCart = {
        items: [
          {
            cartItemId: 'cart_item_1',
            itemId: 'item_1',
            nameSnapshot: 'Burger',
            shortNameSnapshot: 'Burger',
            quantity: 2,
            unitPriceMinor: 15000,
            taxRate: 5,
            taxInclusive: true
          }
        ],
        orderDiscount: null
      };

      const result = await orderService.createOrderFromCart({
        restaurantId,
        cartState: mockCart,
        orderType: 'dineIn',
        source: 'pos',
        tableId: 'tbl_5',
        tableSessionId: 'session_88',
        createdBy: 'STAFF_USER_ALPHA'
      });

      expect(result).toBeDefined();
      expect(logEventSpy).toHaveBeenCalled();
      const calledArgs = logEventSpy.mock.calls[0];
      expect(calledArgs[0]).toBe(restaurantId);
      expect(calledArgs[1].entityType).toBe('order');
      expect(calledArgs[1].action).toBe('order_created');
      expect(calledArgs[1].actorUid).toBe('STAFF_USER_ALPHA');
      expect(calledArgs[1].metadata?.orderNumber).toBe(result.orderNumber);
      expect(calledArgs[1].metadata?.tableSessionId).toBe('session_88');
    });

    it('creates an audit log when an order status is updated', async () => {
      const logEventSpy = vi.spyOn(auditService, 'logEvent').mockResolvedValue({ id: 'log_124' } as any);
      const mockOrder: Order = {
        id: 'ord_777',
        restaurantId,
        orderNumber: 'ORD-777',
        orderType: 'dineIn',
        source: 'pos',
        status: 'confirmed',
        items: [],
        subtotalMinor: 10000,
        discountMinor: 0,
        taxableAmountMinor: 10000,
        cgstMinor: 0,
        sgstMinor: 0,
        igstMinor: 0,
        totalTaxMinor: 0,
        grandTotalMinor: 10000,
        paidAmountMinor: 0,
        dueAmountMinor: 10000,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'STAFF_USER_ALPHA'
      };

      vi.mocked(firestore.getDoc).mockResolvedValue({
        exists: () => true,
        data: () => mockOrder
      } as any);
      vi.mocked(firestore.updateDoc).mockResolvedValue(undefined);

      await orderService.updateOrderStatus(restaurantId, 'ord_777', 'preparing', 'STAFF_USER_ALPHA');

      expect(logEventSpy).toHaveBeenCalled();
      const calledArgs = logEventSpy.mock.calls[0];
      expect(calledArgs[0]).toBe(restaurantId);
      expect(calledArgs[1].entityType).toBe('order');
      expect(calledArgs[1].action).toBe('order_updated');
      expect(calledArgs[1].actorUid).toBe('STAFF_USER_ALPHA');
      expect(calledArgs[1].metadata?.oldStatus).toBe('confirmed');
      expect(calledArgs[1].metadata?.newStatus).toBe('preparing');
    });

    it('creates a cancelled audit log when an order is cancelled with a reason', async () => {
      const logEventSpy = vi.spyOn(auditService, 'logEvent').mockResolvedValue({ id: 'log_125' } as any);
      const mockOrder: Order = {
        id: 'ord_888',
        restaurantId,
        orderNumber: 'ORD-888',
        orderType: 'dineIn',
        source: 'pos',
        status: 'confirmed',
        items: [],
        subtotalMinor: 10000,
        discountMinor: 0,
        taxableAmountMinor: 10000,
        cgstMinor: 0,
        sgstMinor: 0,
        igstMinor: 0,
        totalTaxMinor: 0,
        grandTotalMinor: 10000,
        paidAmountMinor: 0,
        dueAmountMinor: 10000,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'STAFF_USER_ALPHA'
      };

      vi.mocked(firestore.getDoc).mockResolvedValue({
        exists: () => true,
        data: () => mockOrder
      } as any);
      vi.mocked(firestore.updateDoc).mockResolvedValue(undefined);

      await orderService.updateOrderStatus(restaurantId, 'ord_888', 'cancelled', 'STAFF_USER_ALPHA', 'Guest changed their mind');

      expect(logEventSpy).toHaveBeenCalled();
      const calledArgs = logEventSpy.mock.calls[0];
      expect(calledArgs[0]).toBe(restaurantId);
      expect(calledArgs[1].entityType).toBe('order');
      expect(calledArgs[1].action).toBe('order_cancelled');
      expect(calledArgs[1].actorUid).toBe('STAFF_USER_ALPHA');
      expect(calledArgs[1].metadata?.oldStatus).toBe('confirmed');
      expect(calledArgs[1].metadata?.newStatus).toBe('cancelled');
      expect(calledArgs[1].metadata?.cancellationReason).toBe('Guest changed their mind');
    });
  });

  // ==========================================
  // 2. PAYMENT SERVICE AUDIT VERIFICATION
  // ==========================================
  describe('Payment Operations Auditing', () => {
    it('creates an audit log when a payment is recorded', async () => {
      const logEventSpy = vi.spyOn(auditService, 'logEvent').mockResolvedValue({ id: 'log_126' } as any);
      const mockOrder: Order = {
        id: 'ord_123',
        restaurantId,
        orderNumber: 'ORD-123',
        orderType: 'dineIn',
        source: 'pos',
        status: 'confirmed',
        items: [],
        subtotalMinor: 10000,
        discountMinor: 0,
        taxableAmountMinor: 10000,
        cgstMinor: 0,
        sgstMinor: 0,
        igstMinor: 0,
        totalTaxMinor: 0,
        grandTotalMinor: 10000,
        paidAmountMinor: 0,
        dueAmountMinor: 10000,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'STAFF_USER_ALPHA'
      };

      vi.mocked(firestore.runTransaction).mockImplementation(async (_db, callback) => {
        const tx = {
          get: vi.fn(async (docRef: any) => {
            if (docRef.path.includes(`orders/ord_123`)) {
              return {
                exists: () => true,
                data: () => ({ ...mockOrder })
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

      const payment = await paymentService.recordPayment(restaurantId, {
        orderId: 'ord_123',
        amountMinor: 5000,
        method: 'cash',
        status: 'completed',
        createdBy: 'STAFF_USER_ALPHA'
      });

      expect(payment).toBeDefined();
      expect(logEventSpy).toHaveBeenCalled();
      const calledArgs = logEventSpy.mock.calls[0];
      expect(calledArgs[0]).toBe(restaurantId);
      expect(calledArgs[1].entityType).toBe('payment');
      expect(calledArgs[1].action).toBe('payment_created');
      expect(calledArgs[1].metadata?.amountMinor).toBe(5000);
      expect(calledArgs[1].metadata?.method).toBe('cash');
    });

    it('creates an audit log when a payment is refunded', async () => {
      const logEventSpy = vi.spyOn(auditService, 'logEvent').mockResolvedValue({ id: 'log_127' } as any);
      const mockPayment: Payment = {
        id: 'pay_77',
        restaurantId,
        orderId: 'ord_123',
        amountMinor: 5000,
        method: 'cash',
        status: 'completed',
        createdBy: 'STAFF_USER_ALPHA',
        createdAt: new Date()
      };
      const mockOrder: Order = {
        id: 'ord_123',
        restaurantId,
        orderNumber: 'ORD-123',
        orderType: 'dineIn',
        source: 'pos',
        status: 'confirmed',
        items: [],
        subtotalMinor: 10000,
        discountMinor: 0,
        taxableAmountMinor: 10000,
        cgstMinor: 0,
        sgstMinor: 0,
        igstMinor: 0,
        totalTaxMinor: 0,
        grandTotalMinor: 10000,
        paidAmountMinor: 5000,
        dueAmountMinor: 5000,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'STAFF_USER_ALPHA'
      };

      vi.mocked(firestore.runTransaction).mockImplementation(async (_db, callback) => {
        const tx = {
          get: vi.fn(async (docRef: any) => {
            if (docRef.path.includes(`payments/pay_77`)) {
              return {
                exists: () => true,
                data: () => ({ ...mockPayment })
              };
            }
            if (docRef.path.includes(`orders/ord_123`)) {
              return {
                exists: () => true,
                data: () => ({ ...mockOrder })
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

      await paymentService.refundPayment(restaurantId, 'pay_77', 'STAFF_USER_ALPHA', 'Overcharged customer');

      expect(logEventSpy).toHaveBeenCalled();
      const calledArgs = logEventSpy.mock.calls[0];
      expect(calledArgs[0]).toBe(restaurantId);
      expect(calledArgs[1].entityType).toBe('payment');
      expect(calledArgs[1].action).toBe('payment_refunded');
      expect(calledArgs[1].actorUid).toBe('STAFF_USER_ALPHA');
      expect(calledArgs[1].metadata?.reason).toBe('Overcharged customer');
    });
  });

  // ==========================================
  // 3. TABLE SERVICE AUDIT VERIFICATION
  // ==========================================
  describe('Table Operations Auditing', () => {
    it('creates an audit log when a physical table is created', async () => {
      const logEventSpy = vi.spyOn(auditService, 'logEvent').mockResolvedValue({ id: 'log_128' } as any);
      vi.mocked(firestore.setDoc).mockResolvedValue(undefined);

      const table = await tableService.createTable(restaurantId, {
        name: 'Garden Table A',
        tableNumber: 'G-1',
        capacity: 6,
        floorOrArea: 'Garden',
        isActive: true,
        sortOrder: 1
      }, 'STAFF_USER_ALPHA');

      expect(table).toBeDefined();
      expect(logEventSpy).toHaveBeenCalled();
      const calledArgs = logEventSpy.mock.calls[0];
      expect(calledArgs[0]).toBe(restaurantId);
      expect(calledArgs[1].entityType).toBe('table');
      expect(calledArgs[1].action).toBe('table_created');
      expect(calledArgs[1].metadata?.name).toBe('Garden Table A');
      expect(calledArgs[1].metadata?.tableNumber).toBe('G-1');
    });

    it('creates an audit log when a physical table is updated', async () => {
      const logEventSpy = vi.spyOn(auditService, 'logEvent').mockResolvedValue({ id: 'log_129' } as any);
      vi.mocked(firestore.updateDoc).mockResolvedValue(undefined);

      await tableService.updateTable(restaurantId, 'tbl_999', { capacity: 8, isActive: false }, 'STAFF_USER_ALPHA');

      expect(logEventSpy).toHaveBeenCalled();
      const calledArgs = logEventSpy.mock.calls[0];
      expect(calledArgs[0]).toBe(restaurantId);
      expect(calledArgs[1].entityType).toBe('table');
      expect(calledArgs[1].action).toBe('table_updated');
      expect(calledArgs[1].metadata?.updatedFields).toContain('capacity');
      expect(calledArgs[1].metadata?.updatedFields).toContain('isActive');
    });

    it('creates an audit log when a physical table is deleted', async () => {
      const logEventSpy = vi.spyOn(auditService, 'logEvent').mockResolvedValue({ id: 'log_130' } as any);
      vi.mocked(firestore.deleteDoc).mockResolvedValue(undefined);

      await tableService.deleteTable(restaurantId, 'tbl_999');

      expect(logEventSpy).toHaveBeenCalled();
      const calledArgs = logEventSpy.mock.calls[0];
      expect(calledArgs[0]).toBe(restaurantId);
      expect(calledArgs[1].entityType).toBe('table');
      expect(calledArgs[1].action).toBe('table_deleted');
    });
  });

  // ==========================================
  // 4. OFFLINE SYNC DIAGNOSTIC OBSERVABILITY
  // ==========================================
  describe('Offline Sync Diagnostic Observability', () => {
    it('logs console.info structured messages upon successful sync', async () => {
      const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      // Clear sync queue and force online
      offlineSyncService.clearAll();
      (offlineSyncService as any).isOnline = true;

      // Mock service methods to succeed
      vi.spyOn(orderService, 'createOrderFromCart').mockResolvedValue({ id: 'ord_offline_success' } as any);

      // Enqueue item
      offlineSyncService.enqueue(restaurantId, 'create_order', { some: 'payload' }, 'idemp_offline_success_key');

      // Process
      await offlineSyncService.processQueue();

      expect(consoleInfoSpy).toHaveBeenCalled();
      const logCall = consoleInfoSpy.mock.calls.find(call => call[0].includes('[OfflineSync Diagnostic]'));
      expect(logCall).toBeDefined();
      expect(logCall![0]).toContain('Operation Succeeded');
      expect(logCall![0]).toContain('operation=create_order');
      expect(logCall![0]).toContain('requestId=idemp_offline_success_key');
      expect(logCall![0]).toContain('status=completed');
    });

    it('logs console.warn structured messages with failureCategory and error details upon sync failure', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Clear sync queue and force online
      offlineSyncService.clearAll();
      (offlineSyncService as any).isOnline = true;

      // Mock service methods to throw an error (fatal validation)
      vi.spyOn(orderService, 'createOrderFromCart').mockRejectedValue(new Error('validation failed: invalid items'));

      // Enqueue item
      offlineSyncService.enqueue(restaurantId, 'create_order', { some: 'payload' }, 'idemp_offline_fail_key');

      // Process
      await offlineSyncService.processQueue();

      expect(consoleWarnSpy).toHaveBeenCalled();
      const logCall = consoleWarnSpy.mock.calls.find(call => call[0].includes('[OfflineSync Diagnostic]'));
      expect(logCall).toBeDefined();
      expect(logCall![0]).toContain('Operation Failed');
      expect(logCall![0]).toContain('operation=create_order');
      expect(logCall![0]).toContain('requestId=idemp_offline_fail_key');
      expect(logCall![0]).toContain('failureCategory=fatal_validation');
      expect(logCall![0]).toContain('finalState=dead_letter');
      expect(logCall![0]).toContain('error=validation failed: invalid items');
    });
  });
});
