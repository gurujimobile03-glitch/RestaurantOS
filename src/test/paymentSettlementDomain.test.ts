import { describe, it, expect } from 'vitest';
import { calculateOrderSettlement } from '../domain/settlement';
import { Payment } from '../types/payment';
import { Order } from '../types/order';

describe('Billing & Settlement Pure Calculation Engine (Phase 2F)', () => {
  const baseOrder: Pick<Order, 'id' | 'restaurantId' | 'grandTotalMinor'> = {
    id: 'ord_sample_500',
    restaurantId: 'REST_ABC_01',
    grandTotalMinor: 50000 // ₹500.00 (50,000 paise)
  };

  describe('1. Baseline Unpaid & Single Payment States', () => {
    it('returns unpaid status when no payments exist', () => {
      const settlement = calculateOrderSettlement(baseOrder, []);

      expect(settlement.orderId).toBe('ord_sample_500');
      expect(settlement.restaurantId).toBe('REST_ABC_01');
      expect(settlement.grandTotalMinor).toBe(50000);
      expect(settlement.paidAmountMinor).toBe(0);
      expect(settlement.dueAmountMinor).toBe(50000);
      expect(settlement.completedPaymentsCount).toBe(0);
      expect(settlement.isFullySettled).toBe(false);
      expect(settlement.settlementStatus).toBe('unpaid');
    });

    it('calculates partial settlement accurately (₹200 paid of ₹500)', () => {
      const payment1: Payment = {
        id: 'pay_01',
        restaurantId: 'REST_ABC_01',
        orderId: 'ord_sample_500',
        amountMinor: 20000, // ₹200
        method: 'cash',
        status: 'completed',
        createdBy: 'USER_1',
        createdAt: new Date()
      };

      const settlement = calculateOrderSettlement(baseOrder, [payment1]);

      expect(settlement.paidAmountMinor).toBe(20000);
      expect(settlement.dueAmountMinor).toBe(30000);
      expect(settlement.completedPaymentsCount).toBe(1);
      expect(settlement.isFullySettled).toBe(false);
      expect(settlement.settlementStatus).toBe('partially_paid');
    });

    it('calculates exact full settlement accurately (₹500 paid of ₹500)', () => {
      const payment1: Payment = {
        id: 'pay_01',
        restaurantId: 'REST_ABC_01',
        orderId: 'ord_sample_500',
        amountMinor: 50000, // ₹500
        method: 'upi',
        status: 'completed',
        createdBy: 'USER_1',
        createdAt: new Date()
      };

      const settlement = calculateOrderSettlement(baseOrder, [payment1]);

      expect(settlement.paidAmountMinor).toBe(50000);
      expect(settlement.dueAmountMinor).toBe(0);
      expect(settlement.completedPaymentsCount).toBe(1);
      expect(settlement.isFullySettled).toBe(true);
      expect(settlement.settlementStatus).toBe('fully_paid');
    });

    it('handles zero-total order as immediately settled', () => {
      const zeroOrder = {
        id: 'ord_free_promo',
        restaurantId: 'REST_ABC_01',
        grandTotalMinor: 0
      };

      const settlement = calculateOrderSettlement(zeroOrder, []);
      expect(settlement.paidAmountMinor).toBe(0);
      expect(settlement.dueAmountMinor).toBe(0);
      expect(settlement.isFullySettled).toBe(true);
      expect(settlement.settlementStatus).toBe('unpaid'); // 0 paid
    });
  });

  describe('2. Split Settlement Across Multiple Methods', () => {
    it('accurately aggregates multiple completed split payments (₹500 Cash + ₹1000 UPI on ₹1500 Order)', () => {
      const splitOrder: Pick<Order, 'id' | 'restaurantId' | 'grandTotalMinor'> = {
        id: 'ord_split_1500',
        restaurantId: 'REST_ABC_01',
        grandTotalMinor: 150000 // ₹1500.00
      };

      const paymentA: Payment = {
        id: 'pay_split_1',
        restaurantId: 'REST_ABC_01',
        orderId: 'ord_split_1500',
        amountMinor: 50000, // ₹500 Cash
        method: 'cash',
        status: 'completed',
        createdBy: 'USER_1',
        createdAt: new Date()
      };

      const paymentB: Payment = {
        id: 'pay_split_2',
        restaurantId: 'REST_ABC_01',
        orderId: 'ord_split_1500',
        amountMinor: 100000, // ₹1000 UPI
        method: 'upi',
        status: 'completed',
        reference: 'UPI/UTR/889211029',
        createdBy: 'USER_1',
        createdAt: new Date()
      };

      const settlement = calculateOrderSettlement(splitOrder, [paymentA, paymentB]);

      expect(settlement.paidAmountMinor).toBe(150000);
      expect(settlement.dueAmountMinor).toBe(0);
      expect(settlement.completedPaymentsCount).toBe(2);
      expect(settlement.isFullySettled).toBe(true);
      expect(settlement.settlementStatus).toBe('fully_paid');
    });

    it('supports 3-way split (Cash + Card + UPI)', () => {
      const order1000: Pick<Order, 'id' | 'restaurantId' | 'grandTotalMinor'> = {
        id: 'ord_split_1000',
        restaurantId: 'REST_ABC_01',
        grandTotalMinor: 100000 // ₹1000.00
      };

      const payments: Payment[] = [
        {
          id: 'pay_1',
          restaurantId: 'REST_ABC_01',
          orderId: 'ord_split_1000',
          amountMinor: 30000, // ₹300
          method: 'cash',
          status: 'completed',
          createdBy: 'USER_1',
          createdAt: new Date()
        },
        {
          id: 'pay_2',
          restaurantId: 'REST_ABC_01',
          orderId: 'ord_split_1000',
          amountMinor: 40000, // ₹400
          method: 'card',
          status: 'completed',
          reference: 'AUTH_499210',
          createdBy: 'USER_1',
          createdAt: new Date()
        },
        {
          id: 'pay_3',
          restaurantId: 'REST_ABC_01',
          orderId: 'ord_split_1000',
          amountMinor: 30000, // ₹300
          method: 'upi',
          status: 'completed',
          createdBy: 'USER_1',
          createdAt: new Date()
        }
      ];

      const settlement = calculateOrderSettlement(order1000, payments);
      expect(settlement.paidAmountMinor).toBe(100000);
      expect(settlement.dueAmountMinor).toBe(0);
      expect(settlement.completedPaymentsCount).toBe(3);
      expect(settlement.isFullySettled).toBe(true);
    });
  });

  describe('3. Payment Status Filtering (Pending, Failed, Refunded)', () => {
    it('ignores pending, failed, and refunded payments in active paid totals', () => {
      const payments: Payment[] = [
        {
          id: 'pay_completed',
          restaurantId: 'REST_ABC_01',
          orderId: 'ord_sample_500',
          amountMinor: 20000, // ₹200
          method: 'cash',
          status: 'completed',
          createdBy: 'USER_1',
          createdAt: new Date()
        },
        {
          id: 'pay_pending',
          restaurantId: 'REST_ABC_01',
          orderId: 'ord_sample_500',
          amountMinor: 10000, // ₹100
          method: 'upi',
          status: 'pending',
          createdBy: 'USER_1',
          createdAt: new Date()
        },
        {
          id: 'pay_failed',
          restaurantId: 'REST_ABC_01',
          orderId: 'ord_sample_500',
          amountMinor: 15000, // ₹150
          method: 'card',
          status: 'failed',
          createdBy: 'USER_1',
          createdAt: new Date()
        },
        {
          id: 'pay_refunded',
          restaurantId: 'REST_ABC_01',
          orderId: 'ord_sample_500',
          amountMinor: 5000, // ₹50
          method: 'cash',
          status: 'refunded',
          refundReason: 'Customer returned cold beverage',
          createdBy: 'USER_1',
          createdAt: new Date()
        }
      ];

      const settlement = calculateOrderSettlement(baseOrder, payments);

      // Only pay_completed (₹200) counts
      expect(settlement.paidAmountMinor).toBe(20000);
      expect(settlement.dueAmountMinor).toBe(30000);
      expect(settlement.completedPaymentsCount).toBe(1);
      expect(settlement.settlementStatus).toBe('partially_paid');
    });

    it('ignores payments belonging to different orders or different restaurants', () => {
      const payments: Payment[] = [
        {
          id: 'pay_diff_order',
          restaurantId: 'REST_ABC_01',
          orderId: 'ord_DIFFERENT_999',
          amountMinor: 50000,
          method: 'cash',
          status: 'completed',
          createdBy: 'USER_1',
          createdAt: new Date()
        },
        {
          id: 'pay_diff_restaurant',
          restaurantId: 'REST_ANOTHER_TENANT',
          orderId: 'ord_sample_500',
          amountMinor: 50000,
          method: 'cash',
          status: 'completed',
          createdBy: 'USER_1',
          createdAt: new Date()
        }
      ];

      const settlement = calculateOrderSettlement(baseOrder, payments);
      expect(settlement.paidAmountMinor).toBe(0);
      expect(settlement.dueAmountMinor).toBe(50000);
      expect(settlement.completedPaymentsCount).toBe(0);
    });
  });

  describe('4. Overpayment Policy Enforcement', () => {
    it('throws when completed payments sum exceeds grand total (Overpayment Invariant Violation)', () => {
      const paymentOver: Payment = {
        id: 'pay_over',
        restaurantId: 'REST_ABC_01',
        orderId: 'ord_sample_500',
        amountMinor: 50100, // ₹501 on ₹500 order
        method: 'cash',
        status: 'completed',
        createdBy: 'USER_1',
        createdAt: new Date()
      };

      expect(() => calculateOrderSettlement(baseOrder, [paymentOver])).toThrow(
        'Financial Invariant Violation: Total paid amount (50100 paise) exceeds grand total (50000 paise)'
      );
    });
  });

  describe('5. Input Validation & Error Handling', () => {
    it('rejects invalid order objects or invalid grandTotalMinor', () => {
      expect(() => calculateOrderSettlement(null as any, [])).toThrow('Valid Order object is required');
      expect(() => calculateOrderSettlement({} as any, [])).toThrow('Order id is required');
      expect(() =>
        calculateOrderSettlement({ id: '1', restaurantId: '', grandTotalMinor: 100 }, [])
      ).toThrow('Restaurant id is required');
      expect(() =>
        calculateOrderSettlement({ id: '1', restaurantId: 'r1', grandTotalMinor: -100 }, [])
      ).toThrow('Order grandTotalMinor must be a safe non-negative integer minor unit');
      expect(() =>
        calculateOrderSettlement({ id: '1', restaurantId: 'r1', grandTotalMinor: 12.34 as any }, [])
      ).toThrow('Order grandTotalMinor must be a safe non-negative integer minor unit');
    });

    it('rejects completed payments with invalid or non-positive amountMinor', () => {
      const invalidPayment: Payment = {
        id: 'pay_invalid',
        restaurantId: 'REST_ABC_01',
        orderId: 'ord_sample_500',
        amountMinor: 0, // 0 is invalid
        method: 'cash',
        status: 'completed',
        createdBy: 'USER_1',
        createdAt: new Date()
      };

      expect(() => calculateOrderSettlement(baseOrder, [invalidPayment])).toThrow(
        'Encountered invalid completed payment amountMinor: 0'
      );
    });
  });
});
