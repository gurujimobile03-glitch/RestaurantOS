import { PurchaseOrderStatus, CreatePurchaseOrderItemDTO } from '../types/purchaseOrder';
import { MoneyMinor } from '../types/money';
import { multiplyMoney, addMoney, percentageOfMoney, assertValidMoney } from './money';
import { roundQuantity } from './units';

/**
 * Normalizes supplier name deterministically:
 * - Trims outer whitespace
 * - Collapses repeated inner whitespace to single space
 * - Converts to lower case
 *
 * Example:
 * "  ABC   Foods  " -> "abc foods"
 * "ABC Foods" -> "abc foods"
 */
export function normalizeSupplierName(name: string): string {
  if (!name) return '';
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Deterministic purchase order lifecycle status transitions.
 *
 * Lifecycle:
 * draft -> submitted | cancelled
 * submitted -> partiallyReceived | received | cancelled (only if zero items received)
 * partiallyReceived -> received
 *
 * Terminal states:
 * cancelled -> (no further transitions)
 * received -> (no further transitions)
 */
export const ALLOWED_PURCHASE_TRANSITIONS: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
  draft: ['submitted', 'cancelled'],
  submitted: ['partiallyReceived', 'received', 'cancelled'],
  partiallyReceived: ['partiallyReceived', 'received'],
  received: [],
  cancelled: []
};

export function isValidPurchaseStatusTransition(
  current: PurchaseOrderStatus,
  target: PurchaseOrderStatus
): boolean {
  const allowed = ALLOWED_PURCHASE_TRANSITIONS[current] || [];
  return allowed.includes(target);
}

export const isValidPOStatusTransition = isValidPurchaseStatusTransition;

/**
 * Calculates line total for a purchase order item in integer minor units.
 * quantity * unitPriceMinor
 */
export function calculatePurchaseLineTotal(
  quantity: number,
  unitPriceMinor: MoneyMinor
): MoneyMinor {
  const roundedQty = roundQuantity(quantity);
  if (roundedQty <= 0) {
    throw new Error('Quantity must be greater than 0');
  }
  assertValidMoney(unitPriceMinor, 'unitPriceMinor');
  return multiplyMoney(unitPriceMinor, roundedQty);
}

export const calculatePOLineTotalMinor = calculatePurchaseLineTotal;

/**
 * Computes subtotal, tax, and grand total for purchase items.
 */
export function calculatePurchaseOrderTotals(
  items: { lineTotalMinor: MoneyMinor }[],
  taxRatePercent = 0
): {
  subtotalMinor: MoneyMinor;
  taxMinor: MoneyMinor;
  grandTotalMinor: MoneyMinor;
} {
  const subtotalMinor = items.reduce<MoneyMinor>(
    (sum, item) => addMoney(sum, item.lineTotalMinor),
    0 as MoneyMinor
  );

  let taxMinor = 0 as MoneyMinor;
  if (taxRatePercent > 0) {
    taxMinor = percentageOfMoney(subtotalMinor, taxRatePercent);
  }

  const grandTotalMinor = addMoney(subtotalMinor, taxMinor);

  return {
    subtotalMinor,
    taxMinor,
    grandTotalMinor
  };
}

export function calculatePOTotals(
  items: { quantityOrdered: number; unitPriceMinor: MoneyMinor }[],
  taxRatePercent = 0
): {
  subtotalMinor: MoneyMinor;
  taxMinor: MoneyMinor;
  grandTotalMinor: MoneyMinor;
} {
  const calculatedItems = items.map(item => ({
    lineTotalMinor: calculatePurchaseLineTotal(item.quantityOrdered, item.unitPriceMinor)
  }));
  return calculatePurchaseOrderTotals(calculatedItems, taxRatePercent);
}

export interface ReceivingValidationResult {
  isValid: boolean;
  errors: string[];
  validatedReceivings: {
    purchaseOrderItemId: string;
    quantityReceived: number;
  }[];
}

export function validateReceivingQuantities(
  poItems: { id: string; remainingQuantity: number; unit: string }[],
  receivingItems: { purchaseOrderItemId: string; quantityReceived: number }[]
): ReceivingValidationResult {
  const errors: string[] = [];
  const validatedReceivings: { purchaseOrderItemId: string; quantityReceived: number }[] = [];

  if (!receivingItems || receivingItems.length === 0) {
    return {
      isValid: false,
      errors: ['At least one item must have a received quantity > 0'],
      validatedReceivings: []
    };
  }

  for (const item of receivingItems) {
    const poItem = poItems.find(p => p.id === item.purchaseOrderItemId);
    if (!poItem) {
      errors.push(`Item ${item.purchaseOrderItemId} not found in purchase order`);
      continue;
    }

    const qty = roundQuantity(item.quantityReceived);
    if (qty <= 0) {
      errors.push(`Received quantity for item ${item.purchaseOrderItemId} must be greater than 0`);
      continue;
    }

    if (qty > poItem.remainingQuantity) {
      errors.push(
        `Received quantity (${qty} ${poItem.unit}) exceeds remaining quantity (${poItem.remainingQuantity} ${poItem.unit})`
      );
      continue;
    }

    validatedReceivings.push({
      purchaseOrderItemId: item.purchaseOrderItemId,
      quantityReceived: qty
    });
  }

  return {
    isValid: errors.length === 0 && validatedReceivings.length > 0,
    errors,
    validatedReceivings
  };
}
