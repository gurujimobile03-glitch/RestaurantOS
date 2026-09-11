import { MoneyMinor } from '../types/money';

/**
 * AUTHORITATIVE ROUNDING POLICY:
 * RestaurantOS standardizes on Half-Up Rounding to the nearest minor unit (paise).
 * Any fractional paise value >= 0.50 rounds up to the next integer paise.
 * Values < 0.50 round down.
 * For all non-negative financial calculations, Math.round(value) precisely implements half-up rounding.
 * 
 * Invariant: All financial services (discountService, taxService, orderCalculationService)
 * MUST employ this exact function for fractional calculations to prevent lost or extra paise.
 */
export function roundHalfUp(value: number): number {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    throw new TypeError(`Cannot round non-finite value: ${value}`);
  }
  return Math.round(value);
}

/**
 * Validates whether a value qualifies as a valid authoritative MoneyMinor (integer minor currency units).
 */
export function isValidMoney(value: unknown, allowNegative = false): value is MoneyMinor {
  if (typeof value !== 'number') return false;
  if (Number.isNaN(value) || !Number.isFinite(value)) return false;
  if (!Number.isSafeInteger(value)) return false;
  if (!allowNegative && value < 0) return false;
  return true;
}

/**
 * Asserts that a value is a valid MoneyMinor. Throws if invalid.
 */
export function assertValidMoney(
  value: unknown,
  fieldName = 'amount',
  allowNegative = false
): asserts value is MoneyMinor {
  if (typeof value !== 'number') {
    throw new TypeError(`${fieldName} must be a number, received ${typeof value}`);
  }
  if (Number.isNaN(value)) {
    throw new TypeError(`${fieldName} cannot be NaN`);
  }
  if (!Number.isFinite(value)) {
    throw new TypeError(`${fieldName} must be a finite number`);
  }
  if (!Number.isInteger(value)) {
    throw new TypeError(
      `${fieldName} must be an integer in minor units (e.g. paise), received decimal: ${value}`
    );
  }
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(
      `${fieldName} exceeds safe integer limits (${Number.MAX_SAFE_INTEGER}), received: ${value}`
    );
  }
  if (!allowNegative && value < 0) {
    throw new RangeError(`${fieldName} cannot be negative, received: ${value}`);
  }
}

/**
 * Sums multiple MoneyMinor values.
 */
export function addMoney(...amounts: MoneyMinor[]): MoneyMinor {
  let total = 0;
  for (let i = 0; i < amounts.length; i++) {
    const amt = amounts[i];
    assertValidMoney(amt, `amounts[${i}]`);
    total += amt;
  }
  assertValidMoney(total, 'sum result');
  return total;
}

/**
 * Subtracts subtrahend from minuend.
 * By default, disallows negative result unless allowNegative is explicitly true.
 */
export function subtractMoney(
  minuend: MoneyMinor,
  subtrahend: MoneyMinor,
  allowNegative = false
): MoneyMinor {
  assertValidMoney(minuend, 'minuend', allowNegative);
  assertValidMoney(subtrahend, 'subtrahend', allowNegative);

  const diff = minuend - subtrahend;
  if (!allowNegative && diff < 0) {
    throw new RangeError(
      `subtractMoney result cannot be negative (${minuend} - ${subtrahend} = ${diff})`
    );
  }
  assertValidMoney(diff, 'difference result', allowNegative);
  return diff;
}

/**
 * Multiplies an integer money amount by a non-negative multiplier (e.g. quantity or factor).
 * Uses deterministic integer rounding.
 */
export function multiplyMoney(
  amount: MoneyMinor,
  multiplier: number,
  roundingMode: 'round' | 'floor' | 'ceil' = 'round'
): MoneyMinor {
  assertValidMoney(amount, 'amount');

  if (typeof multiplier !== 'number' || Number.isNaN(multiplier) || !Number.isFinite(multiplier)) {
    throw new TypeError(`Multiplier must be a finite number, received: ${multiplier}`);
  }
  if (multiplier < 0) {
    throw new RangeError(`Multiplier cannot be negative, received: ${multiplier}`);
  }

  const raw = amount * multiplier;
  let result: number;
  if (roundingMode === 'floor') {
    result = Math.floor(raw);
  } else if (roundingMode === 'ceil') {
    result = Math.ceil(raw);
  } else {
    result = Math.round(raw);
  }

  assertValidMoney(result, 'multiplication result');
  return result;
}

/**
 * Calculates a percentage of an amount in minor units with deterministic rounding.
 * e.g. percentageOfMoney(10000, 5) -> 500 (5% of ₹100.00 = ₹5.00)
 */
export function percentageOfMoney(
  amount: MoneyMinor,
  percentageRate: number,
  roundingMode: 'round' | 'floor' | 'ceil' = 'round'
): MoneyMinor {
  assertValidMoney(amount, 'amount');

  if (
    typeof percentageRate !== 'number' ||
    Number.isNaN(percentageRate) ||
    !Number.isFinite(percentageRate)
  ) {
    throw new TypeError(`percentageRate must be a finite number, received: ${percentageRate}`);
  }
  if (percentageRate < 0) {
    throw new RangeError(`percentageRate cannot be negative, received: ${percentageRate}`);
  }

  const raw = (amount * percentageRate) / 100;
  let result: number;
  if (roundingMode === 'floor') {
    result = Math.floor(raw);
  } else if (roundingMode === 'ceil') {
    result = Math.ceil(raw);
  } else {
    result = Math.round(raw);
  }

  assertValidMoney(result, 'percentage result');
  return result;
}

/**
 * Compares two MoneyMinor values.
 * Returns:
 *  -1 if a < b
 *   0 if a === b
 *   1 if a > b
 */
export function compareMoney(a: MoneyMinor, b: MoneyMinor): -1 | 0 | 1 {
  assertValidMoney(a, 'comparison a');
  assertValidMoney(b, 'comparison b');
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Converts a standard decimal currency unit (e.g. 100.50) into minor units (10050 paise).
 */
export function toMoneyMinor(
  decimalUnits: number,
  roundingMode: 'round' | 'floor' | 'ceil' = 'round'
): MoneyMinor {
  if (
    typeof decimalUnits !== 'number' ||
    Number.isNaN(decimalUnits) ||
    !Number.isFinite(decimalUnits)
  ) {
    throw new TypeError(`decimalUnits must be a finite number, received: ${decimalUnits}`);
  }
  if (decimalUnits < 0) {
    throw new RangeError(`decimalUnits cannot be negative, received: ${decimalUnits}`);
  }

  // Normalize binary floating point epsilon (e.g. 1.15 * 100 = 114.99999999999999)
  const raw = Math.round(decimalUnits * 10000) / 100;
  let result: number;
  if (roundingMode === 'floor') {
    result = Math.floor(raw);
  } else if (roundingMode === 'ceil') {
    result = Math.ceil(raw);
  } else {
    result = Math.round(raw);
  }

  assertValidMoney(result, 'converted minor units');
  return result;
}

/**
 * Converts minor units (paise) to decimal currency value (rupees) for UI display.
 */
export function fromMoneyMinor(minorUnits: MoneyMinor): number {
  assertValidMoney(minorUnits, 'minorUnits');
  return minorUnits / 100;
}

/**
 * Formats minor units for presentation.
 * e.g. 10050 -> "₹100.50"
 */
export function formatMoney(minorUnits: MoneyMinor, currencySymbol = '₹'): string {
  assertValidMoney(minorUnits, 'minorUnits');
  const rupees = minorUnits / 100;
  return `${currencySymbol}${rupees.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

/**
 * Returns a zero MoneyMinor.
 */
export function zeroMoney(): MoneyMinor {
  return 0;
}
