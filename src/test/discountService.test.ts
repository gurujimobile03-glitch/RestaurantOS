import { describe, it, expect } from 'vitest';
import {
  calculateDiscount,
  validateDiscountSpec,
  allocateDiscountProportionally
} from '../services/discountService';

describe('Discount Engine - Validation & Calculations', () => {
  it('handles zero discount cleanly', () => {
    const resultNoSpec = calculateDiscount(10000);
    expect(resultNoSpec.discountMinor).toBe(0);
    expect(resultNoSpec.remainingTaxableAmountMinor).toBe(10000);

    const resultZeroPercent = calculateDiscount(10000, {
      type: 'percentage',
      percentageRate: 0
    });
    expect(resultZeroPercent.discountMinor).toBe(0);
    expect(resultZeroPercent.remainingTaxableAmountMinor).toBe(10000);

    const resultZeroFixed = calculateDiscount(10000, {
      type: 'fixed',
      fixedAmountMinor: 0
    });
    expect(resultZeroFixed.discountMinor).toBe(0);
    expect(resultZeroFixed.remainingTaxableAmountMinor).toBe(10000);
  });

  it('calculates percentage discounts accurately (e.g. 10% off ₹500 = ₹50)', () => {
    // Subtotal = ₹500 (50000 paise), 10% discount -> ₹50 (5000 paise) discount, ₹450 (45000 paise) remaining
    const res = calculateDiscount(50000, {
      type: 'percentage',
      percentageRate: 10
    });
    expect(res.discountMinor).toBe(5000);
    expect(res.remainingTaxableAmountMinor).toBe(45000);
    expect(res.discountMinor + res.remainingTaxableAmountMinor).toBe(50000);
  });

  it('calculates 1% discount on odd amounts with authoritative rounding', () => {
    // 1% of ₹99.99 (9999 paise) = 99.99 paise -> rounds half-up to 100 paise
    const res = calculateDiscount(9999, {
      type: 'percentage',
      percentageRate: 1
    });
    expect(res.discountMinor).toBe(100);
    expect(res.remainingTaxableAmountMinor).toBe(9899);
    expect(res.discountMinor + res.remainingTaxableAmountMinor).toBe(9999);
  });

  it('calculates fixed amount discount accurately', () => {
    // Subtotal = ₹500 (50000 paise), Fixed = ₹75.50 (7550 paise)
    const res = calculateDiscount(50000, {
      type: 'fixed',
      fixedAmountMinor: 7550
    });
    expect(res.discountMinor).toBe(7550);
    expect(res.remainingTaxableAmountMinor).toBe(42450);
    expect(res.discountMinor + res.remainingTaxableAmountMinor).toBe(50000);
  });

  it('handles 100% full discount accurately', () => {
    const resPercent = calculateDiscount(50000, {
      type: 'percentage',
      percentageRate: 100
    });
    expect(resPercent.discountMinor).toBe(50000);
    expect(resPercent.remainingTaxableAmountMinor).toBe(0);

    const resFixed = calculateDiscount(50000, {
      type: 'fixed',
      fixedAmountMinor: 50000
    });
    expect(resFixed.discountMinor).toBe(50000);
    expect(resFixed.remainingTaxableAmountMinor).toBe(0);
  });

  it('rejects discounts that exceed subtotal with RangeError', () => {
    // Subtotal = ₹100 (10000 paise), Fixed = ₹101 (10100 paise)
    expect(() =>
      calculateDiscount(10000, {
        type: 'fixed',
        fixedAmountMinor: 10100
      })
    ).toThrow(RangeError);

    // Percentage > 100% is caught by validation
    expect(() =>
      calculateDiscount(10000, {
        type: 'percentage',
        percentageRate: 105
      })
    ).toThrow(TypeError);
  });

  it('validates discount spec inputs and rejects negative or non-finite values', () => {
    expect(validateDiscountSpec({ type: 'percentage', percentageRate: -5 }).isValid).toBe(false);
    expect(validateDiscountSpec({ type: 'percentage', percentageRate: NaN }).isValid).toBe(false);
    expect(validateDiscountSpec({ type: 'percentage', percentageRate: Infinity }).isValid).toBe(false);
    expect(validateDiscountSpec({ type: 'percentage', percentageRate: 120 }).isValid).toBe(false);

    expect(validateDiscountSpec({ type: 'fixed', fixedAmountMinor: -500 }).isValid).toBe(false);
    expect(validateDiscountSpec({ type: 'fixed', fixedAmountMinor: 50.5 }).isValid).toBe(false);
    expect(validateDiscountSpec({ type: 'fixed', fixedAmountMinor: NaN }).isValid).toBe(false);
    expect(validateDiscountSpec({ type: 'unknown' as any }).isValid).toBe(false);
  });

  it('handles very small and very large subtotals', () => {
    // 1 paise subtotal, 10% discount -> 0.1 paise -> rounds to 0
    const smallRes = calculateDiscount(1, {
      type: 'percentage',
      percentageRate: 10
    });
    expect(smallRes.discountMinor).toBe(0);
    expect(smallRes.remainingTaxableAmountMinor).toBe(1);

    // 1 paise subtotal, 50% discount -> 0.5 paise -> rounds to 1
    const halfPaiseRes = calculateDiscount(1, {
      type: 'percentage',
      percentageRate: 50
    });
    expect(halfPaiseRes.discountMinor).toBe(1);
    expect(halfPaiseRes.remainingTaxableAmountMinor).toBe(0);

    // Large subtotal: ₹10,00,000 (100,000,000 paise), 15% discount
    const largeRes = calculateDiscount(100000000, {
      type: 'percentage',
      percentageRate: 15
    });
    expect(largeRes.discountMinor).toBe(15000000);
    expect(largeRes.remainingTaxableAmountMinor).toBe(85000000);
  });
});

describe('Proportional Discount Allocation Across Multiple Lines', () => {
  it('allocates discount across equal lines without loss or gain of paise', () => {
    // 3 items of ₹100 each (10000 paise each). Total = 30000 paise.
    // Total discount = ₹30 (3000 paise).
    // Each item should receive 1000 paise.
    const allocations = allocateDiscountProportionally([10000, 10000, 10000], 3000);
    expect(allocations).toEqual([1000, 1000, 1000]);
    expect(allocations.reduce((a, b) => a + b, 0)).toBe(3000);
  });

  it('handles uneven remainder paise deterministically without losing any paise', () => {
    // 3 items of ₹100 each (10000 paise each). Total = 30000 paise.
    // Total discount = ₹10 (1000 paise).
    // 1000 / 3 = 333.333 paise each -> 333, 333, 333 = 999.
    // 1 paise remainder must be assigned so sum is exactly 1000!
    const allocations = allocateDiscountProportionally([10000, 10000, 10000], 1000);
    expect(allocations.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(allocations).toEqual([334, 333, 333]);
  });

  it('allocates proportional discount according to item subtotal ratios', () => {
    // Item 1: ₹100 (10000 paise), Item 2: ₹200 (20000 paise). Total = 30000 paise.
    // Total discount = ₹60 (6000 paise).
    // Item 1 gets 1/3 (2000 paise), Item 2 gets 2/3 (4000 paise).
    const allocations = allocateDiscountProportionally([10000, 20000], 6000);
    expect(allocations).toEqual([2000, 4000]);
    expect(allocations.reduce((a, b) => a + b, 0)).toBe(6000);
  });

  it('rejects total discount exceeding sum of line subtotals', () => {
    expect(() => allocateDiscountProportionally([5000, 5000], 10001)).toThrow(RangeError);
  });

  it('handles empty and zero discount edge cases', () => {
    expect(allocateDiscountProportionally([], 0)).toEqual([]);
    expect(allocateDiscountProportionally([10000, 20000], 0)).toEqual([0, 0]);
  });
});
