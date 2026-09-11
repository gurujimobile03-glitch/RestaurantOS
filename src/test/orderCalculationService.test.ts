import { describe, it, expect } from 'vitest';
import {
  calculateOrderItemLine,
  calculateOrderTotals,
  assertValidQuantity
} from '../services/orderCalculationService';

describe('Line Calculation Engine (calculateOrderItemLine)', () => {
  it('calculates a basic order item line with exclusive tax', () => {
    // 2 x ₹100 @ 5% GST exclusive
    const line = calculateOrderItemLine({
      quantity: 2,
      unitPriceMinor: 10000,
      taxRate: 5,
      taxInclusive: false
    });

    expect(line.quantity).toBe(2);
    expect(line.unitPriceMinor).toBe(10000);
    expect(line.subtotalMinor).toBe(20000);
    expect(line.discountMinor).toBe(0);
    expect(line.taxableAmountMinor).toBe(20000);
    expect(line.totalTaxMinor).toBe(1000);
    expect(line.cgstMinor).toBe(500);
    expect(line.sgstMinor).toBe(500);
    expect(line.igstMinor).toBe(0);
    expect(line.lineTotalMinor).toBe(21000);

    // Invariant
    expect(line.taxableAmountMinor + line.totalTaxMinor).toBe(line.lineTotalMinor);
    expect(line.cgstMinor + line.sgstMinor).toBe(line.totalTaxMinor);
  });

  it('calculates a line with item-level percentage discount and exclusive tax', () => {
    // 2 x ₹100 (subtotal ₹200), 10% discount (-₹20), remaining ₹180, 5% tax (+₹9), total ₹189
    const line = calculateOrderItemLine({
      quantity: 2,
      unitPriceMinor: 10000,
      taxRate: 5,
      taxInclusive: false,
      discount: {
        type: 'percentage',
        percentageRate: 10
      }
    });

    expect(line.subtotalMinor).toBe(20000);
    expect(line.discountMinor).toBe(2000);
    expect(line.taxableAmountMinor).toBe(18000);
    expect(line.totalTaxMinor).toBe(900);
    expect(line.cgstMinor).toBe(450);
    expect(line.sgstMinor).toBe(450);
    expect(line.lineTotalMinor).toBe(18900);
  });

  it('calculates a line with inclusive tax correctly', () => {
    // 1 x ₹105 (gross ₹105) @ 5% GST inclusive
    const line = calculateOrderItemLine({
      quantity: 1,
      unitPriceMinor: 10500,
      taxRate: 5,
      taxInclusive: true
    });

    expect(line.subtotalMinor).toBe(10500);
    expect(line.discountMinor).toBe(0);
    expect(line.taxableAmountMinor).toBe(10000);
    expect(line.totalTaxMinor).toBe(500);
    expect(line.cgstMinor).toBe(250);
    expect(line.sgstMinor).toBe(250);
    expect(line.lineTotalMinor).toBe(10500);
  });

  it('calculates line in inter-state tax mode', () => {
    const line = calculateOrderItemLine({
      quantity: 1,
      unitPriceMinor: 10000,
      taxRate: 18,
      taxInclusive: false,
      taxJurisdiction: 'interState'
    });

    expect(line.totalTaxMinor).toBe(1800);
    expect(line.igstMinor).toBe(1800);
    expect(line.cgstMinor).toBe(0);
    expect(line.sgstMinor).toBe(0);
  });

  it('validates quantity strictly and rejects 0, negatives, decimals, and NaN', () => {
    expect(() => assertValidQuantity(0)).toThrow(RangeError);
    expect(() => assertValidQuantity(-1)).toThrow(RangeError);
    expect(() => assertValidQuantity(1.5)).toThrow(TypeError);
    expect(() => assertValidQuantity(NaN)).toThrow(TypeError);
    expect(() => assertValidQuantity(Infinity)).toThrow(TypeError);
    expect(() => assertValidQuantity('1' as any)).toThrow(TypeError);

    expect(() =>
      calculateOrderItemLine({
        quantity: 0,
        unitPriceMinor: 10000,
        taxRate: 5,
        taxInclusive: false
      })
    ).toThrow(RangeError);
  });
});

describe('Order Calculation Engine (calculateOrderTotals)', () => {
  it('calculates an order containing multiple items with multiple tax rates (Step 9)', () => {
    // Item A: ₹100, 5% GST exclusive
    // Item B: ₹200, 18% GST exclusive
    // Item C: ₹50, 0% GST exclusive
    const result = calculateOrderTotals({
      items: [
        {
          quantity: 1,
          unitPriceMinor: 10000,
          taxRate: 5,
          taxInclusive: false
        },
        {
          quantity: 1,
          unitPriceMinor: 20000,
          taxRate: 18,
          taxInclusive: false
        },
        {
          quantity: 1,
          unitPriceMinor: 5000,
          taxRate: 0,
          taxInclusive: false
        }
      ]
    });

    // Subtotals: 100 + 200 + 50 = ₹350 (35000 paise)
    expect(result.subtotalMinor).toBe(35000);
    expect(result.discountMinor).toBe(0);
    expect(result.taxableAmountMinor).toBe(35000);

    // Taxes:
    // Item A: 5% of 10000 = 500 (CGST 250, SGST 250)
    // Item B: 18% of 20000 = 3600 (CGST 1800, SGST 1800)
    // Item C: 0% of 5000 = 0
    // Total Tax: 500 + 3600 + 0 = 4100 paise (₹41.00)
    expect(result.totalTaxMinor).toBe(4100);
    expect(result.cgstMinor).toBe(2050);
    expect(result.sgstMinor).toBe(2050);
    expect(result.igstMinor).toBe(0);

    // Grand Total: 35000 + 4100 = 39100 paise (₹391.00)
    expect(result.grandTotalMinor).toBe(39100);

    // Aggregation reconciliations
    const sumLineSubtotals = result.lineResults.reduce((acc, l) => acc + l.subtotalMinor, 0);
    const sumLineTaxes = result.lineResults.reduce((acc, l) => acc + l.totalTaxMinor, 0);
    const sumLineTotals = result.lineResults.reduce((acc, l) => acc + l.lineTotalMinor, 0);

    expect(sumLineSubtotals).toBe(result.subtotalMinor);
    expect(sumLineTaxes).toBe(result.totalTaxMinor);
    expect(sumLineTotals).toBe(result.grandTotalMinor);

    // Financial invariants
    expect(result.cgstMinor + result.sgstMinor + result.igstMinor).toBe(result.totalTaxMinor);
    expect(result.taxableAmountMinor + result.totalTaxMinor).toBe(result.grandTotalMinor);
  });

  it('calculates order with order-level percentage discount distributed proportionally', () => {
    // 2 items:
    // Item 1: ₹100 (10000 paise) @ 5% GST exclusive
    // Item 2: ₹100 (10000 paise) @ 5% GST exclusive
    // Subtotal = ₹200 (20000 paise)
    // Order discount = 10% (₹20 = 2000 paise)
    // Each item receives ₹10 (1000 paise) discount -> taxable ₹90 (9000 paise) each
    // Tax per item = 5% of 9000 = 450 paise (₹4.50)
    // Total tax = 900 paise (₹9.00)
    // Grand total = 18000 + 900 = 18900 paise (₹189.00)
    const result = calculateOrderTotals({
      items: [
        {
          quantity: 1,
          unitPriceMinor: 10000,
          taxRate: 5,
          taxInclusive: false
        },
        {
          quantity: 1,
          unitPriceMinor: 10000,
          taxRate: 5,
          taxInclusive: false
        }
      ],
      orderDiscount: {
        type: 'percentage',
        percentageRate: 10
      }
    });

    expect(result.subtotalMinor).toBe(20000);
    expect(result.discountMinor).toBe(2000);
    expect(result.taxableAmountMinor).toBe(18000);
    expect(result.totalTaxMinor).toBe(900);
    expect(result.cgstMinor).toBe(450);
    expect(result.sgstMinor).toBe(450);
    expect(result.grandTotalMinor).toBe(18900);

    expect(result.taxableAmountMinor + result.totalTaxMinor).toBe(result.grandTotalMinor);
  });

  it('calculates empty order cleanly', () => {
    const result = calculateOrderTotals({ items: [] });
    expect(result.subtotalMinor).toBe(0);
    expect(result.discountMinor).toBe(0);
    expect(result.taxableAmountMinor).toBe(0);
    expect(result.totalTaxMinor).toBe(0);
    expect(result.grandTotalMinor).toBe(0);
    expect(result.lineResults.length).toBe(0);
  });
});
