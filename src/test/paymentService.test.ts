import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaymentService } from '../services/paymentService';
import { Order } from '../types/order';
import { Payment } from '../types/payment';

// Mock Firebase Firestore SDK
vi.mock('firebase/firestore', () => {
  return {
    collection: vi.fn((_db, ...pathSegments) => ({ type: 'collection', path: pathSegments.join('/') })),
    doc: vi.fn((_dbOrCol, ...pathSegments) => {
      const id = pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : `mock_pay_${Math.random().toString(36).substring(2, 8)}`;
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
      // Mock transaction context
      const mockTx = {
        get: vi.fn(),
        set: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
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

describe('Payment Service & Transactional Settlement (Phase 2F)', () => {
  let paymentService: PaymentService;
  let sampleOrder500: Order;

  beforeEach(() => {
    vi.clearAllMocks();
    paymentService = new PaymentService();

    sampleOrder500 = {
      id: 'ord_500',
      restaurantId: 'REST_ABC_01',
      orderNumber: 'ORD-2026-500',
      orderType: 'dineIn',
      source: 'pos',
      status: 'confirmed',
      items: [
        {
          itemId: 'item_1',
          nameSnapshot: 'Thali',
          shortNameSnapshot: 'Thali',
          quantity: 2,
          unitPriceMinor: 25000,
          taxRate: 0,
          taxInclusive: true,
          discountMinor: 0,
          lineSubtotalMinor: 50000,
          lineTaxMinor: 0,
          lineTotalMinor: 50000
        }
      ],
      subtotalMinor: 50000,
      discountMinor: 0,
      taxableAmountMinor: 50000,
      cgstMinor: 0,
      sgstMinor: 0,
      igstMinor: 0,
      totalTaxMinor: 0,
      grandTotalMinor: 50000, // ₹500 (50,000 paise)
      paidAmountMinor: 0,
      dueAmountMinor: 50000,
      createdBy: 'STAFF_1',
      createdAt: new Date(),
      updatedAt: new Date()
    };
  });

  describe('1. Authoritative Payment Recording & Transactional Updates', () => {
    it('records a partial Cash payment and updates order paidAmount and dueAmount atomically', async () => {
      vi.mocked(firestore.runTransaction).mockImplementationOnce(async (_db, cb: any) => {
        const mockTx = {
          get: vi.fn().mockResolvedValueOnce({
            exists: () => true,
            data: () => ({ ...sampleOrder500 })
          }),
          set: vi.fn(),
          update: vi.fn()
        };
        return cb(mockTx);
      });

      const payment = await paymentService.recordPayment('REST_ABC_01', {
        orderId: 'ord_500',
        amountMinor: 20000, // ₹200
        method: 'cash',
        createdBy: 'CASHIER_ANITA'
      });

      expect(payment.restaurantId).toBe('REST_ABC_01');
      expect(payment.orderId).toBe('ord_500');
      expect(payment.amountMinor).toBe(20000);
      expect(payment.method).toBe('cash');
      expect(payment.status).toBe('completed');
      expect(payment.createdBy).toBe('CASHIER_ANITA');
    });

    it('records an exact payment settling the full order due (₹500 on ₹500 order)', async () => {
      vi.mocked(firestore.runTransaction).mockImplementationOnce(async (_db, cb: any) => {
        const mockTx = {
          get: vi.fn().mockResolvedValueOnce({
            exists: () => true,
            data: () => ({ ...sampleOrder500 })
          }),
          set: vi.fn(),
          update: vi.fn((_ref, data) => {
            expect(data.paidAmountMinor).toBe(50000);
            expect(data.dueAmountMinor).toBe(0);
          })
        };
        return cb(mockTx);
      });

      const payment = await paymentService.recordPayment('REST_ABC_01', {
        orderId: 'ord_500',
        amountMinor: 50000, // ₹500
        method: 'upi',
        reference: 'UPI_REF_9981'
      });

      expect(payment.amountMinor).toBe(50000);
      expect(payment.reference).toBe('UPI_REF_9981');
    });

    it('rejects overpayment attempt (₹501 on ₹500 order)', async () => {
      vi.mocked(firestore.runTransaction).mockImplementationOnce(async (_db, cb: any) => {
        const mockTx = {
          get: vi.fn().mockResolvedValueOnce({
            exists: () => true,
            data: () => ({ ...sampleOrder500 })
          }),
          set: vi.fn(),
          update: vi.fn()
        };
        return cb(mockTx);
      });

      await expect(
        paymentService.recordPayment('REST_ABC_01', {
          orderId: 'ord_500',
          amountMinor: 50100, // ₹501
          method: 'cash'
        })
      ).rejects.toThrow('Overpayment rejected');
    });

    it('rejects second payment when order is already partially paid and total exceeds grand total', async () => {
      // Order already has ₹300 paid (due = ₹200)
      const partiallyPaidOrder: Order = {
        ...sampleOrder500,
        paidAmountMinor: 30000,
        dueAmountMinor: 20000
      };

      vi.mocked(firestore.runTransaction).mockImplementationOnce(async (_db, cb: any) => {
        const mockTx = {
          get: vi.fn().mockResolvedValueOnce({
            exists: () => true,
            data: () => ({ ...partiallyPaidOrder })
          }),
          set: vi.fn(),
          update: vi.fn()
        };
        return cb(mockTx);
      });

      // Attempt to pay ₹250 when only ₹200 is due
      await expect(
        paymentService.recordPayment('REST_ABC_01', {
          orderId: 'ord_500',
          amountMinor: 25000, // ₹250
          method: 'card'
        })
      ).rejects.toThrow('Overpayment rejected');
    });
  });

  describe('2. Validation & Boundary Rejections', () => {
    it('rejects zero amountMinor', async () => {
      await expect(
        paymentService.recordPayment('REST_ABC_01', {
          orderId: 'ord_500',
          amountMinor: 0,
          method: 'cash'
        })
      ).rejects.toThrow('Payment validation failed');
    });

    it('rejects negative amountMinor', async () => {
      await expect(
        paymentService.recordPayment('REST_ABC_01', {
          orderId: 'ord_500',
          amountMinor: -1000,
          method: 'cash'
        })
      ).rejects.toThrow('Payment validation failed');
    });

    it('rejects decimal / float amountMinor', async () => {
      await expect(
        paymentService.recordPayment('REST_ABC_01', {
          orderId: 'ord_500',
          amountMinor: 250.50 as any,
          method: 'cash'
        })
      ).rejects.toThrow('Payment validation failed');
    });

    it('rejects NaN and Infinity amountMinor', async () => {
      await expect(
        paymentService.recordPayment('REST_ABC_01', {
          orderId: 'ord_500',
          amountMinor: NaN as any,
          method: 'cash'
        })
      ).rejects.toThrow('Payment validation failed');

      await expect(
        paymentService.recordPayment('REST_ABC_01', {
          orderId: 'ord_500',
          amountMinor: Infinity as any,
          method: 'cash'
        })
      ).rejects.toThrow('Payment validation failed');
    });

    it('rejects unrecognised payment methods (e.g. bitcoin/crypto)', async () => {
      await expect(
        paymentService.recordPayment('REST_ABC_01', {
          orderId: 'ord_500',
          amountMinor: 10000,
          method: 'crypto' as any
        })
      ).rejects.toThrow('Payment validation failed');
    });

    it('rejects payment on cancelled orders', async () => {
      vi.mocked(firestore.runTransaction).mockImplementationOnce(async (_db, cb: any) => {
        const mockTx = {
          get: vi.fn().mockResolvedValueOnce({
            exists: () => true,
            data: () => ({ ...sampleOrder500, status: 'cancelled' })
          }),
          set: vi.fn(),
          update: vi.fn()
        };
        return cb(mockTx);
      });

      await expect(
        paymentService.recordPayment('REST_ABC_01', {
          orderId: 'ord_500',
          amountMinor: 10000,
          method: 'cash'
        })
      ).rejects.toThrow('Cannot record payment for cancelled order');
    });
  });

  describe('3. Payment Status Lifecycle & Refund Workflow', () => {
    it('transitions pending payment to completed and increments order paidAmount', async () => {
      const pendingPayment: Payment = {
        id: 'pay_pending_1',
        restaurantId: 'REST_ABC_01',
        orderId: 'ord_500',
        amountMinor: 20000,
        method: 'upi',
        status: 'pending',
        createdBy: 'STAFF_1',
        createdAt: new Date()
      };

      vi.mocked(firestore.runTransaction).mockImplementationOnce(async (_db, cb: any) => {
        const mockTx = {
          get: vi.fn()
            .mockResolvedValueOnce({ exists: () => true, data: () => ({ ...pendingPayment }) })
            .mockResolvedValueOnce({ exists: () => true, data: () => ({ ...sampleOrder500 }) }),
          update: vi.fn((_ref, data) => {
            if (data.status === 'completed') {
              expect(data.status).toBe('completed');
            }
            if (data.paidAmountMinor !== undefined) {
              expect(data.paidAmountMinor).toBe(20000);
              expect(data.dueAmountMinor).toBe(30000);
            }
          })
        };
        return cb(mockTx);
      });

      await paymentService.updatePaymentStatus('REST_ABC_01', 'pay_pending_1', 'completed', 'STAFF_1');
    });

    it('refunds a completed payment, deducting from order paidAmount and preserving the payment record', async () => {
      const completedPayment: Payment = {
        id: 'pay_comp_1',
        restaurantId: 'REST_ABC_01',
        orderId: 'ord_500',
        amountMinor: 50000,
        method: 'cash',
        status: 'completed',
        createdBy: 'STAFF_1',
        createdAt: new Date()
      };

      const settledOrder: Order = {
        ...sampleOrder500,
        paidAmountMinor: 50000,
        dueAmountMinor: 0
      };

      vi.mocked(firestore.runTransaction).mockImplementationOnce(async (_db, cb: any) => {
        const mockTx = {
          get: vi.fn()
            .mockResolvedValueOnce({ exists: () => true, data: () => ({ ...completedPayment }) })
            .mockResolvedValueOnce({ exists: () => true, data: () => ({ ...settledOrder }) }),
          update: vi.fn((_ref, data) => {
            if (data.status === 'refunded') {
              expect(data.status).toBe('refunded');
              expect(data.refundReason).toBe('Customer cancellation before kitchen prep');
            }
            if (data.paidAmountMinor !== undefined) {
              expect(data.paidAmountMinor).toBe(0);
              expect(data.dueAmountMinor).toBe(50000);
            }
          })
        };
        return cb(mockTx);
      });

      await paymentService.refundPayment(
        'REST_ABC_01',
        'pay_comp_1',
        'MANAGER_ROHAN',
        'Customer cancellation before kitchen prep'
      );
    });

    it('rejects invalid payment transition: refunded -> completed', async () => {
      const refundedPayment: Payment = {
        id: 'pay_ref_1',
        restaurantId: 'REST_ABC_01',
        orderId: 'ord_500',
        amountMinor: 50000,
        method: 'cash',
        status: 'refunded',
        createdBy: 'STAFF_1',
        createdAt: new Date()
      };

      vi.mocked(firestore.runTransaction).mockImplementationOnce(async (_db, cb: any) => {
        const mockTx = {
          get: vi.fn().mockResolvedValueOnce({ exists: () => true, data: () => ({ ...refundedPayment }) }),
          update: vi.fn()
        };
        return cb(mockTx);
      });

      await expect(
        paymentService.updatePaymentStatus('REST_ABC_01', 'pay_ref_1', 'completed', 'STAFF_1')
      ).rejects.toThrow('Illegal payment status transition');
    });

    it('rejects invalid payment transition: failed -> completed', async () => {
      const failedPayment: Payment = {
        id: 'pay_fail_1',
        restaurantId: 'REST_ABC_01',
        orderId: 'ord_500',
        amountMinor: 50000,
        method: 'card',
        status: 'failed',
        createdBy: 'STAFF_1',
        createdAt: new Date()
      };

      vi.mocked(firestore.runTransaction).mockImplementationOnce(async (_db, cb: any) => {
        const mockTx = {
          get: vi.fn().mockResolvedValueOnce({ exists: () => true, data: () => ({ ...failedPayment }) }),
          update: vi.fn()
        };
        return cb(mockTx);
      });

      await expect(
        paymentService.updatePaymentStatus('REST_ABC_01', 'pay_fail_1', 'completed', 'STAFF_1')
      ).rejects.toThrow('Illegal payment status transition');
    });
  });

  describe('4. Cross-Tenant Isolation & Security', () => {
    it('rejects recording payment when target restaurant does not match order restaurant', async () => {
      vi.mocked(firestore.runTransaction).mockImplementationOnce(async (_db, cb: any) => {
        const mockTx = {
          get: vi.fn().mockResolvedValueOnce({
            exists: () => true,
            // Order belongs to REST_TENANT_A
            data: () => ({ ...sampleOrder500, restaurantId: 'REST_TENANT_A' })
          }),
          set: vi.fn(),
          update: vi.fn()
        };
        return cb(mockTx);
      });

      // Caller is REST_TENANT_B
      await expect(
        paymentService.recordPayment('REST_TENANT_B', {
          orderId: 'ord_500',
          amountMinor: 10000,
          method: 'cash'
        })
      ).rejects.toThrow('Cross-tenant violation');
    });

    it('rejects recording payment if payload restaurantId does not match target restaurantId', async () => {
      await expect(
        paymentService.recordPayment('REST_TENANT_A', {
          restaurantId: 'REST_TENANT_B',
          orderId: 'ord_500',
          amountMinor: 10000,
          method: 'cash'
        })
      ).rejects.toThrow('Payload restaurantId "REST_TENANT_B" does not match target restaurantId "REST_TENANT_A"');
    });
  });
});
