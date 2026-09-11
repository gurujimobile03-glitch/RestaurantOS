import { describe, it, expect } from 'vitest';
import {
  isValidMoney,
  assertValidMoney,
  addMoney,
  subtractMoney,
  multiplyMoney,
  percentageOfMoney,
  compareMoney,
  toMoneyMinor,
  fromMoneyMinor,
  formatMoney,
  zeroMoney
} from '../utils/money';

describe('Money Architecture - Foundation & Validation', () => {
  it('accepts integer minor units (e.g. paise)', () => {
    expect(isValidMoney(0)).toBe(true);
    expect(isValidMoney(10050)).toBe(true);
    expect(isValidMoney(500)).toBe(true);
    expect(isValidMoney(1000000)).toBe(true);

    expect(() => assertValidMoney(10050)).not.toThrow();
    expect(() => assertValidMoney(0)).not.toThrow();
  });

  it('rejects decimal authoritative money values (e.g. ₹100.50 as float)', () => {
    expect(isValidMoney(100.5)).toBe(false);
    expect(isValidMoney(0.01)).toBe(false);
    expect(isValidMoney(99.99)).toBe(false);

    expect(() => assertValidMoney(100.5)).toThrow(TypeError);
    expect(() => assertValidMoney(100.5)).toThrow(/must be an integer in minor units/);
  });

  it('rejects NaN, Infinity, -Infinity, strings, and null/undefined', () => {
    expect(isValidMoney(NaN)).toBe(false);
    expect(isValidMoney(Infinity)).toBe(false);
    expect(isValidMoney(-Infinity)).toBe(false);
    expect(isValidMoney('10050')).toBe(false);
    expect(isValidMoney(null)).toBe(false);
    expect(isValidMoney(undefined)).toBe(false);
    expect(isValidMoney({})).toBe(false);

    expect(() => assertValidMoney(NaN)).toThrow(TypeError);
    expect(() => assertValidMoney(Infinity)).toThrow(TypeError);
    expect(() => assertValidMoney(-Infinity)).toThrow(TypeError);
    expect(() => assertValidMoney('100' as any)).toThrow(TypeError);
    expect(() => assertValidMoney(null as any)).toThrow(TypeError);
    expect(() => assertValidMoney(undefined as any)).toThrow(TypeError);
  });

  it('rejects negative numbers by default, allows them only when explicitly requested', () => {
    expect(isValidMoney(-500)).toBe(false);
    expect(isValidMoney(-500, true)).toBe(true);

    expect(() => assertValidMoney(-100)).toThrow(RangeError);
    expect(() => assertValidMoney(-100, 'amount', true)).not.toThrow();
  });
});

describe('Money Operations - Integer Arithmetic', () => {
  it('adds multiple MoneyMinor values accurately without floating point creep', () => {
    // 10050 paise + 25000 paise + 4950 paise = 40000 paise (₹400.00)
    const result = addMoney(10050, 25000, 4950);
    expect(result).toBe(40000);
    expect(Number.isInteger(result)).toBe(true);
  });

  it('rejects invalid values passed into addMoney', () => {
    expect(() => addMoney(10050, 25.5)).toThrow(TypeError);
    expect(() => addMoney(10050, NaN)).toThrow(TypeError);
  });

  it('subtracts MoneyMinor values accurately and prevents negative balances', () => {
    const result = subtractMoney(10000, 3500);
    expect(result).toBe(6500);

    // Exact zero is allowed
    expect(subtractMoney(5000, 5000)).toBe(0);

    // Negative difference throws by default
    expect(() => subtractMoney(3000, 5000)).toThrow(RangeError);

    // Allowed when flag is set
    expect(subtractMoney(3000, 5000, true)).toBe(-2000);
  });

  it('multiplies integer minor units by integer quantities deterministically', () => {
    // 2 items @ ₹100.50 (10050 paise) = ₹201.00 (20100 paise)
    const lineTotal = multiplyMoney(10050, 2);
    expect(lineTotal).toBe(20100);
    expect(Number.isInteger(lineTotal)).toBe(true);

    // 0 quantity
    expect(multiplyMoney(10050, 0)).toBe(0);

    // Rejects negative multipliers
    expect(() => multiplyMoney(10050, -1)).toThrow(RangeError);
    // Rejects NaN multipliers
    expect(() => multiplyMoney(10050, NaN)).toThrow(TypeError);
  });

  it('calculates percentage of money deterministically with rounding', () => {
    // 5% GST on ₹100.00 (10000 paise) = ₹5.00 (500 paise)
    expect(percentageOfMoney(10000, 5)).toBe(500);

    // 2.5% CGST on ₹100.00 (10000 paise) = ₹2.50 (250 paise)
    expect(percentageOfMoney(10000, 2.5)).toBe(250);

    // 18% GST on ₹99.00 (9900 paise) = ₹17.82 (1782 paise)
    expect(percentageOfMoney(9900, 18)).toBe(1782);

    // Rounding check: 5% on ₹33.33 (3333 paise) -> 3333 * 0.05 = 166.65 -> rounded to 167 paise
    expect(percentageOfMoney(3333, 5)).toBe(167);

    // Rejects negative percentages
    expect(() => percentageOfMoney(10000, -5)).toThrow(RangeError);
  });

  it('compares two MoneyMinor values correctly', () => {
    expect(compareMoney(500, 1000)).toBe(-1);
    expect(compareMoney(1000, 500)).toBe(1);
    expect(compareMoney(500, 500)).toBe(0);
  });

  it('converts to and from decimal units correctly', () => {
    expect(toMoneyMinor(100.5)).toBe(10050);
    expect(toMoneyMinor(0)).toBe(0);
    expect(toMoneyMinor(49.99)).toBe(4999);

    expect(fromMoneyMinor(10050)).toBe(100.5);
    expect(fromMoneyMinor(0)).toBe(0);

    expect(zeroMoney()).toBe(0);
  });

  it('handles small paise values and boundary integers (0, 1, 5, 10, 99, 100 paise)', () => {
    expect(isValidMoney(0)).toBe(true);
    expect(isValidMoney(1)).toBe(true); // 1 paise (₹0.01)
    expect(isValidMoney(5)).toBe(true); // 5 paise (₹0.05)
    expect(isValidMoney(10)).toBe(true); // 10 paise (₹0.10)
    expect(isValidMoney(99)).toBe(true); // 99 paise (₹0.99)
    expect(isValidMoney(100)).toBe(true); // 100 paise (₹1.00)

    expect(formatMoney(1)).toBe('₹0.01');
    expect(formatMoney(5)).toBe('₹0.05');
    expect(formatMoney(10)).toBe('₹0.10');
    expect(formatMoney(99)).toBe('₹0.99');
    expect(formatMoney(100)).toBe('₹1.00');
  });

  it('enforces safe integer limits and rejects unsafe integers', () => {
    expect(isValidMoney(Number.MAX_SAFE_INTEGER)).toBe(true);
    expect(() => assertValidMoney(Number.MAX_SAFE_INTEGER)).not.toThrow();

    // Numbers beyond MAX_SAFE_INTEGER lose integer precision
    const unsafeInt = Number.MAX_SAFE_INTEGER + 10;
    expect(isValidMoney(unsafeInt)).toBe(false);
    expect(() => assertValidMoney(unsafeInt)).toThrow(RangeError);
  });

  it('converts difficult binary floating decimals accurately without precision artifacts', () => {
    // In standard JS: 1.15 * 100 = 114.99999999999999 and 2.29 * 100 = 228.99999999999997
    expect(toMoneyMinor(1.15)).toBe(115);
    expect(toMoneyMinor(2.29)).toBe(229);
    expect(toMoneyMinor(0.01)).toBe(1);
    expect(toMoneyMinor(0.05)).toBe(5);
    expect(toMoneyMinor(0.07)).toBe(7);
    expect(toMoneyMinor(99.99)).toBe(9999);
  });

  it('formats minor units into human-readable currency representation', () => {
    expect(formatMoney(10050)).toBe('₹100.50');
    expect(formatMoney(0)).toBe('₹0.00');
    expect(formatMoney(500000)).toBe('₹5,000.00');
    expect(formatMoney(10050, '$')).toBe('$100.50');
  });
});
