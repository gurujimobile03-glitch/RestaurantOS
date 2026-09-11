import { MoneyMinor } from '../types/money';
import { TaxJurisdiction } from '../types/tax';
import { Order, OrderItem } from '../types/order';
import {
  OrderItemLineInput,
  OrderItemLineResult,
  OrderCalculationInput,
  OrderCalculationResult
} from '../types/orderCalculation';
import { assertValidMoney, addMoney } from '../utils/money';
import { calculateDiscount, allocateDiscountProportionally } from './discountService';
import { calculateTax } from './taxService';

/**
 * Asserts that a quantity is a valid positive integer.
 */
export function assertValidQuantity(qty: unknown, fieldName = 'quantity'): asserts qty is number {
  if (typeof qty !== 'number') {
    throw new TypeError(`${fieldName} must be a number, received ${typeof qty}`);
  }
  if (Number.isNaN(qty) || !Number.isFinite(qty)) {
    throw new TypeError(`${fieldName} must be a finite number`);
  }
  if (!Number.isInteger(qty)) {
    throw new TypeError(`${fieldName} must be an integer, received decimal: ${qty}`);
  }
  if (qty <= 0) {
    throw new RangeError(`${fieldName} must be a positive integer (> 0), received: ${qty}`);
  }
}

/**
 * Calculates a single order item line according to the authoritative domain policy:
 * 
 * Flow:
 * 1. QUANTITY & UNIT PRICE -> SUBTOTAL = quantity * unitPriceMinor
 * 2. DISCOUNT -> discountMinor, remainingAmountMinor
 * 3. TAX -> taxableAmountMinor, cgstMinor, sgstMinor, igstMinor, totalTaxMinor
 * 4. LINE TOTAL -> lineTotalMinor = taxableAmountMinor + totalTaxMinor
 * 
 * Deterministic and pure.
 */
export function calculateOrderItemLine(input: OrderItemLineInput): OrderItemLineResult {
  const {
    quantity,
    unitPriceMinor,
    taxRate,
    taxInclusive,
    discount,
    taxJurisdiction = 'intraState'
  } = input;

  assertValidQuantity(quantity, 'quantity');
  assertValidMoney(unitPriceMinor, 'unitPriceMinor');

  const subtotalMinor = unitPriceMinor * quantity;
  assertValidMoney(subtotalMinor, 'line subtotalMinor');

  // Calculate discount on this line
  const discountResult = calculateDiscount(subtotalMinor, discount);
  const discountMinor = discountResult.discountMinor;
  const netAmountMinor = discountResult.remainingTaxableAmountMinor;

  // Calculate tax on net amount
  const taxResult = calculateTax({
    amountMinor: netAmountMinor,
    taxRate,
    taxInclusive,
    taxJurisdiction
  });

  const taxableAmountMinor = taxResult.taxableAmountMinor;
  const totalTaxMinor = taxResult.totalTaxMinor;
  const cgstMinor = taxResult.cgstMinor;
  const sgstMinor = taxResult.sgstMinor;
  const igstMinor = taxResult.igstMinor;
  const lineTotalMinor = taxResult.finalTotalMinor;

  // Invariant verification
  if (cgstMinor + sgstMinor + igstMinor !== totalTaxMinor) {
    throw new Error('Line tax components do not equal total tax');
  }
  if (taxableAmountMinor + totalTaxMinor !== lineTotalMinor) {
    throw new Error('Line taxable amount + total tax does not equal line total');
  }

  return {
    quantity,
    unitPriceMinor,
    subtotalMinor,
    discountMinor,
    taxableAmountMinor,
    taxRate,
    taxInclusive,
    taxJurisdiction,
    cgstMinor,
    sgstMinor,
    igstMinor,
    totalTaxMinor,
    lineTotalMinor
  };
}

/**
 * Calculates authoritative order totals from an array of order line inputs.
 * 
 * Rounding & Aggregation Policy:
 * LINE CALCULATION -> ROUND LINE -> AGGREGATE LINES
 * 
 * If order-level discount is provided:
 * 1. Computes line subtotals.
 * 2. Allocates order discount across lines using deterministic integer proportionality.
 * 3. Evaluates each line with its allocated discount.
 * 4. Aggregates line subtotals, discounts, taxable amounts, tax parts, and grand total.
 */
export function calculateOrderTotals(input: OrderCalculationInput): OrderCalculationResult {
  const { items, orderDiscount, taxJurisdiction = 'intraState' } = input;

  if (!Array.isArray(items)) {
    throw new TypeError('Order calculation items must be an array');
  }

  if (items.length === 0) {
    return {
      subtotalMinor: 0,
      discountMinor: 0,
      taxableAmountMinor: 0,
      cgstMinor: 0,
      sgstMinor: 0,
      igstMinor: 0,
      totalTaxMinor: 0,
      grandTotalMinor: 0,
      taxJurisdiction,
      lineResults: []
    };
  }

  let lineInputs = items.map((item) => ({ ...item, taxJurisdiction }));

  // If order-level discount is supplied, allocate it across the items
  if (orderDiscount) {
    const rawSubtotals = lineInputs.map((item) => {
      assertValidQuantity(item.quantity);
      assertValidMoney(item.unitPriceMinor);
      return item.unitPriceMinor * item.quantity;
    });

    const grandSubtotal = addMoney(...rawSubtotals);
    const orderDiscountResult = calculateDiscount(grandSubtotal, orderDiscount);
    const allocatedDiscounts = allocateDiscountProportionally(
      rawSubtotals,
      orderDiscountResult.discountMinor
    );

    lineInputs = lineInputs.map((item, idx) => ({
      ...item,
      discount: {
        type: 'fixed',
        fixedAmountMinor: allocatedDiscounts[idx]
      }
    }));
  }

  const lineResults: OrderItemLineResult[] = lineInputs.map(calculateOrderItemLine);

  let subtotalMinor = 0;
  let discountMinor = 0;
  let taxableAmountMinor = 0;
  let cgstMinor = 0;
  let sgstMinor = 0;
  let igstMinor = 0;
  let totalTaxMinor = 0;
  let grandTotalMinor = 0;

  for (let i = 0; i < lineResults.length; i++) {
    const res = lineResults[i];
    subtotalMinor += res.subtotalMinor;
    discountMinor += res.discountMinor;
    taxableAmountMinor += res.taxableAmountMinor;
    cgstMinor += res.cgstMinor;
    sgstMinor += res.sgstMinor;
    igstMinor += res.igstMinor;
    totalTaxMinor += res.totalTaxMinor;
    grandTotalMinor += res.lineTotalMinor;
  }

  assertValidMoney(subtotalMinor, 'order subtotalMinor');
  assertValidMoney(discountMinor, 'order discountMinor');
  assertValidMoney(taxableAmountMinor, 'order taxableAmountMinor');
  assertValidMoney(cgstMinor, 'order cgstMinor');
  assertValidMoney(sgstMinor, 'order sgstMinor');
  assertValidMoney(igstMinor, 'order igstMinor');
  assertValidMoney(totalTaxMinor, 'order totalTaxMinor');
  assertValidMoney(grandTotalMinor, 'order grandTotalMinor');

  // Enforce financial invariants
  if (cgstMinor + sgstMinor + igstMinor !== totalTaxMinor) {
    throw new Error(
      `Order tax breakdown mismatch: CGST(${cgstMinor}) + SGST(${sgstMinor}) + IGST(${igstMinor}) !== TotalTax(${totalTaxMinor})`
    );
  }

  if (taxableAmountMinor + totalTaxMinor !== grandTotalMinor) {
    throw new Error(
      `Order grand total reconciliation failed: Taxable(${taxableAmountMinor}) + Tax(${totalTaxMinor}) !== GrandTotal(${grandTotalMinor})`
    );
  }

  if (discountMinor > subtotalMinor) {
    throw new Error(
      `Order discount (${discountMinor}) exceeds subtotal (${subtotalMinor})`
    );
  }

  return {
    subtotalMinor,
    discountMinor,
    taxableAmountMinor,
    cgstMinor,
    sgstMinor,
    igstMinor,
    totalTaxMinor,
    grandTotalMinor,
    taxJurisdiction,
    lineResults
  };
}

/**
 * Recalculates an existing Order strictly using the stored historical price snapshots on OrderItem.
 * 
 * NON-NEGOTIABLE RULE:
 * Historical OrderItem snapshots (unitPriceMinor, taxRate, taxInclusive) are authoritative.
 * This function NEVER fetches or references current menu item catalog prices.
 */
export function recalculateOrderFromSnapshots(
  order: Order,
  taxJurisdiction: TaxJurisdiction = 'intraState'
): OrderCalculationResult {
  if (!order || !Array.isArray(order.items)) {
    throw new TypeError('Invalid order: missing items array');
  }

  const lineInputs: OrderItemLineInput[] = order.items.map((item: OrderItem) => {
    return {
      quantity: item.quantity,
      unitPriceMinor: item.unitPriceMinor,
      taxRate: item.taxRate,
      taxInclusive: item.taxInclusive,
      discount: item.discountMinor > 0 ? { type: 'fixed', fixedAmountMinor: item.discountMinor } : undefined,
      taxJurisdiction
    };
  });

  return calculateOrderTotals({
    items: lineInputs,
    taxJurisdiction
  });
}
