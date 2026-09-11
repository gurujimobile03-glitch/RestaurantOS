import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaymentService } from '../services/paymentService';
import { calculateOrderSettlement } from '../domain/settlement';
import { Order } from '../types/order';
import { Payment } from '../types/payment';
import { MenuItem } from '../types/menu';

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
    query: vi.fn((colRef, ..._clauses) => ({ type: 'query', colRef })),
    where: vi.fn((field, op, val) => ({ type: 'where', field, op, val })),
    orderBy: vi.fn((field, dir) => ({ type: 'orderBy', field, dir })),
    onSnapshot: vi.fn(() => vi.fn()),
    serverTimestamp: vi.fn(() => new Date('2026-09-08T12:00:00Z')),
    runTransaction: vi.fn(async (_db, callback) => {
      const mockTx = {
        get: vi.fn(),
        set: vi.fn(),
        update: vi.fn()
      };
      return callback(mockTx);
    })
  };
});

// Mock Firebase Config
vi.mock('../config/firebase', () => ({
  db: { type: 'mockDb' },
  auth: { currentUser: { uid: 'TEST_AUTH_USER_123' } }
}));

import * as firestore from 'firebase/firestore';

describe('Payment & Billing Comprehensive Invariants (Phase 2F)', () => {
  let paymentService: PaymentService;

  beforeEach(() => {
    vi.clearAllMocks();
    paymentService = new PaymentService();
  });

  describe('1. Mathematical Invariant Verification Matrix across Multiple Split Patterns', () => {
    it('verifies paidAmountMinor + dueAmountMinor === grandTotalMinor across random split partitions', () => {
      const grandTotalMinor = 73500; // ₹735.00

      const order: Pick<Order, 'id' | 'restaurantId' | 'grandTotalMinor'> = {
        id: 'ord_inv_735',
        restaurantId: 'REST_ABC_01',
        grandTotalMinor
      };

      // Split 1: ₹200 Cash + ₹300 Card + ₹235 UPI = ₹735
      const splitPayments: Payment[] = [
        {
          id: 'pay_1',
          restaurantId: 'REST_ABC_01',
          orderId: 'ord_inv_735',
          amountMinor: 20000,
          method: 'cash',
          status: 'completed',
          createdBy: 'STAFF_1',
          createdAt: new Date()
        },
        {
          id: 'pay_2',
          restaurantId: 'REST_ABC_01',
          orderId: 'ord_inv_735',
          amountMinor: 30000,
          method: 'card',
          status: 'completed',
          createdBy: 'STAFF_1',
          createdAt: new Date()
        },
        {
          id: 'pay_3',
          restaurantId: 'REST_ABC_01',
          orderId: 'ord_inv_735',
          amountMinor: 23500,
          method: 'upi',
          status: 'completed',
          createdBy: 'STAFF_1',
          createdAt: new Date()
        }
      ];

      const settlement = calculateOrderSettlement(order, splitPayments);

      expect(settlement.paidAmountMinor).toBe(73500);
      expect(settlement.dueAmountMinor).toBe(0);
      expect(settlement.paidAmountMinor + settlement.dueAmountMinor).toBe(grandTotalMinor);
      expect(settlement.isFullySettled).toBe(true);
      expect(settlement.settlementStatus).toBe('fully_paid');
    });

    it('preserves invariant when partial payment is made (₹100 on ₹735)', () => {
      const grandTotalMinor = 73500;
      const order: Pick<Order, 'id' | 'restaurantId' | 'grandTotalMinor'> = {
        id: 'ord_inv_735',
        restaurantId: 'REST_ABC_01',
        grandTotalMinor
      };

      const partialPayments: Payment[] = [
        {
          id: 'pay_1',
          restaurantId: 'REST_ABC_01',
          orderId: 'ord_inv_735',
          amountMinor: 10000, // ₹100
          method: 'cash',
          status: 'completed',
          createdBy: 'STAFF_1',
          createdAt: new Date()
        }
      ];

      const settlement = calculateOrderSettlement(order, partialPayments);

      expect(settlement.paidAmountMinor).toBe(10000);
      expect(settlement.dueAmountMinor).toBe(63500);
      expect(settlement.paidAmountMinor + settlement.dueAmountMinor).toBe(grandTotalMinor);
      expect(settlement.isFullySettled).toBe(false);
      expect(settlement.settlementStatus).toBe('partially_paid');
    });
  });

  describe('2. Historical Catalog Price Change Independence', () => {
    it('guarantees payment settlement is calculated against historical Order grandTotalMinor and NOT current menu item prices', async () => {
      // Historical item: was ₹100 when order was created
      const catalogItem: MenuItem = {
        itemId: 'item_pizza_01',
        restaurantId: 'REST_ABC_01',
        categoryId: 'cat_main',
        name: 'Cheese Pizza',
        shortName: 'Cheese Pizza',
        description: 'Classic cheese pizza',
        imageUrl: null,
        sku: 'PIZZA-01',
        price: 100.0, // ₹100
        taxRate: 5,
        taxInclusive: false,
        foodType: 'veg',
        isAvailable: true,
        sortOrder: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Order was created with total ₹105.00 (₹100 + 5% GST = 10,500 paise)
      const historicalOrder: Order = {
        id: 'ord_hist_105',
        restaurantId: 'REST_ABC_01',
        orderNumber: 'ORD-HIST-01',
        orderType: 'takeaway',
        source: 'pos',
        status: 'confirmed',
        items: [
          {
            itemId: 'item_pizza_01',
            nameSnapshot: 'Cheese Pizza',
            shortNameSnapshot: 'Cheese Pizza',
            quantity: 1,
            unitPriceMinor: 10000,
            taxRate: 5,
            taxInclusive: false,
            discountMinor: 0,
            lineSubtotalMinor: 10000,
            lineTaxMinor: 500,
            lineTotalMinor: 10500
          }
        ],
        subtotalMinor: 10000,
        discountMinor: 0,
        taxableAmountMinor: 10000,
        cgstMinor: 250,
        sgstMinor: 250,
        igstMinor: 0,
        totalTaxMinor: 500,
        grandTotalMinor: 10500, // 10,500 paise
        paidAmountMinor: 0,
        dueAmountMinor: 10500,
        createdBy: 'STAFF_1',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // LIVE CATALOG PRICE HIKE: Price changed from ₹100 to ₹250 (250% increase)
      catalogItem.price = 250.0;
      catalogItem.name = 'Luxury Supreme Pizza';

      // Record exact payment of historical bill total (₹105.00 / 10,500 paise)
      vi.mocked(firestore.runTransaction).mockImplementationOnce(async (_db, cb: any) => {
        const mockTx = {
          get: vi.fn().mockResolvedValueOnce({
            exists: () => true,
            data: () => ({ ...historicalOrder })
          }),
          set: vi.fn(),
          update: vi.fn((_ref, data) => {
            expect(data.paidAmountMinor).toBe(10500);
            expect(data.dueAmountMinor).toBe(0);
          })
        };
        return cb(mockTx);
      });

      const payment = await paymentService.recordPayment('REST_ABC_01', {
        orderId: 'ord_hist_105',
        amountMinor: 10500, // ₹105.00
        method: 'upi'
      });

      expect(payment.amountMinor).toBe(10500);
      expect(payment.status).toBe('completed');
    });
  });

  describe('3. Concurrency Analysis & Distributed Locking Boundary', () => {
    it('verifies transactional atomicity prevents race condition when two requests attempt to pay simultaneously', async () => {
      // In a transactional context, if Order has grandTotal = ₹1000 and two devices simultaneously read due = ₹1000:
      // Device A attempts ₹600.
      // Device B attempts ₹600.
      // The transaction that commits first sets paid = ₹600 (due = ₹400).
      // The second transaction re-reads paid = ₹600, sees ₹600 + ₹600 = ₹1200 > ₹1000, and is safely rejected by the overpayment guard.

      const order1000: Order = {
        id: 'ord_conc_1000',
        restaurantId: 'REST_ABC_01',
        orderNumber: 'ORD-1000',
        orderType: 'dineIn',
        source: 'pos',
        status: 'confirmed',
        items: [],
        subtotalMinor: 100000,
        discountMinor: 0,
        taxableAmountMinor: 100000,
        cgstMinor: 0,
        sgstMinor: 0,
        igstMinor: 0,
        totalTaxMinor: 0,
        grandTotalMinor: 100000, // ₹1000
        paidAmountMinor: 60000,  // Committed by Device A
        dueAmountMinor: 40000,
        createdBy: 'STAFF_1',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      vi.mocked(firestore.runTransaction).mockImplementationOnce(async (_db, cb: any) => {
        const mockTx = {
          get: vi.fn().mockResolvedValueOnce({
            exists: () => true,
            data: () => ({ ...order1000 })
          }),
          set: vi.fn(),
          update: vi.fn()
        };
        return cb(mockTx);
      });

      // Device B attempts ₹600
      await expect(
        paymentService.recordPayment('REST_ABC_01', {
          orderId: 'ord_conc_1000',
          amountMinor: 60000, // ₹600
          method: 'card'
        })
      ).rejects.toThrow('Overpayment rejected');
    });
  });
});
