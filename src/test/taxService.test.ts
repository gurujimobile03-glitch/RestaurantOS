import { describe, it, expect } from 'vitest';
import { calculateTax, assertValidTaxRate } from '../services/taxService';

describe('Tax Engine - Exclusive GST Calculation', () => {
  it('calculates 5% exclusive GST correctly (Base ₹100 -> Tax ₹5, Total ₹105)', () => {
    const res = calculateTax({
      amountMinor: 10000,
      taxRate: 5,
      taxInclusive: false,
      taxJurisdiction: 'intraState'
    });

    expect(res.taxableAmountMinor).toBe(10000);
    expect(res.totalTaxMinor).toBe(500);
    expect(res.finalTotalMinor).toBe(10500);
    expect(res.cgstMinor).toBe(250);
    expect(res.sgstMinor).toBe(250);
    expect(res.igstMinor).toBe(0);
    expect(res.cgstMinor + res.sgstMinor).toBe(res.totalTaxMinor);
    expect(res.taxableAmountMinor + res.totalTaxMinor).toBe(res.finalTotalMinor);
  });

  it('calculates 18% exclusive GST correctly (Base ₹200 -> Tax ₹36, Total ₹236)', () => {
    const res = calculateTax({
      amountMinor: 20000,
      taxRate: 18,
      taxInclusive: false,
      taxJurisdiction: 'intraState'
    });

    expect(res.taxableAmountMinor).toBe(20000);
    expect(res.totalTaxMinor).toBe(3600);
    expect(res.finalTotalMinor).toBe(23600);
    expect(res.cgstMinor).toBe(1800);
    expect(res.sgstMinor).toBe(1800);
    expect(res.igstMinor).toBe(0);
  });

  it('calculates 12% exclusive GST on ₹150 correctly', () => {
    const res = calculateTax({
      amountMinor: 15000,
      taxRate: 12,
      taxInclusive: false,
      taxJurisdiction: 'intraState'
    });

    expect(res.taxableAmountMinor).toBe(15000);
    expect(res.totalTaxMinor).toBe(1800);
    expect(res.finalTotalMinor).toBe(16800);
    expect(res.cgstMinor).toBe(900);
    expect(res.sgstMinor).toBe(900);
  });

  it('handles 0% GST rate', () => {
    const res = calculateTax({
      amountMinor: 5000,
      taxRate: 0,
      taxInclusive: false,
      taxJurisdiction: 'intraState'
    });

    expect(res.taxableAmountMinor).toBe(5000);
    expect(res.totalTaxMinor).toBe(0);
    expect(res.finalTotalMinor).toBe(5000);
    expect(res.cgstMinor).toBe(0);
    expect(res.sgstMinor).toBe(0);
    expect(res.igstMinor).toBe(0);
  });
});

describe('Tax Engine - Inclusive GST Calculation', () => {
  it('extracts 5% inclusive GST correctly (Gross ₹105 -> Taxable ₹100, Tax ₹5)', () => {
    // 10500 paise gross at 5%
    const res = calculateTax({
      amountMinor: 10500,
      taxRate: 5,
      taxInclusive: true,
      taxJurisdiction: 'intraState'
    });

    expect(res.taxableAmountMinor).toBe(10000);
    expect(res.totalTaxMinor).toBe(500);
    expect(res.finalTotalMinor).toBe(10500);
    expect(res.cgstMinor).toBe(250);
    expect(res.sgstMinor).toBe(250);
    expect(res.igstMinor).toBe(0);
    expect(res.taxableAmountMinor + res.totalTaxMinor).toBe(res.finalTotalMinor);
  });

  it('extracts 18% inclusive GST correctly (Gross ₹118 -> Taxable ₹100, Tax ₹18)', () => {
    // 11800 paise gross at 18%
    const res = calculateTax({
      amountMinor: 11800,
      taxRate: 18,
      taxInclusive: true,
      taxJurisdiction: 'intraState'
    });

    expect(res.taxableAmountMinor).toBe(10000);
    expect(res.totalTaxMinor).toBe(1800);
    expect(res.finalTotalMinor).toBe(11800);
    expect(res.cgstMinor).toBe(900);
    expect(res.sgstMinor).toBe(900);
    expect(res.igstMinor).toBe(0);
    expect(res.taxableAmountMinor + res.totalTaxMinor).toBe(res.finalTotalMinor);
  });

  it('extracts 18% inclusive GST on ₹999 accurately with authoritative rounding', () => {
    // 99900 paise gross at 18%
    // Taxable = round(99900 * 100 / 118) = round(84661.0169...) = 84661 paise (₹846.61)
    // Tax = 99900 - 84661 = 15239 paise (₹152.39)
    // CGST = round(15239 / 2) = round(7619.5) = 7620 paise (₹76.20)
    // SGST = 15239 - 7620 = 7619 paise (₹76.19)
    const res = calculateTax({
      amountMinor: 99900,
      taxRate: 18,
      taxInclusive: true,
      taxJurisdiction: 'intraState'
    });

    expect(res.taxableAmountMinor).toBe(84661);
    expect(res.totalTaxMinor).toBe(15239);
    expect(res.finalTotalMinor).toBe(99900);
    expect(res.cgstMinor).toBe(7620);
    expect(res.sgstMinor).toBe(7619);
    expect(res.cgstMinor + res.sgstMinor).toBe(res.totalTaxMinor);
    expect(res.taxableAmountMinor + res.totalTaxMinor).toBe(res.finalTotalMinor);
  });
});

describe('Tax Engine - Jurisdictions: Intra-State vs Inter-State', () => {
  it('allocates 100% to IGST and 0 to CGST/SGST for inter-state tax mode', () => {
    const res = calculateTax({
      amountMinor: 10000,
      taxRate: 18,
      taxInclusive: false,
      taxJurisdiction: 'interState'
    });

    expect(res.totalTaxMinor).toBe(1800);
    expect(res.igstMinor).toBe(1800);
    expect(res.cgstMinor).toBe(0);
    expect(res.sgstMinor).toBe(0);
    expect(res.cgstMinor + res.sgstMinor + res.igstMinor).toBe(res.totalTaxMinor);
  });

  it('splits evenly between CGST and SGST for intra-state', () => {
    const res = calculateTax({
      amountMinor: 10000,
      taxRate: 18,
      taxInclusive: false,
      taxJurisdiction: 'intraState'
    });

    expect(res.totalTaxMinor).toBe(1800);
    expect(res.cgstMinor).toBe(900);
    expect(res.sgstMinor).toBe(900);
    expect(res.igstMinor).toBe(0);
    expect(res.cgstMinor + res.sgstMinor + res.igstMinor).toBe(res.totalTaxMinor);
  });
});

describe('Tax Engine - CGST + SGST Reconciliation & Odd Minor Units', () => {
  it('guarantees zero lost or extra paise when total tax is an odd number of paise', () => {
    // 5 paise tax: CGST = 3, SGST = 2. Total = 5 paise.
    const res = calculateTax({
      amountMinor: 100, // ₹1.00
      taxRate: 5, // 5% of ₹1.00 = 5 paise
      taxInclusive: false,
      taxJurisdiction: 'intraState'
    });

    expect(res.totalTaxMinor).toBe(5);
    expect(res.cgstMinor).toBe(3);
    expect(res.sgstMinor).toBe(2);
    expect(res.cgstMinor + res.sgstMinor).toBe(5);
    expect(res.taxableAmountMinor + res.totalTaxMinor).toBe(res.finalTotalMinor);
  });

  it('guarantees zero lost paise for 1 paise total tax', () => {
    // Amount = 20 paise, Tax rate = 5% -> 1 paise tax
    const res = calculateTax({
      amountMinor: 20,
      taxRate: 5,
      taxInclusive: false,
      taxJurisdiction: 'intraState'
    });

    expect(res.totalTaxMinor).toBe(1);
    expect(res.cgstMinor).toBe(1);
    expect(res.sgstMinor).toBe(0);
    expect(res.cgstMinor + res.sgstMinor).toBe(1);
  });
});

describe('Tax Engine - Boundary & Validation Handling', () => {
  it('handles ₹0 cleanly', () => {
    const res = calculateTax({
      amountMinor: 0,
      taxRate: 18,
      taxInclusive: false
    });

    expect(res.taxableAmountMinor).toBe(0);
    expect(res.totalTaxMinor).toBe(0);
    expect(res.finalTotalMinor).toBe(0);
  });

  it('handles fractional paise amounts under 1 paise with half-up rounding', () => {
    // ₹0.01 (1 paise) with 5% tax -> 0.05 paise -> rounds to 0 paise tax
    const res1 = calculateTax({
      amountMinor: 1,
      taxRate: 5,
      taxInclusive: false
    });
    expect(res1.totalTaxMinor).toBe(0);

    // ₹0.10 (10 paise) with 5% tax -> 0.50 paise -> rounds to 1 paise tax
    const res2 = calculateTax({
      amountMinor: 10,
      taxRate: 5,
      taxInclusive: false
    });
    expect(res2.totalTaxMinor).toBe(1);
  });

  it('validates tax rate strictly', () => {
    expect(() => assertValidTaxRate(-1)).toThrow(RangeError);
    expect(() => assertValidTaxRate(101)).toThrow(RangeError);
    expect(() => assertValidTaxRate(NaN)).toThrow(TypeError);
    expect(() => assertValidTaxRate('5' as any)).toThrow(TypeError);
  });
});
