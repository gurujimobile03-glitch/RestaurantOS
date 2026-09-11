import { describe, it, expect } from 'vitest';
import {
  VALID_ORDER_STATUSES,
  VALID_KOT_STATUSES,
  VALID_PAYMENT_METHODS,
  VALID_PAYMENT_STATUSES,
  validateOrderStatusTransition,
  validateKOTStatusTransition
} from '../utils/transactionValidation';
import { OrderStatus } from '../types/order';
import { KOTStatus } from '../types/kot';

describe('Order Lifecycle & Status Transitions', () => {
  it('defines all required order statuses according to Milestone 2 spec', () => {
    const expected = [
      'draft',
      'confirmed',
      'sentToKitchen',
      'preparing',
      'ready',
      'served',
      'completed',
      'cancelled'
    ];
    expect(VALID_ORDER_STATUSES).toEqual(expect.arrayContaining(expected));
    expect(VALID_ORDER_STATUSES.length).toBe(expected.length);
  });

  it('allows natural sequential progression through the order lifecycle', () => {
    const sequence: OrderStatus[] = [
      'draft',
      'confirmed',
      'sentToKitchen',
      'preparing',
      'ready',
      'served',
      'completed'
    ];

    for (let i = 0; i < sequence.length - 1; i++) {
      const current = sequence[i];
      const next = sequence[i + 1];
      const result = validateOrderStatusTransition(current, next);
      expect(result.isValid).toBe(true);
    }
  });

  it('allows express takeaway and fast fulfillment transitions (confirmed -> preparing and ready -> completed)', () => {
    // Fast-food or takeaway without kitchen dispatch step
    expect(validateOrderStatusTransition('confirmed', 'preparing').isValid).toBe(true);
    // Direct fulfillment upon parcel hand-off (no table serving step)
    expect(validateOrderStatusTransition('ready', 'completed').isValid).toBe(true);
  });

  it('allows cancellation prior to completion', () => {
    const cancelableStatuses: OrderStatus[] = [
      'draft',
      'confirmed',
      'sentToKitchen',
      'preparing',
      'ready',
      'served'
    ];

    for (const status of cancelableStatuses) {
      const result = validateOrderStatusTransition(status, 'cancelled');
      expect(result.isValid).toBe(true);
    }
  });

  it('rejects transitions from completed or cancelled (terminal states)', () => {
    expect(validateOrderStatusTransition('completed', 'draft').isValid).toBe(false);
    expect(validateOrderStatusTransition('completed', 'cancelled').isValid).toBe(false);
    expect(validateOrderStatusTransition('cancelled', 'confirmed').isValid).toBe(false);
  });

  it('rejects specific invalid transitions such as completed -> preparing, cancelled -> completed, ready -> draft', () => {
    expect(validateOrderStatusTransition('completed', 'preparing').isValid).toBe(false);
    expect(validateOrderStatusTransition('cancelled', 'completed').isValid).toBe(false);
    expect(validateOrderStatusTransition('ready', 'draft').isValid).toBe(false);
    expect(validateOrderStatusTransition('served', 'preparing').isValid).toBe(false);
    expect(validateOrderStatusTransition('completed', 'sentToKitchen').isValid).toBe(false);
  });

  it('rejects arbitrary skipping or backwards jumping in order status', () => {
    // Cannot skip straight from draft to ready or completed
    expect(validateOrderStatusTransition('draft', 'ready').isValid).toBe(false);
    expect(validateOrderStatusTransition('draft', 'completed').isValid).toBe(false);

    // Cannot go backwards from served to confirmed
    expect(validateOrderStatusTransition('served', 'confirmed').isValid).toBe(false);
    expect(validateOrderStatusTransition('preparing', 'draft').isValid).toBe(false);
  });

  it('rejects invalid or unknown order status strings', () => {
    expect(validateOrderStatusTransition('pending' as any, 'confirmed').isValid).toBe(false);
    expect(validateOrderStatusTransition('confirmed', 'finished' as any).isValid).toBe(false);
  });
});

describe('KOT Lifecycle & Status Transitions', () => {
  it('defines all required KOT statuses according to Milestone 2 spec', () => {
    const expected = [
      'draft',
      'confirmed',
      'sentToKitchen',
      'preparing',
      'ready',
      'served',
      'cancelled'
    ];
    expect(VALID_KOT_STATUSES).toEqual(expect.arrayContaining(expected));
  });

  it('allows natural sequential progression for KOT workflow', () => {
    const sequence: KOTStatus[] = [
      'draft',
      'confirmed',
      'sentToKitchen',
      'preparing',
      'ready',
      'served'
    ];

    for (let i = 0; i < sequence.length - 1; i++) {
      const current = sequence[i];
      const next = sequence[i + 1];
      const result = validateKOTStatusTransition(current, next);
      expect(result.isValid).toBe(true);
    }
  });

  it('allows KOT cancellation from active states before served', () => {
    expect(validateKOTStatusTransition('draft', 'cancelled').isValid).toBe(true);
    expect(validateKOTStatusTransition('confirmed', 'cancelled').isValid).toBe(true);
    expect(validateKOTStatusTransition('sentToKitchen', 'cancelled').isValid).toBe(true);
    expect(validateKOTStatusTransition('preparing', 'cancelled').isValid).toBe(true);
    expect(validateKOTStatusTransition('ready', 'cancelled').isValid).toBe(true);
  });

  it('rejects invalid KOT jumps and invalid transitions from terminal states', () => {
    expect(validateKOTStatusTransition('draft', 'served').isValid).toBe(false);
    expect(validateKOTStatusTransition('served', 'preparing').isValid).toBe(false);
    expect(validateKOTStatusTransition('cancelled', 'draft').isValid).toBe(false);
  });
});

describe('Payment Methods and Statuses', () => {
  it('contains expected payment methods (cash, card, upi, other)', () => {
    expect(VALID_PAYMENT_METHODS).toEqual(['cash', 'card', 'upi', 'other']);
  });

  it('contains expected payment statuses (pending, completed, failed, refunded)', () => {
    expect(VALID_PAYMENT_STATUSES).toEqual(['pending', 'completed', 'failed', 'refunded']);
  });
});
