import { describe, it, expect, vi, beforeEach } from 'vitest';
import { orderService, OrderHistoryFilterOptions } from '../services/orderService';
import { tableSessionService } from '../services/tableSessionService';
import { hasPermission, isViewAllowed } from '../utils/permissions';
import { Order } from '../types/order';
import { TableSession } from '../types/table';

// Mock Firebase App, Auth, Storage & Firestore
vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({})),
  getApps: vi.fn(() => [{}]),
  getApp: vi.fn(() => ({}))
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({}))
}));

vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(() => ({}))
}));

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
    limit: vi.fn(),
    startAfter: vi.fn(),
    onSnapshot: vi.fn((_q, callback) => {
      callback({
        docs: [],
        forEach: (fn: any) => [].forEach(fn)
      });
      return () => {};
    }),
    serverTimestamp: vi.fn(() => new Date()),
    runTransaction: vi.fn()
  };
});

// Mock auditService
vi.mock('../services/auditService', () => ({
  auditService: {
    logEvent: vi.fn().mockResolvedValue('mock_audit_id')
  }
}));

import { getDocs, getDoc, updateDoc, runTransaction } from 'firebase/firestore';
import { auditService } from '../services/auditService';

describe('M6-6B — Staff Operations + Order History & Bill Retrieval', () => {
  const restId = 'rest_m6_test_123';
  const userId = 'user_staff_456';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Permission Matrix for Orders & Staff Ops', () => {
    it('allows access_orders for owner, manager, cashier, and accountant', () => {
      expect(hasPermission('owner', 'access_orders')).toBe(true);
      expect(hasPermission('manager', 'access_orders')).toBe(true);
      expect(hasPermission('cashier', 'access_orders')).toBe(true);
      expect(hasPermission('accountant', 'access_orders')).toBe(true);
      expect(hasPermission('captain', 'access_orders')).toBe(false);
      expect(hasPermission('kitchen', 'access_orders')).toBe(false);
    });

    it('allows view_orders for all operational roles', () => {
      expect(hasPermission('owner', 'view_orders')).toBe(true);
      expect(hasPermission('manager', 'view_orders')).toBe(true);
      expect(hasPermission('cashier', 'view_orders')).toBe(true);
      expect(hasPermission('captain', 'view_orders')).toBe(true);
      expect(hasPermission('kitchen', 'view_orders')).toBe(true);
      expect(hasPermission('accountant', 'view_orders')).toBe(true);
    });

    it('verifies view permissions for orders page', () => {
      expect(isViewAllowed('owner', 'orders')).toBe(true);
      expect(isViewAllowed('manager', 'orders')).toBe(true);
      expect(isViewAllowed('cashier', 'orders')).toBe(true);
      expect(isViewAllowed('accountant', 'orders')).toBe(true);
      expect(isViewAllowed('captain', 'orders')).toBe(false);
    });
  });

  describe('2. Historical Table Session Retrieval', () => {
    it('queries historical closed table sessions scoped by restaurantId and tableId', async () => {
      const mockSessionsData = [
        {
          id: 'sess_closed_1',
          restaurantId: restId,
          tableId: 'tbl_101',
          guestCount: 3,
          status: 'closed',
          openedAt: new Date(Date.now() - 3600000),
          closedAt: new Date(Date.now() - 1800000)
        },
        {
          id: 'sess_closed_2',
          restaurantId: restId,
          tableId: 'tbl_101',
          guestCount: 2,
          status: 'closed',
          openedAt: new Date(Date.now() - 7200000),
          closedAt: new Date(Date.now() - 5400000)
        }
      ];

      const docsList = mockSessionsData.map((data) => ({
        id: data.id,
        data: () => data
      }));
      (getDocs as any).mockResolvedValueOnce({
        docs: docsList,
        forEach: (cb: any) => docsList.forEach(cb)
      });

      const sessions = await tableSessionService.getHistoricalSessionsForTable(restId, 'tbl_101', 10);
      expect(sessions.length).toBe(2);
      expect(sessions[0].status).toBe('closed');
      expect(sessions[0].tableId).toBe('tbl_101');
      expect(sessions[1].status).toBe('closed');
    });
  });

  describe('3. Order History Query & Filtering Engine', () => {
    const mockOrders: Order[] = [
      {
        id: 'ord_1',
        restaurantId: restId,
        orderNumber: '1001',
        orderType: 'dineIn',
        tableId: 'tbl_1',
        tableSessionId: 'sess_1',
        items: [
          {
            itemId: 'item_paneer',
            nameSnapshot: 'Paneer Tikka',
            unitPriceMinor: 25000,
            taxRate: 5,
            taxInclusive: false,
            quantity: 2,
            lineTotalMinor: 50000
          }
        ],
        subtotalMinor: 50000,
        discountMinor: 0,
        taxableAmountMinor: 50000,
        cgstMinor: 1250,
        sgstMinor: 1250,
        igstMinor: 0,
        totalTaxMinor: 2500,
        grandTotalMinor: 52500,
        paidAmountMinor: 52500,
        dueAmountMinor: 0,
        status: 'completed',
        createdAt: new Date(Date.now() - 100000)
      } as any,
      {
        id: 'ord_2',
        restaurantId: restId,
        orderNumber: '1002',
        orderType: 'takeaway',
        customerSnapshot: { name: 'Rahul Sharma', phone: '9876543210' },
        items: [
          {
            itemId: 'item_biryani',
            nameSnapshot: 'Hyderabadi Biryani',
            unitPriceMinor: 35000,
            taxRate: 5,
            taxInclusive: false,
            quantity: 1,
            lineTotalMinor: 35000
          }
        ],
        subtotalMinor: 35000,
        discountMinor: 5000,
        taxableAmountMinor: 30000,
        cgstMinor: 750,
        sgstMinor: 750,
        igstMinor: 0,
        totalTaxMinor: 1500,
        grandTotalMinor: 31500,
        paidAmountMinor: 0,
        dueAmountMinor: 31500,
        status: 'served',
        createdAt: new Date(Date.now() - 50000)
      } as any
    ];

    it('filters orders by paymentStatus (paid vs unpaid)', async () => {
      const docsList = mockOrders.map((ord) => ({
        id: ord.id,
        data: () => ord
      }));
      (getDocs as any).mockResolvedValueOnce({
        docs: docsList,
        forEach: (cb: any) => docsList.forEach(cb)
      });

      const result = await orderService.queryOrderHistory(restId, {
        paymentStatus: 'paid'
      });

      expect(result.orders.length).toBe(1);
      expect(result.orders[0].id).toBe('ord_1');
      expect(result.orders[0].paidAmountMinor).toBe(52500);
    });

    it('filters orders by orderType (dineIn vs takeaway)', async () => {
      const docsList = mockOrders.map((ord) => ({
        id: ord.id,
        data: () => ord
      }));
      (getDocs as any).mockResolvedValueOnce({
        docs: docsList,
        forEach: (cb: any) => docsList.forEach(cb)
      });

      const result = await orderService.queryOrderHistory(restId, {
        orderType: 'takeaway'
      });

      expect(result.orders.length).toBe(1);
      expect(result.orders[0].id).toBe('ord_2');
      expect(result.orders[0].customerSnapshot?.name).toBe('Rahul Sharma');
    });

    it('searches orders by customer name, phone, or order number', async () => {
      const docsList = mockOrders.map((ord) => ({
        id: ord.id,
        data: () => ord
      }));
      (getDocs as any).mockResolvedValueOnce({
        docs: docsList,
        forEach: (cb: any) => docsList.forEach(cb)
      });

      const result = await orderService.queryOrderHistory(restId, {
        searchQuery: '9876543210'
      });

      expect(result.orders.length).toBe(1);
      expect(result.orders[0].id).toBe('ord_2');
    });
  });

  describe('4. Historical Financial Snapshot Integrity', () => {
    it('preserves exact line item pricing and tax breakdown without recalculating from today prices', async () => {
      const historicalOrder: Order = {
        id: 'ord_hist_99',
        restaurantId: restId,
        orderNumber: '500',
        orderType: 'dineIn',
        items: [
          {
            itemId: 'item_vintage',
            nameSnapshot: 'Vintage Espresso (2025 Recipe)',
            shortNameSnapshot: 'Espresso',
            unitPriceMinor: 12000,
            taxRate: 5,
            taxInclusive: false,
            quantity: 2,
            lineSubtotalMinor: 24000,
            lineTaxMinor: 1200,
            lineTotalMinor: 25200
          }
        ],
        subtotalMinor: 24000,
        discountMinor: 0,
        taxableAmountMinor: 24000,
        cgstMinor: 600,
        sgstMinor: 600,
        igstMinor: 0,
        totalTaxMinor: 1200,
        grandTotalMinor: 25200,
        paidAmountMinor: 25200,
        dueAmountMinor: 0,
        status: 'completed',
        createdAt: new Date('2025-01-15T12:00:00Z')
      } as any;

      (getDoc as any).mockResolvedValueOnce({
        exists: () => true,
        data: () => historicalOrder
      });

      const order = await orderService.getOrderById(restId, 'ord_hist_99');
      expect(order).not.toBeNull();
      expect(order!.items[0].nameSnapshot).toBe('Vintage Espresso (2025 Recipe)');
      expect(order!.items[0].unitPriceMinor).toBe(12000);
      expect(order!.grandTotalMinor).toBe(25200);
      expect(order!.cgstMinor).toBe(600);
      expect(order!.sgstMinor).toBe(600);
    });
  });

  describe('5. Bill Viewed and Reprint Audit Logging', () => {
    it('logs bill reprint audit event with user UID and order ID', async () => {
      await orderService.logBillReprint(restId, 'ord_1001', userId);

      expect(auditService.logEvent).toHaveBeenCalledWith(
        restId,
        expect.objectContaining({
          actorUid: userId,
          action: 'bill_reprinted',
          entityType: 'order',
          entityId: 'ord_1001'
        })
      );
    });

    it('logs bill viewed audit event with user UID', async () => {
      await orderService.logBillViewed(restId, 'ord_1001', userId);

      expect(auditService.logEvent).toHaveBeenCalledWith(
        restId,
        expect.objectContaining({
          actorUid: userId,
          action: 'bill_viewed',
          entityType: 'order',
          entityId: 'ord_1001'
        })
      );
    });
  });

  describe('6. Safe Reopen Flow', () => {
    it('safely reopens a completed order to served status without modifying payments', async () => {
      const mockCompletedOrder = {
        id: 'ord_completed_1',
        restaurantId: restId,
        orderNumber: '1001',
        status: 'completed',
        grandTotalMinor: 50000,
        paidAmountMinor: 50000,
        dueAmountMinor: 0
      };

      (getDoc as any).mockResolvedValueOnce({
        exists: () => true,
        data: () => mockCompletedOrder
      });

      await orderService.reopenOrder(restId, 'ord_completed_1', userId, 'Staff adjustment needed');

      expect(auditService.logEvent).toHaveBeenCalledWith(
        restId,
        expect.objectContaining({
          actorUid: userId,
          action: 'order_reopened',
          entityType: 'order',
          entityId: 'ord_completed_1'
        })
      );
    });

    it('rejects reopening if order is cancelled', async () => {
      const mockCancelledOrder = {
        id: 'ord_cancelled_1',
        restaurantId: restId,
        status: 'cancelled'
      };

      (getDoc as any).mockResolvedValueOnce({
        exists: () => true,
        data: () => mockCancelledOrder
      });

      await expect(
        orderService.reopenOrder(restId, 'ord_cancelled_1', userId, 'Attempt reopen')
      ).rejects.toThrow(/Cannot reopen cancelled order/);
    });
  });
});
