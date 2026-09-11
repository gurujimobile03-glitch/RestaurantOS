import { MoneyMinor } from '../types/money';
import { DiscountResult, DiscountSpec } from '../types/discount';
import { assertValidMoney, roundHalfUp, isValidMoney } from '../utils/money';

/**
 * Validates a discount specification for correctness.
 */
export function validateDiscountSpec(spec?: DiscountSpec): { isValid: boolean; error?: string } {
  if (!spec) return { isValid: true };

  if (spec.type !== 'percentage' && spec.type !== 'fixed') {
    return { isValid: false, error: `Invalid discount type: ${String((spec as any).type)}` };
  }

  if (spec.type === 'percentage') {
    if (
      typeof spec.percentageRate !== 'number' ||
      Number.isNaN(spec.percentageRate) ||
      !Number.isFinite(spec.percentageRate)
    ) {
      return { isValid: false, error: 'Percentage discount rate must be a finite number.' };
    }
    if (spec.percentageRate < 0) {
      return { isValid: false, error: 'Percentage discount rate cannot be negative.' };
    }
    if (spec.percentageRate > 100) {
      return { isValid: false, error: 'Percentage discount rate cannot exceed 100%.' };
    }
  }

  if (spec.type === 'fixed') {
    if (!isValidMoney(spec.fixedAmountMinor)) {
      return {
        isValid: false,
        error: 'Fixed discount amount must be a non-negative integer minor unit (paise).'
      };
    }
  }

  return { isValid: true };
}

/**
 * Calculates discount amount and remaining taxable amount.
 * 
 * Order of operations:
 * ITEM SUBTOTAL -> DISCOUNT -> TAX -> GRAND TOTAL
 * 
 * Enforces:
 * - subtotalMinor >= 0
 * - discountMinor >= 0
 * - discountMinor <= subtotalMinor
 * - remainingTaxableAmountMinor >= 0
 * - discountMinor + remainingTaxableAmountMinor === subtotalMinor
 * 
 * Throws RangeError if discount exceeds subtotal.
 */
export function calculateDiscount(
  subtotalMinor: MoneyMinor,
  spec?: DiscountSpec
): DiscountResult {
  assertValidMoney(subtotalMinor, 'subtotalMinor');

  if (!spec) {
    return {
      discountMinor: 0,
      remainingTaxableAmountMinor: subtotalMinor
    };
  }

  const specValidation = validateDiscountSpec(spec);
  if (!specValidation.isValid) {
    throw new TypeError(specValidation.error || 'Invalid discount specification');
  }

  let discountMinor: MoneyMinor = 0;

  if (spec.type === 'percentage') {
    const rate = spec.percentageRate ?? 0;
    if (rate === 0 || subtotalMinor === 0) {
      discountMinor = 0;
    } else if (rate === 100) {
      discountMinor = subtotalMinor;
    } else {
      discountMinor = roundHalfUp((subtotalMinor * rate) / 100);
    }
  } else if (spec.type === 'fixed') {
    discountMinor = spec.fixedAmountMinor ?? 0;
  }

  assertValidMoney(discountMinor, 'discountMinor');

  if (discountMinor > subtotalMinor) {
    throw new RangeError(
      `Discount (${discountMinor} paise) cannot exceed subtotal (${subtotalMinor} paise).`
    );
  }

  const remainingTaxableAmountMinor = subtotalMinor - discountMinor;
  assertValidMoney(remainingTaxableAmountMinor, 'remainingTaxableAmountMinor');

  return {
    discountMinor,
    remainingTaxableAmountMinor
  };
}

/**
 * Proportioned discount allocation across multiple lines.
 * Guarantees:
 * - Sum of line discounts === totalDiscountMinor
 * - Each line discount <= line subtotal
 * - Deterministic, no lost or extra paise
 */
export function allocateDiscountProportionally(
  subtotals: MoneyMinor[],
  totalDiscountMinor: MoneyMinor
): MoneyMinor[] {
  assertValidMoney(totalDiscountMinor, 'totalDiscountMinor');

  if (subtotals.length === 0) {
    if (totalDiscountMinor > 0) {
      throw new RangeError('Cannot allocate discount to zero items');
    }
    return [];
  }

  let grandSubtotal = 0;
  for (let i = 0; i < subtotals.length; i++) {
    assertValidMoney(subtotals[i], `subtotals[${i}]`);
    grandSubtotal += subtotals[i];
  }

  if (totalDiscountMinor > grandSubtotal) {
    throw new RangeError(
      `Total discount (${totalDiscountMinor} paise) cannot exceed order subtotal (${grandSubtotal} paise)`
    );
  }

  if (totalDiscountMinor === 0 || grandSubtotal === 0) {
    return subtotals.map(() => 0);
  }

  if (totalDiscountMinor === grandSubtotal) {
    return [...subtotals];
  }

  // Calculate base share using floor, track remainders
  const allocations: MoneyMinor[] = [];
  const fractions: { index: number; remainder: number; subtotal: number }[] = [];
  let allocatedSum = 0;

  for (let i = 0; i < subtotals.length; i++) {
    const raw = (subtotals[i] * totalDiscountMinor) / grandSubtotal;
    const floored = Math.floor(raw);
    allocations.push(floored);
    allocatedSum += floored;
    fractions.push({
      index: i,
      remainder: raw - floored,
      subtotal: subtotals[i]
    });
  }

  // Distribute remaining paise to items with largest fractional parts
  let remainderPaise = totalDiscountMinor - allocatedSum;
  fractions.sort((a, b) => {
    if (b.remainder !== a.remainder) return b.remainder - a.remainder;
    return b.subtotal - a.subtotal;
  });

  for (let i = 0; i < remainderPaise; i++) {
    const target = fractions[i % fractions.length];
    allocations[target.index] += 1;
  }

  // Sanity check invariant
  let finalSum = 0;
  for (let i = 0; i < allocations.length; i++) {
    assertValidMoney(allocations[i], `allocations[${i}]`);
    if (allocations[i] > subtotals[i]) {
      throw new Error(`Allocated discount ${allocations[i]} exceeds subtotal ${subtotals[i]}`);
    }
    finalSum += allocations[i];
  }

  if (finalSum !== totalDiscountMinor) {
    throw new Error(
      `Discount allocation sum (${finalSum}) does not match requested total (${totalDiscountMinor})`
    );
  }

  return allocations;
}
