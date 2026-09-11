import { MoneyMinor } from '../types/money';
import { Payment } from '../types/payment';
import { Order } from '../types/order';
import { isValidMoney } from '../utils/money';

export type SettlementStatus = 'unpaid' | 'partially_paid' | 'fully_paid';

export interface OrderSettlementState {
  orderId: string;
  restaurantId: string;
  grandTotalMinor: MoneyMinor;
  paidAmountMinor: MoneyMinor;
  dueAmountMinor: MoneyMinor;
  completedPaymentsCount: number;
  isFullySettled: boolean;
  settlementStatus: SettlementStatus;
}

/**
 * Pure, deterministic financial settlement calculator for RestaurantOS.
 * 
 * CRITICAL FINANCIAL INVARIANTS:
 * 1. Integer-only arithmetic (MoneyMinor in Paise).
 * 2. grandTotalMinor >= 0, paidAmountMinor >= 0, dueAmountMinor >= 0.
 * 3. paidAmountMinor <= grandTotalMinor.
 * 4. paidAmountMinor + dueAmountMinor === grandTotalMinor.
 * 5. sum(completed payments matching restaurantId & orderId) === paidAmountMinor.
 * 6. Non-completed payments ('pending', 'failed', 'refunded') DO NOT contribute to paidAmountMinor.
 * 7. Pure function: No network, no Firebase, no UI, no side effects.
 */
export function calculateOrderSettlement(
  order: Pick<Order, 'id' | 'restaurantId' | 'grandTotalMinor'>,
  payments: Payment[]
): OrderSettlementState {
  if (!order || typeof order !== 'object') {
    throw new Error('Valid Order object is required for settlement calculation.');
  }

  const cleanOrderId = order.id?.trim();
  const cleanRestaurantId = order.restaurantId?.trim();

  if (!cleanOrderId) {
    throw new Error('Order id is required for settlement calculation.');
  }
  if (!cleanRestaurantId) {
    throw new Error('Restaurant id is required for settlement calculation.');
  }

  if (!isValidMoney(order.grandTotalMinor)) {
    throw new Error(
      `Order grandTotalMinor must be a safe non-negative integer minor unit, received: ${order.grandTotalMinor}`
    );
  }

  const grandTotalMinor = order.grandTotalMinor;
  let paidAmountMinor = 0;
  let completedPaymentsCount = 0;

  if (Array.isArray(payments)) {
    for (const payment of payments) {
      if (!payment || typeof payment !== 'object') continue;

      // Filter: strictly match restaurantId and orderId
      if (payment.restaurantId !== cleanRestaurantId || payment.orderId !== cleanOrderId) {
        continue;
      }

      // Filter: ONLY completed payments contribute to paidAmountMinor
      if (payment.status === 'completed') {
        if (!isValidMoney(payment.amountMinor) || payment.amountMinor <= 0) {
          throw new Error(
            `Encountered invalid completed payment amountMinor: ${payment.amountMinor} on payment "${payment.id}"`
          );
        }

        const nextPaid = paidAmountMinor + payment.amountMinor;
        if (!Number.isSafeInteger(nextPaid)) {
          throw new Error('Accumulated paidAmountMinor exceeds safe integer limit.');
        }

        paidAmountMinor = nextPaid;
        completedPaymentsCount++;
      }
    }
  }

  // Overpayment check invariant
  if (paidAmountMinor > grandTotalMinor) {
    throw new Error(
      `Financial Invariant Violation: Total paid amount (${paidAmountMinor} paise) exceeds grand total (${grandTotalMinor} paise) for order "${cleanOrderId}". Overpayment is not permitted.`
    );
  }

  const dueAmountMinor = grandTotalMinor - paidAmountMinor;

  // Derive settlement status
  let settlementStatus: SettlementStatus = 'unpaid';
  if (paidAmountMinor === 0) {
    settlementStatus = 'unpaid';
  } else if (paidAmountMinor < grandTotalMinor) {
    settlementStatus = 'partially_paid';
  } else {
    settlementStatus = 'fully_paid';
  }

  const isFullySettled = dueAmountMinor === 0 && (grandTotalMinor === 0 || paidAmountMinor === grandTotalMinor);

  return {
    orderId: cleanOrderId,
    restaurantId: cleanRestaurantId,
    grandTotalMinor,
    paidAmountMinor,
    dueAmountMinor,
    completedPaymentsCount,
    isFullySettled,
    settlementStatus
  };
}
